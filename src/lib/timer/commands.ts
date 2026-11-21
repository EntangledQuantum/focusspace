import type { TimerMode } from "@/lib/stores/timer";
import type { TimerSnapshot } from "@/lib/timer/persist";

/**
 * Pure timer state transitions for commands issued outside the browser tab
 * (Chrome extension). They mirror `useTimerStore` + the focus page so that a
 * session started/stopped remotely looks exactly like one driven from the UI.
 */

/** Sessions shorter than this are treated as accidental and deleted (same as useTimer). */
export const MIN_RECORDED_SEC = 10;

export interface TimerSettings {
  focusSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  longBreakEvery: number;
}

export interface TaskProgress {
  estimatedPomodoros: number;
  completedPomodoros: number;
}

export const isBreakMode = (mode: TimerMode) => mode === "short_break" || mode === "long_break";
export const isActive = (s: TimerSnapshot | null) => !!s && (s.status === "running" || s.status === "paused");

export function emptySnapshot(settings: TimerSettings): TimerSnapshot {
  return {
    mode: "pomodoro",
    status: "idle",
    plannedDurationSec: settings.focusSec,
    startedAt: null,
    pausedAt: null,
    accumulatedPausedMs: 0,
    currentSessionId: null,
    currentTaskId: null,
    currentProjectId: null,
    pomodoroCount: 0,
    source: "mcp",
  };
}

/** Same as getElapsedSec in the store: a paused clock is frozen at pausedAt. */
export function elapsedSec(s: TimerSnapshot, now: number): number {
  if (!s.startedAt) return 0;
  const end = s.status === "paused" && s.pausedAt ? s.pausedAt : now;
  return Math.max(0, Math.floor((end - s.startedAt - s.accumulatedPausedMs) / 1000));
}

export function remaining(s: TimerSnapshot, now: number): number {
  if (s.status === "idle" || !s.startedAt) return s.plannedDurationSec;
  if (s.status === "completed") return 0;
  return Math.max(0, s.plannedDurationSec - elapsedSec(s, now));
}

/** A running session whose countdown hit zero more than `graceMs` ago and nobody recorded it yet. */
export function isOverdue(s: TimerSnapshot | null, now: number, graceMs = 3000): boolean {
  if (!s || s.status !== "running" || !s.startedAt) return false;
  const endsAt = s.startedAt + s.accumulatedPausedMs + s.plannedDurationSec * 1000;
  return now >= endsAt + graceMs;
}

/** Focus duration for the next pomodoro, halving the last session of a x.5 estimate (focus page rule). */
export function pomodoroDuration(settings: TimerSettings, task: TaskProgress | null): number {
  if (!task) return settings.focusSec;
  const total = Math.ceil(task.estimatedPomodoros);
  const isHalfLast = task.estimatedPomodoros % 1 === 0.5;
  const isLast = task.completedPomodoros === total - 1;
  return isHalfLast && isLast ? Math.round(settings.focusSec / 2) : settings.focusSec;
}

/** Which break follows a completed focus session. Cycle is task-relative when a task is active. */
export function breakAfterFocus(s: TimerSnapshot, settings: TimerSettings, task: TaskProgress | null): { mode: TimerMode; durationSec: number } {
  const completedInCycle = task ? task.completedPomodoros : s.pomodoroCount;
  const every = Math.max(1, settings.longBreakEvery);
  const isLong = completedInCycle > 0 && completedInCycle % every === 0;
  return isLong
    ? { mode: "long_break", durationSec: settings.longBreakSec }
    : { mode: "short_break", durationSec: settings.shortBreakSec };
}

/**
 * What a plain "start" does: like the focus page's play button, a finished or
 * idle break leads into focus; custom mode keeps its configured length.
 */
export function defaultStart(s: TimerSnapshot, settings: TimerSettings, task: TaskProgress | null): { mode: TimerMode; durationSec: number } {
  if (s.mode === "custom") return { mode: "custom", durationSec: s.plannedDurationSec || settings.focusSec };
  return { mode: "pomodoro", durationSec: pomodoroDuration(settings, task) };
}

export function durationFor(mode: TimerMode, s: TimerSnapshot, settings: TimerSettings, task: TaskProgress | null): number {
  switch (mode) {
    case "short_break": return settings.shortBreakSec;
    case "long_break": return settings.longBreakSec;
    case "custom": return s.mode === "custom" ? s.plannedDurationSec : settings.focusSec;
    default: return pomodoroDuration(settings, task);
  }
}

/** store.start() for the snapshot's current task (switching tasks goes through applySelectTask). */
export function applyStart(
  prev: TimerSnapshot,
  p: { mode: TimerMode; durationSec: number; sessionId: string; now: number },
): TimerSnapshot {
  return {
    ...prev,
    mode: p.mode,
    status: "running",
    plannedDurationSec: p.durationSec,
    startedAt: p.now,
    pausedAt: null,
    accumulatedPausedMs: 0,
    currentSessionId: p.sessionId,
    source: "mcp",
  };
}

export function applyPause(s: TimerSnapshot, now: number): TimerSnapshot | null {
  if (s.status !== "running") return null;
  return { ...s, status: "paused", pausedAt: now, source: "mcp" };
}

export function applyResume(s: TimerSnapshot, now: number): TimerSnapshot | null {
  if (s.status !== "paused" || s.pausedAt === null) return null;
  return {
    ...s,
    status: "running",
    pausedAt: null,
    accumulatedPausedMs: s.accumulatedPausedMs + (now - s.pausedAt),
    source: "mcp",
  };
}

/** store.reset(): breaks flip back to pomodoro so the next start is focus. */
export function applyReset(s: TimerSnapshot): TimerSnapshot {
  return {
    ...s,
    mode: isBreakMode(s.mode) ? "pomodoro" : s.mode,
    status: "idle",
    startedAt: null,
    pausedAt: null,
    accumulatedPausedMs: 0,
    currentSessionId: null,
    source: "mcp",
  };
}

/** store.complete() + incrementPomodoroCount() for pomodoro mode. */
export function applyComplete(s: TimerSnapshot): TimerSnapshot {
  return {
    ...s,
    status: "completed",
    pausedAt: null,
    pomodoroCount: s.mode === "pomodoro" ? s.pomodoroCount + 1 : s.pomodoroCount,
    source: "mcp",
  };
}

/** Selecting another task while idle resets the cycle count (like store.start / set_active_task). */
export function applySelectTask(s: TimerSnapshot, taskId: string | null, projectId: string | null): TimerSnapshot | null {
  if (isActive(s)) return null;
  return {
    ...s,
    currentTaskId: taskId,
    currentProjectId: projectId,
    pomodoroCount: s.currentTaskId === taskId ? s.pomodoroCount : 0,
    source: "mcp",
  };
}

/** How to close out the focus_sessions row when a session is stopped or skipped early. */
export function closeOut(s: TimerSnapshot, now: number): { kind: "delete" } | { kind: "end"; actualSec: number } {
  const e = elapsedSec(s, now);
  if (e < MIN_RECORDED_SEC) return { kind: "delete" };
  return { kind: "end", actualSec: Math.min(e, s.plannedDurationSec) };
}
