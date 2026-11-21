import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { TimerMode } from "@/lib/stores/timer";
import { readTimerState, type TimerSnapshot } from "@/lib/timer/persist";
import {
  applyComplete, applyPause, applyReset, applyResume, applySelectTask, applyStart,
  breakAfterFocus, closeOut, defaultStart, durationFor, emptySnapshot, isActive, isBreakMode,
  isOverdue, remaining, type TaskProgress, type TimerSettings,
} from "@/lib/timer/commands";

/**
 * Data + commands behind /api/extension/* (also used by MCP / Focus AI).
 * `db` is the service-role client from resolveMcpContext (or the local SQLite
 * shim), so EVERY query filters by user_id.
 *
 * Latency budget: each awaited query is a Vercel → Supabase round trip, so a
 * command loads everything it needs in ONE parallel round (timer, settings,
 * and — via the caller's hint of what it is already showing — task, subtasks,
 * project), writes in one more, and builds the returned state in memory
 * instead of reading back what it just wrote.
 */
type Db = SupabaseClient<Database>;

export class CommandError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

/** What the caller already shows; lets the first round fetch task/subtasks/project in parallel. */
export interface StateHint {
  taskId?: string | null;
  projectId?: string | null;
}

const DEFAULT_SETTINGS: TimerSettings = { focusSec: 1500, shortBreakSec: 300, longBreakSec: 900, longBreakEvery: 4 };
const CHANGED_ELSEWHERE = "Timer changed elsewhere — try again.";

type TaskRow = { id: string; title: string; status: "todo" | "done"; project_id: string | null; estimated_pomodoros: number; completed_pomodoros: number };
type SubtaskRow = { id: string; title: string; done: boolean };
type ProjectRow = { id: string; name: string; color: string };

/** Rows touched by an update — cloud returns the selected rows, the local shim returns a count. */
function affected(res: { data: unknown; count?: number | null }): number {
  if (Array.isArray(res.data)) return res.data.length;
  return res.count ?? 0;
}

