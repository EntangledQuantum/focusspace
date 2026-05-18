-- ─── Extensions ────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── profiles ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "users_own_profile" on public.profiles
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── user_settings ──────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  theme                  text not null default 'dark' check (theme in ('dark','light','system')),
  active_wallpaper_id    uuid,
  focus_duration_sec     int  not null default 1500,
  short_break_sec        int  not null default 300,
  long_break_sec         int  not null default 900,
  long_break_every       int  not null default 4,
  completion_tone        text not null default 'soft-chime',
  dnd_during_focus       bool not null default false,
  browser_notifs_enabled bool not null default false,
  auto_start_breaks      bool not null default false,
  auto_start_pomodoros   bool not null default false
);
alter table public.user_settings enable row level security;
create policy "users_own_settings" on public.user_settings
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── projects ───────────────────────────────────────────────────────
create table if not exists public.projects (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#ffb4a5',
  icon        text,
  archived_at timestamptz,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.projects enable row level security;
create policy "users_own_projects" on public.projects
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index if not exists idx_projects_user on public.projects(user_id);

-- ─── tags ───────────────────────────────────────────────────────────
create table if not exists public.tags (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#b5ccc1',
  created_at timestamptz not null default now(),
  unique (user_id, lower(name))
);
alter table public.tags enable row level security;
create policy "users_own_tags" on public.tags
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── tasks ──────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  project_id          uuid references public.projects(id) on delete set null,
  title               text not null,
  notes               text,
  priority            text not null default 'med' check (priority in ('low','med','high','urgent')),
  status              text not null default 'todo' check (status in ('todo','done')),
  estimated_pomodoros int  not null default 0,
  completed_pomodoros int  not null default 0,
  sort_order          int  not null default 0,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);
alter table public.tasks enable row level security;
create policy "users_own_tasks" on public.tasks
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index if not exists idx_tasks_user_project on public.tasks(user_id, project_id, status);

-- ─── task_tags ──────────────────────────────────────────────────────
create table if not exists public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id  uuid not null references public.tags(id)  on delete cascade,
  primary key (task_id, tag_id)
);
alter table public.task_tags enable row level security;
create policy "task_tags_owner" on public.task_tags
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_tags.task_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_tags.task_id and t.user_id = auth.uid()
    )
  );
create index if not exists idx_task_tags_tag on public.task_tags(tag_id);

-- ─── focus_sessions ─────────────────────────────────────────────────
create table if not exists public.focus_sessions (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  task_id              uuid references public.tasks(id)    on delete set null,
  project_id           uuid references public.projects(id) on delete set null,
  mode                 text not null check (mode in ('pomodoro','custom','short_break','long_break')),
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  planned_duration_sec int  not null,
  actual_duration_sec  int,
  completed            bool not null default false,
  interruption_count   int  not null default 0,
  created_at           timestamptz not null default now()
);
alter table public.focus_sessions enable row level security;
create policy "users_own_sessions" on public.focus_sessions
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index if not exists idx_sessions_user_time on public.focus_sessions(user_id, started_at desc);

-- ─── wallpapers ─────────────────────────────────────────────────────
create table if not exists public.wallpapers (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete cascade,
  name         text not null,
  storage_path text not null,
  is_builtin   bool not null default false,
  created_at   timestamptz not null default now()
);
alter table public.wallpapers enable row level security;
-- built-ins are public read; user wallpapers are owner-only
create policy "wallpapers_read" on public.wallpapers
  for select using (is_builtin = true or auth.uid() = user_id);
create policy "wallpapers_insert" on public.wallpapers
  for insert with check (auth.uid() = user_id);
create policy "wallpapers_delete" on public.wallpapers
  for delete using (auth.uid() = user_id);
