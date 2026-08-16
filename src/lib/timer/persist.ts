import type { TimerMode, TimerStatus } from "@/lib/stores/timer";

export interface TimerSnapshot {
  mode: TimerMode;
  status: TimerStatus;
  plannedDurationSec: number;
  startedAt: number | null;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  currentSessionId: string | null;
  currentTaskId: string | null;
  currentProjectId: string | null;
  pomodoroCount: number;
  source: "ui" | "mcp";
  updatedAt?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from: (table: string) => any };

export async function writeTimerState(
  db: AnyDb,
  userId: string,
  snap: TimerSnapshot,
) {
  const row = {
    user_id: userId,
    mode: snap.mode,
    status: snap.status,
    planned_duration_sec: snap.plannedDurationSec,
    started_at: snap.startedAt,
    paused_at: snap.pausedAt,
    accumulated_paused_ms: snap.accumulatedPausedMs,
    current_session_id: snap.currentSessionId,
    current_task_id: snap.currentTaskId,
    current_project_id: snap.currentProjectId,
    pomodoro_count: snap.pomodoroCount,
    source: snap.source,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("timer_state").upsert(row, { onConflict: "user_id" });
  if (error) {
    // First-time cloud deploys may not have the migration yet — never crash the timer.
    console.warn("[timer] persist failed:", error.message);
  }
}

export async function readTimerState(db: AnyDb, userId: string): Promise<TimerSnapshot | null> {
  const { data, error } = await db.from("timer_state").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    mode: data.mode,
    status: data.status,
    plannedDurationSec: data.planned_duration_sec,
    startedAt: data.started_at,
    pausedAt: data.paused_at,
    accumulatedPausedMs: data.accumulated_paused_ms ?? 0,
    currentSessionId: data.current_session_id,
    currentTaskId: data.current_task_id,
    currentProjectId: data.current_project_id,
    pomodoroCount: data.pomodoro_count ?? 0,
    source: data.source ?? "ui",
    updatedAt: data.updated_at,
  };
}

export function remainingSec(snap: TimerSnapshot, now = Date.now()): number {
  if (!snap.startedAt || snap.status === "idle") return snap.plannedDurationSec;
  const pausedExtra = snap.status === "paused" && snap.pausedAt ? now - snap.pausedAt : 0;
  const elapsed = Math.floor((now - snap.startedAt - snap.accumulatedPausedMs - pausedExtra) / 1000);
  return Math.max(0, snap.plannedDurationSec - elapsed);
}
