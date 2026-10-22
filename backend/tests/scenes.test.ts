import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SUGGEST_COOLDOWN_MS, recommend, suggestForScene } from "../src/ai.js";
import { createApp } from "../src/app.js";
import { loadScenes, sceneAt } from "../src/scenes.js";
import { createSession } from "../src/sessions.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/scenes", import.meta.url));

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  loadScenes(FIXTURES);
});

describe("sceneAt", () => {
  it("returns the latest sample at or before the timestamp", () => {
    expect(sceneAt("testclip", 0)?.timestamp).toBe(0);
    expect(sceneAt("testclip", 1.9)?.timestamp).toBe(1);
    expect(sceneAt("testclip", 2)?.label).toBe("Very bright scene");
    expect(sceneAt("testclip", 999)?.timestamp).toBe(2);
  });

  it("unknown clip or skipped bad file → undefined", () => {
    expect(sceneAt("nope", 0)).toBeUndefined();
    expect(sceneAt("broken", 0)).toBeUndefined();
  });

  it("a missing directory loads nothing without throwing", () => {
    loadScenes("/does/not/exist");
    expect(sceneAt("testclip", 0)).toBeUndefined();
    loadScenes(FIXTURES);
  });
});

describe("POST /api/scenes/analyze", () => {
  const app = createApp(new Server());

  it("serves the sample for a timestamp", async () => {
    const res = await request(app)
      .post("/api/scenes/analyze")
      .send({ clipId: "testclip", timestamp: 2.5 })
      .expect(200);
    expect(res.body).toMatchObject({ clipId: "testclip", timestamp: 2, sceneChange: true });
  });

  it("400 on bad body, 404 on unknown clip", async () => {
    await request(app).post("/api/scenes/analyze").send({ clipId: "testclip" }).expect(400);
    await request(app)
      .post("/api/scenes/analyze")
      .send({ clipId: "nope", timestamp: 0 })
      .expect(404);
  });
});

describe("suggestForScene", () => {
  const T = 10 * SUGGEST_COOLDOWN_MS;

  it("dark scene, not in Bright Room → suggests Bright Room once, then cools down", () => {
    const session = createSession();
    session.scene = sceneAt("testclip", 0);
    const rec = suggestForScene(session, T);
    expect(rec).toMatchObject({ mode: "bright", title: "Dark scene: try Bright Room?" });
    expect(rec).not.toHaveProperty("request");
    expect(suggestForScene(session, T + 1000)).toBeUndefined();
    expect(suggestForScene(session, T + SUGGEST_COOLDOWN_MS)).toBeDefined();
  });

  it("nothing when the mode already suits the scene", () => {
    const session = createSession();
    session.scene = sceneAt("testclip", 0);
    session.state.mode = "bright";
    expect(suggestForScene(session, T)).toBeUndefined();
  });

  it("very bright scene suggests Night only in a dark/dim room", () => {
    const session = createSession();
    session.scene = sceneAt("testclip", 2);
    session.state.roomLight = "bright";
    expect(suggestForScene(session, T)).toBeUndefined();
    session.state.roomLight = "dim";
    expect(suggestForScene(session, T)?.mode).toBe("night");
  });

  it("stays quiet right after the user's own AI request", () => {
    const session = createSession();
    session.scene = sceneAt("testclip", 0);
    session.lastAiAt = T - 1000;
    expect(suggestForScene(session, T)).toBeUndefined();
  });
});

describe("scene feeds recommendations", () => {
  it("a dark scene adds a Scene reason and lifts shadows", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const session = createSession();
    session.scene = sceneAt("testclip", 0);
    const rec = await recommend(session, "I can't see anything");
    expect(rec?.reasons).toContainEqual({
      label: "Scene",
      value: "Dark scene: +20 shadows, +5 brightness",
    });
    vi.unstubAllEnvs();
  });
});
