import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { PRESETS } from "../src/engine.js";
import { createSession, getSession, type SessionState } from "../src/sessions.js";
import { attachSocketHandlers } from "../src/socket.js";

let io: Server;
let app: ReturnType<typeof createApp>;
let url: string;
const clients: Socket[] = [];

beforeAll(async () => {
  io = new Server();
  app = createApp(io);
  const server = createServer(app);
  io.attach(server);
  attachSocketHandlers(io);
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  io.close();
});

afterEach(() => {
  clients.splice(0).forEach((c) => c.disconnect());
});

function client(code: string, role: string): Socket {
  const c = connect(url, { transports: ["websocket"], query: { code, role }, reconnection: false });
  clients.push(c);
  return c;
}

/** Resolves with the next `event` payload that passes `match`. */
function next<T>(c: Socket, event: string, match: (p: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve) => {
    const h = (p: T) => {
      if (!match(p)) return;
      c.off(event, h);
      resolve(p);
    };
    c.on(event, h);
  });
}

/** Connects a TV and a phone, resolving once the TV sees the phone. */
async function pair() {
  const { code } = createSession().state;
  const tv = client(code, "tv");
  const phoneSeen = next<SessionState>(tv, "session:state", (s) => s.phoneConnected);
  const phone = client(code, "phone");
  await phoneSeen;
  return { code, tv, phone };
}

describe("socket", () => {
  it("rejects a bad role or unknown code", async () => {
    const err1 = await next<Error>(client(createSession().state.code, "hacker"), "connect_error");
    expect(err1.message).toMatch(/invalid/);
    const err2 = await next<Error>(client("ZZZZ", "tv"), "connect_error");
    expect(err2.message).toMatch(/not found/);
  });

  it("tracks phoneConnected as phones come and go", async () => {
    const { tv, phone } = await pair();
    const gone = next<SessionState>(tv, "session:state", (s) => !s.phoneConnected);
    phone.disconnect();
    expect((await gone).phoneConnected).toBe(false);
  });

  it("mode:update then undo", async () => {
    const { tv, phone } = await pair();

    const applied = next(tv, "settings:apply");
    phone.emit("mode:update", { mode: "night", source: "tv" });
    expect(await applied).toMatchObject({
      mode: "night",
      settings: PRESETS.night, // dim room, no prefs
      source: "phone",
    });

    const undone = next(tv, "settings:apply");
    phone.emit("settings:undo", {});
    expect(await undone).toMatchObject({ mode: "cinema", source: "undo" });
  });

  it("phone Undo via playback:request undoes", async () => {
    const { tv, phone } = await pair();
    phone.emit("mode:update", { mode: "sports" });
    await next(tv, "settings:apply");
    const undone = next(tv, "settings:apply");
    phone.emit("playback:request", { action: "undo" });
    expect(await undone).toMatchObject({ mode: "cinema", source: "undo" });
  });

  it("ignores invalid payloads", async () => {
    const { code, tv, phone } = await pair();
    phone.emit("mode:update", { mode: "disco" });
    // a valid event after it proves the bad one was skipped, not queued
    const applied = next(tv, "settings:apply");
    phone.emit("mode:update", { mode: "bright" });
    expect(await applied).toMatchObject({ mode: "bright" });
    expect(getSession(code)?.history).toHaveLength(1);
  });

  it("forwards playback:request to the TV only", async () => {
    const { tv, phone } = await pair();
    let phoneGotIt = false;
    phone.on("playback:command", () => (phoneGotIt = true));
    const cmd = next(tv, "playback:command");
    phone.emit("playback:request", { action: "pause" });
    expect(await cmd).toMatchObject({ action: "pause" });
    expect(phoneGotIt).toBe(false);
  });

  it("stores preferences and roomLight", async () => {
    const { code, tv, phone } = await pair();
    const state = next<SessionState>(tv, "session:state", (s) => s.roomLight === "bright");
    phone.emit("preferences:update", { roomLight: "bright", shadowDetail: 80 });
    await state;
    expect(getSession(code)?.preferences).toEqual({ shadowDetail: 80 });
  });

  it("stores TV playback and broadcasts clip changes", async () => {
    const { code, tv, phone } = await pair();
    const state = next<SessionState>(phone, "session:state", (s) => s.clipId === "day");
    tv.emit("playback:update", { clipId: "day", position: 12.5, playing: true });
    await state;
    expect(getSession(code)?.playback).toEqual({ position: 12.5, playing: true });
  });

  it("applies an accepted recommendation", async () => {
    const { code, tv, phone } = await pair();
    const settings = {
      brightness: 20,
      contrast: 10,
      saturation: 0,
      warmth: 0,
      shadows: 15,
      sharpness: 0,
    };
    getSession(code)!.pending = {
      id: "r1",
      mode: "bright",
      title: "t",
      settings,
      reasons: [],
      explanation: "e",
    };
    const applied = next(tv, "settings:apply");
    phone.emit("recommendation:respond", { id: "r1", accepted: true });
    expect(await applied).toEqual({ mode: "bright", settings, source: "ai" });
    expect(getSession(code)?.pending).toBeUndefined();
  });

  it("AI recommend → TV gets it → phone accepts → applied", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { code, tv, phone } = await pair();

    const shown = next<{ id: string; mode: string }>(tv, "ai:recommendation");
    const res = await request(app)
      .post("/api/ai/recommend")
      .send({ code, request: "I can't see anything in this dark scene" })
      .expect(200);
    const rec = await shown;
    expect(rec).toEqual(res.body);
    expect(rec.mode).toBe("bright");

    const applied = next(tv, "settings:apply");
    phone.emit("recommendation:respond", { id: rec.id, accepted: true });
    expect(await applied).toMatchObject({ mode: "bright", source: "ai" });

    // cooldown: a second request straight away is refused
    await request(app).post("/api/ai/recommend").send({ code, request: "too dark" }).expect(429);
    await request(app).post("/api/ai/recommend").send({ code, request: "" }).expect(400);
    await request(app).post("/api/ai/recommend").send({ code: "ZZZZ", request: "x" }).expect(404);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("off-topic AI request → 422 and nothing sent to the TV", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { code, tv } = await pair();
    let tvGotIt = false;
    tv.on("ai:recommendation", () => (tvGotIt = true));
    const res = await request(app)
      .post("/api/ai/recommend")
      .send({ code, request: "what's the weather tomorrow?" })
      .expect(422);
    expect(res.body.error).toMatch(/only help with how the picture looks/);
    expect(getSession(code)?.pending).toBeUndefined();
    expect(tvGotIt).toBe(false);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("REST /mode shim broadcasts settings:apply", async () => {
    const { code, tv } = await pair();
    const applied = next(tv, "settings:apply");
    await request(app).post(`/api/sessions/${code}/mode`).send({ mode: "cinema" }).expect(200);
    expect(await applied).toMatchObject({ mode: "cinema", source: "phone" });
    await request(app).post(`/api/sessions/${code}/mode`).send({ mode: "disco" }).expect(400);
  });
});
