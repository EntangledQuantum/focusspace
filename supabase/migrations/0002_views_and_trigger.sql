-- ─── Analytics views ────────────────────────────────────────────────

create or replace view public.v_daily_focus with (security_invoker = true) as
select
  fs.user_id,
  (fs.started_at at time zone 'UTC')::date::text as day,
  coalesce(sum(fs.actual_duration_sec), 0)::int   as total_seconds,
  count(*)::int                                    as sessions,
  count(*) filter (where fs.completed)::int        as completed_sessions
from public.focus_sessions fs
where fs.mode in ('pomodoro', 'custom')
  and fs.ended_at is not null
group by fs.user_id, (fs.started_at at time zone 'UTC')::date;

create or replace view public.v_tag_focus with (security_invoker = true) as
select
  t.user_id,
  tg.id   as tag_id,
  tg.name as tag_name,
  tg.color as tag_color,
  coalesce(sum(fs.actual_duration_sec), 0)::int as total_seconds
from public.task_tags tt
join public.tags         tg on tg.id = tt.tag_id
join public.tasks        t  on t.id  = tt.task_id
join public.focus_sessions fs on fs.task_id = t.id
  and fs.mode in ('pomodoro', 'custom')
  and fs.completed = true
where t.user_id = tg.user_id
group by t.user_id, tg.id, tg.name, tg.color;

-- ─── New-user bootstrap trigger ─────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_project_id uuid;
begin
  -- Profile
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  );

  -- Default settings
  insert into public.user_settings (user_id)
  values (new.id);

  -- Seed project
  insert into public.projects (user_id, name, color, sort_order)
  values (new.id, 'Personal', '#ffb4a5', 0)
  returning id into default_project_id;

  -- Seed tag
  insert into public.tags (user_id, name, color)
  values (new.id, 'Focus', '#b5ccc1');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
