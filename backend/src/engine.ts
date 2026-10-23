import type { ModeId, PictureSettings, Preferences, RoomLight } from "./sessions.js";

export interface Reason {
  label: string;
  value: string;
}

/** Scene measurements, 0..1 (SceneInsights in shared/contract.md). */
export interface SceneMetrics {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface EngineInput {
  mode: ModeId;
  roomLight: RoomLight;
  preferences: Preferences;
  scene?: SceneMetrics | undefined;
  /** What the user asked for, from the AI (or rule fallback). */
  intents?: Intent[] | undefined;
}

type Delta = Partial<PictureSettings>;

export const INTENTS = {
  more_shadow_detail: { shadows: 15, brightness: 5 },
  more_bright: { brightness: 15 },
  less_bright: { brightness: -15 },
  more_vivid: { saturation: 15 },
  less_vivid: { saturation: -15 },
  more_contrast: { contrast: 10 },
  less_contrast: { contrast: -10 },
  warmer: { warmth: 15 },
  cooler: { warmth: -15 },
  sharper: { sharpness: 15 },
} satisfies Record<string, Delta>;
export type Intent = keyof typeof INTENTS;
export const INTENT_IDS = Object.keys(INTENTS) as [Intent, ...Intent[]];

const LIMIT = 50;

// Mirrors the ffmpeg filters in tv/scripts/make-media.sh so the numbers match the rendered variants:
// contrast/saturation = (eq factor - 1) * 100, brightness = eq brightness * 200,
// warmth = (red gain - blue gain) * 100, sharpness from unsharp.
export const PRESETS: Record<ModeId, PictureSettings> = {
  original: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, shadows: 0, sharpness: 0 },
  cinema: { brightness: -16, contrast: 25, saturation: -25, warmth: -22, shadows: 0, sharpness: 0 },
  night: { brightness: -36, contrast: -5, saturation: 20, warmth: 45, shadows: 0, sharpness: 0 },
  bright: { brightness: 24, contrast: 15, saturation: 40, warmth: 0, shadows: 0, sharpness: 0 },
  sports: { brightness: 12, contrast: 35, saturation: 50, warmth: 0, shadows: 0, sharpness: 40 },
};

export const MODE_LABEL: Record<ModeId, string> = {
  original: "Original",
  cinema: "Cinema",
  night: "Night",
  bright: "Bright Room",
  sports: "Sports",
};

const ROOM: Record<RoomLight, Delta> = {
  dark: { brightness: -10 },
  dim: {},
  normal: { brightness: 5 },
  bright: { brightness: 15, contrast: 10 },
};

function sceneDelta(scene: SceneMetrics): [Delta, string][] {
  const out: [Delta, string][] = [];
  if (scene.brightness < 0.25) out.push([{ shadows: 20, brightness: 5 }, "Dark scene"]);
  if (scene.brightness > 0.75) out.push([{ brightness: -10 }, "Very bright scene"]);
  if (scene.saturation < 0.25) out.push([{ saturation: 10 }, "Muted colours"]);
  return out;
}

/** 0..100 slider, 50 = neutral → -20..+20. */
const slider = (v: number) => Math.round((v - 50) * 0.4);

function describe(delta: Delta): string {
  return Object.entries(delta)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`)
    .join(", ");
}

/** Mode preset + room light + scene + intents + preferences, clamped to ±50, with a reason per adjustment. */
export function computeSettings(input: EngineInput): {
  settings: PictureSettings;
  reasons: Reason[];
} {
  const settings = { ...PRESETS[input.mode] };
  const reasons: Reason[] = [{ label: "Mode", value: `${MODE_LABEL[input.mode]} preset` }];

  const adjust = (label: string, why: string, delta: Delta) => {
    const text = describe(delta);
    if (!text) return;
    for (const [k, v] of Object.entries(delta) as [keyof PictureSettings, number][]) {
      settings[k] += v;
    }
    reasons.push({ label, value: `${why}: ${text}` });
  };

  adjust("Room light", input.roomLight, ROOM[input.roomLight]);
  if (input.scene) {
    for (const [delta, why] of sceneDelta(input.scene)) adjust("Scene", why, delta);
  }
  for (const intent of new Set(input.intents)) {
    adjust("You asked", intent.replaceAll("_", " "), INTENTS[intent]);
  }
  const { shadowDetail, colourIntensity } = input.preferences;
  if (shadowDetail !== undefined) {
    adjust("Preference", "Shadow detail", { shadows: slider(shadowDetail) });
  }
  if (colourIntensity !== undefined) {
    adjust("Preference", "Colour intensity", { saturation: slider(colourIntensity) });
  }

  for (const k of Object.keys(settings) as (keyof PictureSettings)[]) {
    settings[k] = Math.max(-LIMIT, Math.min(LIMIT, settings[k]));
  }
  return { settings, reasons };
}
