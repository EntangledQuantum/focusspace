-- ─── subtasks ────────────────────────────────────────────────────────
create table if not exists public.subtasks (
  id         uuid primary key default uuid_generate_v4(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  done       bool not null default false,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.subtasks enable row level security;
create policy "users_own_subtasks" on public.subtasks
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index if not exists idx_subtasks_task on public.subtasks(task_id);
create index if not exists idx_subtasks_user on public.subtasks(user_id);

-- ─── spotify takeover setting ────────────────────────────────────────
-- When true (default), starting a focus session takes over playback from an
-- already-playing external Spotify device. When false, external playback is
-- left alone.
alter table public.user_settings
  add column if not exists spotify_takeover bool not null default true;
