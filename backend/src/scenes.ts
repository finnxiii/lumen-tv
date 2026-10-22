import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const sceneSchema = z.object({
  clipId: z.string(),
  timestamp: z.number(),
  brightness: z.number().min(0).max(1),
  contrast: z.number().min(0).max(1),
  saturation: z.number().min(0).max(1),
  sceneChange: z.boolean(),
  label: z.string().optional(),
});
export type SceneInsights = z.infer<typeof sceneSchema>;

// Same path from src/ (tsx) and dist/ (node): <repo>/ai/scenes
const DEFAULT_DIR = fileURLToPath(new URL("../../ai/scenes", import.meta.url));

/** clipId → samples sorted by timestamp, written by ai/analyze.py. */
let scenes = new Map<string, SceneInsights[]>();

/** Loads every <clipId>.json in dir. Missing dir or bad files are logged and skipped. */
export function loadScenes(dir = process.env.SCENES_DIR || DEFAULT_DIR): void {
  scenes = new Map();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    console.warn(`[scenes] no ${dir}; run ai/analyze.py to enable scene insights`);
    return;
  }
  for (const file of files) {
    try {
      const samples = z.array(sceneSchema).parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
      if (!samples.length) continue;
      const clipId = file.slice(0, -".json".length);
      scenes.set(
        clipId,
        samples.sort((a, b) => a.timestamp - b.timestamp),
      );
    } catch (err) {
      console.warn(`[scenes] skipping ${file}:`, (err as Error).message);
    }
  }
  console.log(`[scenes] loaded ${[...scenes.keys()].join(", ") || "nothing"} from ${dir}`);
}

/** The latest sample at or before `timestamp` (the first sample if earlier). */
export function sceneAt(clipId: string, timestamp: number): SceneInsights | undefined {
  const samples = scenes.get(clipId);
  if (!samples) return undefined;
  let found = samples[0];
  for (const s of samples) {
    if (s.timestamp > timestamp) break;
    found = s;
  }
  return found;
}
