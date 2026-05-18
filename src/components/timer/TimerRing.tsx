"use client";

import { motion } from "framer-motion";

const RADIUS = 48;
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
    <div className="relative flex items-center justify-center select-none">
      {/* Ambient glow behind ring */}
      <div
        className="absolute rounded-full pointer-events-none transition-opacity duration-500"
        style={{
          width: "220px",
          height: "220px",
          background: "radial-gradient(circle, color-mix(in srgb, var(--color-primary) 12%, transparent) 0%, transparent 70%)",
          opacity: isRunning ? 1 : 0.4,
        }}
      />

      <svg
        width="288"
        height="288"
        viewBox="0 0 100 100"
        className="transform -rotate-90"
      >
        {/* Track */}
        <circle
          cx="50" cy="50" r={RADIUS}
          fill="none"
          stroke="var(--color-outline-variant)"
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />

        {/* Progress arc */}
        <motion.circle
          cx="50" cy="50" r={RADIUS}
          fill="none"
          stroke={isCompleted ? "var(--color-secondary)" : "var(--color-primary)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            filter: `drop-shadow(0 0 8px ${isCompleted ? "var(--color-secondary)" : "var(--color-primary)"}66)`,
          }}
        />
      </svg>

      {/* Time display */}
      <div className="absolute flex flex-col items-center justify-center gap-1">
        <motion.span
          className="text-timer tabular-nums"
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
