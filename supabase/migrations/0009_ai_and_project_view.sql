-- ═══════════════════════════════════════════════════════════════════
-- AI task agent + Projects view preference
-- ═══════════════════════════════════════════════════════════════════

-- ─── user_settings: AI prefs (client-safe, non-secret) + project view ──
alter table public.user_settings
  add column if not exists ai_enabled          bool not null default false,
  add column if not exists ai_model            text,
  add column if not exists ai_use_own_key      bool not null default false,
  add column if not exists ai_has_own_key      bool not null default false,
  add column if not exists ai_destructive      text not null default 'allow'
    check (ai_destructive in ('allow', 'confirm')),
  add column if not exists projects_show_all    bool not null default true,
  add column if not exists projects_visible_ids text[] not null default '{}';

-- ─── ai_credentials: server-only secrets (api key encrypted at rest) ───
-- The browser NEVER queries this table; only server routes read it and
-- decrypt with AI_ENCRYPTION_KEY. Clients learn status via
-- user_settings.ai_has_own_key only.
create table if not exists public.ai_credentials (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  base_url       text,
  model          text,
  api_key_cipher text,
  created_at     timestamptz not null default now()
);
alter table public.ai_credentials enable row level security;
create policy "users_own_ai_credentials" on public.ai_credentials
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ─── ai_usage: per-user monthly token accounting (budget enforcement) ──
create table if not exists public.ai_usage (
  user_id       uuid not null references auth.users(id) on delete cascade,
  period        text not null,                 -- 'YYYY-MM'
  tokens_in     int  not null default 0,
  tokens_out    int  not null default 0,
  request_count int  not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, period)
);
alter table public.ai_usage enable row level security;
create policy "users_own_ai_usage" on public.ai_usage
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ─── ai_conversations + ai_messages: persisted chat history ────────────
create table if not exists public.ai_conversations (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_conversations enable row level security;
create policy "users_own_ai_conversations" on public.ai_conversations
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index if not exists idx_ai_conversations_user on public.ai_conversations(user_id, updated_at desc);

create table if not exists public.ai_messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null,
  parts           jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
alter table public.ai_messages enable row level security;
create policy "users_own_ai_messages" on public.ai_messages
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index if not exists idx_ai_messages_conversation on public.ai_messages(conversation_id, created_at);
