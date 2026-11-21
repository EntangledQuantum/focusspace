import { describe, expect, it } from "vitest";
// Plain-JS module shipped in the extension (no build step); pure, so it runs under vitest directly.
import { acceptMusic, overlayPending, predictMusic, predictTimer, shouldApplyPoll } from "../extension/lib/optimistic.js";

const T0 = 1_800_000_000_000;

function state(timer: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    justCompleted: false,
    timer: { mode: "pomodoro", status: "idle", plannedDurationSec: 1500, remainingSec: 1500, pomodoroCount: 0, updatedAt: "a", ...timer },
    task: { id: "t1", title: "T", done: false, estimatedPomodoros: 2, completedPomodoros: 0, subtasks: [{ id: "s1", title: "a", done: false }, { id: "s2", title: "b", done: false }] },
    project: null,
    next: { start: { mode: "pomodoro", durationSec: 1500 }, breakOption: null },
    ...extra,
  };
}

describe("optimistic timer prediction", () => {
  it("pause freezes the locally counted-down time; resume continues from it", () => {
    const running = state({ status: "running", remainingSec: 600 });
    const paused = predictTimer(running, T0, "pause", undefined, T0 + 30_000)!;
    expect(paused.state.timer).toMatchObject({ status: "paused", remainingSec: 570 });
    const resumed = predictTimer(paused.state, paused.receivedAt, "resume", undefined, T0 + 90_000)!;
    expect(resumed.state.timer).toMatchObject({ status: "running", remainingSec: 570 });
    expect(resumed.receivedAt).toBe(T0 + 90_000);
  });

  it("starts the offered break or focus with its length, and refuses impossible actions", () => {
    const done = state({ status: "completed", remainingSec: 0 }, {
      next: { start: { mode: "pomodoro", durationSec: 1500 }, breakOption: { mode: "short_break", durationSec: 300 } },
    });
    expect(predictTimer(done, T0, "start", "short_break", T0)!.state.timer).toMatchObject({ status: "running", mode: "short_break", remainingSec: 300 });
    expect(predictTimer(done, T0, "start", "pomodoro", T0)!.state.timer).toMatchObject({ mode: "pomodoro", remainingSec: 1500 });
    expect(predictTimer(done, T0, "pause", undefined, T0)).toBeNull();
    expect(predictTimer(state({ status: "running" }), T0, "start", undefined, T0)).toBeNull();
  });

  it("stopping a break returns to an idle focus", () => {
    const onBreak = state({ status: "running", mode: "short_break", remainingSec: 100 });
    expect(predictTimer(onBreak, T0, "stop", undefined, T0)!.state.timer).toMatchObject({ status: "idle", mode: "pomodoro", remainingSec: 1500 });
  });
});

describe("reconciliation", () => {
  it("ignores polls while a command is in flight or requested before its ack", () => {
    expect(shouldApplyPoll({ inFlight: true, pollStartedAt: 10, lastAckAt: 0 })).toBe(false);
    expect(shouldApplyPoll({ inFlight: false, pollStartedAt: 10, lastAckAt: 20 })).toBe(false);
    expect(shouldApplyPoll({ inFlight: false, pollStartedAt: 30, lastAckAt: 20 })).toBe(true);
    expect(shouldApplyPoll({ inFlight: false, pollStartedAt: 5, lastAckAt: 0 })).toBe(true);
  });

  it("re-applies in-flight subtask / done clicks over a server snapshot", () => {
    const server = state({});
    const out = overlayPending(server, { subtasks: new Map([["s2", true]]), taskDone: { taskId: "t1", done: true } });
    expect(out.task!.done).toBe(true);
    expect(out.task!.subtasks.map((s: { done: boolean }) => s.done)).toEqual([false, true]);
    // A pending "done" for a different task (the server moved on) is not applied.
    expect(overlayPending(server, { subtasks: new Map(), taskDone: { taskId: "other", done: true } }).task!.done).toBe(false);
  });

  it("holds an optimistic music state against Spotify's lagging reads", () => {
    const music = { connected: true, isPlaying: false, device: "Desktop", track: { name: "A" } };
    expect(predictMusic(music, "play")).toMatchObject({ isPlaying: true });
    expect(predictMusic({ connected: false }, "play")).toBeNull();
    const hold = { until: T0 + 3000, isPlaying: true };
    expect(acceptMusic({ ...music, isPlaying: false }, hold, T0 + 500)).toBe(false); // stale read
    expect(acceptMusic({ ...music, isPlaying: true }, hold, T0 + 500)).toBe(true); // caught up
    expect(acceptMusic({ ...music, isPlaying: false }, hold, T0 + 3500)).toBe(true); // hold expired: trust Spotify
    const skip = { until: T0 + 3000, isPlaying: true, fromTrack: "A" };
    expect(acceptMusic({ ...music, isPlaying: true }, skip, T0 + 500)).toBe(false); // still the old track
    expect(acceptMusic({ ...music, isPlaying: true, track: { name: "B" } }, skip, T0 + 500)).toBe(true);
  });
});
