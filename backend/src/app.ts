import cors from "cors";
import express, { type Request, type Response } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import { CODE_PATTERN, createSession, getSession, type Session } from "./sessions.js";
import { changeMode, modeSchema } from "./socket.js";

const codeParam = z.string().toUpperCase().regex(CODE_PATTERN);
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

  return app;
}
