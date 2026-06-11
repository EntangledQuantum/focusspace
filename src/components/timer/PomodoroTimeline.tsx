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
  /** Pomodoros completed in the current cycle before this task's first session.
   *  0 when a task drives the timeline (task-relative cadence); the global
   *  session count when running without a task. */
  cycleOffset: number;
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
  cycleOffset, longBreakEvery,
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

  const plannedSessions = Math.max(1, Math.ceil(estimatedPomodoros));
  const hasHalfLast = estimatedPomodoros % 1 === 0.5;

  // The current session number (1-indexed) — if we're running/paused on a pomo,
  // it's the (completedPomodoros + 1)-th pomo. While on a break, the most recently
  // completed pomo was (completedPomodoros)-th.
  const isRunningPomo = isActive && !isOnBreak;
  const inFlightPomo = isRunningPomo ? 1 : 0;
  // Render enough segments to cover both the plan AND any overflow pomos the user is doing
  const visibleSessions = Math.max(plannedSessions, completedPomodoros + inFlightPomo);

  // Build: [P, Break, P, Break, ..., P, Break] — always ends with a break
  type Seg = { type: SegType; durationSec: number; isOverflow: boolean };
  const segs: Seg[] = [];
  for (let i = 0; i < visibleSessions; i++) {
    const isLastPlanned = i === plannedSessions - 1;
    const isOverflow = i >= plannedSessions;
    segs.push({
      type: "pomodoro",
      durationSec: !isOverflow && isLastPlanned && hasHalfLast ? pomoDurationSec / 2 : pomoDurationSec,
      isOverflow,
    });
    const countAfterPomo = cycleOffset + i + 1;
    const isLong = longBreakEvery > 0 && countAfterPomo % longBreakEvery === 0;
    segs.push({
      type: isLong ? "long_break" : "short_break",
      durationSec: isLong ? longBreakSec : shortBreakSec,
      isOverflow,
    });
  }

  // Active segment index:
  //   completedPomodoros = N → next pomo segment index = N*2
  //   On break after pomo N → break segment index = N*2 - 1
  const activeIdx = Math.max(0, completedPomodoros * 2 - (isOnBreak ? 1 : 0));
  const activeSeg = segs[activeIdx];

  // Labels — never auto-conclude "Task complete"; only the user's Done button does that.
  const currentPomoNum = isOnBreak ? completedPomodoros : completedPomodoros + 1;
  const isOverflowPomo = currentPomoNum > plannedSessions;

  let leftLabel = "";
  if (isOnBreak) {
    leftLabel = activeSeg?.type === "long_break" ? "Long break" : "Short break";
  } else if (status === "idle") {
    leftLabel = completedPomodoros >= plannedSessions
      ? `Ready · ${plannedSessions}/${plannedSessions} done · bonus`
      : `Ready · Focus ${currentPomoNum}/${plannedSessions}`;
  } else {
    leftLabel = isOverflowPomo
      ? `Bonus focus ${currentPomoNum - plannedSessions}`
      : `Focus ${currentPomoNum}/${plannedSessions}`;
  }

  let rightLabel = "";
  if (isActive && !isOnBreak) {
    const nextBreak = segs[activeIdx + 1];
    if (nextBreak) {
      const breakType = nextBreak.type === "long_break" ? "Long" : "Short";
      const isLastPlanned = currentPomoNum === plannedSessions;
      rightLabel = isLastPlanned && !isOverflowPomo
        ? `${breakType} break up next`
        : `${breakType} break in ~${fmt(remainingSec)} · ${fmt(nextBreak.durationSec)}`;
    }
  } else if (isActive && isOnBreak) {
    const nextPomoNum = completedPomodoros + 1;
    rightLabel = nextPomoNum > plannedSessions
      ? `Bonus focus ${nextPomoNum - plannedSessions} next`
      : `Focus ${nextPomoNum}/${plannedSessions} next`;
  } else if (status === "idle") {
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
