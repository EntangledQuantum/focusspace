"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchDailyFocus, fetchTagFocus, fetchRecentSessions, fetchStreak,
  type AnalyticsFilter,
} from "@/lib/analytics/queries";
import { createClient } from "@/lib/supabase/client";
import { fmtDuration, fmtTime } from "@/lib/utils";
import { Clock, Target, Flame, Check } from "lucide-react";
import type { Project } from "@/types/database";

const RANGE_OPTIONS: { value: AnalyticsFilter["range"]; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

const PROJECT_FALLBACK_COLORS = ["#ff5fa2", "#b06bf6", "#5fb0ff", "#46c98b", "#f2a341", "#ff8fbe"];

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="glass hover-lift" style={{ borderRadius: 20, padding: 18, flex: 1, minWidth: 160 }}>
      <div className="flex items-center" style={{ gap: 9, marginBottom: 14 }}>
        <div
          className="flex items-center justify-center"
          style={{
            width: 32, height: 32, borderRadius: 10,
            color, background: `color-mix(in srgb, ${color} 15%, transparent)`,
          }}
        >
          <Icon size={17} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-on-surface-variant)", opacity: 0.8 }}>{label}</span>
      </div>
      <p className="tabular-nums" style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, color: "var(--color-on-surface)", letterSpacing: "-.02em" }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", marginTop: 3 }}>{sub}</p>}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="py-8 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>{label}</div>
  );
}

