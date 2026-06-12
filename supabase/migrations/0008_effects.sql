-- ─── live effects (overlay on top of any background) ─────────────────
-- `active_effect` is the effect id (rain/snow/aurora/…) or NULL for none.
-- `effect_settings` stores per-effect customisation: { rain: { intensity, speed, density }, … }
alter table public.user_settings
  add column if not exists active_effect   text,
  add column if not exists effect_settings jsonb not null default '{}'::jsonb;
