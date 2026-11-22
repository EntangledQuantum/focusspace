import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as clockTs from "@/lib/timer/clock";
import * as clockJs from "../extension/lib/clock.js";
import { AUTO_START_WINDOW_MS, autoNext, staleIntent, type TimerSettings } from "@/lib/timer/commands";
import { completedBetween, type TimerRow } from "@/lib/timer/client";

/**
 * The server row is the single source of truth: these pin the rules that keep
 * every client in agreement — clock offset, exactly-once completion with
 * concurrent observers, stale-intent rejection, and server-side auto-start.
 */

describe("server-clock offset (site TS and extension JS share the math)", () => {
  for (const [name, c] of [["ts", clockTs], ["js", clockJs]] as const) {
    it(`${name}: midpoint estimate, lowest round trip wins, old samples expire`, () => {
      // Server is 12 minutes ahead; request took 200 ms, server read in the middle.
      const s1 = c.sampleOffset(1_000_000 + 720_000 + 100, 1_000_000, 1_000_200);
      expect(s1.offset).toBe(720_000);
      expect(s1.rtt).toBe(200);
      // A noisier sample (2 s round trip, asymmetric) must not override the precise one.
      const s2 = c.sampleOffset(1_100_000 + 720_000 + 1900, 1_100_000, 1_102_000);
      let r = c.addSample([], s1, 1_000_200);
      r = c.addSample(r.samples, s2, 1_102_000);
      expect(r.offset).toBe(720_000);
      // More than ten minutes later both have expired; a new sample (clock drifted +50 ms) takes over.
      const s3 = c.sampleOffset(1_800_000 + 720_100, 1_800_000, 1_800_100);
      r = c.addSample(r.samples, s3, 1_800_100);
      expect(r.samples.length).toBe(1);
      expect(r.offset).toBe(720_050);
    });

    it(`${name}: remaining is computed from server timestamps, frozen while paused`, () => {
      const t = { status: "running" as const, plannedDurationSec: 60, startedAt: 10_000, pausedAt: null, accumulatedPausedMs: 5_000 };
      expect(c.remainingAt(t, 10_000 + 5_000 + 12_300)).toBe(48); // ceil(60 - 12.3)
      expect(c.remainingAt({ ...t, status: "paused", pausedAt: 20_000 }, 999_999)).toBe(55);
      expect(c.remainingAt({ ...t, status: "completed" }, 0)).toBe(0);
      expect(c.remainingAt({ ...t, status: "idle", startedAt: null }, 0)).toBe(60);
    });
  }
});

describe("rules", () => {
  const settings: TimerSettings = { focusSec: 1500, shortBreakSec: 300, longBreakSec: 900, longBreakEvery: 4, autoStartBreaks: true, autoStartPomodoros: true };
  const base = {
    status: "completed" as const, plannedDurationSec: 1500, startedAt: 0, pausedAt: null, accumulatedPausedMs: 0,
    currentSessionId: "s", currentTaskId: "t", currentProjectId: null, pomodoroCount: 1, source: "mcp" as const,
  };

  it("auto-start is decided from settings + task progress, only when the end was seen promptly", () => {
    const end = 1_000_000;
    expect(autoNext({ ...base, mode: "pomodoro" }, settings, { estimatedPomodoros: 4, completedPomodoros: 1 }, end, end + 5_000))
      .toEqual({ mode: "short_break", durationSec: 300 });
    expect(autoNext({ ...base, mode: "pomodoro" }, settings, { estimatedPomodoros: 8, completedPomodoros: 4 }, end, end))
      .toEqual({ mode: "long_break", durationSec: 900 });
    // Nobody was around for a while: don't chain phantom sessions.
    expect(autoNext({ ...base, mode: "pomodoro" }, settings, null, end, end + AUTO_START_WINDOW_MS + 1)).toBeNull();
    // After a break: next pomodoro only while the task has planned work left.
    expect(autoNext({ ...base, mode: "short_break" }, settings, { estimatedPomodoros: 2, completedPomodoros: 1 }, end, end))
      .toEqual({ mode: "pomodoro", durationSec: 1500 });
    expect(autoNext({ ...base, mode: "short_break" }, settings, { estimatedPomodoros: 2, completedPomodoros: 2 }, end, end)).toBeNull();
    expect(autoNext({ ...base, mode: "pomodoro" }, { ...settings, autoStartBreaks: false }, null, end, end)).toBeNull();
  });

  it("a stop/pause aimed at one session is refused once another is running", () => {
    const s = { ...base, mode: "pomodoro" as const, status: "running" as const, currentSessionId: "B" };
    expect(staleIntent(s, "A")).toMatch(/another device/);
    expect(staleIntent(s, "B")).toBeNull();
    expect(staleIntent(s, undefined)).toBeNull(); // MCP / AI: act on whatever runs
  });

  it("the site tells a completion apart from a stop / skip", () => {
    const prev: TimerRow = {
      mode: "pomodoro", status: "running", plannedDurationSec: 60, startedAt: 1000, pausedAt: null, accumulatedPausedMs: 0,
      currentSessionId: "A", currentTaskId: null, currentProjectId: null, pomodoroCount: 0, updatedAt: "1",
    };
    expect(completedBetween(prev, { ...prev, status: "completed", updatedAt: "2" }, 61_500)).toBe("A");
    // auto-started break beginning exactly at the end
    expect(completedBetween(prev, { ...prev, mode: "short_break", currentSessionId: "B", startedAt: 61_000, updatedAt: "2" }, 62_000)).toBe("A");
    // stopped early / skipped: not a completion
    expect(completedBetween(prev, { ...prev, status: "idle", currentSessionId: null, startedAt: null, updatedAt: "2" }, 30_000)).toBeNull();
    expect(completedBetween(prev, { ...prev, status: "completed", updatedAt: "2" }, 20_000)).toBeNull();
  });
});

