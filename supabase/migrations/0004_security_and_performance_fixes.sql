-- ─── Security: revoke public RPC access to trigger function ────────
revoke execute on function public.handle_new_user() from anon, authenticated;

-- ─── Security: remove broad storage listing policy ─────────────────
-- Public bucket URLs work without a SELECT policy; this policy only
-- enabled /storage/v1/object/list/ which we don't need.
drop policy if exists "wallpapers_read_public" on storage.objects;

-- ─── Performance: missing FK indexes ──────────────────────────────
create index if not exists idx_focus_sessions_task_id    on public.focus_sessions (task_id);
create index if not exists idx_focus_sessions_project_id on public.focus_sessions (project_id);
create index if not exists idx_tasks_project_id          on public.tasks (project_id);
create index if not exists idx_wallpapers_user_id        on public.wallpapers (user_id);

-- ─── Performance: wrap auth.uid() in (select ...) to prevent ───────
-- per-row re-evaluation in RLS policies

-- profiles
drop policy if exists "users_own_profile" on public.profiles;
create policy "users_own_profile" on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- user_settings
drop policy if exists "users_own_settings" on public.user_settings;
create policy "users_own_settings" on public.user_settings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- projects
drop policy if exists "users_own_projects" on public.projects;
create policy "users_own_projects" on public.projects
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- tags
drop policy if exists "users_own_tags" on public.tags;
create policy "users_own_tags" on public.tags
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- tasks
drop policy if exists "users_own_tasks" on public.tasks;
create policy "users_own_tasks" on public.tasks
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- task_tags (joined through tasks — keep subquery, wrap inner auth call)
drop policy if exists "task_tags_owner" on public.task_tags;
create policy "task_tags_owner" on public.task_tags
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_tags.task_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_tags.task_id
        and t.user_id = (select auth.uid())
    )
  );

-- focus_sessions
drop policy if exists "users_own_sessions" on public.focus_sessions;
create policy "users_own_sessions" on public.focus_sessions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- wallpapers table
drop policy if exists "wallpapers_read"   on public.wallpapers;
drop policy if exists "wallpapers_insert" on public.wallpapers;
drop policy if exists "wallpapers_delete" on public.wallpapers;

create policy "wallpapers_read" on public.wallpapers
  for select using (is_builtin = true or (select auth.uid()) = user_id);
create policy "wallpapers_insert" on public.wallpapers
  for insert with check ((select auth.uid()) = user_id);
create policy "wallpapers_delete" on public.wallpapers
  for delete using ((select auth.uid()) = user_id);
