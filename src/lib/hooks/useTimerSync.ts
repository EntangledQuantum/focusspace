"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTimerStore } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";

let lastApplied = "";

/**
 * Pull the server timer snapshot once and apply it if it was written by
 * MCP / Focus AI / the Chrome extension (any source except "ui").
 * Returns true when the store changed.
 * Exported so the global chat panel can re-sync right after a timer tool,
 * on any tab — not only while /focus is polling.
 */
export async function pullTimerState(qc: QueryClient): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("timer_state").select("*").eq("user_id", user.id).maybeSingle();
    // Anything not written by this site's own UI (MCP, Focus AI, Chrome extension).
    if (!data || data.source === "ui") return false;
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
    qc.invalidateQueries({ queryKey: ["subtasks"] });
    qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
    return true;
  } catch {
    return false; // cloud without migration, or offline
  }
}

/**
 * Picks up timer commands written outside this tab (MCP / Ask AI / the Chrome
 * extension — anything not tagged "ui") so the live ring follows
 * start/pause/reset that happened elsewhere.
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
