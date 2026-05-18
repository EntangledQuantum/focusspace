"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTimerStore, getElapsedSec, getRemainingMs, type TimerMode } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function useTimer() {
  const store = useTimerStore();
  const rafRef = useRef<number | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);
  const supabase = createClient();
  const qc = useQueryClient();

  // Tick counter forces React re-renders on each animation frame while running
  const [, setTick] = useState(0);

  const tick = useCallback(() => {
    const state = useTimerStore.getState();
    if (state.status !== "running") return;

    const remaining = getRemainingMs(state);
    if (remaining <= 0) {
      useTimerStore.getState().complete();
      onCompleteRef.current?.();
      return;
    }

    setTick((t) => t + 1);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const { status } = store;
    if (status === "running") {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [store.status, tick]);

  const startSession = useCallback(
    async ({
      mode,
      durationSec,
      taskId,
      projectId,
    }: {
      mode: TimerMode;
      durationSec: number;
      taskId?: string | null;
      projectId?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: sessionData } = await supabase
        .from("focus_sessions")
        .insert({
          user_id: user!.id,
          mode,
          planned_duration_sec: durationSec,
          task_id: taskId ?? null,
          project_id: projectId ?? null,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      store.start({
        mode,
        durationSec,
        taskId: taskId ?? null,
        projectId: projectId ?? null,
        sessionId: sessionData?.id ?? null,
      });
    },
    [store, supabase]
  );

  const completeSession = useCallback(async () => {
    const state = useTimerStore.getState();
    if (!state.currentSessionId) return;

    const elapsed = getElapsedSec(state);
    await supabase
      .from("focus_sessions")
      .update({
        ended_at: new Date().toISOString(),
        actual_duration_sec: elapsed,
        completed: true,
      })
      .eq("id", state.currentSessionId);

    if (state.mode === "pomodoro" && state.currentTaskId) {
      const { data: taskData } = await supabase
        .from("tasks")
        .select("completed_pomodoros")
        .eq("id", state.currentTaskId)
        .single();
      if (taskData) {
        await supabase
          .from("tasks")
          .update({ completed_pomodoros: taskData.completed_pomodoros + 1 })
          .eq("id", state.currentTaskId);
      }
    }

    if (state.mode === "pomodoro") {
      store.incrementPomodoroCount();
    }

    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
  }, [supabase, store, qc]);

  const skipSession = useCallback(async () => {
    const state = useTimerStore.getState();
    if (!state.currentSessionId) {
      store.reset();
      return;
    }

    const elapsed = getElapsedSec(state);
    await supabase
      .from("focus_sessions")
      .update({
        ended_at: new Date().toISOString(),
        actual_duration_sec: elapsed,
        completed: false,
      })
      .eq("id", state.currentSessionId);

    store.reset();
    qc.invalidateQueries({ queryKey: ["sessions"] });
  }, [supabase, store, qc]);

  const elapsed = getElapsedSec(store);
  const remaining = getRemainingMs(store);
  const progress = store.plannedDurationSec > 0
    ? Math.min(1, elapsed / store.plannedDurationSec)
    : 0;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const displayTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return {
    ...store,
    elapsed,
    remaining,
    progress,
    displayTime,
    startSession,
    completeSession,
    skipSession,
    onCompleteRef,
  };
}
