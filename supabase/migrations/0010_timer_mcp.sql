-- Live timer snapshot so MCP / Ask AI can read and command the clock.
create table if not exists public.timer_state (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  mode                  text not null default 'pomodoro',
  status                text not null default 'idle',
  planned_duration_sec  int  not null default 1500,
  started_at            bigint,
  paused_at             bigint,
  accumulated_paused_ms bigint not null default 0,
  current_session_id    uuid,
  current_task_id       uuid,
  current_project_id    uuid,
  pomodoro_count        int  not null default 0,
  source                text not null default 'ui' check (source in ('ui', 'mcp')),
  updated_at            timestamptz not null default now()
);
alter table public.timer_state enable row level security;
create policy "users_own_timer_state" on public.timer_state
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Personal access tokens for the hosted MCP endpoint.
create table if not exists public.mcp_tokens (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  token_hash   text not null,
  prefix       text not null,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.mcp_tokens enable row level security;
create policy "users_own_mcp_tokens" on public.mcp_tokens
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index if not exists idx_mcp_tokens_hash on public.mcp_tokens(token_hash);
