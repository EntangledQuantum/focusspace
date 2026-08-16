/** Embedded so standalone Docker / production don't need the .sql file on disk. */
export const LOCAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id           TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url   TEXT,
  timezone     TEXT NOT NULL DEFAULT 'UTC',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                 TEXT PRIMARY KEY,
  theme                   TEXT NOT NULL DEFAULT 'dark',
  active_wallpaper_id     TEXT,
  focus_duration_sec      INTEGER NOT NULL DEFAULT 1500,
  short_break_sec         INTEGER NOT NULL DEFAULT 300,
  long_break_sec          INTEGER NOT NULL DEFAULT 900,
  long_break_every        INTEGER NOT NULL DEFAULT 4,
  completion_tone         TEXT NOT NULL DEFAULT 'soft-chime',
  dnd_during_focus        INTEGER NOT NULL DEFAULT 0,
  browser_notifs_enabled  INTEGER NOT NULL DEFAULT 0,
  auto_start_breaks       INTEGER NOT NULL DEFAULT 0,
  auto_start_pomodoros    INTEGER NOT NULL DEFAULT 0,
  wallpaper_blur          INTEGER NOT NULL DEFAULT 60,
  wallpaper_opacity       INTEGER NOT NULL DEFAULT 40,
  spotify_access_token    TEXT,
  spotify_refresh_token   TEXT,
  spotify_token_expires_at TEXT,
  spotify_auto_start      INTEGER NOT NULL DEFAULT 0,
  spotify_takeover        INTEGER NOT NULL DEFAULT 1,
  glass_tint              REAL NOT NULL DEFAULT 0.5,
  glass_blur              INTEGER NOT NULL DEFAULT 22,
  active_effect           TEXT,
  effect_settings         TEXT NOT NULL DEFAULT '{}',
  ai_enabled              INTEGER NOT NULL DEFAULT 0,
  ai_model                TEXT,
  ai_use_own_key          INTEGER NOT NULL DEFAULT 0,
  ai_has_own_key          INTEGER NOT NULL DEFAULT 0,
  ai_destructive          TEXT NOT NULL DEFAULT 'allow',
  projects_show_all       INTEGER NOT NULL DEFAULT 1,
  projects_visible_ids    TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#ff5fa2',
  icon        TEXT,
  archived_at TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#b5ccc1',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  project_id           TEXT,
  title                TEXT NOT NULL,
  notes                TEXT,
  priority             TEXT NOT NULL DEFAULT 'med',
  status               TEXT NOT NULL DEFAULT 'todo',
  estimated_pomodoros  REAL NOT NULL DEFAULT 1,
  completed_pomodoros  INTEGER NOT NULL DEFAULT 0,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  completed_at         TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_project ON tasks(user_id, project_id, status);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL,
  tag_id  TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);

CREATE TABLE IF NOT EXISTS subtasks (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  task_id              TEXT,
  project_id           TEXT,
  mode                 TEXT NOT NULL,
  started_at           TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at             TEXT,
  planned_duration_sec INTEGER NOT NULL,
  actual_duration_sec  INTEGER,
  completed            INTEGER NOT NULL DEFAULT 0,
  interruption_count   INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_time ON focus_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS wallpapers (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  name         TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  is_builtin   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_credentials (
  user_id        TEXT PRIMARY KEY,
  base_url       TEXT,
  model          TEXT,
  api_key_cipher TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id       TEXT NOT NULL,
  period        TEXT NOT NULL,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, period)
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT 'New chat',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  role            TEXT NOT NULL,
  parts           TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timer_state (
  user_id               TEXT PRIMARY KEY,
  mode                  TEXT NOT NULL DEFAULT 'pomodoro',
  status                TEXT NOT NULL DEFAULT 'idle',
  planned_duration_sec  INTEGER NOT NULL DEFAULT 1500,
  started_at            INTEGER,
  paused_at             INTEGER,
  accumulated_paused_ms INTEGER NOT NULL DEFAULT 0,
  current_session_id    TEXT,
  current_task_id       TEXT,
  current_project_id    TEXT,
  pomodoro_count        INTEGER NOT NULL DEFAULT 0,
  source                TEXT NOT NULL DEFAULT 'ui',
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  prefix      TEXT NOT NULL,
  last_used_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIEW IF NOT EXISTS v_daily_focus AS
SELECT
  user_id,
  substr(started_at, 1, 10) AS day,
  CAST(COALESCE(SUM(actual_duration_sec), 0) AS INTEGER) AS total_seconds,
  CAST(COUNT(*) AS INTEGER) AS sessions,
  CAST(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS INTEGER) AS completed_sessions
FROM focus_sessions
WHERE mode IN ('pomodoro', 'custom')
  AND ended_at IS NOT NULL
GROUP BY user_id, substr(started_at, 1, 10);

CREATE VIEW IF NOT EXISTS v_tag_focus AS
SELECT
  t.user_id,
  tg.id AS tag_id,
  tg.name AS tag_name,
  tg.color AS tag_color,
  CAST(COALESCE(SUM(fs.actual_duration_sec), 0) AS INTEGER) AS total_seconds
FROM task_tags tt
JOIN tags tg ON tg.id = tt.tag_id
JOIN tasks t ON t.id = tt.task_id
JOIN focus_sessions fs ON fs.task_id = t.id
  AND fs.mode IN ('pomodoro', 'custom')
  AND fs.completed = 1
GROUP BY t.user_id, tg.id, tg.name, tg.color;
`;
