import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyPause, applyResume, applySelectTask, breakAfterFocus, closeOut, elapsedSec,
  emptySnapshot, isOverdue, pomodoroDuration, remaining, type TimerSettings,
} from "@/lib/timer/commands";
import type { TimerSnapshot } from "@/lib/timer/persist";

const SETTINGS: TimerSettings = { focusSec: 1500, shortBreakSec: 300, longBreakSec: 900, longBreakEvery: 4 };
const T0 = 1_800_000_000_000;

function running(over: Partial<TimerSnapshot> = {}): TimerSnapshot {
  return { ...emptySnapshot(SETTINGS), status: "running", startedAt: T0, currentSessionId: "s1", ...over };
}

describe("timer command transitions", () => {
  it("pause freezes the clock and resume adds the paused gap", () => {
    const paused = applyPause(running(), T0 + 60_000)!;
    expect(paused.status).toBe("paused");
    expect(remaining(paused, T0 + 600_000)).toBe(1500 - 60);
    const resumed = applyResume(paused, T0 + 300_000)!;
    expect(resumed.accumulatedPausedMs).toBe(240_000);
    expect(elapsedSec(resumed, T0 + 360_000)).toBe(120);
    expect(applyPause(paused, T0)).toBeNull();
    expect(applyResume(resumed, T0)).toBeNull();
  });

  it("overdue only after the countdown (incl. paused time) ends plus grace", () => {
    const s = running({ accumulatedPausedMs: 10_000 });
    const end = T0 + 10_000 + 1_500_000;
    expect(isOverdue(s, end)).toBe(false);
    expect(isOverdue(s, end + 3_000)).toBe(true);
    expect(isOverdue({ ...s, status: "paused", pausedAt: T0 + 1 }, end + 60_000)).toBe(false);
  });

  it("stopping drops accidental sessions and clamps long ones", () => {
    expect(closeOut(running(), T0 + 9_000)).toEqual({ kind: "delete" });
    expect(closeOut(running(), T0 + 120_000)).toEqual({ kind: "end", actualSec: 120 });
    expect(closeOut(running(), T0 + 9_999_000)).toEqual({ kind: "end", actualSec: 1500 });
  });

  it("halves the last session of an x.5 estimate and picks long breaks on the cycle", () => {
    expect(pomodoroDuration(SETTINGS, { estimatedPomodoros: 2.5, completedPomodoros: 2 })).toBe(750);
    expect(pomodoroDuration(SETTINGS, { estimatedPomodoros: 2.5, completedPomodoros: 1 })).toBe(1500);
    const done = { ...running(), status: "completed" as const };
    expect(breakAfterFocus(done, SETTINGS, { estimatedPomodoros: 8, completedPomodoros: 4 }).mode).toBe("long_break");
    expect(breakAfterFocus(done, SETTINGS, { estimatedPomodoros: 8, completedPomodoros: 3 }).mode).toBe("short_break");
  });

  it("refuses to switch tasks mid-session and resets the cycle on a new task", () => {
    expect(applySelectTask(running(), "t2", null)).toBeNull();
    const idle = { ...emptySnapshot(SETTINGS), currentTaskId: "t1", pomodoroCount: 3 };
    expect(applySelectTask(idle, "t2", "p")!.pomodoroCount).toBe(0);
    expect(applySelectTask(idle, "t1", "p")!.pomodoroCount).toBe(3);
  });
});

