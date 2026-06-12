import type { BackdropVariant } from "@/components/effects/AnimatedBackdrop";

/**
 * Live effects are NOT backgrounds — they render on top of whatever background
 * (mesh preset or uploaded photo) the user has chosen. Each effect carries its
 * own customisable settings, persisted per-effect so switching remembers them.
 */
export interface EffectSettings {
  intensity: number; // 0–1 — glow / opacity
  speed: number;     // 0.25–2 — animation rate
  density: number;   // 0.3–1.5 — particle count multiplier (ignored by aurora)
}

export interface EffectDef {
  id: string;
  name: string;
  variant: BackdropVariant;
  defaults: EffectSettings;
  hasDensity: boolean;
}

export const EFFECTS: EffectDef[] = [
  // Aurora's pink runs hot, so it ships dialled-way-down by default.
  { id: "aurora",    name: "Aurora",    variant: "aurora",    defaults: { intensity: 0.18, speed: 0.8, density: 1 }, hasDensity: false },
  { id: "rain",      name: "Rainfall",  variant: "rain",      defaults: { intensity: 0.7,  speed: 1,   density: 1 }, hasDensity: true },
  { id: "snow",      name: "Snowfall",  variant: "snow",      defaults: { intensity: 0.8,  speed: 1,   density: 1 }, hasDensity: true },
  { id: "starfield", name: "Starfield", variant: "starfield", defaults: { intensity: 0.9,  speed: 1,   density: 1 }, hasDensity: true },
  { id: "fireflies", name: "Fireflies", variant: "fireflies", defaults: { intensity: 0.8,  speed: 1,   density: 1 }, hasDensity: true },
];

export function getEffect(id: string | null | undefined): EffectDef | null {
  if (!id) return null;
  return EFFECTS.find((e) => e.id === id) ?? null;
}

/** Resolve the stored settings for an effect, falling back to its defaults. */
export function effectSettingsFor(
  effectId: string,
  stored: Record<string, Partial<EffectSettings>> | null | undefined,
): EffectSettings {
  const def = EFFECTS.find((e) => e.id === effectId);
  const base = def?.defaults ?? { intensity: 0.6, speed: 1, density: 1 };
  const s = stored?.[effectId] ?? {};
  return {
    intensity: s.intensity ?? base.intensity,
    speed: s.speed ?? base.speed,
    density: s.density ?? base.density,
  };
}