/** Run a side effect after the response is sent (Vercel keeps the function alive for it). */
export function runAfter(fn: () => Promise<unknown>) {
  const safe = () => fn().catch((e) => console.warn("[extension] background write failed:", e));
  try {
    after(safe);
  } catch {
    void safe(); // outside a request scope (tests, scripts)
  }
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

async function loadTask(db: Db, userId: string, taskId: string | null | undefined): Promise<TaskRow | null> {
  if (!taskId) return null;
  const { data } = await db.from("tasks")
    .select("id, title, status, project_id, estimated_pomodoros, completed_pomodoros")
    .eq("id", taskId).eq("user_id", userId).maybeSingle();
  return (data as TaskRow | null) ?? null;
}

async function loadSubtasks(db: Db, userId: string, taskId: string | null | undefined): Promise<SubtaskRow[]> {
  if (!taskId) return [];
  const { data } = await db.from("subtasks").select("id, title, done").eq("task_id", taskId).eq("user_id", userId).order("sort_order");
  return (data ?? []).map((s) => ({ id: s.id, title: s.title, done: !!s.done }));
}

async function loadProject(db: Db, userId: string, projectId: string | null | undefined): Promise<ProjectRow | null> {
  if (!projectId) return null;
  const { data } = await db.from("projects").select("id, name, color").eq("id", projectId).eq("user_id", userId).maybeSingle();
  return data ? { id: data.id, name: data.name, color: data.color } : null;
}

const progressOf = (t: { estimated_pomodoros: number; completed_pomodoros: number } | null): TaskProgress | null =>
  t ? { estimatedPomodoros: Number(t.estimated_pomodoros ?? 1), completedPomodoros: t.completed_pomodoros ?? 0 } : null;

function toRow(userId: string, s: TimerSnapshot, updatedAt: string) {
  return {
    user_id: userId,
    mode: s.mode,
    status: s.status,
    planned_duration_sec: s.plannedDurationSec,
    started_at: s.startedAt,
    paused_at: s.pausedAt,
    accumulated_paused_ms: s.accumulatedPausedMs,
    current_session_id: s.currentSessionId,
    current_task_id: s.currentTaskId,
    current_project_id: s.currentProjectId,
    pomodoro_count: s.pomodoroCount,
    source: s.source,
    updated_at: updatedAt,
  };
}

/**
 * Write the snapshot only if nobody else (the web app, MCP) changed the row
 * since we read it. Returns the committed snapshot (with its new updatedAt, so
 * callers never need to read it back), or null on a lost race.
 */
async function commit(db: Db, userId: string, prev: TimerSnapshot | null, next: TimerSnapshot): Promise<TimerSnapshot | null> {
  const updatedAt = new Date().toISOString();
  const row = toRow(userId, next, updatedAt);
  if (!prev?.updatedAt) {
    const { error } = await db.from("timer_state").upsert(row, { onConflict: "user_id" });
    if (error) throw new CommandError(`Could not save the timer: ${error.message}`, 500);
    return { ...next, updatedAt };
  }
  const { user_id: _u, ...patch } = row;
  void _u;
  const res = await db.from("timer_state").update(patch).eq("user_id", userId).eq("updated_at", prev.updatedAt).select("user_id");
  return affected(res) > 0 ? { ...next, updatedAt } : null;
}

/**
 * Record a session whose countdown ran out while no focus page was open.
 * Idempotent with the web app's completeSession: only the writer that flips
 * ended_at from NULL counts the pomodoro, so it is never double-counted.
 * Returns whether this call counted it, and the snapshot now stored.
 */
async function finalize(db: Db, userId: string, snap: TimerSnapshot, task: TaskRow | null) {
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
  const next = won ? applyComplete(snap) : { ...snap, status: "completed" as const, pausedAt: null, source: "mcp" as const };
  const countTask = won && snap.mode === "pomodoro" && snap.currentTaskId;
  const counted = countTask ? (task?.id === snap.currentTaskId ? task : await loadTask(db, userId, snap.currentTaskId)) : null;
  const [committed] = await Promise.all([
    commit(db, userId, snap, next),
    counted
      ? db.from("tasks").update({ completed_pomodoros: (counted.completed_pomodoros ?? 0) + 1 }).eq("id", counted.id).eq("user_id", userId)
      : Promise.resolve(null),
  ]);
  if (counted && task && counted.id === task.id) task.completed_pomodoros = (task.completed_pomodoros ?? 0) + 1;
  return { won, snap: committed ?? (await readTimerState(db, userId)) };
}

export async function finalizeOverdue(db: Db, userId: string, snap: TimerSnapshot): Promise<boolean> {
  return (await finalize(db, userId, snap, null)).won;
}

interface Ctx {
  settings: TimerSettings;
  /** Row as read (null when the user has never used the timer). */
  raw: TimerSnapshot | null;
  snap: TimerSnapshot;
  justCompleted: boolean;
  task: TaskRow | null;
  subtasks: SubtaskRow[];
  project: ProjectRow | null;
}

/**
 * Everything a command or the popup needs, in one parallel round when the hint
 * matches (the common case), two otherwise. `present` forces which task to load
 * (e.g. the one being selected) instead of the timer's current task.
 */
async function loadCtx(db: Db, userId: string, now: number, hint: StateHint = {}, present?: string | null): Promise<Ctx> {
  const guessTask = present !== undefined ? present : hint.taskId;
  const [settings, raw, guessedTask, guessedSubs, guessedProject] = await Promise.all([
    loadSettings(db, userId),
    readTimerState(db, userId),
    loadTask(db, userId, guessTask),
    loadSubtasks(db, userId, guessTask),
    loadProject(db, userId, hint.projectId),
  ]);

  let snap = raw ?? emptySnapshot(settings);
  const wantTask = present !== undefined ? present : snap.currentTaskId;
  let task = guessedTask;
  let subtasks = guessedSubs;
  let project = guessedProject;
  if ((guessTask ?? null) !== (wantTask ?? null)) {
    // Hint missed: fetch the right task — and its likely project (from the timer row) — in one more round.
    const likelyProject = present === undefined ? snap.currentProjectId : hint.projectId;
    [task, subtasks, project] = await Promise.all([
      loadTask(db, userId, wantTask),
      loadSubtasks(db, userId, wantTask),
      likelyProject && likelyProject !== guessedProject?.id ? loadProject(db, userId, likelyProject) : Promise.resolve(guessedProject),
    ]);
  }

  // The row commands compare-and-set against: as read, or as finalize just stored it.
  let base = raw;
  let justCompleted = false;
  if (raw && isOverdue(raw, now)) {
    const out = await finalize(db, userId, raw, task);
    justCompleted = out.won;
    base = out.snap;
    if (out.snap) snap = out.snap;
  }

  const projectId = task?.project_id ?? (present === undefined ? snap.currentProjectId : null);
  if ((project?.id ?? null) !== (projectId ?? null)) project = await loadProject(db, userId, projectId);
  return { settings, raw: base, snap, justCompleted, task, subtasks, project };
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

function buildState(c: Ctx, now: number): ExtensionState {
  const { snap, settings, task } = c;
  const progress = progressOf(task);
  const focusJustEnded = snap.status === "completed" && !isBreakMode(snap.mode);
  return {
    serverNow: now,
    justCompleted: c.justCompleted,
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
          subtasks: c.subtasks,
        }
      : null,
    project: c.project,
    next: {
      start: defaultStart(snap, settings, progress),
      breakOption: focusJustEnded ? breakAfterFocus(snap, settings, progress) : null,
    },
  };
}

export async function getExtensionState(db: Db, userId: string, now = Date.now(), hint: StateHint = {}): Promise<ExtensionState> {
  return buildState(await loadCtx(db, userId, now, hint), now);
}

export type TimerAction = "start" | "pause" | "resume" | "stop" | "skip";
const TIMER_MODES: TimerMode[] = ["pomodoro", "custom", "short_break", "long_break"];

/** Runs a timer command and returns the resulting state (no follow-up read needed). */
export async function runTimerCommand(
  db: Db, userId: string, action: TimerAction,
  opts: { mode?: string; durationSec?: number; hint?: StateHint } = {}, now = Date.now(),
): Promise<ExtensionState> {
  const c = await loadCtx(db, userId, now, opts.hint);
  const { snap, raw, settings, task } = c;
  const done = (committed: TimerSnapshot | null) => {
    if (!committed) throw new CommandError(CHANGED_ELSEWHERE);
    return buildState({ ...c, snap: committed, justCompleted: c.justCompleted }, now);
  };

  if (action === "pause" || action === "resume") {
    const next = action === "pause" ? applyPause(snap, now) : applyResume(snap, now);
    if (!next) throw new CommandError(action === "pause" ? "Timer is not running." : "Timer is not paused.");
    return done(await commit(db, userId, raw, next));
  }

  if (action === "stop" || action === "skip") {
    // Same bookkeeping as the focus page's Reset/Skip: drop accidental (<10s) sessions, keep the rest as incomplete.
    let close: PromiseLike<unknown> = Promise.resolve();
    if (isActive(snap) && snap.currentSessionId) {
      const out = closeOut(snap, now);
      const q = out.kind === "delete"
        ? db.from("focus_sessions").delete()
        : db.from("focus_sessions").update({ ended_at: new Date(now).toISOString(), actual_duration_sec: out.actualSec, completed: false });
      close = q.eq("id", snap.currentSessionId).eq("user_id", userId).is("ended_at", null);
    }
    const [committed] = await Promise.all([commit(db, userId, raw, applyReset(snap)), close]);
    return done(committed);
  }

  // start
  if (isActive(snap)) throw new CommandError("A session is already in progress.");
  const progress = progressOf(task);
  const requested = TIMER_MODES.includes(opts.mode as TimerMode) ? (opts.mode as TimerMode) : null;
  const planned = requested
    ? { mode: requested, durationSec: durationFor(requested, snap, settings, progress) }
    : defaultStart(snap, settings, progress);
  // Explicit length (MCP / Focus AI "start a 45-minute session").
  const plan = opts.durationSec && opts.durationSec > 0 ? { ...planned, durationSec: Math.round(opts.durationSec) } : planned;
  const focus = !isBreakMode(plan.mode);

  // The session id is generated here so the session row and the timer write go out together.
  const sessionId = crypto.randomUUID();
  const next = applyStart(snap, { ...plan, sessionId, now });
  const [insert, committed] = await Promise.all([
    db.from("focus_sessions").insert({
      id: sessionId,
      user_id: userId,
      mode: plan.mode,
      planned_duration_sec: plan.durationSec,
      task_id: focus ? task?.id ?? null : null,
      project_id: focus ? task?.project_id ?? snap.currentProjectId ?? null : null,
      started_at: new Date(now).toISOString(),
    }),
    commit(db, userId, raw, next),
  ]);
  if (insert.error) {
    // Undo the timer write (only if it is still ours) so it never points at a missing session.
    if (committed) await commit(db, userId, committed, { ...snap, source: "mcp" });
    throw new CommandError(`Could not start session: ${insert.error.message}`, 500);
  }
  if (!committed) {
    // Someone else changed the timer at the same instant — don't leave an orphan session behind.
    await db.from("focus_sessions").delete().eq("id", sessionId).eq("user_id", userId);
    throw new CommandError(CHANGED_ELSEWHERE);
  }
  return done(committed);
}

/**
 * Re-stamp timer_state so open FocusSpace tabs (useTimerSync) refetch
 * tasks/subtasks. Only touches source + updated_at, so it cannot clobber a
 * concurrent timer write; runs after the response is sent.
 */
function nudge(db: Db, userId: string, c: Ctx): Ctx {
  if (!c.raw) return c;
  const updatedAt = new Date().toISOString();
  runAfter(async () => {
    await db.from("timer_state").update({ source: "mcp", updated_at: updatedAt }).eq("user_id", userId);
  });
  return { ...c, snap: { ...c.snap, source: "mcp", updatedAt } };
}

export type TaskAction =
  | { action: "select"; taskId: string | null }
  /** `done` = desired state (idempotent, no read needed); omitted = toggle. */
  | { action: "toggle_done"; taskId: string; done?: boolean }
  | { action: "toggle_subtask"; subtaskId: string; done?: boolean };

/** Runs a task command and returns the resulting state (no follow-up read needed). */
export async function runTaskCommand(
  db: Db, userId: string, cmd: TaskAction, hint: StateHint = {}, now = Date.now(),
): Promise<ExtensionState> {
  if (cmd.action === "toggle_subtask") {
    let desired = cmd.done;
    if (desired === undefined) {
      const { data: st } = await db.from("subtasks").select("done").eq("id", cmd.subtaskId).eq("user_id", userId).maybeSingle();
      if (!st) throw new CommandError("Subtask not found.", 404);
      desired = !st.done;
    }
    const [res, c] = await Promise.all([
      db.from("subtasks").update({ done: desired }).eq("id", cmd.subtaskId).eq("user_id", userId).select("id"),
      loadCtx(db, userId, now, hint),
    ]);
    if (affected(res) === 0) throw new CommandError("Subtask not found.", 404);
    const subtasks = c.subtasks.map((s) => (s.id === cmd.subtaskId ? { ...s, done: desired! } : s));
    return buildState(nudge(db, userId, { ...c, subtasks }), now);
  }

  if (cmd.action === "select") {
    const c = await loadCtx(db, userId, now, hint, cmd.taskId);
    if (cmd.taskId && !c.task) throw new CommandError("Task not found.", 404);
    const next = applySelectTask(c.snap, c.task?.id ?? null, c.task?.project_id ?? null);
    if (!next) throw new CommandError("Stop the timer before switching tasks.");
    const committed = await commit(db, userId, c.raw, next);
    if (!committed) throw new CommandError(CHANGED_ELSEWHERE);
    return buildState({ ...c, snap: committed }, now);
  }

  // toggle_done — mirrors the focus page's "Finish task": mark done, then move on to the next todo.
  let desired = cmd.done;
  if (desired === undefined) {
    const t = await loadTask(db, userId, cmd.taskId);
    if (!t) throw new CommandError("Task not found.", 404);
    desired = t.status !== "done";
  }
  const [res, c] = await Promise.all([
    db.from("tasks").update({ status: desired ? "done" : "todo", completed_at: desired ? new Date(now).toISOString() : null })
      .eq("id", cmd.taskId).eq("user_id", userId).select("id, project_id"),
    loadCtx(db, userId, now, hint),
  ]);
  if (affected(res) === 0) throw new CommandError("Task not found.", 404);
  if (c.task?.id === cmd.taskId) c.task = { ...c.task, status: desired ? "done" : "todo" };

  if (desired && c.snap.currentTaskId === cmd.taskId && !isActive(c.snap)) {
    const doneProject = c.task?.project_id ?? null;
    const { data: candidates } = await db.from("tasks").select("id, project_id")
      .eq("user_id", userId).eq("status", "todo").neq("id", cmd.taskId).order("sort_order").limit(20);
    const pick = (candidates ?? []).find((t) => t.project_id === doneProject) ?? candidates?.[0] ?? null;
    const next = pick ? applySelectTask(c.snap, pick.id, pick.project_id) : null;
    if (pick && next) {
      const [committed, task, subtasks, project] = await Promise.all([
        commit(db, userId, c.raw, next),
        loadTask(db, userId, pick.id),
        loadSubtasks(db, userId, pick.id),
        pick.project_id === c.project?.id ? Promise.resolve(c.project) : loadProject(db, userId, pick.project_id),
      ]);
      if (committed) return buildState({ ...c, snap: committed, task, subtasks, project }, now);
    }
  }
  return buildState(nudge(db, userId, c), now);
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
