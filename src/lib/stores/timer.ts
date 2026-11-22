import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TimerMode = "pomodoro" | "custom" | "short_break" | "long_break";
export type TimerStatus = "idle" | "running" | "paused" | "completed";

/**
 * Read-only mirror of the server's `timer_state` row (the single source of
 * truth). It is only ever written by src/lib/timer/client.ts from server
 * responses / Realtime events (plus a short-lived optimistic guess while a
 * command is in flight). Timestamps are SERVER epoch ms; `clockOffsetMs`
 * (server − local, measured per response) turns them into a local countdown,
 * so every tab and the extension show the same time whatever the local clock.
 * Persisted only so a reload paints instantly; it is replaced by a fresh
 * server read on mount.
 */
export interface TimerState {
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
  /** Version of the server row this mirrors. */
  updatedAt: string | null;
  /** server clock − local clock, ms. */
  clockOffsetMs: number;
  /** True once a server response has been applied in this page load. */
  synced: boolean;
}

export const INITIAL_TIMER: TimerState = {
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
  updatedAt: null,
  clockOffsetMs: 0,
  synced: false,
};

export const useTimerStore = create<TimerState>()(
  persist(() => ({ ...INITIAL_TIMER }), {
    name: "focusspace-timer",
    version: 2,
    partialize: (s) => ({ ...s, synced: false }),
    // v1 stored a locally-driven timer with browser-clock timestamps: drop it.
    migrate: () => ({ ...INITIAL_TIMER }),
  }),
);

/** Server time now, as best this tab knows it. */
export function serverNow(state: Pick<TimerState, "clockOffsetMs">): number {
  return Date.now() + state.clockOffsetMs;
}

/** Derived: elapsed seconds of the current session (server clock). */
export function getElapsedSec(state: TimerState): number {
  if (!state.startedAt) return 0;
  const now = state.status === "paused" && state.pausedAt ? state.pausedAt : serverNow(state);
  return Math.max(0, Math.floor((now - state.startedAt - state.accumulatedPausedMs) / 1000));
}

/** Derived: remaining seconds (name kept for existing callers). */
export function getRemainingMs(state: TimerState): number {
  if (state.status === "completed") return 0;
  if (state.status === "idle" || !state.startedAt) return state.plannedDurationSec;
  return Math.max(0, state.plannedDurationSec - getElapsedSec(state));
}
