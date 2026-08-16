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
  if (firstBoot) bootstrap(_db);
  ensureBootstrap(_db);
  return _db;
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
