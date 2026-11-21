/**
 * Pure (DOM-free) notification-sound settings: preset catalogue, defaults,
 * normalisation of stored values and the volume → gain curve. Kept separate
 * from the Web Audio engine so it can be unit-tested and imported anywhere.
 */

export type SoundKind = "focus" | "break";

export const SOUND_PRESETS = [
  { id: "soft-chime", label: "Soft chime", hint: "Warm three-note chime" },
  { id: "gentle-bell", label: "Bell", hint: "Bright ringing bell" },
  { id: "marimba", label: "Marimba", hint: "Wooden, rounded mallet notes" },
  { id: "digital", label: "Digital beep", hint: "Sharp beeps, hardest to miss" },
  { id: "deep-bowl", label: "Singing bowl", hint: "Long shimmering bowl" },
] as const;

export type SoundPresetId = (typeof SOUND_PRESETS)[number]["id"];

const PRESET_IDS = new Set<string>(SOUND_PRESETS.map((p) => p.id));

export const DEFAULT_FOCUS_TONE: SoundPresetId = "soft-chime";
export const DEFAULT_BREAK_TONE: SoundPresetId = "marimba";
export const DEFAULT_SOUND_VOLUME = 80;

/** Unknown / legacy ids fall back to the given default instead of breaking playback. */
export function normalizeToneId(id: string | null | undefined, fallback: SoundPresetId = DEFAULT_FOCUS_TONE): SoundPresetId {
  return id && PRESET_IDS.has(id) ? (id as SoundPresetId) : fallback;
}

export function clampVolume(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SOUND_VOLUME;
  return Math.round(Math.min(100, Math.max(0, n)));
}

/**
 * Slider percentage → linear gain on the master bus.
 *
 * Linear sliders feel dead: the ear hears loudness logarithmically, so 0–50%
 * of a linear gain covers almost the whole audible range. We map the slider
 * linearly in decibels instead (−40 dB … +12 dB) so every step is an audible
 * change. The top ~25% drives the bus into the master limiter, which squeezes
 * the decaying tail up → genuinely loud at 100% without clipping. 0 is silence.
 */
export const VOLUME_MIN_DB = -40;
export const VOLUME_MAX_DB = 12;

export function volumeToGain(volume: number): number {
  const v = clampVolume(volume);
  if (v === 0) return 0;
  const db = VOLUME_MIN_DB + (VOLUME_MAX_DB - VOLUME_MIN_DB) * (v / 100);
  return Math.pow(10, db / 20);
}

export interface SoundSettingsInput {
  sound_enabled?: boolean | null;
  sound_volume?: number | null;
  completion_tone?: string | null;
  break_end_tone?: string | null;
}

export interface ResolvedSoundSettings {
  enabled: boolean;
  volume: number;
  focusTone: SoundPresetId;
  breakTone: SoundPresetId;
}

/** Fill defaults for rows created before the sound columns existed (or a missing row). */
export function resolveSoundSettings(s: SoundSettingsInput | null | undefined): ResolvedSoundSettings {
  return {
    enabled: s?.sound_enabled ?? true,
    volume: s?.sound_volume == null ? DEFAULT_SOUND_VOLUME : clampVolume(s.sound_volume),
    focusTone: normalizeToneId(s?.completion_tone, DEFAULT_FOCUS_TONE),
    breakTone: normalizeToneId(s?.break_end_tone, DEFAULT_BREAK_TONE),
  };
}

/** The tone that should play when a session of the given kind ends. */
export function toneFor(kind: SoundKind, s: ResolvedSoundSettings): SoundPresetId {
  return kind === "break" ? s.breakTone : s.focusTone;
}
