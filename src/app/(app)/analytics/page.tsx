"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchDailyFocus, fetchTagFocus, fetchRecentSessions, fetchStreak,
  type AnalyticsFilter,
} from "@/lib/analytics/queries";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Sector,
} from "recharts";
import { fmtDuration, fmtTime } from "@/lib/utils";
import { Clock, CheckSquare, Flame, Calendar } from "lucide-react";
import type { Project } from "@/types/database";

const RANGE_OPTIONS: { value: AnalyticsFilter["range"]; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export default function AnalyticsPage() {
  const supabase = createClient();
  const [range, setRange] = useState<AnalyticsFilter["range"]>("7d");
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);

  const filter: AnalyticsFilter = { range, projectId: filterProjectId, tagId: filterTagId };

  const { data: daily = [] } = useQuery({ queryKey: ["analytics", "daily", filter], queryFn: () => fetchDailyFocus(filter) });
  const { data: tagFocus = [] } = useQuery({ queryKey: ["analytics", "tags", filter], queryFn: () => fetchTagFocus(filter) });
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions", filter], queryFn: () => fetchRecentSessions(filter) });
  const { data: streak = { current: 0, best: 0 } } = useQuery({ queryKey: ["analytics", "streak"], queryFn: fetchStreak });
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").is("archived_at", null).order("sort_order");
      return data ?? [];
    },
  });

  const totalSeconds = daily.reduce((s, d) => s + d.total_seconds, 0);
  const completedSessions = sessions.filter((s) => s.completed).length;

  // Heatmap — last 26 weeks
  const heatmapDays = buildHeatmapDays(daily.map((d) => ({ date: d.day, seconds: d.total_seconds })));
  const maxSeconds = Math.max(...heatmapDays.flat().map((d) => d?.seconds ?? 0), 1);

  const weeklyBars = daily.map((d) => ({
    name: new Date(d.day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    minutes: Math.round(d.total_seconds / 60),
  }));

  const PIE_COLORS = ["var(--color-primary)", "var(--color-secondary)", "var(--color-tertiary)", "var(--color-primary-container)", "#c0b0ff", "#a4cfb4"];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header + filters */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}>
            Analytics Overview
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            Your productivity trends.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: range === opt.value ? "rgba(255,255,255,0.08)" : "transparent",
                color: range === opt.value ? "var(--color-on-surface)" : "var(--color-on-surface-variant)",
                border: range === opt.value ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-outline-variant)",
              }}
            >
              {opt.label}
            </button>
          ))}
          <select
            value={filterProjectId ?? ""}
            onChange={(e) => setFilterProjectId(e.target.value || null)}
            className="px-3 py-1.5 rounded-full text-xs outline-none"
            style={{
              background: "var(--color-surface-container-high)",
              color: "var(--color-on-surface)",
              border: "1px solid var(--color-outline-variant)",
            }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          icon={<Clock size={18} />}
          label="Total Focus Time"
          value={fmtDuration(totalSeconds)}
          color="var(--color-primary)"
        />
        <KpiCard
          icon={<CheckSquare size={18} />}
          label="Sessions Completed"
          value={String(completedSessions)}
          color="var(--color-secondary)"
        />
        <KpiCard
          icon={<Flame size={18} />}
          label="Current Streak"
          value={`${streak.current} days`}
          sub={`Best: ${streak.best} days`}
          color="var(--color-tertiary)"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly bar chart */}
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-on-surface-variant)" }}>
            Daily Activity
          </p>
          {weeklyBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weeklyBars} barSize={12}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-container-high)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "12px",
                    color: "var(--color-on-surface)",
                    fontSize: 12,
                  }}
                  formatter={(v: unknown) => [`${v} min`, "Focus"]}
                />
                <Bar dataKey="minutes" radius={[4, 4, 0, 0]} fill="var(--color-primary)" fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty label="No sessions yet in this range." />
          )}
        </div>

        {/* Tag donut */}
        <div className="glass rounded-2xl p-5 flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-on-surface-variant)" }}>
            Time by Tag
          </p>
          {tagFocus.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={tagFocus} dataKey="total_seconds" nameKey="tag_name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
                    {tagFocus.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--color-surface-container-high)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", color: "var(--color-on-surface)", fontSize: 12 }}
                    formatter={(v: unknown) => [fmtDuration(Number(v)), "Focus"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {tagFocus.slice(0, 4).map((t, i) => {
                  const pct = Math.round((t.total_seconds / totalSeconds) * 100) || 0;
                  return (
                    <div key={t.tag_id} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="flex-1 truncate" style={{ color: "var(--color-on-surface)" }}>{t.tag_name}</span>
                      <span style={{ color: "var(--color-on-surface-variant)" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty label="Tag some tasks to see breakdown." />
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="glass rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-on-surface-variant)" }}>
          Activity Heatmap — last 26 weeks
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
      <div className="glass rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-on-surface-variant)" }}>
          Recent Sessions
        </p>
        {sessions.length === 0 ? (
          <Empty label="No sessions recorded yet." />
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 15).map((s) => (
              <div key={s.id} className="flex items-center gap-4 py-2.5 text-sm"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="w-1 self-stretch rounded-full shrink-0"
                  style={{ background: s.completed ? "var(--color-secondary)" : "var(--color-outline)" }} />
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ color: "var(--color-on-surface)" }}>
                    {s.task_title ?? "Untitled session"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
                    {s.project_name ?? "—"} · {fmtTime(s.started_at)}
                  </p>
                </div>
                {s.tags.slice(0, 2).map((tag) => (
                  <span key={tag.id} className="px-2 py-0.5 rounded-full text-xs shrink-0"
                    style={{ background: "color-mix(in srgb, var(--color-secondary) 15%, transparent)", color: "var(--color-secondary)" }}>
                    {tag.name}
                  </span>
                ))}
                <span className="text-xs shrink-0 font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
                  {s.actual_duration_sec ? fmtDuration(s.actual_duration_sec) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="glass rounded-2xl p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--color-on-surface-variant)" }}>{label}</p>
        <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>{sub}</p>}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="py-8 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>{label}</div>
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
