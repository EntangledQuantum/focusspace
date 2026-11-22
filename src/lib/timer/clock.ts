/**
 * Server-clock offset estimation (NTP-style). All timer timestamps are server
 * epoch ms, so a client whose own clock is off by minutes would otherwise show
 * a different countdown than everyone else. Each API response carries
 * `serverNow`; the server clock read happened somewhere between the request
 * being sent (t0) and the response arriving (t1), so the best estimate is the
 * midpoint, and samples with the smallest round trip are the most precise.
 *
 * Mirrored in extension/lib/clock.js (no build step there); both are tested
 * against the same cases.
 */

export interface ClockSample {
  offset: number; // serverNow - local midpoint
  rtt: number;
  at: number; // local time the sample was taken
}

const MAX_SAMPLES = 8;
const MAX_AGE_MS = 10 * 60_000;

export function sampleOffset(serverNow: number, t0: number, t1: number): ClockSample {
  return { offset: serverNow - (t0 + t1) / 2, rtt: Math.max(0, t1 - t0), at: t1 };
}

/** Keep recent samples; the estimate is the one with the lowest round trip. */
export function addSample(samples: ClockSample[], s: ClockSample, now = s.at): { samples: ClockSample[]; offset: number } {
  const kept = [...samples, s].filter((x) => now - x.at <= MAX_AGE_MS).slice(-MAX_SAMPLES);
  const best = kept.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  return { samples: kept, offset: Math.round(best.offset) };
}

export interface TimerTimes {
  status: "idle" | "running" | "paused" | "completed";
  plannedDurationSec: number;
  startedAt: number | null;
  pausedAt: number | null;
  accumulatedPausedMs: number;
}

/** Remaining whole seconds at a given server time (rounded up, like a countdown). */
export function remainingAt(t: TimerTimes, serverNow: number): number {
  if (t.status === "idle" || !t.startedAt) return t.plannedDurationSec;
  if (t.status === "completed") return 0;
  const end = t.status === "paused" && t.pausedAt ? t.pausedAt : serverNow;
  const elapsedMs = end - t.startedAt - t.accumulatedPausedMs;
  return Math.max(0, Math.ceil(t.plannedDurationSec - elapsedMs / 1000));
}
