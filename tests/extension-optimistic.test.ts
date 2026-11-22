import { describe, expect, it } from "vitest";
// Plain-JS module shipped in the extension (no build step); pure, so it runs under vitest directly.
import { acceptMusic, overlayPending, predictMusic, predictTimer, shouldApplyPoll } from "../extension/lib/optimistic.js";

const T0 = 1_800_000_000_000;

function state(timer: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    justCompleted: false,
    timer: {
      mode: "pomodoro", status: "idle", plannedDurationSec: 1500, remainingSec: 1500, pomodoroCount: 0, updatedAt: "a",
      startedAt: null, pausedAt: null, accumulatedPausedMs: 0, endsAt: null, sessionId: null, ...timer,
    },
    task: { id: "t1", title: "T", done: false, estimatedPomodoros: 2, completedPomodoros: 0, subtasks: [{ id: "s1", title: "a", done: false }, { id: "s2", title: "b", done: false }] },
    project: null,
    next: { start: { mode: "pomodoro", durationSec: 1500 }, breakOption: null },
    ...extra,
  };
}

describe("optimistic timer prediction (server timestamps)", () => {
  it("pause stamps the server time; resume adds the paused gap — same as the server rules", () => {
    const running = state({ status: "running", startedAt: T0, sessionId: "s" });
    const paused = predictTimer(running, "pause", undefined, T0 + 30_000)!;
    expect(paused.timer).toMatchObject({ status: "paused", pausedAt: T0 + 30_000, remainingSec: 1470, endsAt: null });
    const resumed = predictTimer(paused, "resume", undefined, T0 + 90_000)!;
    expect(resumed.timer).toMatchObject({ status: "running", accumulatedPausedMs: 60_000, remainingSec: 1470 });
    expect(resumed.timer.endsAt).toBe(T0 + 60_000 + 1_500_000);
  });

  it("starts the offered break or focus with its length, and refuses impossible actions", () => {
    const done = state({ status: "completed", remainingSec: 0 }, {
      next: { start: { mode: "pomodoro", durationSec: 1500 }, breakOption: { mode: "short_break", durationSec: 300 } },
    });
    expect(predictTimer(done, "start", "short_break", T0)!.timer).toMatchObject({ status: "running", mode: "short_break", startedAt: T0, endsAt: T0 + 300_000 });
    expect(predictTimer(done, "start", "pomodoro", T0)!.timer).toMatchObject({ mode: "pomodoro", remainingSec: 1500 });
    expect(predictTimer(done, "pause", undefined, T0)).toBeNull();
    expect(predictTimer(state({ status: "running", startedAt: T0 }), "start", undefined, T0)).toBeNull();
  });

  it("stopping a break returns to an idle focus", () => {
    const onBreak = state({ status: "running", mode: "short_break", startedAt: T0, plannedDurationSec: 300 });
    expect(predictTimer(onBreak, "stop", undefined, T0)!.timer).toMatchObject({ status: "idle", mode: "pomodoro", remainingSec: 1500, sessionId: null });
  });
});

describe("reconciliation", () => {
  it("ignores polls while a command is in flight, requested before its ack, or older than shown", () => {
    const base = { currentUpdatedAt: undefined, incomingUpdatedAt: undefined };
    expect(shouldApplyPoll({ ...base, inFlight: true, pollStartedAt: 10, lastAckAt: 0 })).toBe(false);
    expect(shouldApplyPoll({ ...base, inFlight: false, pollStartedAt: 10, lastAckAt: 20 })).toBe(false);
    expect(shouldApplyPoll({ ...base, inFlight: false, pollStartedAt: 30, lastAckAt: 20 })).toBe(true);
    // Versions are server-stamped; the formats differ (toISOString vs PostgREST) but compare as instants.
    expect(shouldApplyPoll({
      inFlight: false, pollStartedAt: 30, lastAckAt: 0,
      currentUpdatedAt: "2026-11-22T10:00:05.000Z", incomingUpdatedAt: "2026-11-22T10:00:04.500+00:00",
    })).toBe(false);
    expect(shouldApplyPoll({
      inFlight: false, pollStartedAt: 30, lastAckAt: 0,
      currentUpdatedAt: "2026-11-22T10:00:05.000Z", incomingUpdatedAt: "2026-11-22T10:00:06.000+00:00",
    })).toBe(true);
  });

  it("re-applies in-flight subtask / done clicks over a server snapshot", () => {
    const server = state({});
    const out = overlayPending(server, { subtasks: new Map([["s2", true]]), taskDone: { taskId: "t1", done: true } });
    expect(out.task!.done).toBe(true);
    expect(out.task!.subtasks.map((s: { done: boolean }) => s.done)).toEqual([false, true]);
    expect(overlayPending(server, { subtasks: new Map(), taskDone: { taskId: "other", done: true } }).task!.done).toBe(false);
  });

  it("holds an optimistic music state against Spotify's lagging reads", () => {
    const music = { connected: true, isPlaying: false, device: "Desktop", track: { name: "A" } };
    expect(predictMusic(music, "play")).toMatchObject({ isPlaying: true });
    expect(predictMusic({ connected: false }, "play")).toBeNull();
    const hold = { until: T0 + 3000, isPlaying: true };
    expect(acceptMusic({ ...music, isPlaying: false }, hold, T0 + 500)).toBe(false);
    expect(acceptMusic({ ...music, isPlaying: true }, hold, T0 + 500)).toBe(true);
    expect(acceptMusic({ ...music, isPlaying: false }, hold, T0 + 3500)).toBe(true);
    const skip = { until: T0 + 3000, isPlaying: true, fromTrack: "A" };
    expect(acceptMusic({ ...music, isPlaying: true }, skip, T0 + 500)).toBe(false);
    expect(acceptMusic({ ...music, isPlaying: true, track: { name: "B" } }, skip, T0 + 500)).toBe(true);
  });
});
