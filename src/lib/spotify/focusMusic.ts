import type { TimerMode, TimerStatus } from "@/lib/stores/timer";

/**
 * Pure decision logic for "music follows focus". Kept free of React/SDK so the
 * transition rules can be unit-tested and so the same rules apply no matter
 * who changed the timer (UI buttons, auto-complete, or MCP via useTimerSync).
 */

export interface TimerSnapshot {
  mode: TimerMode;
  status: TimerStatus;
}

export interface MusicPrefs {
  /** Start music when a focus session starts. */
  autoPlay: boolean;
  /** Pause music when focus ends (completed, paused, reset, or a break starts). */
  autoPause: boolean;
  /** Resume music we auto-paused when the next focus starts / focus resumes. */
  resumeOnFocus: boolean;
  /** Pull playback over from another device when auto-playing. */
  takeover: boolean;
}

export interface MusicSettingsRow {
  spotify_auto_start?: boolean | null;
  spotify_auto_pause?: boolean | null;
  spotify_resume_on_focus?: boolean | null;
  spotify_takeover?: boolean | null;
}

export const DEFAULT_MUSIC_PREFS: MusicPrefs = {
  autoPlay: false,
  autoPause: true,
  resumeOnFocus: true,
  takeover: true,
};

export function musicPrefsFromSettings(s: MusicSettingsRow | null | undefined): MusicPrefs {
  return {
    autoPlay: s?.spotify_auto_start ?? DEFAULT_MUSIC_PREFS.autoPlay,
    autoPause: s?.spotify_auto_pause ?? DEFAULT_MUSIC_PREFS.autoPause,
    resumeOnFocus: s?.spotify_resume_on_focus ?? DEFAULT_MUSIC_PREFS.resumeOnFocus,
    takeover: s?.spotify_takeover ?? DEFAULT_MUSIC_PREFS.takeover,
  };
}

export function isFocusMode(mode: TimerMode): boolean {
  return mode === "pomodoro" || mode === "custom";
}

export function isFocusRunning(s: TimerSnapshot): boolean {
  return s.status === "running" && isFocusMode(s.mode);
}

export type FocusTransition = "focus_start" | "focus_resume" | "focus_end";

/**
 * Classify a timer change. Breaks never count as focus, so
 * focus → completed → break is a single `focus_end` and the break starting
 * is not a `focus_start`.
 */
export function focusTransition(prev: TimerSnapshot, next: TimerSnapshot): FocusTransition | null {
  const was = isFocusRunning(prev);
  const now = isFocusRunning(next);
  if (!was && now) {
    return prev.status === "paused" && prev.mode === next.mode ? "focus_resume" : "focus_start";
  }
  if (was && !now) return "focus_end";
  return null;
}

export interface MusicSituation {
  /** Our in-browser player is playing right now. */
  playingHere: boolean;
  /** Our player holds a (paused) context that can be resumed. */
  pausedHere: boolean;
  /** Another Spotify Connect device is playing. */
  playingElsewhere: boolean;
  /** The current pause was done by us on a focus_end, not by the user. */
  autoPaused: boolean;
  /** The user picked something in the music picker. */
  hasSelection: boolean;
}

export type MusicAction = "none" | "pause" | "resume" | "play_selection" | "takeover";

export function decideMusicAction(
  transition: FocusTransition | null,
  prefs: MusicPrefs,
  m: MusicSituation,
): MusicAction {
  if (!transition) return "none";

  if (transition === "focus_end") {
    return prefs.autoPause && m.playingHere ? "pause" : "none";
  }

  // focus_start / focus_resume
  if (m.playingHere) return "none";

  // Undo our own auto-pause first — it continues the same song where it left off.
  if (m.autoPaused && m.pausedHere && (prefs.resumeOnFocus || prefs.autoPlay)) return "resume";

  // Fresh auto-play only on a real session start, never on un-pausing the timer
  // (if the user paused the music themselves, un-pausing the timer leaves it).
  if (transition !== "focus_start" || !prefs.autoPlay) return "none";

  if (m.playingElsewhere) return prefs.takeover ? "takeover" : "none";
  // A paused context here is normally the current selection (picking music
  // plays it immediately), so continue it rather than restart it from track 1.
  if (m.pausedHere) return "resume";
  if (m.hasSelection) return "play_selection";
  return "none";
}
