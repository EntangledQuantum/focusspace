"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTimerStore, getElapsedSec, getRemainingMs, type TimerMode } from "@/lib/stores/timer";
import { fetchTimer, onSessionComplete, timerCommand } from "@/lib/timer/client";
import { unlockAudio } from "@/lib/audio/tones";

/**
 * The website's timer controls. Every action is an intent sent to the server
 * (the single source of truth, see lib/timer/client.ts); this hook only
 * renders the mirrored row and re-renders once per displayed second. A tab
 * never completes a session itself — at zero it asks the server, which
 * records it exactly once and (per user settings) auto-starts the next phase.
 */
export function useTimer() {
  const store = useTimerStore();
  const onCompleteRef = useRef<((info: { mode: TimerMode; claimed: boolean }) => void) | null>(null);

  // Re-render only when the displayed second changes.
  const [, setDisplayedSec] = useState(0);

  /** Register the side-effect to run when the server reports a completed session. */
  const setOnComplete = useCallback((cb: ((info: { mode: TimerMode; claimed: boolean }) => void) | null) => {
    onCompleteRef.current = cb;
  }, []);

  useEffect(() => onSessionComplete((info) => onCompleteRef.current?.(info)), []);

  useEffect(() => {
    if (store.status !== "running") return;
    let asked = false;
    const tick = () => {
      const state = useTimerStore.getState();
      if (state.status !== "running") return;
      const remaining = getRemainingMs(state);
      setDisplayedSec(remaining);
      // Hit zero: ask the server (useTimerSync also schedules this; harmless if both do).
      if (remaining <= 0 && !asked) {
        asked = true;
        void fetchTimer();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [store.status, store.updatedAt]);

  const startSession = useCallback(
    async ({ mode, durationSec, taskId, projectId }: {
      mode: TimerMode;
      durationSec: number;
      taskId?: string | null;
      projectId?: string | null;
    }) => {
      // Starting the timer is a user gesture: unlock audio now so the end-of-session sound can play later.
      unlockAudio();
      await timerCommand("start", { mode, durationSec, taskId, projectId });
    },
    [],
  );

  const pause = useCallback(() => { void timerCommand("pause"); }, []);
  const resume = useCallback(() => { unlockAudio(); void timerCommand("resume"); }, []);
  const skipSession = useCallback(async () => { await timerCommand("skip"); }, []);
  const resetSession = useCallback(async () => { await timerCommand("stop"); }, []);
  /** Stop and restart the pomodoro cycle (focus page "Reset task"). */
  const resetCycle = useCallback(async () => { await timerCommand("stop", { resetCycle: true }); }, []);
  /** Choose pomodoro / custom (and its length) while idle — shared with every client. */
  const setMode = useCallback((mode: TimerMode, durationSec: number) => {
    void timerCommand("set_mode", { mode, durationSec });
  }, []);
  /** Make a task the timer's task (idle only), for every client. */
  const selectTask = useCallback(async (taskId: string | null, projectId: string | null) => {
    await timerCommand("select", { taskId, projectId });
  }, []);

  const elapsed = getElapsedSec(store);
  const remaining = getRemainingMs(store);
  const progress = store.status === "completed"
    ? 1
    : store.plannedDurationSec > 0 ? Math.min(1, elapsed / store.plannedDurationSec) : 0;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const displayTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return {
    ...store,
    pause,
    resume,
    elapsed,
    remaining,
    progress,
    displayTime,
    startSession,
    skipSession,
    resetSession,
    resetCycle,
    setMode,
    selectTask,
    setOnComplete,
  };
}
