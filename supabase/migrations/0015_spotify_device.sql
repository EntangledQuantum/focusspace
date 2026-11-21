-- Spotify device resolution: let server-side playback (Focus AI, MCP, the
-- Chrome extension) find the user's FocusSpace web player and their music pick.
-- Additive and idempotent — safe to re-run; the app tolerates these columns
-- being absent until this runs.

alter table public.user_settings
  -- Web Playback SDK device id the FocusSpace tab reported on `ready`
  -- (refreshed on every reconnect and periodically while the tab is open).
  add column if not exists spotify_web_device_id      text,
  add column if not exists spotify_web_device_seen_at timestamptz,
  -- Music chosen in FocusSpace's music picker; "resume" falls back to it
  -- when nothing was playing.
  add column if not exists spotify_selected_uri       text,
  add column if not exists spotify_selected_name      text;
