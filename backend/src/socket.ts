import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { suggestForScene } from "./ai.js";
import { computeSettings } from "./engine.js";
import { sceneAt } from "./scenes.js";
import {
  modeSchema,
  CODE_PATTERN,
  getSession,
  type ModeId,
  type PictureSettings,
  type Session,
  type Source,
} from "./sessions.js";

const MAX_HISTORY = 20;

const roleSchema = z.enum(["tv", "phone"]);
type Role = z.infer<typeof roleSchema>;

const handshakeSchema = z.object({
  code: z.string().toUpperCase().regex(CODE_PATTERN),
  role: roleSchema,
});

const schemas = {
  // `source` from the client is ignored; the socket's role is the source of truth.
  "mode:update": z.object({ mode: modeSchema }),
  "recommendation:respond": z.object({ id: z.string(), accepted: z.boolean() }),
  "settings:undo": z.unknown(),
  "playback:update": z.object({
    clipId: z.string().min(1).max(64),
    position: z.number().nonnegative(),
    playing: z.boolean(),
  }),
  "preferences:update": z.object({
    roomLight: z.enum(["dark", "dim", "normal", "bright"]).optional(),
    style: z.string().max(32).optional(),
    shadowDetail: z.number().min(0).max(100).optional(),
    colourIntensity: z.number().min(0).max(100).optional(),
  }),
  // `undo` isn't in shared/contract.md; docs/tv-integration.md says the phone's Undo button sends it.
  "playback:request": z.object({
    action: z.enum(["play", "pause", "seek", "undo"]),
    position: z.number().nonnegative().optional(),
  }),
};
type EventName = keyof typeof schemas;

/** Applies {mode, settings} and tells everyone in the room. */
function apply(
  io: Server,
  session: Session,
  mode: ModeId,
  settings: PictureSettings,
  source: Source,
): void {
  session.state.mode = mode;
  session.state.settings = settings;
  io.to(session.state.code).emit("settings:apply", { mode, settings, source });
  io.to(session.state.code).emit("session:state", session.state);
}

function pushHistory(session: Session): void {
  const { mode, settings } = session.state;
  session.history.push({ mode, settings });
  if (session.history.length > MAX_HISTORY) session.history.shift();
}

export function changeMode(io: Server, session: Session, mode: ModeId, source: Source): void {
  pushHistory(session);
  const { roomLight } = session.state;
  const { preferences, scene } = session;
  const { settings } = computeSettings({ mode, roomLight, preferences, scene });
  apply(io, session, mode, settings, source);
}

export function undo(io: Server, session: Session): void {
  const prev = session.history.pop();
  if (prev) apply(io, session, prev.mode, prev.settings, "undo");
}

/** phoneConnected = at least one phone socket in the room right now. */
function updatePresence(io: Server, code: string): void {
  const session = getSession(code);
  if (!session) return;
  session.state.phoneConnected = (io.sockets.adapter.rooms.get(`${code}:phone`)?.size ?? 0) > 0;
  io.to(code).emit("session:state", session.state);
}

export function attachSocketHandlers(io: Server): void {
  io.use((socket, next) => {
    const hs = handshakeSchema.safeParse(socket.handshake.query);
    if (!hs.success) return next(new Error("invalid code or role"));
    if (!getSession(hs.data.code)) return next(new Error("session not found or expired"));
    socket.data = hs.data;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const { code, role } = socket.data as { code: string; role: Role };
    // `${code}:tv` / `${code}:phone` let us target one role and count phones.
    void socket.join([code, `${code}:${role}`]);
    console.log(`[socket] ${role} connected to ${code}`);
    updatePresence(io, code);
    socket.on("disconnect", (reason) => {
      console.log(`[socket] ${role} left ${code} (${reason})`);
      updatePresence(io, code);
    });

    /** Validates sender role and payload; drops the socket if its session has gone. */
    function on<E extends EventName>(
      event: E,
      roles: Role[],
      handler: (session: Session, payload: z.infer<(typeof schemas)[E]>) => void,
    ): void {
      const schema = schemas[event] as z.ZodType<z.infer<(typeof schemas)[E]>>;
      socket.on(event as string, (raw: unknown) => {
        if (!roles.includes(role)) return;
        const session = getSession(code);
        if (!session) {
          socket.disconnect(true);
          return;
        }
        const payload = schema.safeParse(raw ?? {});
        if (!payload.success) {
          console.warn(`[socket] bad ${event} from ${role} in ${code}`);
          return;
        }
        handler(session, payload.data);
      });
    }

    on("mode:update", ["tv", "phone"], (session, { mode }) => {
      changeMode(io, session, mode, role);
    });

    on("settings:undo", ["tv", "phone"], (session) => undo(io, session));

    on("recommendation:respond", ["tv", "phone"], (session, { id, accepted }) => {
      const rec = session.pending;
      if (!rec || rec.id !== id) return;
      session.pending = undefined;
      if (accepted) {
        pushHistory(session);
        apply(io, session, rec.mode, rec.settings, "ai");
      }
    });

    on("playback:update", ["tv"], (session, { clipId, position, playing }) => {
      session.playback = { position, playing };
      if (clipId !== session.state.clipId) {
        session.state.clipId = clipId;
        io.to(code).emit("session:state", session.state);
      }
      // Samples are 1 s apart and updates ~2 s, so this fires about once per update while playing.
      const scene = sceneAt(clipId, position);
      if (scene !== session.scene) {
        const prevLabel = session.scene?.label;
        session.scene = scene;
        if (scene) io.to(code).emit("scene:insights", scene);
        const rec = scene && scene.label !== prevLabel ? suggestForScene(session) : undefined;
        if (rec) {
          session.pending = rec;
          io.to(code).emit("ai:recommendation", rec);
        }
      }
    });

    on("preferences:update", ["phone"], (session, { roomLight, ...prefs }) => {
      if (roomLight) session.state.roomLight = roomLight;
      Object.assign(session.preferences, prefs);
      io.to(code).emit("session:state", session.state);
    });

    on("playback:request", ["phone"], (session, { action, position }) => {
      if (action === "undo") return undo(io, session);
      io.to(`${code}:tv`).emit("playback:command", { action, position });
    });
  });
}
