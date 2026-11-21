import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LOCAL_USER_ID, LOCAL_DISPLAY_NAME, newId } from "./ids";
import { LOCAL_SCHEMA } from "./schema";

export function dataDir(): string {
  if (process.env.FOCUSSPACE_DATA_DIR) return process.env.FOCUSSPACE_DATA_DIR;
  return path.join(os.homedir(), ".focusspace");
}

export function dbFilePath(): string {
  return path.join(dataDir(), "focusspace.db");
}

type BetterSqlite = typeof import("better-sqlite3");

let _db: InstanceType<BetterSqlite> | null = null;

export function getSqlite() {
  if (_db) return _db;
  // Lazy require so Next's bundler doesn't try to pack the native addon
  // into client chunks. next.config marks this package as external.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as BetterSqlite;
  fs.mkdirSync(dataDir(), { recursive: true });
  const firstBoot = !fs.existsSync(dbFilePath());
  _db = new Database(dbFilePath());
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(LOCAL_SCHEMA);
  addMissingColumns(_db);
  if (firstBoot) bootstrap(_db);
  ensureBootstrap(_db);
  return _db;
}

/**
 * `CREATE TABLE IF NOT EXISTS` never alters an existing table, so columns added
 * after a local DB was created are backfilled here (the SQLite counterpart of
 * the additive Supabase migrations).
 */
const ADDED_COLUMNS: { table: string; column: string; ddl: string }[] = [
  // 0012_sounds_settings
  { table: "user_settings", column: "break_end_tone", ddl: "TEXT NOT NULL DEFAULT 'marimba'" },
  { table: "user_settings", column: "sound_enabled", ddl: "INTEGER NOT NULL DEFAULT 1" },
  { table: "user_settings", column: "sound_volume", ddl: "INTEGER NOT NULL DEFAULT 80" },
  // 0013_music_focus_sync
  { table: "user_settings", column: "spotify_auto_pause", ddl: "INTEGER NOT NULL DEFAULT 1" },
  { table: "user_settings", column: "spotify_resume_on_focus", ddl: "INTEGER NOT NULL DEFAULT 1" },
  // 0015_spotify_device
  { table: "user_settings", column: "spotify_web_device_id", ddl: "TEXT" },
  { table: "user_settings", column: "spotify_web_device_seen_at", ddl: "TEXT" },
  { table: "user_settings", column: "spotify_selected_uri", ddl: "TEXT" },
  { table: "user_settings", column: "spotify_selected_name", ddl: "TEXT" },
];

function addMissingColumns(db: InstanceType<BetterSqlite>) {
  const existing = new Map<string, Set<string>>();
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    if (!existing.has(table)) {
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
      existing.set(table, new Set(cols.map((c) => c.name)));
    }
    const cols = existing.get(table)!;
    if (cols.has(column)) continue;
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`);
    cols.add(column);
  }
}

/** Create the implicit local user + a starter project on first launch. */
function bootstrap(db: InstanceType<BetterSqlite>) {
  const now = new Date().toISOString();
  const projectId = newId();
  db.prepare(
    `INSERT OR IGNORE INTO profiles (id, display_name, timezone, created_at) VALUES (?, ?, 'UTC', ?)`,
  ).run(LOCAL_USER_ID, LOCAL_DISPLAY_NAME, now);
  db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(LOCAL_USER_ID);
  db.prepare(
    `INSERT OR IGNORE INTO projects (id, user_id, name, color, sort_order, created_at) VALUES (?, ?, 'Personal', '#ff5fa2', 0, ?)`,
  ).run(projectId, LOCAL_USER_ID, now);
  db.prepare(
    `INSERT OR IGNORE INTO tags (id, user_id, name, color, created_at) VALUES (?, ?, 'Focus', '#b5ccc1', ?)`,
  ).run(newId(), LOCAL_USER_ID, now);
  db.prepare(
    `INSERT OR IGNORE INTO timer_state (user_id, mode, status, planned_duration_sec, pomodoro_count, source, updated_at)
     VALUES (?, 'pomodoro', 'idle', 1500, 0, 'ui', ?)`,
  ).run(LOCAL_USER_ID, now);
}

function ensureBootstrap(db: InstanceType<BetterSqlite>) {
  const row = db.prepare(`SELECT id FROM profiles WHERE id = ?`).get(LOCAL_USER_ID);
  if (!row) bootstrap(db);
}

export function closeSqlite() {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
    _db = null;
  }
}

export function resetSqliteForTests(filePath: string) {
  closeSqlite();
  process.env.FOCUSSPACE_DATA_DIR = path.dirname(filePath);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch { /* windows lock */ }
  }
  return getSqlite();
}
