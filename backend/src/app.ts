import cors from "cors";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import { OFF_TOPIC, recommend } from "./ai.js";
import { sceneAt } from "./scenes.js";
import { CODE_PATTERN, createSession, getSession, modeSchema, type Session } from "./sessions.js";
import { changeMode } from "./socket.js";

// Same path from src/ (tsx) and dist/ (node): <repo>/phone
const PHONE_DIR = fileURLToPath(new URL("../../phone", import.meta.url));

const codeParam = z.string().toUpperCase().regex(CODE_PATTERN);
// Protects the Gemini free-tier quota (~15 req/min) from button mashing.
const AI_COOLDOWN_MS = 3000;
const recommendBody = z.object({ code: codeParam, request: z.string().trim().min(1).max(300) });
const analyzeBody = z.object({
  clipId: z.string().min(1).max(64),
  timestamp: z.number().nonnegative(),
});
const modeBody = z.object({ mode: modeSchema, source: z.enum(["phone", "tv"]).default("phone") });

/** Validates :code and returns the session, or sends a 400/404 and returns undefined. */
function findSession(req: Request, res: Response): Session | undefined {
  const code = codeParam.safeParse(req.params.code);
  if (!code.success) {
    res.status(400).json({ error: "Invalid room code" });
    return undefined;
  }
  const session = getSession(code.data);
  if (!session) res.status(404).json({ error: "Session not found or expired" });
  return session;
}

export function createApp(io: Server) {
  const app = express();

  // shortcut: any origin allowed, lock to the phone site's URL once it's hosted
  app.use(cors());
  app.use(express.json());

  // The phone controller; the TV's QR code opens <PHONE_URL>/join/<code>.
  app.use(express.static(PHONE_DIR));
  app.get("/join/:code", (_req, res) => res.sendFile("index.html", { root: PHONE_DIR }));

  app.get("/health", (_req, res) => {
    res.json({ status: "OK" });
  });

  app.post("/api/sessions", (_req, res) => {
    res.status(201).json(createSession().state);
  });

  // phoneConnected flips when the phone's socket connects, not here.
  app.post("/api/sessions/:code/join", (req, res) => {
    const session = findSession(req, res);
    if (session) res.json(session.state);
  });

  app.get("/api/sessions/:code", (req, res) => {
    const session = findSession(req, res);
    if (session) res.json(session.state);
  });

  // Serves ai/analyze.py's precomputed results; nothing is analysed live.
  app.post("/api/scenes/analyze", (req, res) => {
    const body = analyzeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Body must be { clipId, timestamp }" });
      return;
    }
    const scene = sceneAt(body.data.clipId, body.data.timestamp);
    if (!scene) {
      res.status(404).json({ error: `No scene data for clip "${body.data.clipId}"` });
      return;
    }
    res.json(scene);
  });

  // Test shim from docs/tv-integration.md: same as a mode:update socket event.
  app.post("/api/sessions/:code/mode", (req, res) => {
    const session = findSession(req, res);
    if (!session) return;
    const body = modeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }
    changeMode(io, session, body.data.mode, body.data.source);
    res.json(session.state);
  });

  app.post("/api/ai/recommend", async (req, res) => {
    const body = recommendBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Body must be { code, request } with a 1-300 char request" });
      return;
    }
    const session = getSession(body.data.code);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }
    const now = Date.now();
    if (now - session.lastAiAt < AI_COOLDOWN_MS) {
      res.status(429).json({ error: "Slow down: one request every 3 seconds" });
      return;
    }
    session.lastAiAt = now;

    const rec = await recommend(session, body.data.request);
    if (!rec) {
      res.status(422).json({ error: OFF_TOPIC });
      return;
    }
    // Stays pending until a recommendation:respond with this id.
    session.pending = rec;
    io.to(session.state.code).emit("ai:recommendation", rec);
    res.json(rec);
  });

  return app;
}
