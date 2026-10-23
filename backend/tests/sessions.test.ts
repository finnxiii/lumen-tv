import { Server } from "socket.io";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  CODE_PATTERN,
  SESSION_TTL_MS,
  createSession,
  getSession,
  sweepExpired,
} from "../src/sessions.js";

describe("sessions", () => {
  it("creates 4-char codes without 0/O/1/I", () => {
    for (let i = 0; i < 200; i++) {
      expect(createSession().state.code).toMatch(CODE_PATTERN);
    }
  });

  it("finds a session case-insensitively", () => {
    const { code } = createSession().state;
    expect(getSession(code.toLowerCase())?.state.code).toBe(code);
  });

  it("expires after the TTL and extends on access", () => {
    const t0 = 1_000_000;
    const { code } = createSession(t0).state;
    // access just before expiry pushes it out another TTL
    expect(getSession(code, t0 + SESSION_TTL_MS - 1)).toBeDefined();
    expect(getSession(code, t0 + 2 * SESSION_TTL_MS - 2)).toBeDefined();
    expect(getSession(code, t0 + 10 * SESSION_TTL_MS)).toBeUndefined();
  });

  it("sweep removes expired sessions", () => {
    const { code } = createSession(0).state;
    sweepExpired(SESSION_TTL_MS);
    expect(getSession(code, 0)).toBeUndefined();
  });
});

describe("REST", () => {
  const app = createApp(new Server());

  it("create → join → get", async () => {
    const created = await request(app).post("/api/sessions").expect(201);
    expect(created.body).toMatchObject({
      phoneConnected: false,
      mode: "cinema",
      clipId: "night",
      roomLight: "dim",
    });
    const { code } = created.body as { code: string };

    const joined = await request(app).post(`/api/sessions/${code.toLowerCase()}/join`).expect(200);
    expect(joined.body.code).toBe(code);

    const got = await request(app).get(`/api/sessions/${code}`).expect(200);
    expect(got.body.code).toBe(code);
  });

  it("400 on a malformed code, 404 on an unknown one", async () => {
    await request(app).get("/api/sessions/O0I1").expect(400);
    await request(app).get("/api/sessions/toolong").expect(400);
    await request(app).post("/api/sessions/ZZZZ/join").expect(404);
  });
});

describe("phone controller", () => {
  const app = createApp(new Server());

  it("is served at / and at the QR link /join/:code", async () => {
    await request(app).get("/").expect(200).expect("Content-Type", /html/);
    const res = await request(app).get("/join/ABCD").expect(200);
    expect(res.text).toContain("Lumen Remote");
  });
});
