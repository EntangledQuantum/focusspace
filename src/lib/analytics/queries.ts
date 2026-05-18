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
    .order("started_at", { ascending: false })
    .limit(50);

  const start = rangeStart(filter.range);
  if (start) q = q.gte("started_at", start);
  if (filter.projectId) q = q.eq("project_id", filter.projectId);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((s: any) => ({
    ...s,
    task_title: s.tasks?.title ?? null,
    project_name: s.projects?.name ?? null,
    tags: s.tasks?.task_tags?.map((tt: any) => tt.tags).filter(Boolean) ?? [],
  }));
}

export async function fetchStreak(): Promise<{ current: number; best: number }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_daily_focus")
    .select("day, completed_sessions")
    .order("day", { ascending: false })
    .limit(365);

  if (error || !data) return { current: 0, best: 0 };

  let current = 0;
  let best = 0;
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);

  const days = data.filter((d) => d.completed_sessions > 0).map((d) => d.day);
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().slice(0, 10);
    if (days[i] === expectedStr) {
      streak++;
      if (i === 0) current = streak;
    } else {
      best = Math.max(best, streak);
      streak = 0;
    }
  }
  best = Math.max(best, streak, current);

  return { current, best };
}
