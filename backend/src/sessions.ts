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

const sessions = new Map<string, SessionState>();

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

export function createSession(now = Date.now()): SessionState {
  const state: SessionState = {
    code: newCode(),
    phoneConnected: false,
    mode: "cinema",
    settings: { ...ZERO_SETTINGS },
    clipId: "night",
    roomLight: "dim",
    expiresAt: now + SESSION_TTL_MS,
  };
  sessions.set(state.code, state);
  return state;
}

/** Returns the live session and extends its expiry, or undefined if it's unknown or expired. */
export function getSession(code: string, now = Date.now()): SessionState | undefined {
  const state = sessions.get(code.toUpperCase());
  if (!state) return undefined;
  if (state.expiresAt <= now) {
    sessions.delete(state.code);
    return undefined;
  }
  state.expiresAt = now + SESSION_TTL_MS;
  return state;
}

export function sweepExpired(now = Date.now()): void {
  for (const [code, state] of sessions) {
    if (state.expiresAt <= now) sessions.delete(code);
  }
}
