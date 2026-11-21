"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTimerStore } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";

let lastApplied = "";

/**
 * Pull the server timer snapshot once and apply it if it was written by
 * MCP / Focus AI (source "mcp"). Returns true when the store changed.
 * Exported so the global chat panel can re-sync right after a timer tool,
 * on any tab — not only while /focus is polling.
 */
export async function pullTimerState(qc: QueryClient): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("timer_state").select("*").eq("user_id", user.id).maybeSingle();
    if (!data || data.source !== "mcp") return false;
    if (data.updated_at && data.updated_at === lastApplied) return false;
    lastApplied = data.updated_at ?? "";
    useTimerStore.setState({
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
    });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
    return true;
  } catch {
    return false; // cloud without migration, or offline
  }
}

/**
 * Picks up timer commands written by MCP / Ask AI so the live ring
 * follows start/pause/reset that happened outside the browser.
 */
export function useTimerSync() {
  const qc = useQueryClient();

  useEffect(() => {
    // Re-apply on mount even if this snapshot was seen before navigating away.
    lastApplied = "";
    let cancelled = false;
    const tick = () => { if (!cancelled) void pullTimerState(qc); };
    tick();
    const id = setInterval(tick, 1200);
    return () => { cancelled = true; clearInterval(id); };
  }, [qc]);
}
