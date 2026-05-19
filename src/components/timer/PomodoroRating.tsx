"use client";

import { useState } from "react";

interface Props {
  value: number; // 1, 1.5, 2 … 5
  onChange: (v: number) => void;
  pomoDurationSec?: number;
  shortBreakSec?: number;
  readOnly?: boolean;
}

function PomoIcon({ state }: { state: "full" | "half" | "empty" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      {/* Timer body */}
      {state !== "empty" && (
        <clipPath id={`clip-half-${state}`}>
          <rect x="0" y="0" width={state === "half" ? "8" : "16"} height="16" />
        </clipPath>
      )}
      {/* Filled bg */}
      {state !== "empty" && (
        <circle
          cx="8" cy="9" r="6"
          fill="var(--color-primary)"
          clipPath={state === "half" ? `url(#clip-half-${state})` : undefined}
        />
      )}
      {/* Outline circle */}
      <circle
        cx="8" cy="9" r="6"
        stroke={state === "empty" ? "rgba(255,255,255,0.22)" : "var(--color-primary)"}
        strokeWidth="1.4"
        fill="none"
      />
      {/* Top stem */}
      <rect
        x="6.5" y="2" width="3" height="2" rx="0.8"
        fill={state === "empty" ? "rgba(255,255,255,0.22)" : "var(--color-primary)"}
      />
      {/* Clock hands — only on empty/outlined to keep it readable */}
      {state === "empty" && (
        <>
          <line x1="8" y1="9" x2="8" y2="6.5" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="8" y1="9" x2="10" y2="9" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
      {/* Clock hands on filled — contrasting white */}
      {state === "full" && (
        <>
          <line x1="8" y1="9" x2="8" y2="6.5" stroke="rgba(0,0,0,0.35)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="8" y1="9" x2="10" y2="9" stroke="rgba(0,0,0,0.35)" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0 && m > 0) return `~${h}h ${m}m`;
  if (h > 0) return `~${h}h`;
  return `~${m}m`;
}

export function PomodoroRating({
  value, onChange, pomoDurationSec = 25 * 60, shortBreakSec = 5 * 60, readOnly = false,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  const getState = (pos: number): "full" | "half" | "empty" => {
    if (display >= pos) return "full";
    if (pos > 1 && display >= pos - 0.5) return "half";
    return "empty";
  };

  const totalSec = value * pomoDurationSec + Math.max(0, Math.ceil(value) - 1) * shortBreakSec;

  if (readOnly) {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((pos) => (
          <PomoIcon key={pos} state={getState(pos)} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-0.5" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((pos) => (
          <div key={pos} className="relative" style={{ width: 16, height: 16 }}>
            {/* Left-half zone → pos-0.5, except pos=1 stays 1 */}
            <div
              className="absolute inset-y-0 left-0 z-10 cursor-pointer"
              style={{ width: "50%" }}
              onMouseEnter={() => !readOnly && setHover(pos === 1 ? 1 : pos - 0.5)}
              onClick={() => !readOnly && onChange(pos === 1 ? 1 : pos - 0.5)}
            />
            {/* Right-half zone → pos */}
            <div
              className="absolute inset-y-0 right-0 z-10 cursor-pointer"
              style={{ width: "50%" }}
              onMouseEnter={() => !readOnly && setHover(pos)}
              onClick={() => !readOnly && onChange(pos)}
            />
            <PomoIcon state={getState(pos)} />
          </div>
        ))}
      </div>
      <span className="text-xs tabular-nums" style={{ color: "var(--color-on-surface-variant)" }}>
        {formatDuration(totalSec)}
      </span>
    </div>
  );
}

/** Small read-only pip row used on task list rows */
export function PomodoroMiniPips({
  estimated, completed,
}: { estimated: number; completed: number }) {
  const total = Math.ceil(estimated);
  const hasHalfLast = estimated % 1 === 0.5;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < completed;
        const isHalf = hasHalfLast && i === total - 1;
        return (
          <div
            key={i}
            className="relative rounded-full overflow-hidden"
            style={{
              width: isHalf ? 5 : 7,
              height: 7,
              background: isDone ? "var(--color-primary)" : "rgba(255,255,255,0.14)",
            }}
          />
        );
      })}
    </div>
  );
}
