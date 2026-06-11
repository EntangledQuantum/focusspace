import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TimerMode = "pomodoro" | "custom" | "short_break" | "long_break";
export type TimerStatus = "idle" | "running" | "paused" | "completed";

interface TimerState {
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

  // Actions
  start: (params: {
    mode: TimerMode;
    durationSec: number;
    taskId?: string | null;
    projectId?: string | null;
    sessionId?: string | null;
  }) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  complete: () => void;
  setSessionId: (id: string) => void;
  incrementPomodoroCount: () => void;
  setMode: (mode: TimerMode, durationSec: number) => void;
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      mode: "pomodoro",
      status: "idle",
      plannedDurationSec: 25 * 60,
      startedAt: null,
      pausedAt: null,
      accumulatedPausedMs: 0,
      currentSessionId: null,
      currentTaskId: null,
      currentProjectId: null,
      pomodoroCount: 0,

      start({ mode, durationSec, taskId = null, projectId = null, sessionId = null }) {
        const prevTaskId = get().currentTaskId;
        // Starting work on a different task begins a fresh pomodoro cycle,
        // so the break cadence and timeline don't inherit the old task's count.
        // Breaks belong to the task's cycle and keep the current task/count.
        const isFocusMode = mode === "pomodoro" || mode === "custom";
        const taskChanged = isFocusMode && taskId !== prevTaskId;
        set((s) => ({
          mode,
          status: "running",
          plannedDurationSec: durationSec,
          startedAt: Date.now(),
          pausedAt: null,
          accumulatedPausedMs: 0,
          currentTaskId: isFocusMode ? taskId : s.currentTaskId,
          currentProjectId: isFocusMode ? projectId : s.currentProjectId,
          currentSessionId: sessionId,
          pomodoroCount: taskChanged ? 0 : s.pomodoroCount,
        }));
      },

      pause() {
        const { status } = get();
        if (status !== "running") return;
        set({ status: "paused", pausedAt: Date.now() });
      },

      resume() {
        const { status, pausedAt, accumulatedPausedMs } = get();
        if (status !== "paused" || pausedAt === null) return;
        set({
          status: "running",
          pausedAt: null,
          accumulatedPausedMs: accumulatedPausedMs + (Date.now() - pausedAt),
        });
      },

      reset() {
        set((s) => ({
          // If we were on a break, flip back to pomodoro so the timeline shows the next focus
          mode: s.mode === "short_break" || s.mode === "long_break" ? "pomodoro" : s.mode,
          status: "idle",
          startedAt: null,
          pausedAt: null,
          accumulatedPausedMs: 0,
          currentSessionId: null,
        }));
      },

      complete() {
        set({ status: "completed" });
      },

      setSessionId(id) {
        set({ currentSessionId: id });
      },

      incrementPomodoroCount() {
        set((s) => ({ pomodoroCount: s.pomodoroCount + 1 }));
      },

      setMode(mode, durationSec) {
        set({ mode, plannedDurationSec: durationSec, status: "idle", startedAt: null, pausedAt: null, accumulatedPausedMs: 0 });
      },
    }),
    {
      name: "focusspace-timer",
      partialize: (s) => ({
        mode: s.mode,
        status: s.status,
        plannedDurationSec: s.plannedDurationSec,
        startedAt: s.startedAt,
        pausedAt: s.pausedAt,
        accumulatedPausedMs: s.accumulatedPausedMs,
        currentSessionId: s.currentSessionId,
        currentTaskId: s.currentTaskId,
        currentProjectId: s.currentProjectId,
        pomodoroCount: s.pomodoroCount,
      }),
    }
  )
);

/** Derived: elapsed seconds (safe across tab throttle) */
export function getElapsedSec(state: TimerState): number {
  if (!state.startedAt) return 0;
  const now = state.status === "paused" && state.pausedAt ? state.pausedAt : Date.now();
  return Math.floor((now - state.startedAt - state.accumulatedPausedMs) / 1000);
}

/** Derived: remaining seconds */
export function getRemainingMs(state: TimerState): number {
  const elapsed = getElapsedSec(state);
  return Math.max(0, state.plannedDurationSec - elapsed);
}
