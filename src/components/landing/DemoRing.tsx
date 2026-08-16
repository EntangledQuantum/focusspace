"use client";

import { useEffect, useState } from "react";

/** Live demo ring — endlessly counts down with the gradient stroke. */
export function DemoRing({ size = 220 }: { size?: number }) {
  const R = Math.round(size * 0.4);
  const C = 2 * Math.PI * R;
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 0 ? 25 * 60 : s - 7));
    }, 120);
    return () => clearInterval(id);
  }, []);

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const progress = 1 - secondsLeft / (25 * 60);
  const cx = size / 2;

  return (
    <div className="relative" style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
      <div
        className="absolute rounded-full"
        style={{
          width: size - 10,
          height: size - 10,
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 68%)",
          filter: "blur(8px)",
        }}
      />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="landing-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-secondary)" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={R} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="6" />
        <circle
          cx={cx}
          cy={cx}
          r={R}
          fill="none"
          stroke="url(#landing-ring)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          style={{ filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--color-primary) 45%, transparent))" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: size > 180 ? 44 : 32,
            fontWeight: 600,
            letterSpacing: "-.03em",
            color: "var(--color-on-surface)",
          }}
        >
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--color-on-surface-variant)" }}>
          <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--color-primary)" }} />
          deep work in progress
        </span>
      </div>
    </div>
  );
}
