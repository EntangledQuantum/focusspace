-- ─── glass controls ──────────────────────────────────────────────────
-- Live "frosted glass" sliders: tint (0–1 opacity of cards) and blur (px).
alter table public.user_settings
  add column if not exists glass_tint float8 not null default 0.5,
  add column if not exists glass_blur int not null default 22;
