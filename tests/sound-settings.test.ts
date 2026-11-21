import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_BREAK_TONE,
  DEFAULT_FOCUS_TONE,
  DEFAULT_SOUND_VOLUME,
  SOUND_PRESETS,
  clampVolume,
  resolveSoundSettings,
  toneFor,
  volumeToGain,
} from "@/lib/audio/sound-settings";
import { getPattern, patternDuration } from "@/lib/audio/presets";

describe("volumeToGain", () => {
  it("is silent at 0 and drives the bus +12 dB into the limiter at 100%", () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(100)).toBeCloseTo(3.98, 2);
  });

  it("is strictly increasing and dB-linear across the slider", () => {
    let prev = 0;
    for (let v = 1; v <= 100; v++) {
      const g = volumeToGain(v);
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
    // Equal slider steps → equal dB steps (what makes the slider feel even).
    const db = (v: number) => 20 * Math.log10(volumeToGain(v));
    expect(db(50) - db(25)).toBeCloseTo(db(100) - db(75), 6);
    // Half way is clearly quieter than full but still well audible (≈ −14 dB).
    expect(db(50)).toBeCloseTo(-14, 0);
  });

  it("clamps out-of-range and junk input", () => {
    expect(volumeToGain(250)).toBe(volumeToGain(100));
    expect(volumeToGain(-5)).toBe(0);
    expect(clampVolume("abc")).toBe(DEFAULT_SOUND_VOLUME);
    expect(clampVolume(42.6)).toBe(43);
  });
});

describe("resolveSoundSettings", () => {
  it("fills defaults for rows that predate the sound columns", () => {
    expect(resolveSoundSettings(null)).toEqual({
      enabled: true,
      volume: DEFAULT_SOUND_VOLUME,
      focusTone: DEFAULT_FOCUS_TONE,
      breakTone: DEFAULT_BREAK_TONE,
    });
    expect(resolveSoundSettings({ completion_tone: "deep-bowl" }).focusTone).toBe("deep-bowl");
  });

  it("keeps explicit mute / 0% and falls back on unknown tone ids", () => {
    const s = resolveSoundSettings({ sound_enabled: false, sound_volume: 0, completion_tone: "kazoo", break_end_tone: "digital" });
    expect(s.enabled).toBe(false);
    expect(s.volume).toBe(0);
    expect(s.focusTone).toBe(DEFAULT_FOCUS_TONE);
    expect(toneFor("break", s)).toBe("digital");
    expect(toneFor("focus", s)).toBe(DEFAULT_FOCUS_TONE);
  });
});

describe("presets", () => {
  it("every preset has a noticeable but bounded motif for both events", () => {
    for (const { id } of SOUND_PRESETS) {
      for (const kind of ["focus", "break"] as const) {
        const p = getPattern(id, kind);
        expect(p.notes.length, `${id}/${kind}`).toBeGreaterThanOrEqual(2);
        const d = patternDuration(p);
        expect(d, `${id}/${kind}`).toBeGreaterThan(1);
        expect(d, `${id}/${kind}`).toBeLessThan(8);
      }
    }
  });
});

describe("local sqlite column upgrade", () => {
  let dir: string | null = null;
  afterEach(async () => {
    const { closeSqlite } = await import("@/lib/local/db");
    closeSqlite();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("adds the sound columns to a DB created before they existed", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-sound-"));
    const file = path.join(dir, "focusspace.db");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const old = new Database(file);
    old.exec(`CREATE TABLE user_settings (user_id TEXT PRIMARY KEY, completion_tone TEXT NOT NULL DEFAULT 'soft-chime');
              INSERT INTO user_settings (user_id) VALUES ('legacy');`);
    old.close();

    process.env.FOCUSSPACE_DATA_DIR = dir;
    const { getSqlite, closeSqlite } = await import("@/lib/local/db");
    closeSqlite();
    const row = getSqlite().prepare(`SELECT * FROM user_settings WHERE user_id = 'legacy'`).get() as Record<string, unknown>;
    expect(row).toMatchObject({ sound_enabled: 1, sound_volume: 80, break_end_tone: "marimba" });

    // Idempotent on the next boot.
    closeSqlite();
    expect(() => getSqlite()).not.toThrow();
  });
});