describe("extension service (local SQLite)", () => {
  let dir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-ext-"));
    process.env.FOCUSSPACE_MODE = "local";
    const { resetSqliteForTests } = await import("@/lib/local/db");
    resetSqliteForTests(path.join(dir, "focusspace.db"));
    const { createLocalDb } = await import("@/lib/local/builder");
    const { executeQuery } = await import("@/lib/local/execute");
    db = createLocalDb(executeQuery);
    userId = (await import("@/lib/local/ids")).LOCAL_USER_ID;
  });

  afterEach(async () => {
    const { closeSqlite } = await import("@/lib/local/db");
    closeSqlite();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows file lock */ }
  });

  async function makeTask() {
    const { data: projects } = await db.from("projects").select("id");
    const { data } = await db.from("tasks")
      .insert({ user_id: userId, project_id: projects[0].id, title: "Write report", estimated_pomodoros: 2 })
      .select("id").single();
    return data.id as string;
  }

  it("start → stop within 10s leaves no session behind", async () => {
    const svc = await import("@/lib/extension/service");
    const now = Date.now();
    await svc.runTimerCommand(db, userId, "start", {}, now);
    const state = await svc.getExtensionState(db, userId, now + 1000);
    expect(state.timer.status).toBe("running");
    expect(state.timer.mode).toBe("pomodoro");
    const { data: sessions } = await db.from("focus_sessions").select("id");
    expect(sessions).toHaveLength(1);

    await expect(svc.runTimerCommand(db, userId, "start", {}, now + 2000)).rejects.toThrow(/already/);
    await svc.runTimerCommand(db, userId, "stop", {}, now + 5000);
    expect((await db.from("focus_sessions").select("id")).data).toHaveLength(0);
    expect((await svc.getExtensionState(db, userId)).timer.status).toBe("idle");
  });

  it("records an overdue focus session exactly once, even if the web app also completes it", async () => {
    const svc = await import("@/lib/extension/service");
    const taskId = await makeTask();
    await svc.runTaskCommand(db, userId, { action: "select", taskId });
    const start = Date.now() - 1_600_000; // started 26m40s ago → a 25m session is overdue
    await svc.runTimerCommand(db, userId, "start", {}, start);

    const state = await svc.getExtensionState(db, userId);
    expect(state.justCompleted).toBe(true);
    expect(state.timer.status).toBe("completed");
    expect(state.timer.pomodoroCount).toBe(1);
    expect(state.task?.completedPomodoros).toBe(1);
    expect(state.next.breakOption?.mode).toBe("short_break");

    // A second reader (popup + badge alarm) must not count it again.
    const again = await svc.getExtensionState(db, userId);
    expect(again.justCompleted).toBe(false);

    // The web app's completeSession uses the same "ended_at IS NULL" guard → no-op.
    const { data: sessions } = await db.from("focus_sessions").select("id, completed, actual_duration_sec");
    expect(sessions).toEqual([expect.objectContaining({ completed: true, actual_duration_sec: 1500 })]);
    const webAttempt = await db.from("focus_sessions").update({ completed: true }).eq("id", sessions[0].id).is("ended_at", null).select("id");
    expect(webAttempt.count).toBe(0);
    const { data: task } = await db.from("tasks").select("completed_pomodoros").eq("id", taskId).single();
    expect(task.completed_pomodoros).toBe(1);
  });

  it("refuses a command when the timer row changed since it was read", async () => {
    const svc = await import("@/lib/extension/service");
    const { readTimerState, writeTimerState } = await import("@/lib/timer/persist");
    await svc.runTimerCommand(db, userId, "start", {}, Date.now());
    const snap = (await readTimerState(db, userId))!;
    // The web app pauses at (almost) the same moment.
    await new Promise((r) => setTimeout(r, 5));
    await writeTimerState(db, userId, { ...snap, status: "paused", pausedAt: Date.now(), source: "ui" });
    // A stale write keyed on the old updated_at must not clobber it.
    const res = await db.from("timer_state").update({ status: "running" }).eq("user_id", userId).eq("updated_at", snap.updatedAt).select("user_id");
    expect(res.count).toBe(0);
    expect((await readTimerState(db, userId))!.status).toBe("paused");
  });

  it("extension commands drive music-follows-focus like MCP (synced rows → focus transitions)", async () => {
    const svc = await import("@/lib/extension/service");
    const { readTimerState } = await import("@/lib/timer/persist");
    const { focusTransition } = await import("@/lib/spotify/focusMusic");
    const now = Date.now();
    let prev = (await readTimerState(db, userId))!;
    const step = async (action: "start" | "pause" | "resume" | "stop", at: number) => {
      await svc.runTimerCommand(db, userId, action, {}, at);
      const next = (await readTimerState(db, userId))!;
      expect(next.source).not.toBe("ui"); // useTimerSync only applies non-UI rows
      const t = focusTransition(prev, next);
      prev = next;
      return t;
    };
    expect(await step("start", now)).toBe("focus_start");
    expect(await step("pause", now + 60_000)).toBe("focus_end");
    expect(await step("resume", now + 90_000)).toBe("focus_resume");
    expect(await step("stop", now + 120_000)).toBe("focus_end");
  });

  it("finishing the active task while idle moves on to the next todo", async () => {
    const svc = await import("@/lib/extension/service");
    const first = await makeTask();
    const second = await makeTask();
    await svc.runTaskCommand(db, userId, { action: "select", taskId: first });
    await svc.runTaskCommand(db, userId, { action: "toggle_done", taskId: first });
    const state = await svc.getExtensionState(db, userId);
    expect(state.task?.id).toBe(second);
    const { data } = await db.from("tasks").select("status").eq("id", first).single();
    expect(data.status).toBe("done");
  });
});