export default function AnalyticsPage() {
  const supabase = createClient();
  const [range, setRange] = useState<AnalyticsFilter["range"]>("7d");
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);

  const filter: AnalyticsFilter = { range, projectId: filterProjectId, tagId: null };

  const { data: daily = [] } = useQuery({ queryKey: ["analytics", "daily", filter], queryFn: () => fetchDailyFocus(filter) });
  useQuery({ queryKey: ["analytics", "tags", filter], queryFn: () => fetchTagFocus(filter) });
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions", filter], queryFn: () => fetchRecentSessions(filter) });
  const { data: streak = { current: 0, best: 0 } } = useQuery({ queryKey: ["analytics", "streak"], queryFn: fetchStreak });
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").is("archived_at", null).order("sort_order");
      return data ?? [];
    },
  });

  // Tasks completed in range
  const { data: tasksDone = 0 } = useQuery({
    queryKey: ["analytics", "tasks-done", range],
    queryFn: async () => {
      let q = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done");
      if (range !== "all") {
        const d = new Date();
        d.setDate(d.getDate() - (range === "7d" ? 7 : 30));
        q = q.gte("completed_at", d.toISOString());
      }
      const { count } = await q;
      return count ?? 0;
    },
  });

  const totalSeconds = daily.reduce((s, d) => s + d.total_seconds, 0);
  const completedSessions = sessions.filter((s) => s.completed).length;
  const totalHours = totalSeconds / 3600;

  // "Focus by day" — last 14 entries max, rendered as gradient bars
  const dayBars = useMemo(() => {
    return daily.slice(-14).map((d) => ({
      label: new Date(d.day).toLocaleDateString(undefined, { weekday: "short" }),
      hours: d.total_seconds / 3600,
    }));
  }, [daily]);
  const maxDayHours = Math.max(...dayBars.map((b) => b.hours), 0.1);

  // "By project" — share of focus time per project from recent sessions
  const projectBreakdown = useMemo(() => {
    const byProject = new Map<string, number>();
    for (const s of sessions) {
      const key = s.project_name ?? "No project";
      byProject.set(key, (byProject.get(key) ?? 0) + (s.actual_duration_sec ?? 0));
    }
    const total = Array.from(byProject.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    return Array.from(byProject.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, secs], i) => {
        const project = projects.find((p) => p.name === name);
        return {
          name,
          pct: Math.round((secs / total) * 100),
          color: project?.color ?? PROJECT_FALLBACK_COLORS[i % PROJECT_FALLBACK_COLORS.length],
        };
      });
  }, [sessions, projects]);

  // Heatmap — built in an effect because `new Date()` (current time) isn't
  // allowed during Next's client prerender pass.
  const [heatmapDays, setHeatmapDays] = useState<(null | { date: string; seconds: number })[][]>([]);
  useEffect(() => {
    setHeatmapDays(buildHeatmapDays(daily.map((d) => ({ date: d.day, seconds: d.total_seconds }))));
  }, [daily]);
  const maxSeconds = Math.max(...heatmapDays.flat().map((d) => d?.seconds ?? 0), 1);

  return (
    <div className="min-h-dvh flex justify-center" style={{ padding: "104px 20px 60px" }}>
      <div className="fade-up w-full" style={{ maxWidth: 880 }}>
        {/* Header + filters */}
        <div className="flex items-end justify-between gap-4 flex-wrap" style={{ marginBottom: 22 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", color: "var(--color-on-surface)" }}>
              Analytics
            </h1>
            <p style={{ fontSize: 14, color: "var(--color-on-surface-variant)", marginTop: 4 }}>
              Your deep-work trends.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <div className="glass-soft flex rounded-full" style={{ gap: 3, padding: 4 }}>
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRange(opt.value)}
                  className="pill"
                  style={{
                    padding: "6px 14px", fontSize: 12.5,
                    color: range === opt.value ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                    background: range === opt.value ? "color-mix(in srgb, var(--color-primary) 15%, transparent)" : "transparent",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <select
              value={filterProjectId ?? ""}
              onChange={(e) => setFilterProjectId(e.target.value || null)}
              className="glass-soft px-3 py-2 rounded-full text-xs outline-none"
              style={{ color: "var(--color-on-surface)" }}
            >
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Stat cards */}
        <div className="flex flex-wrap" style={{ gap: 14, marginBottom: 16 }}>
          <StatCard icon={Clock} label="Focus time" value={totalHours >= 1 ? `${totalHours.toFixed(1)}h` : fmtDuration(totalSeconds)} sub={range === "all" ? "all time" : `last ${range === "7d" ? "7" : "30"} days`} color="#ff5fa2" />
          <StatCard icon={Target} label="Sessions" value={String(completedSessions)} sub="completed" color="#b06bf6" />
          <StatCard icon={Flame} label="Streak" value={String(streak.current)} sub={`best: ${streak.best} days`} color="#f2a341" />
          <StatCard icon={Check} label="Tasks done" value={String(tasksDone)} sub={range === "all" ? "all time" : "in this range"} color="#46c98b" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr]" style={{ gap: 16, marginBottom: 16 }}>
          {/* Focus by day — gradient bars */}
          <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--color-on-surface)", marginBottom: 20 }}>
              Focus by day
            </p>
            {dayBars.length > 0 ? (
              <div className="flex items-end" style={{ gap: 10, height: 180 }}>
                {dayBars.map((b, i) => (
                  <div key={i} className="flex flex-col items-center flex-1" style={{ gap: 9, minWidth: 0 }}>
                    <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-on-surface-variant)" }}>
                      {b.hours >= 0.95 ? `${b.hours.toFixed(1)}h` : b.hours > 0 ? `${Math.round(b.hours * 60)}m` : ""}
                    </span>
                    <div
                      className="w-full rounded-lg"
                      style={{
                        maxWidth: 34,
                        height: Math.max((b.hours / maxDayHours) * 130, b.hours > 0 ? 6 : 2),
                        background: b.hours > 0
                          ? "linear-gradient(to top, var(--color-primary), var(--color-secondary))"
                          : "rgba(255,255,255,0.08)",
                        boxShadow: b.hours > 0 ? "0 4px 14px -4px color-mix(in srgb, var(--color-primary) 50%, transparent)" : "none",
                      }}
                    />
                    <span style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", opacity: 0.7 }}>{b.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty label="No sessions yet in this range." />
            )}
          </div>

          {/* By project */}
          <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--color-on-surface)", marginBottom: 20 }}>
              By project
            </p>
            {projectBreakdown.length > 0 ? (
              <div className="flex flex-col" style={{ gap: 16 }}>
                {projectBreakdown.map((b) => (
                  <div key={b.name}>
                    <div className="flex justify-between" style={{ marginBottom: 7 }}>
                      <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: "var(--color-on-surface)" }}>{b.name}</span>
                      <span className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 700, color: b.color }}>{b.pct}%</span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 7, background: "rgba(255,255,255,0.13)" }}>
                      <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: b.color }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty label="Run some sessions to see the split." />
            )}
          </div>
        </div>

        {/* Heatmap */}
        <div className="glass" style={{ borderRadius: 22, padding: 22, marginBottom: 16 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--color-on-surface)", marginBottom: 16 }}>
            Activity — last 26 weeks
          </p>
          <div className="overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {heatmapDays.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((day, di) => {
                    const intensity = day ? Math.min(1, day.seconds / maxSeconds) : 0;
                    return (
                      <div
                        key={di}
                        title={day ? `${day.date}: ${fmtDuration(day.seconds)}` : ""}
                        className="w-3 h-3 rounded-sm transition-all"
                        style={{
                          background: day && day.seconds > 0
                            ? `color-mix(in srgb, var(--color-primary) ${Math.round(15 + intensity * 85)}%, var(--color-surface-container-high))`
                            : "var(--color-surface-container-high)",
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent sessions */}
        <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--color-on-surface)", marginBottom: 12 }}>
            Recent sessions
          </p>
          {sessions.length === 0 ? (
            <Empty label="No sessions recorded yet." />
          ) : (
            <div>
              {sessions.slice(0, 15).map((s) => (
                <div key={s.id} className="flex items-center gap-4 py-2.5 text-sm"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="w-1 self-stretch rounded-full shrink-0"
                    style={{ background: s.completed ? "var(--color-primary)" : "var(--color-outline)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ color: "var(--color-on-surface)", fontWeight: 500 }}>
                      {s.task_title ?? "Untitled session"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)", opacity: 0.8 }}>
                      {s.project_name ?? "—"} · {fmtTime(s.started_at)}
                    </p>
                  </div>
                  {s.tags.slice(0, 2).map((tag) => (
                    <span key={tag.id} className="px-2 py-0.5 rounded-full text-xs shrink-0"
                      style={{
                        background: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
                        color: tag.color,
                      }}>
                      #{tag.name}
                    </span>
                  ))}
                  <span className="text-xs shrink-0 font-medium tabular-nums" style={{ color: "var(--color-on-surface-variant)" }}>
                    {s.actual_duration_sec ? fmtDuration(s.actual_duration_sec) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Returns a 2D array: [week][dayOfWeek], last 26 weeks
function buildHeatmapDays(data: { date: string; seconds: number }[]) {
  const byDate = Object.fromEntries(data.map((d) => [d.date, d.seconds]));
  const today = new Date();
  const result: (null | { date: string; seconds: number })[][] = [];

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (26 * 7 - 1));

  let week: (null | { date: string; seconds: number })[] = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    week.push({ date: iso, seconds: byDate[iso] ?? 0 });
    if (week.length === 7) {
      result.push(week);
      week = [];
    }
  }
  if (week.length > 0) result.push(week);

  return result;
}
