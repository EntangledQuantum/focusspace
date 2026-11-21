-- Server-side chat runs: the chat route saves the conversation itself and
-- records whether a reply is still being generated, so a client that lost its
-- connection (or reopened the chat) can tell "still working" from "failed".
-- Additive + idempotent.
alter table public.ai_conversations
  add column if not exists run_state      text check (run_state in ('running', 'done', 'error', 'cancelled')),
  add column if not exists run_error      text,
  add column if not exists run_updated_at timestamptz;
