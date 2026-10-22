import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { CODE_PATTERN, createSession, getSession } from "./sessions.js";

const codeParam = z.string().toUpperCase().regex(CODE_PATTERN);

/** Validates :code and sends the session, or a 400/404 error. */
function sendSession(req: Request, res: Response): void {
  const code = codeParam.safeParse(req.params.code);
  if (!code.success) {
    res.status(400).json({ error: "Invalid room code" });
    return;
  }
  const state = getSession(code.data);
  if (!state) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }
  res.json(state);
}

export function createApp() {
  const app = express();

  // shortcut: any origin allowed, lock to the phone site's URL once it's hosted
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "OK" });
  });

  app.post("/api/sessions", (_req, res) => {
    res.status(201).json(createSession());
  });

  // phoneConnected flips when the phone's socket connects (task 3), not here.
  app.post("/api/sessions/:code/join", sendSession);
  app.get("/api/sessions/:code", sendSession);

  return app;
}
