import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { TimerMode } from "@/lib/stores/timer";
import { readTimerState, writeTimerState, type TimerSnapshot } from "@/lib/timer/persist";
import {
  applyComplete, applyPause, applyReset, applyResume, applySelectTask, applyStart,
  breakAfterFocus, closeOut, defaultStart, durationFor, emptySnapshot, isActive, isBreakMode,
  isOverdue, remaining, type TaskProgress, type TimerSettings,
} from "@/lib/timer/commands";

/**
 * Data + commands behind /api/extension/*. `db` is the service-role client from
 * resolveMcpContext (or the local SQLite shim), so EVERY query filters by user_id.
 */
type Db = SupabaseClient<Database>;

export class CommandError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

const DEFAULT_SETTINGS: TimerSettings = { focusSec: 1500, shortBreakSec: 300, longBreakSec: 900, longBreakEvery: 4 };

/** Rows touched by an update — cloud returns the selected rows, the local shim returns a count. */
function affected(res: { data: unknown; count?: number | null }): number {
  if (Array.isArray(res.data)) return res.data.length;
  return res.count ?? 0;
}

async function loadSettings(db: Db, userId: string): Promise<TimerSettings> {
  const { data } = await db.from("user_settings")
    .select("focus_duration_sec, short_break_sec, long_break_sec, long_break_every")
    .eq("user_id", userId).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    focusSec: data.focus_duration_sec ?? DEFAULT_SETTINGS.focusSec,
    shortBreakSec: data.short_break_sec ?? DEFAULT_SETTINGS.shortBreakSec,
    longBreakSec: data.long_break_sec ?? DEFAULT_SETTINGS.longBreakSec,
    longBreakEvery: data.long_break_every ?? DEFAULT_SETTINGS.longBreakEvery,
  };
}

async function loadTask(db: Db, userId: string, taskId: string | null) {
  if (!taskId) return null;
  const { data } = await db.from("tasks")
    .select("id, title, status, project_id, estimated_pomodoros, completed_pomodoros")
    .eq("id", taskId).eq("user_id", userId).maybeSingle();
  return data ?? null;
}

const progressOf = (t: { estimated_pomodoros: number; completed_pomodoros: number } | null): TaskProgress | null =>
  t ? { estimatedPomodoros: Number(t.estimated_pomodoros ?? 1), completedPomodoros: t.completed_pomodoros ?? 0 } : null;

/**
 * Write the snapshot only if nobody else (the web app, MCP) changed the row
 * since we read it. Returns false on a lost race.
 */
