"use client";

import type { TimerMode, TimerStatus } from "@/lib/stores/timer";

interface Props {
  mode: TimerMode;
  status: TimerStatus;
  progress: number;
  remainingSec: number;
  estimatedPomodoros: number;
  completedPomodoros: number;
  pomoDurationSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  pomodoroCount: number;   // global count — used to determine long-break position
  longBreakEvery: number;
}

type SegType = "pomodoro" | "short_break" | "long_break";

function fmt(sec: number) {
  const m = Math.ceil(sec / 60);
  return `${m}m`;
}

export function PomodoroTimeline({
  mode, status, progress, remainingSec,
  estimatedPomodoros, completedPomodoros,
  pomoDurationSec, shortBreakSec, longBreakSec,
  pomodoroCount, longBreakEvery,
}: Props) {
  const isOnBreak = mode === "short_break" || mode === "long_break";
  const isActive = status === "running" || status === "paused";

  if (mode === "custom") {
    return (
      <div className="w-full space-y-1.5">
        <div
          className="relative rounded-full overflow-hidden w-full"
          style={{ height: 5, background: "rgba(255,255,255,0.07)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(progress, 1) * 100}%`,
              background: "var(--color-primary)",
              transition: "width 0.5s linear",
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
            Custom session
          </span>
          {isActive && (
            <span className="text-[10px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }}>
              {fmt(remainingSec)} left
            </span>
          )}
        </div>
      </div>
    );
  }

  const totalSessions = Math.max(1, Math.ceil(estimatedPomodoros));
  const hasHalfLast = estimatedPomodoros % 1 === 0.5;
  // Global count before any of this task's sessions ran
  const initialCount = pomodoroCount - completedPomodoros;

  // Build: [P, Break, P, Break, ..., P, Break] — always ends with a break
  type Seg = { type: SegType; durationSec: number };
  const segs: Seg[] = [];
  for (let i = 0; i < totalSessions; i++) {
    const isLastPomo = i === totalSessions - 1;
    segs.push({
      type: "pomodoro",
      durationSec: isLastPomo && hasHalfLast ? pomoDurationSec / 2 : pomoDurationSec,
    });
    // Break type is computed by where this pomo falls in the global cycle
    const globalCountAfterPomo = initialCount + i + 1;
    const isLong = longBreakEvery > 0 && globalCountAfterPomo % longBreakEvery === 0;
    segs.push({
      type: isLong ? "long_break" : "short_break",
      durationSec: isLong ? longBreakSec : shortBreakSec,
    });
  }

  // Which segment is active?
  // completedPomodoros = N  → pomo N+1 is next (segment index N*2)
  // On break after N         → break segment index N*2 - 1
  const activeIdx = Math.max(0, completedPomodoros * 2 - (isOnBreak ? 1 : 0));
  const isTaskDone = !isOnBreak && completedPomodoros >= totalSessions;

  const currentPomoNum = Math.min(
    isOnBreak ? completedPomodoros : completedPomodoros + 1,
    totalSessions
  );
  const activeSeg = segs[activeIdx];

  let leftLabel = "";
  if (isTaskDone) {
    leftLabel = status === "idle" ? "Task complete — pick another" : "Session done";
  } else if (isOnBreak) {
    leftLabel = activeSeg?.type === "long_break" ? "Long break" : "Short break";
  } else if (status === "idle") {
    leftLabel = `Ready · Focus ${currentPomoNum}/${totalSessions}`;
  } else {
    leftLabel = `Focus ${currentPomoNum}/${totalSessions}`;
  }

  let rightLabel = "";
  if (isActive && !isOnBreak && !isTaskDone) {
    const nextBreak = segs[activeIdx + 1];
    if (nextBreak) {
      const breakType = nextBreak.type === "long_break" ? "Long" : "Short";
      const isLastPomo = currentPomoNum === totalSessions;
      rightLabel = isLastPomo
        ? `${breakType} break up next`
        : `${breakType} break in ~${fmt(remainingSec)} · ${fmt(nextBreak.durationSec)}`;
    }
  } else if (isActive && isOnBreak) {
    const nextPomoNum = completedPomodoros + 1;
    if (nextPomoNum <= totalSessions) {
      rightLabel = `Focus ${nextPomoNum}/${totalSessions} next`;
    }
  } else if (status === "idle" && !isTaskDone) {
    rightLabel = `${fmt(activeSeg?.durationSec ?? pomoDurationSec)} session`;
  }

  return (
    <div className="w-full space-y-1.5">
      {/* Segment bar */}
      <div className="flex items-stretch" style={{ height: 5, gap: 2 }}>
        {segs.map((seg, i) => {
          const segState =
            i < activeIdx
              ? "done"
              : i === activeIdx
              ? isActive
                ? "active"
                : status === "completed"
                ? "done"
                : "upcoming"
              : "upcoming";

          const color =
            seg.type === "long_break"
              ? "var(--color-tertiary)"
              : seg.type === "short_break"
              ? "var(--color-secondary)"
              : "var(--color-primary)";

          return (
            <div
              key={i}
              className="relative rounded-full overflow-hidden"
              style={{
                flex: `${seg.durationSec} 0 0`,
                minWidth: seg.type === "pomodoro" ? 12 : 7,
                background:
                  segState === "done"
                    ? color
                    : segState === "active"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(255,255,255,0.06)",
              }}
            >
              {segState === "active" && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(progress, 1) * 100}%`,
                    background: color,
                    transition: "width 0.5s linear",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Info row */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-medium leading-none"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          {leftLabel}
        </span>
        {rightLabel && (
          <span
            className="text-[10px] leading-none"
            style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }}
          >
            {rightLabel}
          </span>
        )}
      </div>
    </div>
  );
}
