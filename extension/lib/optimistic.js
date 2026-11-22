// Pure optimistic-UI rules for the popup / side panel (no chrome.* / DOM),
// unit-tested in tests/extension-optimistic.test.ts. Timer guesses use the
// same rules as the server (src/lib/timer/commands.ts) on SERVER timestamps,
// so the guess and the answer agree to the millisecond in the common case.
import { remainingAt } from "./clock.js";

const isBreakMode = (m) => m === "short_break" || m === "long_break";

function withTimes(timer, patch, now) {
  const t = { ...timer, ...patch };
  t.endsAt = t.status === "running" && t.startedAt ? t.startedAt + t.accumulatedPausedMs + t.plannedDurationSec * 1000 : null;
  t.remainingSec = remainingAt(t, now);
  return t;
}

/**
 * What the server will (almost certainly) answer to a timer command, at server
 * time `now`. Returns null when the action makes no sense in the current state
 * (the click is then ignored instead of sent).
 */
export function predictTimer(state, action, mode, now) {
  const t = state?.timer;
  if (!t) return null;
  const active = t.status === "running" || t.status === "paused";
  const next = { ...state.next };
  let timer;

  if (action === "pause") {
    if (t.status !== "running") return null;
    timer = withTimes(t, { status: "paused", pausedAt: now }, now);
  } else if (action === "resume") {
    if (t.status !== "paused" || !t.pausedAt) return null;
    timer = withTimes(t, { status: "running", pausedAt: null, accumulatedPausedMs: t.accumulatedPausedMs + (now - t.pausedAt) }, now);
  } else if (action === "stop" || action === "skip") {
    timer = withTimes(t, {
      status: "idle", mode: isBreakMode(t.mode) ? "pomodoro" : t.mode,
      startedAt: null, pausedAt: null, accumulatedPausedMs: 0, sessionId: null,
      plannedDurationSec: next.start.durationSec,
    }, now);
    next.breakOption = null;
  } else if (action === "start") {
    if (active) return null;
    const { start, breakOption } = state.next;
    const chosen = !mode || mode === start.mode
      ? start
      : breakOption && breakOption.mode === mode
        ? breakOption
        : { mode, durationSec: start.durationSec }; // unusual; the server's answer corrects the length
    timer = withTimes(t, {
      status: "running", mode: chosen.mode, plannedDurationSec: chosen.durationSec,
      startedAt: now, pausedAt: null, accumulatedPausedMs: 0, sessionId: "pending",
    }, now);
    next.breakOption = null;
  } else {
    return null;
  }
  return { ...state, justCompleted: false, timer, next };
}

/**
 * Should a polled snapshot replace what is shown? Dropped while a command is
 * in flight, when requested before the latest command was acknowledged (it may
 * predate it), or when it is an older version than the one shown (all versions
 * are stamped by the server, so they order correctly).
 */
export function shouldApplyPoll({ inFlight, pollStartedAt, lastAckAt, currentUpdatedAt, incomingUpdatedAt }) {
  if (inFlight) return false;
  if (lastAckAt && pollStartedAt < lastAckAt) return false;
  if (currentUpdatedAt && incomingUpdatedAt && Date.parse(incomingUpdatedAt) < Date.parse(currentUpdatedAt)) return false;
  return true;
}

/**
 * Re-apply clicks that are still in flight on top of any snapshot that arrives
 * meanwhile (e.g. toggling two subtasks quickly: the first response must not
 * un-tick the second).
 */
export function overlayPending(state, pending) {
  if (!state?.task) return state;
  const { subtasks = new Map(), taskDone } = pending;
  if (!subtasks.size && taskDone === undefined) return state;
  return {
    ...state,
    task: {
      ...state.task,
      done: taskDone !== undefined && taskDone.taskId === state.task.id ? taskDone.done : state.task.done,
      subtasks: state.task.subtasks.map((s) => (subtasks.has(s.id) ? { ...s, done: subtasks.get(s.id) } : s)),
    },
  };
}

/** Immediate music state for a click. next/previous can't know the new track, so they mark it pending. */
export function predictMusic(music, action) {
  if (!music?.connected) return null;
  if (action === "play") return { ...music, isPlaying: true };
  if (action === "pause") return { ...music, isPlaying: false };
  if (action === "next" || action === "previous") return { ...music, isPlaying: true, pending: action };
  return null;
}

/**
 * Spotify only reflects a command in /me/player after a short lag. While the
 * hold lasts, a polled state that still shows the old playback is ignored
 * instead of flipping the button back.
 */
export function acceptMusic(incoming, hold, now = Date.now()) {
  if (!hold || now >= hold.until || !incoming?.connected) return true;
  if (hold.isPlaying !== undefined && incoming.isPlaying !== hold.isPlaying) return false;
  if (hold.fromTrack !== undefined && (incoming.track?.name ?? null) === hold.fromTrack) return false;
  return true;
}
