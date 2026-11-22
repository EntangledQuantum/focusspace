// Server-clock offset (NTP-style) — mirror of src/lib/timer/clock.ts.
// All timer timestamps are server epoch ms; the extension renders them with
// Date.now() + offset so every client shows the same countdown, whatever the
// local clock says.

const MAX_SAMPLES = 8;
const MAX_AGE_MS = 10 * 60_000;

export function sampleOffset(serverNow, t0, t1) {
  return { offset: serverNow - (t0 + t1) / 2, rtt: Math.max(0, t1 - t0), at: t1 };
}

export function addSample(samples, s, now = s.at) {
  const kept = [...samples, s].filter((x) => now - x.at <= MAX_AGE_MS).slice(-MAX_SAMPLES);
  const best = kept.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  return { samples: kept, offset: Math.round(best.offset) };
}

/** Remaining whole seconds of a timer (server timestamps) at a server time. */
export function remainingAt(t, serverNow) {
  if (!t) return 0;
  if (t.status === "idle" || !t.startedAt) return t.plannedDurationSec;
  if (t.status === "completed") return 0;
  const end = t.status === "paused" && t.pausedAt ? t.pausedAt : serverNow;
  const elapsedMs = end - t.startedAt - t.accumulatedPausedMs;
  return Math.max(0, Math.ceil(t.plannedDurationSec - elapsedMs / 1000));
}
