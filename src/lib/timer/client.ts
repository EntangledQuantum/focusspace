"use client";

import { toast } from "sonner";
import { useTimerStore, INITIAL_TIMER, serverNow, type TimerMode, type TimerState } from "@/lib/stores/timer";
import { addSample, sampleOffset, type ClockSample } from "@/lib/timer/clock";
import {
  applyPause, applyReset, applyResume, applySelectTask, applySetMode, applyStart, endsAt,
} from "@/lib/timer/commands";
import type { TimerSnapshot } from "@/lib/timer/persist";
import type { ExtensionState } from "@/lib/extension/service";

/**
 * The website's side of the single source of truth.
 *
 * - Commands are INTENTS sent to /api/timer; the server applies them with its
 *   own clock and returns the new row. The store shows an optimistic guess
 *   meanwhile and is replaced by the answer (or by the server's current state
 *   when the intent is refused).
 * - Every server state (command answers, GET, Realtime rows) lands in
 *   `applyRow`, which also measures the server-clock offset.
 * - No tab ever completes a session itself: when the countdown hits zero the
 *   tab just asks the server, which records the completion exactly once.
 */

export type TimerIntent = "start" | "pause" | "resume" | "stop" | "skip" | "set_mode" | "select";

export interface TimerRow {
  mode: TimerMode;
  status: TimerState["status"];
  plannedDurationSec: number;
  startedAt: number | null;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  currentSessionId: string | null;
  currentTaskId: string | null;
  currentProjectId: string | null;
  pomodoroCount: number;
  updatedAt: string | null;
}

let samples: ClockSample[] = [];
let inflight = 0;
const completionListeners = new Set<(info: { sessionId: string; mode: TimerMode; claimed: boolean }) => void>();
const changeListeners = new Set<(row: TimerRow) => void>();

export function onSessionComplete(cb: (info: { sessionId: string; mode: TimerMode; claimed: boolean }) => void) {
  completionListeners.add(cb);
  return () => { completionListeners.delete(cb); };
}

/** Fires after every applied server change (used to refresh task/session queries). */
export function onTimerChange(cb: (row: TimerRow) => void) {
  changeListeners.add(cb);
  return () => { changeListeners.delete(cb); };
}

function toSnapshot(s: TimerState): TimerSnapshot {
  return {
    mode: s.mode, status: s.status, plannedDurationSec: s.plannedDurationSec, startedAt: s.startedAt,
    pausedAt: s.pausedAt, accumulatedPausedMs: s.accumulatedPausedMs, currentSessionId: s.currentSessionId,
    currentTaskId: s.currentTaskId, currentProjectId: s.currentProjectId, pomodoroCount: s.pomodoroCount,
    source: "ui", updatedAt: s.updatedAt ?? undefined,
  };
}

export function rowFromState(st: ExtensionState): TimerRow {
  const t = st.timer;
  return {
    mode: t.mode, status: t.status, plannedDurationSec: t.plannedDurationSec, startedAt: t.startedAt,
    pausedAt: t.pausedAt, accumulatedPausedMs: t.accumulatedPausedMs, currentSessionId: t.sessionId,
    currentTaskId: t.taskId, currentProjectId: t.projectId, pomodoroCount: t.pomodoroCount, updatedAt: t.updatedAt,
  };
}