describe("server finalisation (local SQLite)", () => {
  let dir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-sync-"));
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

  async function taskWithSession(startedAgoMs: number, settings: Record<string, unknown> = {}) {
    const svc = await import("@/lib/extension/service");
    await db.from("user_settings").update({ auto_start_breaks: false, auto_start_pomodoros: false, ...settings }).eq("user_id", userId);
    const { data: projects } = await db.from("projects").select("id");
    const { data: task } = await db.from("tasks").insert({ user_id: userId, project_id: projects[0].id, title: "Write", estimated_pomodoros: 4 }).select("id").single();
    await svc.runTaskCommand(db, userId, { action: "select", taskId: task.id });
    const started = await svc.runTimerCommand(db, userId, "start", {}, Date.now() - startedAgoMs);
    return { svc, taskId: task.id as string, started };
  }

  it("records a completion exactly once when several clients observe it at the same moment", async () => {
    const { svc, taskId } = await taskWithSession(26 * 60_000); // a 25-minute pomodoro, overdue
    const now = Date.now();
    const results = await Promise.all([1, 2, 3, 4].map(() => svc.getExtensionState(db, userId, now)));
    expect(results.filter((r) => r.justCompleted)).toHaveLength(1);
    for (const r of results) expect(r.timer).toMatchObject({ status: "completed", pomodoroCount: 1 });
    const { data: task } = await db.from("tasks").select("completed_pomodoros").eq("id", taskId).single();
    expect(task.completed_pomodoros).toBe(1);
    const { data: sessions } = await db.from("focus_sessions").select("completed, actual_duration_sec");
    expect(sessions).toEqual([expect.objectContaining({ completed: true, actual_duration_sec: 1500 })]);
  });

  it("auto-starts the break on the server, at the exact end time, when nobody has the site open", async () => {
    const { svc, started } = await taskWithSession(25 * 60_000 + 30_000, { auto_start_breaks: true });
    const end = started.timer.endsAt!;
    const state = await svc.getExtensionState(db, userId);
    expect(state.justCompleted).toBe(true);
    expect(state.timer).toMatchObject({ status: "running", mode: "short_break", startedAt: end, pomodoroCount: 1 });
    expect(state.timer.sessionId).not.toBe(started.timer.sessionId);
    const { data: sessions } = await db.from("focus_sessions").select("id, mode, completed, ended_at");
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s: { mode: string }) => s.mode === "short_break")).toMatchObject({ id: state.timer.sessionId, ended_at: null });
  });

  it("does not auto-start after a long absence", async () => {
    const { svc } = await taskWithSession(25 * 60_000 + AUTO_START_WINDOW_MS + 60_000, { auto_start_breaks: true });
    const state = await svc.getExtensionState(db, userId);
    expect(state.timer.status).toBe("completed");
    expect(state.next.breakOption?.mode).toBe("short_break");
  });

  it("refuses a pause aimed at a session another client already replaced, returning the current state", async () => {
    const { svc, started } = await taskWithSession(1000);
    const first = started.timer.sessionId;
    // Another device stops and starts a new session.
    await svc.runTimerCommand(db, userId, "stop", {});
    const second = await svc.runTimerCommand(db, userId, "start", {});
    const err = await svc.runTimerCommand(db, userId, "pause", { expectSessionId: first }).catch((e) => e);
    expect(err).toBeInstanceOf(svc.CommandError);
    expect(err.status).toBe(409);
    expect(err.state.timer).toMatchObject({ status: "running", sessionId: second.timer.sessionId });
    // The same intent aimed at the running session goes through.
    const ok = await svc.runTimerCommand(db, userId, "pause", { expectSessionId: second.timer.sessionId });
    expect(ok.timer.status).toBe("paused");
  });
});
