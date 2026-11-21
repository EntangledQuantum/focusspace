// Pure optimistic-UI rules for the popup (no chrome.* / DOM), unit-tested in
// tests/extension-optimistic.test.ts. The popup applies a predicted state the
// moment a button is clicked, then reconciles with the server's answer.

/** Whole seconds left on a snapshot, counting down locally since it was received. */
export function liveRemaining(state, receivedAt, now = Date.now()) {
  const t = state?.timer;
  if (!t) return 0;
  if (t.status !== "running") return t.remainingSec;
  return Math.max(0, Math.ceil(t.remainingSec - (now - receivedAt) / 1000));
}

/**
 * What the server will (almost certainly) answer to a timer command, so the UI
 * can show it immediately. Returns null when the action makes no sense in the
 * current state (the click is then ignored instead of sent).
 */
export function predictTimer(state, receivedAt, action, mode, now = Date.now()) {
  const t = state?.timer;
  if (!t) return null;
  const left = liveRemaining(state, receivedAt, now);
  const active = t.status === "running" || t.status === "paused";
  const timer = { ...t };
  const next = { ...state.next };

  if (action === "pause") {
    if (t.status !== "running") return null;
    Object.assign(timer, { status: "paused", remainingSec: left });
  } else if (action === "resume") {
    if (t.status !== "paused") return null;
    Object.assign(timer, { status: "running", remainingSec: left });
  } else if (action === "stop" || action === "skip") {
    const isBreakMode = t.mode === "short_break" || t.mode === "long_break";
    Object.assign(timer, {
      status: "idle",
      mode: isBreakMode ? "pomodoro" : t.mode,
      remainingSec: next.start.durationSec,
      plannedDurationSec: next.start.durationSec,
    });
    next.breakOption = null;
  } else if (action === "start") {
    if (active) return null;
    const { start, breakOption } = state.next;
    const chosen = !mode || mode === start.mode
      ? start
      : breakOption && breakOption.mode === mode
        ? breakOption
        : { mode, durationSec: start.durationSec }; // unusual; the server's answer corrects the length
    Object.assign(timer, { status: "running", mode: chosen.mode, remainingSec: chosen.durationSec, plannedDurationSec: chosen.durationSec });
    next.breakOption = null;
  } else {
    return null;
  }
  return { state: { ...state, justCompleted: false, timer, next }, receivedAt: now };
}

/**
 * Should a polled snapshot replace what the popup shows? Polls are dropped
 * while a command is in flight and when they were requested before the latest
 * command was acknowledged (they may predate it), so a slow poll can never
 * undo a click. (updated_at is not compared: the website stamps it with the
 * browser's clock, which may lag the server's.)
 */
export function shouldApplyPoll({ inFlight, pollStartedAt, lastAckAt }) {
  if (inFlight) return false;
  return !(lastAckAt && pollStartedAt < lastAckAt);
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
