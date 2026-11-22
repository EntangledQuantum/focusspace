import type { TimerMode } from "@/lib/stores/timer";
import type { TimerSnapshot } from "@/lib/timer/persist";

/**
 * Pure timer state transitions — the ONLY place timer rules live.
 *
 * The `timer_state` row is the single source of truth. Every client (each
 * website tab, the extension popup / side panel / badge, MCP, Focus AI) sends
 * intents to the server, which applies these functions with the SERVER clock
 * and stores the result; clients only render the row (corrected by a measured
 * server-clock offset, see ./clock.ts). All timestamps are server epoch ms.
 */

/** Sessions shorter than this are treated as accidental and deleted. */
export const MIN_RECORDED_SEC = 10;

/**
 * Auto-start the next phase only if the end was observed within this window.
 * Past it (nobody was around — browser closed, laptop asleep) the timer just
 * waits as "completed" instead of chaining phantom sessions through the absence.
 */
export const AUTO_START_WINDOW_MS = 2 * 60_000;

export interface TimerSettings {
  focusSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  longBreakEvery: number;
  autoStartBreaks?: boolean;
  autoStartPomodoros?: boolean;
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

/** A paused clock is frozen at pausedAt. */
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

/** Server epoch ms at which a running session ends (null unless running). */
export function endsAt(s: TimerSnapshot): number | null {
  if (s.status !== "running" || !s.startedAt) return null;
  return s.startedAt + s.accumulatedPausedMs + s.plannedDurationSec * 1000;
}

/** A running session whose countdown has reached zero (server clock). */
export function isOverdue(s: TimerSnapshot | null, now: number, graceMs = 0): boolean {
  const end = s ? endsAt(s) : null;
  return end !== null && now >= end + graceMs;
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

/**
 * Server-side auto-start (replaces the website's client-side chaining, so it
 * behaves the same with no tab open). Called with the snapshot right after a
 * session completed and the task progress AFTER counting it. Returns the next
 * phase to start at the old session's end, or null to stay "completed".
 */
export function autoNext(
  done: TimerSnapshot, settings: TimerSettings, task: TaskProgress | null, endMs: number, now: number,
): { mode: TimerMode; durationSec: number } | null {
  if (now - endMs > AUTO_START_WINDOW_MS) return null;
  if (!isBreakMode(done.mode)) {
    return settings.autoStartBreaks ? breakAfterFocus(done, settings, task) : null;
  }
  if (!settings.autoStartPomodoros || !task) return null;
  // After a break, continue only while the task still has planned work left.
  if (task.completedPomodoros >= Math.ceil(task.estimatedPomodoros)) return null;
  return { mode: "pomodoro", durationSec: pomodoroDuration(settings, task) };
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

/** Reset: breaks flip back to pomodoro so the next start is focus. */
export function applyReset(s: TimerSnapshot, opts: { resetCycle?: boolean } = {}): TimerSnapshot {
  return {
    ...s,
    mode: isBreakMode(s.mode) ? "pomodoro" : s.mode,
    status: "idle",
    startedAt: null,
    pausedAt: null,
    accumulatedPausedMs: 0,
    currentSessionId: null,
    pomodoroCount: opts.resetCycle ? 0 : s.pomodoroCount,
    source: "mcp",
  };
}

/** Session completed; the cycle count goes up for pomodoro mode. */
export function applyComplete(s: TimerSnapshot): TimerSnapshot {
  return {
    ...s,
    status: "completed",
    pausedAt: null,
    pomodoroCount: s.mode === "pomodoro" ? s.pomodoroCount + 1 : s.pomodoroCount,
    source: "mcp",
  };
}

/** Pick pomodoro / custom (and its length) while idle — shared, so every client shows the same next start. */
export function applySetMode(s: TimerSnapshot, mode: TimerMode, durationSec: number): TimerSnapshot | null {
  if (isActive(s)) return null;
  return {
    ...s, mode, plannedDurationSec: durationSec, status: "idle",
    startedAt: null, pausedAt: null, accumulatedPausedMs: 0, currentSessionId: null, source: "mcp",
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

/**
 * Stale-intent guard. A pause/resume/stop/skip made while looking at session
 * X must not act on a different session Y that another client started in the
 * meantime. Returns an error message, or null when the intent still applies.
 */
export function staleIntent(s: TimerSnapshot, expectSessionId: string | null | undefined): string | null {
  if (expectSessionId === undefined) return null; // caller didn't say (MCP / AI): act on whatever runs
  if ((s.currentSessionId ?? null) === (expectSessionId ?? null)) return null;
  return "The timer changed on another device — showing the latest state.";
}
