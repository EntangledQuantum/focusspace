"use client";

/**
 * Web Audio engine for notification sounds.
 *
 * Browsers only let an AudioContext start (or resume) inside a user gesture.
 * The old implementation created its context lazily at the moment a session
 * *completed* — a timer tick, not a gesture — so on Safari (and on Chrome after
 * a reload with no click yet) the context stayed "suspended", `await resume()`
 * never settled and the chime was silently dropped. Now:
 *
 *  - `unlockAudio()` is called synchronously from gestures (timer start/resume,
 *    any click on the focus page, the settings preview) so the context is
 *    already running when a session ends — including in a background tab.
 *  - playback never awaits a resume that can't succeed: if the context is
 *    still blocked after a short wait we skip the sound (the desktop
 *    notification still fires) instead of playing it late.
 *  - everything goes through a per-playback volume bus and a limiter, so 100%
 *    is loud but never clips, and a new sound cuts the previous one cleanly.
 */

import { getPattern, patternDuration, type SoundPattern } from "./presets";
import {
  normalizeToneId,
  volumeToGain,
  SOUND_PRESETS,
  type SoundKind,
} from "./sound-settings";

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: AudioNode | null = null;
let current: { bus: GainNode; oscillators: OscillatorNode[] } | null = null;

function getCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  // Safari < 14.1 only ships the prefixed constructor.
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function getContext(): AudioContext | null {
  if (ctx && ctx.state !== "closed") return ctx;
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  master = createMaster(ctx, ctx.destination);
  return ctx;
}

/**
 * Master chain: a brick-wall-ish limiter (lets the 100% setting push the synth
 * hot for loudness) followed by a small trim that absorbs the limiter's attack
 * overshoot, so peaks stay around −1 dBFS. Returns the chain's input node.
 */
export function createMaster(c: BaseAudioContext, destination: AudioNode): AudioNode {
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.2;
  const trim = c.createGain();
  trim.gain.value = 0.85;
  limiter.connect(trim);
  trim.connect(destination);
  return limiter;
}

/** Schedule every note/partial of a pattern into `out`, starting at `t0`. */
export function schedulePattern(c: BaseAudioContext, out: AudioNode, { voice, notes }: SoundPattern, t0: number): OscillatorNode[] {
  const nyquist = c.sampleRate / 2;
  let voiceIn: AudioNode = out;
  if (voice.lowpass) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = voice.lowpass;
    lp.Q.value = 0.5;
    lp.connect(out);
    voiceIn = lp;
  }

  const oscillators: OscillatorNode[] = [];
  for (const note of notes) {
    const start = t0 + note.at;
    const peakAt = start + voice.attack;
    const holdUntil = peakAt + voice.hold;
    for (const p of voice.partials) {
      const freq = note.freq * p.ratio + (p.detuneHz ?? 0);
      if (freq >= nyquist * 0.9) continue;
      const peak = voice.level * (note.velocity ?? 1) * p.amp;

      const osc = c.createOscillator();
      osc.type = p.type ?? "sine";
      osc.frequency.value = freq;

      const env = c.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(peak, peakAt);
      if (voice.hold > 0) env.gain.setValueAtTime(peak, holdUntil);
      env.gain.exponentialRampToValueAtTime(0.0001, holdUntil + p.decay);

      osc.connect(env);
      env.connect(voiceIn);
      osc.start(start);
      osc.stop(holdUntil + p.decay + 0.05);
      oscillators.push(osc);
    }
  }
  return oscillators;
}

function isRunning(c: AudioContext): boolean {
  return c.state === "running";
}

/**
 * Create / resume the audio context. Call synchronously from a user gesture
 * handler (click, keydown, …) — that's the only time browsers allow it.
 */
export function unlockAudio(): void {
  const c = getContext();
  if (!c || isRunning(c)) return;
  c.resume().catch(() => {});
  // Older iOS Safari only fully unlocks once something has actually played
  // inside the gesture: a one-sample silent buffer does it.
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}

let unlockInstalls = 0;
function onGesture() { unlockAudio(); }
function onVisible() {
  // Chrome/Firefox may allow a resume after an earlier interaction (sticky activation).
  if (document.visibilityState === "visible" && ctx && !isRunning(ctx)) ctx.resume().catch(() => {});
}

/**
 * Unlock audio on the first (and any later) user interaction with the page, so
 * a session that ends while the tab is in the background can still play.
 * Returns a cleanup function; safe to call from several components.
 */
export function installAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => {};
  if (unlockInstalls++ === 0) {
    window.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
    window.addEventListener("keydown", onGesture, { capture: true, passive: true });
    window.addEventListener("touchend", onGesture, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    if (--unlockInstalls === 0) {
      window.removeEventListener("pointerdown", onGesture, { capture: true });
      window.removeEventListener("keydown", onGesture, { capture: true });
      window.removeEventListener("touchend", onGesture, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

async function ensureRunning(c: AudioContext, timeoutMs: number): Promise<boolean> {
  if (isRunning(c)) return true;
  // resume() stays pending forever without user activation — never await it bare.
  await Promise.race([
    c.resume().catch(() => {}),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
  return isRunning(c);
}

/** Fade out and stop whatever is currently playing. */
export function stopSound(): void {
  if (!current || !ctx) return;
  const { bus, oscillators } = current;
  current = null;
  const t = ctx.currentTime;
  try {
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 0.04);
    for (const o of oscillators) o.stop(t + 0.06);
  } catch {
    /* already stopped */
  }
  setTimeout(() => { try { bus.disconnect(); } catch { /* ignore */ } }, 200);
}

export interface PlayOptions {
  kind?: SoundKind;
  /** 0–100 */
  volume: number;
}

/**
 * Play a notification sound. Resolves `true` once it's scheduled, `false` if it
 * couldn't play (muted, Web Audio unsupported, or audio still blocked by the
 * browser's autoplay policy).
 */
export async function playSound(toneId: string, { kind = "focus", volume }: PlayOptions): Promise<boolean> {
  const gain = volumeToGain(volume);
  if (gain <= 0) return false;

  // Synchronous up to here so a call from a click handler still counts as the gesture.
  const c = getContext();
  if (!c || !master) return false;
  if (!isRunning(c)) unlockAudio();
  if (!(await ensureRunning(c, 600))) return false;

  stopSound();

  const pattern = getPattern(normalizeToneId(toneId), kind);
  const bus = c.createGain();
  bus.gain.value = gain;
  bus.connect(master);
  const oscillators = schedulePattern(c, bus, pattern, c.currentTime + 0.03);

  const playback = { bus, oscillators };
  current = playback;
  const totalMs = (patternDuration(pattern) + 0.2) * 1000;
  setTimeout(() => {
    if (current === playback) current = null;
    try { bus.disconnect(); } catch { /* ignore */ }
  }, totalMs);
  return true;
}

export const TONE_OPTIONS = SOUND_PRESETS.map((p) => ({ value: p.id, label: p.label }));
