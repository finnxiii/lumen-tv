// Types mirror shared/contract.md. Keep them in sync.
export type ModeId = "cinema" | "night" | "bright" | "sports";

export interface PictureSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  shadows: number;
  sharpness: number;
}

export interface SessionState {
  code: string;
  phoneConnected: boolean;
  mode: ModeId;
  settings: PictureSettings;
  clipId: string;
  roomLight: "dark" | "dim" | "normal" | "bright";
  expiresAt: number;
}

export type RoomLight = SessionState["roomLight"];
export type Source = "phone" | "ai" | "tv" | "undo";

export interface Recommendation {
  id: string;
  request?: string;
  mode: ModeId;
  title: string;
  settings: PictureSettings;
  reasons: { label: string; value: string }[];
  explanation: string;
}

// shortcut: contract leaves these types open; 0..100 sliders assumed, confirm with NLH
export interface Preferences {
  style?: string | undefined;
  shadowDetail?: number | undefined;
  colourIntensity?: number | undefined;
}

export interface Session {
  state: SessionState;
  preferences: Preferences;
  /** Previous {mode, settings} for undo, newest last. */
  history: Pick<SessionState, "mode" | "settings">[];
  pending: Recommendation | undefined;
  playback: { position: number; playing: boolean } | undefined;
}

// No 0/O/1/I so codes can't be misread off the TV screen.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/;
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const ZERO_SETTINGS: PictureSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  shadows: 0,
  sharpness: 0,
};

const sessions = new Map<string, Session>();

function newCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: 4 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  } while (sessions.has(code));
  return code;
}

export function createSession(now = Date.now()): Session {
  const state: SessionState = {
    code: newCode(),
    phoneConnected: false,
    mode: "cinema",
    settings: { ...ZERO_SETTINGS },
    clipId: "night",
    roomLight: "dim",
    expiresAt: now + SESSION_TTL_MS,
  };
  const session: Session = {
    state,
    preferences: {},
    history: [],
    pending: undefined,
    playback: undefined,
  };
  sessions.set(state.code, session);
  return session;
}

/** Returns the live session and extends its expiry, or undefined if it's unknown or expired. */
export function getSession(code: string, now = Date.now()): Session | undefined {
  const session = sessions.get(code.toUpperCase());
  if (!session) return undefined;
  if (session.state.expiresAt <= now) {
    sessions.delete(session.state.code);
    return undefined;
  }
  session.state.expiresAt = now + SESSION_TTL_MS;
  return session;
}

export function sweepExpired(now = Date.now()): void {
  for (const [code, session] of sessions) {
    if (session.state.expiresAt <= now) sessions.delete(code);
  }
}
