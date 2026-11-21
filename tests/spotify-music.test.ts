import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { playlistItemCount, playlistSubtitle } from "@/lib/spotify/normalize";
import {
  decideMusicAction, focusTransition, musicPrefsFromSettings,
  type MusicPrefs, type MusicSituation, type TimerSnapshot,
} from "@/lib/spotify/focusMusic";

describe("playlist item count across Spotify API shapes", () => {
  it("reads the Feb-2026 `items.total` shape", () => {
    expect(playlistItemCount({ items: { total: 42 } })).toBe(42);
  });

  it("still reads the legacy `tracks.total` shape", () => {
    expect(playlistItemCount({ tracks: { total: 17 } })).toBe(17);
  });

  it("prefers `items` over the deprecated `tracks` when both are present", () => {
    expect(playlistItemCount({ items: { total: 9 }, tracks: { total: 0 } })).toBe(9);
  });

  it("keeps a genuine zero", () => {
    expect(playlistItemCount({ items: { total: 0 } })).toBe(0);
  });

  it("returns null when no count is provided (never invents 0)", () => {
    expect(playlistItemCount({})).toBeNull();
    expect(playlistItemCount({ items: null, tracks: null })).toBeNull();
    expect(playlistItemCount({ items: { total: "12" } })).toBeNull();
    // A full playlist object's `items` page is an object; a bare array is not a count.
    expect(playlistItemCount({ items: [] })).toBeNull();
    expect(playlistItemCount(null)).toBeNull();
  });

  it("hides the count instead of showing a wrong one", () => {
    expect(playlistSubtitle({ items: { total: 1 } })).toBe("1 track");
    expect(playlistSubtitle({ items: { total: 24 } })).toBe("24 tracks");
    expect(playlistSubtitle({ owner: { display_name: "Spotify" } })).toBe("By Spotify");
    expect(playlistSubtitle({})).toBeUndefined();
  });
});

const focus = (status: TimerSnapshot["status"]): TimerSnapshot => ({ mode: "pomodoro", status });
const brk = (status: TimerSnapshot["status"]): TimerSnapshot => ({ mode: "short_break", status });

describe("focus transitions", () => {
  it("detects a fresh focus start from idle or after a completed break", () => {
    expect(focusTransition(focus("idle"), focus("running"))).toBe("focus_start");
    expect(focusTransition(brk("completed"), focus("running"))).toBe("focus_start");
    expect(focusTransition({ mode: "custom", status: "idle" }, { mode: "custom", status: "running" })).toBe("focus_start");
  });

  it("treats un-pausing the same focus session as a resume", () => {
    expect(focusTransition(focus("paused"), focus("running"))).toBe("focus_resume");
  });

  it("ends focus on complete, pause, reset, and a break starting directly", () => {
    expect(focusTransition(focus("running"), focus("completed"))).toBe("focus_end");
    expect(focusTransition(focus("running"), focus("paused"))).toBe("focus_end");
    expect(focusTransition(focus("running"), focus("idle"))).toBe("focus_end");
    expect(focusTransition(focus("running"), brk("running"))).toBe("focus_end");
  });

  it("never treats breaks as focus", () => {
    expect(focusTransition(focus("completed"), brk("running"))).toBeNull();
    expect(focusTransition(brk("running"), brk("completed"))).toBeNull();
    expect(focusTransition(brk("paused"), brk("running"))).toBeNull();
  });

  it("ignores no-op updates (e.g. MCP re-writing a running state)", () => {
    expect(focusTransition(focus("running"), focus("running"))).toBeNull();
    expect(focusTransition(focus("paused"), focus("idle"))).toBeNull();
  });
});

const ALL_ON: MusicPrefs = { autoPlay: true, autoPause: true, resumeOnFocus: true, takeover: true };
const quiet: MusicSituation = {
  playingHere: false, pausedHere: false, playingElsewhere: false, autoPaused: false, hasSelection: false,
};