/** Postgres row (Realtime payload) → TimerRow. */
export function rowFromDb(r: Record<string, unknown>): TimerRow {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    mode: r.mode as TimerMode,
    status: r.status as TimerState["status"],
    plannedDurationSec: Number(r.planned_duration_sec),
    startedAt: n(r.started_at),
    pausedAt: n(r.paused_at),
    accumulatedPausedMs: Number(r.accumulated_paused_ms ?? 0),
    currentSessionId: (r.current_session_id as string | null) ?? null,
    currentTaskId: (r.current_task_id as string | null) ?? null,
    currentProjectId: (r.current_project_id as string | null) ?? null,
    pomodoroCount: Number(r.pomodoro_count ?? 0),
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

/**
 * A session ended by completion (not a stop/skip) when it was running, its
 * end time has passed, and it is now "completed" or an auto-started phase
 * began exactly at that end.
 */
export function completedBetween(prev: TimerRow | TimerState, next: TimerRow, now: number): string | null {
  if (prev.status !== "running" || !prev.currentSessionId || !prev.startedAt) return null;
  const end = prev.startedAt + prev.accumulatedPausedMs + prev.plannedDurationSec * 1000;
  if (now < end - 1500) return null;
  if (next.status === "completed" && next.currentSessionId === prev.currentSessionId) return prev.currentSessionId;
  if (next.status === "running" && next.currentSessionId !== prev.currentSessionId && next.startedAt === end) return prev.currentSessionId;
  return null;
}

/** One tab plays the sound / notification per completed session (others just update). */
function claim(sessionId: string): boolean {
  try {
    const key = `fs-done:${sessionId}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/**
 * Apply an authoritative server row. Rows older than what is shown are ignored
 * (all versions are server-stamped, so they order correctly), as are pushes
 * that arrive while one of this tab's own commands is in flight — its answer
 * is newer and lands right after.
 */
export function applyRow(row: TimerRow, opts: { fromCommand?: boolean; fromPeer?: boolean } = {}) {
  const prev = useTimerStore.getState();
  if (!opts.fromCommand) {
    if (inflight > 0) return;
    if (prev.synced && prev.updatedAt && row.updatedAt && Date.parse(row.updatedAt) < Date.parse(prev.updatedAt)) return;
  }
  const sameVersion = prev.synced && !!row.updatedAt && Date.parse(prev.updatedAt ?? "") === Date.parse(row.updatedAt);
  useTimerStore.setState({ ...row, synced: true });
  if (sameVersion) return;
  if (!opts.fromPeer) peers()?.postMessage(row); // hand it to this browser's other tabs instantly
  const done = completedBetween(prev, row, serverNow(prev));
  if (done) {
    const claimed = claim(done);
    completionListeners.forEach((cb) => cb({ sessionId: done, mode: prev.mode, claimed }));
  }
  changeListeners.forEach((cb) => cb(row));
}

/**
 * Same-browser tabs share every server row they receive over a
 * BroadcastChannel: instant cross-tab updates with no extra server load, and
 * still correct if Realtime is down (version ordering in applyRow applies).
 */
let peerChannel: BroadcastChannel | null | undefined;
function peers(): BroadcastChannel | null {
  if (peerChannel !== undefined) return peerChannel;
  peerChannel = typeof BroadcastChannel === "function" ? new BroadcastChannel("focusspace-timer") : null;
  peerChannel?.addEventListener("message", (e: MessageEvent<TimerRow>) => {
    if (e.data && typeof e.data === "object" && "status" in e.data) applyRow(e.data, { fromPeer: true });
  });
  return peerChannel;
}
/** Start listening to sibling tabs (called once by useTimerSync). */
export function listenToPeers() {
  peers();
}

function noteClock(serverNowMs: number | undefined, t0: number, t1: number) {
  if (typeof serverNowMs !== "number") return;
  const r = addSample(samples, sampleOffset(serverNowMs, t0, t1));
  samples = r.samples;
  if (useTimerStore.getState().clockOffsetMs !== r.offset) useTimerStore.setState({ clockOffsetMs: r.offset });
}

async function call(method: "GET" | "POST", url: string, body?: unknown) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      signal: ctrl.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    noteClock(data?.serverNow, t0, Date.now());
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

let fetching: Promise<void> | null = null;

/** Read the server state (one query when nothing changed). Concurrent calls share one request. */
export function fetchTimer(): Promise<void> {
  fetching ??= (async () => {
    try {
      const s = useTimerStore.getState();
      const since = s.synced && s.updatedAt ? `?since=${encodeURIComponent(s.updatedAt)}` : "";
      const r = await call("GET", `/api/timer${since}`);
      if (r.ok && r.data && !r.data.unchanged && r.data.timer) applyRow(rowFromState(r.data as ExtensionState));
    } catch {
      /* offline — keep counting from the last known server timestamps */
    } finally {
      fetching = null;
    }
  })();
  return fetching;
}

function predict(intent: TimerIntent, s: TimerState, opts: CommandOptions): TimerRow | null {
  const now = serverNow(s);
  const snap = toSnapshot(s);
  let next: TimerSnapshot | null = null;
  switch (intent) {
    case "pause": next = applyPause(snap, now); break;
    case "resume": next = applyResume(snap, now); break;
    case "stop":
    case "skip": next = applyReset(snap, { resetCycle: opts.resetCycle }); break;
    case "set_mode": next = opts.mode ? applySetMode(snap, opts.mode, opts.durationSec ?? s.plannedDurationSec) : null; break;
    case "select": next = applySelectTask(snap, opts.taskId ?? null, opts.projectId ?? null); break;
    case "start": {
      const base = opts.taskId !== undefined ? applySelectTask(snap, opts.taskId, opts.projectId ?? null) ?? snap : snap;
      next = applyStart(base, { mode: opts.mode ?? s.mode, durationSec: opts.durationSec ?? s.plannedDurationSec, sessionId: "pending", now });
      break;
    }
  }
  if (!next) return null;
  return { ...next, updatedAt: s.updatedAt } as TimerRow;
}

export interface CommandOptions {
  mode?: TimerMode;
  durationSec?: number;
  taskId?: string | null;
  projectId?: string | null;
  resetCycle?: boolean;
}

/**
 * Send an intent. The UI updates immediately; the server's answer replaces
 * the guess. A refused intent (409) shows the server's current state with a
 * toast; a network failure rolls back to the last server state.
 */
export async function timerCommand(intent: TimerIntent, opts: CommandOptions = {}): Promise<boolean> {
  const before = useTimerStore.getState();
  const guess = predict(intent, before, opts);
  inflight++;
  if (guess) useTimerStore.setState(guess);
  const expect = intent === "pause" || intent === "resume" || intent === "stop" || intent === "skip";
  try {
    const r = await call("POST", "/api/timer", {
      action: intent,
      ...opts,
      ...(expect ? { expectSessionId: before.currentSessionId } : {}),
      known: { taskId: opts.taskId ?? before.currentTaskId, projectId: opts.projectId ?? before.currentProjectId },
    });
    inflight--;
    if (r.ok && r.data?.timer) {
      applyRow(rowFromState(r.data as ExtensionState), { fromCommand: true });
      return true;
    }
    if (r.data?.state?.timer) applyRow(rowFromState(r.data.state as ExtensionState), { fromCommand: true });
    else restore(before);
    toast.error(r.data?.error || `Timer request failed (${r.status}).`);
    return false;
  } catch {
    inflight--;
    restore(before);
    toast.error("You're offline — the timer wasn't changed.");
    return false;
  }
}

function restore(before: TimerState) {
  const { clockOffsetMs } = useTimerStore.getState();
  useTimerStore.setState({ ...before, clockOffsetMs });
}

/** When the running session is due, ask the server (which records the completion once). */
export function msUntilDue(s: TimerState): number | null {
  const end = endsAt(toSnapshot(s));
  return end === null ? null : end - serverNow(s);
}

export function resetTimerClientForTests() {
  samples = [];
  inflight = 0;
  useTimerStore.setState({ ...INITIAL_TIMER });
}
