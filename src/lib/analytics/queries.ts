import { createClient } from "@/lib/supabase/client";
import type { DailyFocus, TagFocus, FocusSession, Project, Tag } from "@/types/database";

export const queryKeys = {
  analytics: (filter: AnalyticsFilter) => ["analytics", filter] as const,
  dailyFocus: (filter: AnalyticsFilter) => ["analytics", "daily", filter] as const,
  tagFocus: (filter: AnalyticsFilter) => ["analytics", "tags", filter] as const,
  sessions: (filter: AnalyticsFilter) => ["sessions", filter] as const,
  streak: () => ["analytics", "streak"] as const,
};

export interface AnalyticsFilter {
  range: "7d" | "30d" | "all";
  projectId?: string | null;
  tagId?: string | null;
}

function rangeStart(range: AnalyticsFilter["range"]): string | null {
  if (range === "all") return null;
  const d = new Date();
  d.setDate(d.getDate() - (range === "7d" ? 7 : 30));
  return d.toISOString();
}

export async function fetchDailyFocus(filter: AnalyticsFilter): Promise<DailyFocus[]> {
  const supabase = createClient();
  let q = supabase
    .from("v_daily_focus")
    .select("*")
    .order("day", { ascending: true });

  const start = rangeStart(filter.range);
  if (start) q = q.gte("day", start.slice(0, 10));

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchTagFocus(filter: AnalyticsFilter): Promise<TagFocus[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("v_tag_focus").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function fetchRecentSessions(filter: AnalyticsFilter): Promise<
  (FocusSession & { task_title: string | null; project_name: string | null; tags: Tag[] })[]
> {
  const supabase = createClient();
  let q = supabase
    .from("focus_sessions")
    .select(`
      *,
      tasks:task_id ( title, task_tags ( tags ( * ) ) ),
      projects:project_id ( name )
    `)
    // Only focus sessions that actually ran — skip breaks and orphaned start rows
    .in("mode", ["pomodoro", "custom"])
    .not("ended_at", "is", null)
    .gte("actual_duration_sec", 30)
    .order("started_at", { ascending: false })
    .limit(50);

  const start = rangeStart(filter.range);
  if (start) q = q.gte("started_at", start);
  if (filter.projectId) q = q.eq("project_id", filter.projectId);

  const { data, error } = await q;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((s: any) => ({
    ...s,
    task_title: s.tasks?.title ?? (s.mode === "custom" ? "Custom session" : null),
    project_name: s.projects?.name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tags: s.tasks?.task_tags?.map((tt: any) => tt.tags).filter(Boolean) ?? [],
  }));
}

export async function fetchStreak(): Promise<{ current: number; best: number }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_daily_focus")
    .select("day, completed_sessions")
    .order("day", { ascending: true })
    .limit(730);

  if (error || !data) return { current: 0, best: 0 };

  // Set of dates (YYYY-MM-DD) with at least one completed session
  const activeDays = new Set(
    data.filter((d) => d.completed_sessions > 0).map((d) => d.day.slice(0, 10)),
  );
  if (activeDays.size === 0) return { current: 0, best: 0 };

  function toIso(d: Date) {
    return d.toISOString().slice(0, 10);
  }
  function shiftDays(iso: string, delta: number) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    return toIso(d);
  }

  // Current streak: walk back from today (or yesterday if today is empty — streak still alive)
  const today = toIso(new Date());
  let cursor = activeDays.has(today) ? today : shiftDays(today, -1);
  let current = 0;
  while (activeDays.has(cursor)) {
    current++;
    cursor = shiftDays(cursor, -1);
  }

  // Best streak: iterate ascending sorted unique days and find max consecutive run
  const sorted = Array.from(activeDays).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    if (prev !== null && shiftDays(prev, 1) === day) {
      run++;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = day;
  }

  return { current, best: Math.max(best, current) };
}
