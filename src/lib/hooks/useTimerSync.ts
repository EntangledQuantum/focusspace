"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTimerStore } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";


/**
 * Picks up timer commands written by MCP / Ask AI so the live ring
 * follows start/pause/reset that happened outside the browser.
 */
export function useTimerSync() {
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let lastUpdated = "";

    async function tick() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase.from("timer_state").select("*").eq("user_id", user.id).maybeSingle();
        if (!data || cancelled) return;
        if (data.source !== "mcp") return;
        if (data.updated_at && data.updated_at === lastUpdated) return;
        lastUpdated = data.updated_at ?? "";
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
      } catch {
        /* ignore — cloud without migration, or offline */
      }
    }

    tick();
    const id = setInterval(tick, 1200);
    return () => { cancelled = true; clearInterval(id); };
  }, [qc]);
}
