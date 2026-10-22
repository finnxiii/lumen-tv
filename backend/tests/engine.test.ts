import { describe, expect, it } from "vitest";
import { PRESETS, computeSettings } from "../src/engine.js";

const base = { mode: "cinema", roomLight: "dim", preferences: {} } as const;

describe("computeSettings", () => {
  it("dim room, no scene, no prefs = the mode preset", () => {
    const { settings, reasons } = computeSettings(base);
    expect(settings).toEqual(PRESETS.cinema);
    expect(reasons).toEqual([{ label: "Mode", value: "Cinema preset" }]);
  });

  it("bright room lifts brightness and contrast", () => {
    const { settings, reasons } = computeSettings({ ...base, roomLight: "bright" });
    expect(settings.brightness).toBe(PRESETS.cinema.brightness + 15);
    expect(settings.contrast).toBe(PRESETS.cinema.contrast + 10);
    expect(reasons[1]).toEqual({
      label: "Room light",
      value: "bright: +15 brightness, +10 contrast",
    });
  });

  it("dark scene lifts shadows; muted scene lifts saturation", () => {
    const scene = { brightness: 0.1, contrast: 0.5, saturation: 0.1 };
    const { settings, reasons } = computeSettings({ ...base, scene });
    expect(settings.shadows).toBe(20);
    expect(settings.saturation).toBe(PRESETS.cinema.saturation + 10);
    expect(reasons.map((r) => r.label)).toEqual(["Mode", "Scene", "Scene"]);
  });

  it("preference sliders: 50 is neutral, 0..100 maps to -20..+20", () => {
    const neutral = computeSettings({
      ...base,
      preferences: { shadowDetail: 50, colourIntensity: 50 },
    });
    expect(neutral.settings).toEqual(PRESETS.cinema);
    expect(neutral.reasons).toHaveLength(1);

    const { settings } = computeSettings({
      ...base,
      preferences: { shadowDetail: 100, colourIntensity: 0 },
    });
    expect(settings.shadows).toBe(20);
    expect(settings.saturation).toBe(PRESETS.cinema.saturation - 20);
  });

  it("intents add their deltas once each, with a reason", () => {
    const { settings, reasons } = computeSettings({
      ...base,
      intents: ["more_shadow_detail", "warmer", "warmer"],
    });
    expect(settings.shadows).toBe(15);
    expect(settings.warmth).toBe(PRESETS.cinema.warmth + 15);
    expect(reasons.slice(1)).toEqual([
      { label: "You asked", value: "more shadow detail: +15 shadows, +5 brightness" },
      { label: "You asked", value: "warmer: +15 warmth" },
    ]);
  });

  it("clamps every value to ±50", () => {
    const { settings } = computeSettings({
      mode: "sports",
      roomLight: "bright",
      preferences: { colourIntensity: 100 },
      scene: { brightness: 0.5, contrast: 0.5, saturation: 0.1 },
    });
    // sports saturation 50 + 10 (scene) + 20 (pref) would be 80
    expect(settings.saturation).toBe(50);
    for (const v of Object.values(settings)) expect(Math.abs(v)).toBeLessThanOrEqual(50);
  });
});
