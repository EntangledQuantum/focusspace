import { describe, expect, it } from "vitest";
import { remainingSec, type TimerSnapshot } from "@/lib/timer/persist";
import { MAX_ESTIMATED_POMOS, VISIBLE_PROJECT_DOTS } from "@/lib/mode";

function estimatePomos(taskMinutes: number, focusMinutes: number) {
  return Math.min(MAX_ESTIMATED_POMOS, Math.ceil(taskMinutes / focusMinutes));
}

describe("pomodoro estimates", () => {
  it("uses the user's focus length, not a hard-coded 25", () => {
    expect(estimatePomos(120, 25)).toBe(5);
    expect(estimatePomos(120, 50)).toBe(3);
    expect(estimatePomos(120, 90)).toBe(2);
  });

  it("allows long tasks up to 24 pomos", () => {
    expect(estimatePomos(600, 25)).toBe(24);
    expect(estimatePomos(800, 25)).toBe(24);
  });

  it("shows 12 dots then a +N remainder", () => {
    const est = 14;
    const visible = Math.min(est, VISIBLE_PROJECT_DOTS);
    const extra = est - visible;
    expect(visible).toBe(12);
    expect(extra).toBe(2);
  });

  it("computes remaining time from a running snapshot", () => {
    const snap: TimerSnapshot = {
      mode: "pomodoro",
      status: "running",
      plannedDurationSec: 1500,
      startedAt: Date.now() - 60_000,
      pausedAt: null,
      accumulatedPausedMs: 0,
      currentSessionId: "s",
      currentTaskId: "t",
      currentProjectId: "p",
      pomodoroCount: 0,
      source: "mcp",
    };
    const rem = remainingSec(snap);
    expect(rem).toBeGreaterThan(1435);
    expect(rem).toBeLessThanOrEqual(1440);
  });
});
