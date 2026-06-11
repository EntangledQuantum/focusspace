"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTimerStore, getElapsedSec, getRemainingMs, type TimerMode } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

// Completion listeners shared across all useTimer instances (focus page +
// pop-out miniplayer both mount the hook). Whichever instance's tick crosses
// zero transitions the store exactly once and notifies every listener, so the
// focus page's session-recording logic runs even if the miniplayer "won".
const completionListeners = new Set<() => void>();

export function useTimer() {
  const store = useTimerStore();
  const onCompleteRef = useRef<(() => void) | null>(null);
  const supabase = createClient();
  const qc = useQueryClient();

  // Re-render only when the displayed second changes — a 60fps rAF loop here
  // previously re-rendered the whole page tree every frame and made the app crawl.
  const [, setDisplayedSec] = useState(0);

  /** Register the side-effect to run when a session completes (stable identity). */
  const setOnComplete = useCallback((cb: (() => void) | null) => {
    onCompleteRef.current = cb;
  }, []);

  useEffect(() => {
    const listener = () => onCompleteRef.current?.();
    completionListeners.add(listener);
    return () => { completionListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (store.status !== "running") return;

    const tick = () => {
      const state = useTimerStore.getState();
      if (state.status !== "running") return;
      const remaining = getRemainingMs(state);
      if (remaining <= 0) {
        useTimerStore.getState().complete();
        completionListeners.forEach((cb) => cb());
        return;
      }
      setDisplayedSec(remaining);
    };

    tick();
    // Browsers throttle hidden-tab intervals to ~1s, which still completes on time.
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [store.status]);

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

  // Sessions shorter than this are treated as accidental (start → immediate reset/skip)
  // and removed entirely so they don't pollute analytics with 0m / Untitled noise.
  const MIN_RECORDED_SEC = 10;

  const skipSession = useCallback(async () => {
    const state = useTimerStore.getState();
    if (!state.currentSessionId) {
      store.reset();
      return;
    }

    const elapsed = getElapsedSec(state);
    if (elapsed < MIN_RECORDED_SEC) {
      await supabase.from("focus_sessions").delete().eq("id", state.currentSessionId);
    } else {
      await supabase
        .from("focus_sessions")
        .update({
          ended_at: new Date().toISOString(),
          actual_duration_sec: elapsed,
          completed: false,
        })
        .eq("id", state.currentSessionId);
    }

    store.reset();
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
  }, [supabase, store, qc]);

  const resetSession = useCallback(async () => {
    const state = useTimerStore.getState();
    const elapsed = getElapsedSec(state);

    if (state.currentSessionId) {
      if (elapsed < MIN_RECORDED_SEC) {
        await supabase.from("focus_sessions").delete().eq("id", state.currentSessionId);
      } else {
        await supabase
          .from("focus_sessions")
          .update({
            ended_at: new Date().toISOString(),
            actual_duration_sec: elapsed,
            completed: false,
          })
          .eq("id", state.currentSessionId);
      }
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    }

    store.reset();
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
    resetSession,
    setOnComplete,
  };
}
