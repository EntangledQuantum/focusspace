-- Push timer_state changes to every open FocusSpace tab (Supabase Realtime).
-- The server row is the single source of truth; website tabs subscribe to
-- their own row (RLS "users_own_timer_state" limits each user to theirs) and
-- fall back to a light poll if Realtime is unavailable. Idempotent.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'timer_state'
     ) then
    alter publication supabase_realtime add table public.timer_state;
  end if;
end $$;
