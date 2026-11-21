import type { ExtensionState } from "@/lib/extension/service";

// Compact, agent-oriented rendering of the live FocusSpace state. Tool output
// is read by models, so: one fact per line, `key: value`, ids inline, times as
// both mm:ss and seconds, absolute end time in ISO UTC (+ user's local clock).

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

export const minutes = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
};

const MODE_LABEL: Record<string, string> = { pomodoro: "pomodoro", custom: "custom", short_break: "short break", long_break: "long break" };

export interface StatusExtras {
  timezone?: string | null;
  settings?: {
    focusSec: number; shortBreakSec: number; longBreakSec: number; longBreakEvery: number;
    autoStartBreaks?: boolean; autoStartPomodoros?: boolean;
  } | null;
  /** One-line now-playing, or null when Spotify isn't connected. */
  music?: string | null;
  destructive?: "allow" | "confirm";
}

function localClock(ms: number, tz?: string | null): string | null {
  try {
    return new Date(ms).toLocaleTimeString("en-GB", { timeZone: tz || "UTC", hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

/** Render the timer line alone (also used as the result of timer commands). */
export function timerLine(st: ExtensionState, tz?: string | null): string {
  const t = st.timer;
  const mode = MODE_LABEL[t.mode] ?? t.mode;
  if (t.status === "running") {
    const endsAt = st.serverNow + t.remainingSec * 1000;
    const clock = localClock(endsAt, tz);
    return `timer: running · ${mode} · ${mmss(t.remainingSec)} left (${t.remainingSec}s of ${t.plannedDurationSec}s) · ends_at ${new Date(endsAt).toISOString()}${clock ? ` (${clock} ${tz || "UTC"})` : ""}`;
  }
  if (t.status === "paused") return `timer: paused · ${mode} · ${mmss(t.remainingSec)} left (${t.remainingSec}s of ${t.plannedDurationSec}s)`;
  if (t.status === "completed") return `timer: finished · ${mode} just ended${st.justCompleted ? " (recorded now)" : ""}`;
  return `timer: idle · mode ${mode} · next start ${MODE_LABEL[st.next.start.mode] ?? st.next.start.mode} ${mmss(st.next.start.durationSec)}`;
}

export function formatStatus(st: ExtensionState, x: StatusExtras = {}): string {
  const lines = [timerLine(st, x.timezone)];
  const task = st.task;
  if (task) {
    const subDone = task.subtasks.filter((s) => s.done).length;
    lines.push(`task: ${task.title} (id: ${task.id}) · ${task.done ? "done" : "todo"} · pomos ${task.completedPomodoros}/${task.estimatedPomodoros}${task.subtasks.length ? ` · subtasks ${subDone}/${task.subtasks.length}` : ""}`);
    const open = task.subtasks.filter((s) => !s.done).slice(0, 5);
    if (open.length) lines.push(`next subtasks: ${open.map((s) => `${s.title} (id: ${s.id})`).join("; ")}`);
  } else {
    lines.push("task: none selected (set_active_task or start_timer with taskRef)");
  }
  if (st.project) lines.push(`project: ${st.project.name} (id: ${st.project.id})`);
  const every = x.settings?.longBreakEvery ?? 4;
  const done = task ? task.completedPomodoros : st.timer.pomodoroCount;
  const cycle = `cycle: ${done % every}/${every} pomos toward long break`;
  lines.push(st.next.breakOption
    ? `${cycle} · suggested next: ${MODE_LABEL[st.next.breakOption.mode]} ${mmss(st.next.breakOption.durationSec)}`
    : cycle);
  if (x.settings) {
    const s = x.settings;
    lines.push(`settings: focus ${minutes(s.focusSec)} · short ${minutes(s.shortBreakSec)} · long ${minutes(s.longBreakSec)} every ${s.longBreakEvery} · auto-start breaks ${s.autoStartBreaks ? "on" : "off"}, pomos ${s.autoStartPomodoros ? "on" : "off"}`);
  }
  if (x.music !== undefined) lines.push(`music: ${x.music ?? "spotify not connected"}`);
  if (x.timezone || x.destructive) lines.push(`tz: ${x.timezone || "UTC"}${x.destructive ? ` · deletes: ${x.destructive}` : ""}`);
  return lines.join("\n");
}
