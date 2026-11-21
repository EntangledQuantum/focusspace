/**
 * Synthesised notification-sound presets (no audio files).
 *
 * Each preset is a "voice" (a stack of oscillator partials with an amplitude
 * envelope) plus a short motif. Focus-end motifs fall (time to relax); break-end
 * motifs rise (back to work), so the two are distinguishable even with the same
 * preset. Motifs repeat so a single chime can't slip by unnoticed.
 *
 * Pitches sit around 0.5–2 kHz with plenty of upper partials — the range small
 * laptop/phone speakers reproduce well and the ear is most sensitive to. The old
 * tones were pure sines down to 220 Hz, which those speakers barely produce.
 */
import type { SoundKind, SoundPresetId } from "./sound-settings";

export type Waveform = "sine" | "triangle" | "square" | "sawtooth";

export interface VoicePartial {
  /** Frequency multiple of the note's pitch. */
  ratio: number;
  /** Relative amplitude. */
  amp: number;
  /** Seconds from peak down to silence (−80 dB). */
  decay: number;
  type?: Waveform;
  /** Absolute Hz offset — a detuned twin produces the slow "beating" shimmer of a bowl. */
  detuneHz?: number;
}

export interface Voice {
  partials: VoicePartial[];
  /** Attack time in seconds. */
  attack: number;
  /** Seconds held at full level before decaying (beeps); 0 for struck sounds. */
  hold: number;
  /** Overall level so presets come out roughly equally loud. */
  level: number;
  /** Optional low-pass cutoff (Hz) to round off harsh waveforms. */
  lowpass?: number;
}

export interface NoteEvent {
  /** Start offset in seconds. */
  at: number;
  freq: number;
  velocity?: number;
}

export interface SoundPattern {
  voice: Voice;
  notes: NoteEvent[];
}

const N = {
  G4: 392.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
  B5: 987.77, C6: 1046.5, E6: 1318.51, G6: 1567.98, A6: 1760.0,
} as const;

function seq(freqs: number[], step: number, start = 0, velocity = 1): NoteEvent[] {
  return freqs.map((freq, i) => ({ at: start + i * step, freq, velocity }));
}

function repeat(notes: NoteEvent[], times: number, period: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let r = 0; r < times; r++) {
    for (const n of notes) out.push({ ...n, at: n.at + r * period });
  }
  return out;
}

const VOICES: Record<SoundPresetId, Voice> = {
  "soft-chime": {
    attack: 0.006, hold: 0, level: 0.3,
    partials: [
      { ratio: 1, amp: 1, decay: 2.2 },
      { ratio: 1, amp: 0.3, decay: 1.6, type: "triangle" },
      { ratio: 2, amp: 0.4, decay: 1.3 },
      { ratio: 3, amp: 0.18, decay: 0.8 },
    ],
  },
  "gentle-bell": {
    attack: 0.002, hold: 0, level: 0.26,
    partials: [
      { ratio: 0.5, amp: 0.22, decay: 3.0 },
      { ratio: 1, amp: 1, decay: 2.8 },
      { ratio: 1.19, amp: 0.3, decay: 2.0 },
      { ratio: 1.5, amp: 0.22, decay: 1.6 },
      { ratio: 2, amp: 0.55, decay: 1.6 },
      { ratio: 2.74, amp: 0.32, decay: 1.0 },
      { ratio: 3.76, amp: 0.16, decay: 0.7 },
      { ratio: 5.4, amp: 0.1, decay: 0.45 },
    ],
  },
  marimba: {
    attack: 0.002, hold: 0, level: 0.45,
    partials: [
      { ratio: 1, amp: 1, decay: 0.9 },
      { ratio: 4, amp: 0.4, decay: 0.25 },
      { ratio: 10, amp: 0.1, decay: 0.08 },
    ],
  },
  digital: {
    attack: 0.004, hold: 0.1, level: 0.25, lowpass: 5000,
    partials: [{ ratio: 1, amp: 1, decay: 0.05, type: "square" }],
  },
  "deep-bowl": {
    attack: 0.012, hold: 0, level: 0.28,
    partials: [
      { ratio: 1, amp: 1, decay: 4.0 },
      { ratio: 1, amp: 0.5, decay: 4.0, detuneHz: 2.5 },
      { ratio: 2.71, amp: 0.5, decay: 3.0 },
      { ratio: 2.71, amp: 0.25, decay: 3.0, detuneHz: -3 },
      { ratio: 5.15, amp: 0.28, decay: 1.8 },
      { ratio: 8.2, amp: 0.1, decay: 1.0 },
    ],
  },
};

const MOTIFS: Record<SoundPresetId, Record<SoundKind, NoteEvent[]>> = {
  "soft-chime": {
    focus: repeat(seq([N.E6, N.C6, N.G5], 0.2), 2, 1.6),
    break: repeat(seq([N.G5, N.C6, N.E6, N.G6], 0.16), 2, 1.6),
  },
  "gentle-bell": {
    focus: repeat([{ at: 0, freq: N.A5 }, { at: 0.55, freq: N.E5 }], 2, 2.2),
    break: repeat([{ at: 0, freq: N.E5 }, { at: 0.28, freq: N.A5 }], 2, 1.6),
  },
  marimba: {
    focus: repeat(seq([N.C6, N.G5, N.E5, N.C5], 0.13), 2, 1.2),
    break: repeat([...seq([N.C5, N.E5, N.G5, N.C6], 0.12), { at: 0.6, freq: N.C6 }], 2, 1.3),
  },
  digital: {
    focus: repeat(seq([N.E6, N.E6], 0.16), 3, 0.6),
    break: repeat(seq([N.B5, N.E6, N.A6], 0.14), 2, 0.8),
  },
  "deep-bowl": {
    focus: [{ at: 0, freq: N.G4 }, { at: 1.8, freq: N.G4 }],
    break: repeat([{ at: 0, freq: N.D5 }, { at: 0.45, freq: N.G5 }], 2, 2.0),
  },
};

export function getPattern(id: SoundPresetId, kind: SoundKind): SoundPattern {
  return { voice: VOICES[id], notes: MOTIFS[id][kind] };
}

/** Seconds until the last partial of the pattern has faded out. */
export function patternDuration({ voice, notes }: SoundPattern): number {
  const longest = Math.max(...voice.partials.map((p) => p.decay));
  const lastStart = Math.max(...notes.map((n) => n.at));
  return lastStart + voice.attack + voice.hold + longest;
}