async function commit(db: Db, userId: string, prev: TimerSnapshot | null, next: TimerSnapshot): Promise<boolean> {
  if (!prev?.updatedAt) {
    await writeTimerState(db, userId, next);
    return true;
  }
  const res = await db.from("timer_state").update({
    mode: next.mode,
    status: next.status,
    planned_duration_sec: next.plannedDurationSec,
    started_at: next.startedAt,
    paused_at: next.pausedAt,
    accumulated_paused_ms: next.accumulatedPausedMs,
    current_session_id: next.currentSessionId,
    current_task_id: next.currentTaskId,
    current_project_id: next.currentProjectId,
    pomodoro_count: next.pomodoroCount,
    source: next.source,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("updated_at", prev.updatedAt).select("user_id");
  return affected(res) > 0;
}

/**
 * Record a session whose countdown ran out while no focus page was open.
 * Idempotent with the web app's completeSession: only the writer that flips
 * ended_at from NULL counts the pomodoro, so it is never double-counted.
 */
export async function finalizeOverdue(db: Db, userId: string, snap: TimerSnapshot): Promise<boolean> {
  const endMs = (snap.startedAt ?? 0) + snap.accumulatedPausedMs + snap.plannedDurationSec * 1000;
  let won = !snap.currentSessionId;
  if (snap.currentSessionId) {
    const res = await db.from("focus_sessions").update({
      ended_at: new Date(endMs).toISOString(),
      actual_duration_sec: snap.plannedDurationSec,
      completed: true,
    }).eq("id", snap.currentSessionId).eq("user_id", userId).is("ended_at", null).select("id");
    won = affected(res) > 0;
  }
  if (won && snap.mode === "pomodoro" && snap.currentTaskId) {
    const task = await loadTask(db, userId, snap.currentTaskId);
    if (task) {
      await db.from("tasks").update({ completed_pomodoros: (task.completed_pomodoros ?? 0) + 1 })
        .eq("id", task.id).eq("user_id", userId);
    }
  }
  const next = won ? applyComplete(snap) : { ...snap, status: "completed" as const, pausedAt: null, source: "mcp" as const };
  await commit(db, userId, snap, next);
  return won;
}

async function readFresh(db: Db, userId: string, now: number) {
  const [settings, snap] = await Promise.all([loadSettings(db, userId), readTimerState(db, userId)]);
  let justCompleted = false;
  let current = snap;
  if (snap && isOverdue(snap, now)) {
    justCompleted = await finalizeOverdue(db, userId, snap);
    current = await readTimerState(db, userId);
  }
  return { settings, snap: current, justCompleted };
}

export interface ExtensionState {
  serverNow: number;
  justCompleted: boolean;
  timer: {
    mode: TimerMode;
    status: TimerSnapshot["status"];
    plannedDurationSec: number;
    remainingSec: number;
    pomodoroCount: number;
    source: string;
    updatedAt: string | null;
  };
  task: {
    id: string; title: string; done: boolean;
    estimatedPomodoros: number; completedPomodoros: number;
    subtasks: { id: string; title: string; done: boolean }[];
  } | null;
  project: { id: string; name: string; color: string } | null;
  /** What the primary Start button will do, plus the break offered after a finished focus session. */
  next: { start: { mode: TimerMode; durationSec: number }; breakOption: { mode: TimerMode; durationSec: number } | null };
}

export async function getExtensionState(db: Db, userId: string, now = Date.now()): Promise<ExtensionState> {
  const { settings, snap: raw, justCompleted } = await readFresh(db, userId, now);
  const snap = raw ?? emptySnapshot(settings);

  const task = await loadTask(db, userId, snap.currentTaskId);
  const projectId = task?.project_id ?? snap.currentProjectId;
  const [{ data: subtasks }, { data: project }] = await Promise.all([
    task
      ? db.from("subtasks").select("id, title, done").eq("task_id", task.id).eq("user_id", userId).order("sort_order")
      : Promise.resolve({ data: [] as { id: string; title: string; done: boolean }[] }),
    projectId
      ? db.from("projects").select("id, name, color").eq("id", projectId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const progress = progressOf(task);
  const focusJustEnded = snap.status === "completed" && !isBreakMode(snap.mode);
  return {
    serverNow: now,
    justCompleted,
    timer: {
      mode: snap.mode,
      status: snap.status,
      plannedDurationSec: snap.plannedDurationSec,
      remainingSec: remaining(snap, now),
      pomodoroCount: snap.pomodoroCount,
      source: snap.source,
      updatedAt: snap.updatedAt ?? null,
    },
    task: task
      ? {
          id: task.id,
          title: task.title,
          done: task.status === "done",
          estimatedPomodoros: progress!.estimatedPomodoros,
          completedPomodoros: progress!.completedPomodoros,
          subtasks: (subtasks ?? []).map((s) => ({ id: s.id, title: s.title, done: !!s.done })),
        }
      : null,
    project: project ? { id: project.id, name: project.name, color: project.color } : null,
    next: {
      start: defaultStart(snap, settings, progress),
      breakOption: focusJustEnded ? breakAfterFocus(snap, settings, progress) : null,
    },
  };
}

export type TimerAction = "start" | "pause" | "resume" | "stop" | "skip";
const TIMER_MODES: TimerMode[] = ["pomodoro", "custom", "short_break", "long_break"];

export async function runTimerCommand(
  db: Db, userId: string, action: TimerAction, opts: { mode?: string; durationSec?: number } = {}, now = Date.now(),
): Promise<void> {
  const { settings, snap: raw } = await readFresh(db, userId, now);
  const snap = raw ?? emptySnapshot(settings);

  if (action === "pause" || action === "resume") {
    const next = action === "pause" ? applyPause(snap, now) : applyResume(snap, now);
    if (!next) throw new CommandError(action === "pause" ? "Timer is not running." : "Timer is not paused.");
    if (!(await commit(db, userId, raw, next))) throw new CommandError("Timer changed elsewhere — try again.");
    return;
  }

  if (action === "stop" || action === "skip") {
    // Same bookkeeping as the focus page's Reset/Skip: drop accidental (<10s) sessions, keep the rest as incomplete.
    if (isActive(snap) && snap.currentSessionId) {
      const out = closeOut(snap, now);
      const q = out.kind === "delete"
        ? db.from("focus_sessions").delete()
        : db.from("focus_sessions").update({ ended_at: new Date(now).toISOString(), actual_duration_sec: out.actualSec, completed: false });
      await q.eq("id", snap.currentSessionId).eq("user_id", userId).is("ended_at", null);
    }
    if (!(await commit(db, userId, raw, applyReset(snap)))) throw new CommandError("Timer changed elsewhere — try again.");
    return;
  }

  // start
  if (isActive(snap)) throw new CommandError("A session is already in progress.");
  const task = await loadTask(db, userId, snap.currentTaskId);
  const progress = progressOf(task);
  const requested = TIMER_MODES.includes(opts.mode as TimerMode) ? (opts.mode as TimerMode) : null;
  const planned = requested
    ? { mode: requested, durationSec: durationFor(requested, snap, settings, progress) }
    : defaultStart(snap, settings, progress);
  // Explicit length (MCP / Focus AI "start a 45-minute session").
  const plan = opts.durationSec && opts.durationSec > 0 ? { ...planned, durationSec: Math.round(opts.durationSec) } : planned;
  const focus = !isBreakMode(plan.mode);

  const { data: session, error } = await db.from("focus_sessions").insert({
    user_id: userId,
    mode: plan.mode,
    planned_duration_sec: plan.durationSec,
    task_id: focus ? task?.id ?? null : null,
    project_id: focus ? task?.project_id ?? snap.currentProjectId ?? null : null,
    started_at: new Date(now).toISOString(),
  }).select("id").single();
  if (error || !session) throw new CommandError(`Could not start session: ${error?.message ?? "unknown error"}`, 500);

  const next = applyStart(snap, { ...plan, sessionId: session.id, now });
  if (!(await commit(db, userId, raw, next))) {
    // Someone else changed the timer at the same instant — don't leave an orphan session behind.
    await db.from("focus_sessions").delete().eq("id", session.id).eq("user_id", userId);
    throw new CommandError("Timer changed elsewhere — try again.");
  }
}

/** Re-stamp timer_state so open FocusSpace tabs (useTimerSync) refetch tasks/subtasks. */
async function nudge(db: Db, userId: string) {
  const snap = await readTimerState(db, userId);
  if (snap) await commit(db, userId, snap, { ...snap, source: "mcp" });
}

export type TaskAction =
  | { action: "select"; taskId: string | null }
  | { action: "toggle_done"; taskId: string }
  | { action: "toggle_subtask"; subtaskId: string };

export async function runTaskCommand(db: Db, userId: string, cmd: TaskAction): Promise<void> {
  if (cmd.action === "toggle_subtask") {
    const { data: st } = await db.from("subtasks").select("id, done").eq("id", cmd.subtaskId).eq("user_id", userId).maybeSingle();
    if (!st) throw new CommandError("Subtask not found.", 404);
    await db.from("subtasks").update({ done: !st.done }).eq("id", st.id).eq("user_id", userId);
    await nudge(db, userId);
    return;
  }

  const settings = await loadSettings(db, userId);
  const raw = await readTimerState(db, userId);
  const snap = raw ?? emptySnapshot(settings);

  if (cmd.action === "select") {
    const task = cmd.taskId ? await loadTask(db, userId, cmd.taskId) : null;
    if (cmd.taskId && !task) throw new CommandError("Task not found.", 404);
    const next = applySelectTask(snap, task?.id ?? null, task?.project_id ?? null);
    if (!next) throw new CommandError("Stop the timer before switching tasks.");
    if (!(await commit(db, userId, raw, next))) throw new CommandError("Timer changed elsewhere — try again.");
    return;
  }

  // toggle_done — mirrors the focus page's "Finish task": mark done, then move on to the next todo.
  const task = await loadTask(db, userId, cmd.taskId);
  if (!task) throw new CommandError("Task not found.", 404);
  const done = task.status !== "done";
  await db.from("tasks").update({ status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null })
    .eq("id", task.id).eq("user_id", userId);

  if (done && snap.currentTaskId === task.id && !isActive(snap)) {
    const { data: candidates } = await db.from("tasks").select("id, project_id")
      .eq("user_id", userId).eq("status", "todo").neq("id", task.id).order("sort_order").limit(20);
    const pick = (candidates ?? []).find((t) => t.project_id === task.project_id) ?? candidates?.[0] ?? null;
    if (pick) {
      const next = applySelectTask(snap, pick.id, pick.project_id);
      if (next && (await commit(db, userId, raw, next))) return;
    }
  }
  await nudge(db, userId);
}

export async function listTasks(db: Db, userId: string) {
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    db.from("projects").select("id, name, color").eq("user_id", userId).is("archived_at", null).order("sort_order"),
    db.from("tasks").select("id, title, project_id, estimated_pomodoros, completed_pomodoros")
      .eq("user_id", userId).eq("status", "todo").order("sort_order").limit(500),
  ]);
  return {
    projects: (projects ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color })),
    tasks: (tasks ?? []).map((t) => ({
      id: t.id, title: t.title, projectId: t.project_id,
      estimatedPomodoros: Number(t.estimated_pomodoros ?? 1), completedPomodoros: t.completed_pomodoros ?? 0,
    })),
  };
}
