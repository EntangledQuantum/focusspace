-- ─── notification sounds ─────────────────────────────────────────────
-- Per-user sound controls: master on/off, volume (0–100 %), and a separate
-- tone for "break over" (completion_tone stays the "focus session over" tone).
-- Additive + idempotent; existing rows get the defaults.
alter table public.user_settings
  add column if not exists sound_enabled  boolean not null default true,
  add column if not exists sound_volume   int     not null default 80,
  add column if not exists break_end_tone text    not null default 'marimba';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_settings_sound_volume_range'
      and conrelid = 'public.user_settings'::regclass
  ) then
    alter table public.user_settings
      add constraint user_settings_sound_volume_range check (sound_volume between 0 and 100);
  end if;
end $$;
