-- Music follows focus: per-user toggles for pausing / resuming Spotify with the
-- focus timer. Additive and idempotent — safe to re-run.
--
-- spotify_auto_start already exists on production (it was added outside the
-- migration history, like the token columns below); they are declared here
-- with IF NOT EXISTS so a fresh database built from migrations alone matches.

alter table public.user_settings
  add column if not exists spotify_access_token     text,
  add column if not exists spotify_refresh_token    text,
  add column if not exists spotify_token_expires_at timestamptz,
  -- Start music when a focus session starts.
  add column if not exists spotify_auto_start       bool not null default false,
  -- Pause FocusSpace's player when focus ends (completed, paused, stopped, or a break starts).
  add column if not exists spotify_auto_pause       bool not null default true,
  -- Resume music that was auto-paused when the next focus session starts / focus resumes.
  add column if not exists spotify_resume_on_focus  bool not null default true;
