"use client";

import { motion } from "framer-motion";

const RADIUS = 104;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  progress: number; // 0-1
  displayTime: string;
  status: string;
}

export function TimerRing({ progress, displayTime, status }: Props) {
  const offset = CIRCUMFERENCE * (1 - progress);
  const isRunning = status === "running";
  const isCompleted = status === "completed";

  return (
    <div className="relative select-none" style={{ width: 252, height: 252, display: "grid", placeItems: "center" }}>
      {/* Ambient glow behind ring */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 240,
          height: 240,
          background: "radial-gradient(circle, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 68%)",
          opacity: isRunning ? 1 : 0.5,
          transition: "opacity .6s",
          filter: "blur(6px)",
        }}
      />

      <svg width="252" height="252" viewBox="0 0 252 252" style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-secondary)" />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx="126" cy="126" r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.13)"
          strokeWidth="6"
        />

        {/* Progress arc — pink → purple gradient */}
        <motion.circle
          cx="126" cy="126" r={RADIUS}
          fill="none"
          stroke={isCompleted ? "var(--color-secondary)" : "url(#ring-grad)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--color-primary) 55%, transparent))",
          }}
        />
      </svg>

      {/* Time display */}
      <div className="absolute flex flex-col items-center justify-center">
        <motion.span
          className="text-timer"
          style={{ color: "var(--color-on-surface)" }}
          animate={{ scale: isCompleted ? [1, 1.05, 1] : 1 }}
          transition={{ duration: 0.4 }}
        >
          {displayTime}
        </motion.span>
      </div>
    </div>
  );
}