describe("music action for a transition", () => {
  it("pauses only when auto-pause is on and our player is playing", () => {
    expect(decideMusicAction("focus_end", ALL_ON, { ...quiet, playingHere: true })).toBe("pause");
    expect(decideMusicAction("focus_end", { ...ALL_ON, autoPause: false }, { ...quiet, playingHere: true })).toBe("none");
    expect(decideMusicAction("focus_end", ALL_ON, { ...quiet, playingElsewhere: true })).toBe("none");
  });

  it("resumes music it auto-paused, even with auto-play off", () => {
    const prefs = { ...ALL_ON, autoPlay: false };
    const s = { ...quiet, pausedHere: true, autoPaused: true };
    expect(decideMusicAction("focus_start", prefs, s)).toBe("resume");
    expect(decideMusicAction("focus_resume", prefs, s)).toBe("resume");
    expect(decideMusicAction("focus_start", { ...prefs, resumeOnFocus: false }, s)).toBe("none");
  });

  it("leaves music the user paused alone when the timer is un-paused", () => {
    expect(decideMusicAction("focus_resume", ALL_ON, { ...quiet, pausedHere: true, autoPaused: false })).toBe("none");
  });

  it("does nothing on start when auto-play is off and nothing was auto-paused", () => {
    expect(decideMusicAction("focus_start", { ...ALL_ON, autoPlay: false }, { ...quiet, hasSelection: true })).toBe("none");
  });

  it("auto-plays: continues a paused context before restarting the selection", () => {
    expect(decideMusicAction("focus_start", ALL_ON, { ...quiet, pausedHere: true, hasSelection: true })).toBe("resume");
    expect(decideMusicAction("focus_start", ALL_ON, { ...quiet, hasSelection: true })).toBe("play_selection");
    expect(decideMusicAction("focus_start", ALL_ON, quiet)).toBe("none");
  });

  it("respects takeover for playback on another device", () => {
    const s = { ...quiet, playingElsewhere: true, hasSelection: true };
    expect(decideMusicAction("focus_start", ALL_ON, s)).toBe("takeover");
    expect(decideMusicAction("focus_start", { ...ALL_ON, takeover: false }, s)).toBe("none");
  });

  it("never interrupts music that is already playing here", () => {
    const s = { ...quiet, playingHere: true, hasSelection: true, autoPaused: true };
    expect(decideMusicAction("focus_start", ALL_ON, s)).toBe("none");
  });

  it("defaults to not auto-playing until settings load", () => {
    expect(musicPrefsFromSettings(undefined).autoPlay).toBe(false);
    expect(musicPrefsFromSettings({ spotify_auto_start: true, spotify_auto_pause: false }))
      .toEqual({ autoPlay: true, autoPause: false, resumeOnFocus: true, takeover: true });
  });
});

describe("local (self-host) settings upgrade", () => {
  it("adds the music columns to a database created before they existed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-music-"));
    const file = path.join(dir, "focusspace.db");
    const { default: Database } = await import("better-sqlite3");
    const old = new Database(file);
    old.exec(`CREATE TABLE user_settings (user_id TEXT PRIMARY KEY, spotify_auto_start INTEGER NOT NULL DEFAULT 0);
              INSERT INTO user_settings (user_id) VALUES ('u1');`);
    old.close();

    const db = await import("@/lib/local/db");
    db.closeSqlite();
    process.env.FOCUSSPACE_DATA_DIR = dir;
    try {
      const row = db.getSqlite()
        .prepare("SELECT spotify_auto_pause, spotify_resume_on_focus FROM user_settings WHERE user_id = 'u1'")
        .get();
      expect(row).toEqual({ spotify_auto_pause: 1, spotify_resume_on_focus: 1 });
      // Idempotent on the next boot.
      db.closeSqlite();
      expect(() => db.getSqlite()).not.toThrow();
    } finally {
      db.closeSqlite();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows file lock */ }
    }
  });
});
