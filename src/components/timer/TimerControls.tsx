"use client";

import { RotateCcw, Play, Pause, SkipForward } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  status: string;
  onPlayPause: () => void;
  onReset: () => void;
  onSkip: () => void;
  disabled?: boolean;
}

export function TimerControls({ status, onPlayPause, onReset, onSkip, disabled }: Props) {
  const isRunning = status === "running";
  const isIdle = status === "idle";

  return (
    <div className="flex items-center gap-6">
      {/* Reset */}
      <motion.button
        onClick={onReset}
        whileTap={{ scale: 0.92 }}
        className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200"
        style={{
          background: "color-mix(in srgb, var(--color-surface-variant) 40%, transparent)",
          color: "var(--color-on-surface-variant)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
        aria-label="Reset timer"
      >
        <RotateCcw size={20} />
      </motion.button>

      {/* Play / Pause — main action */}
      <motion.button
        onClick={onPlayPause}
        disabled={disabled}
        whileTap={{ scale: 0.93 }}
        whileHover={{ scale: 1.04 }}
        className="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300"
        style={{
          background: "var(--color-primary)",
          color: "var(--color-on-primary)",
          boxShadow: "0 8px 32px color-mix(in srgb, var(--color-primary) 30%, transparent)",
          border: "1px solid rgba(255,255,255,0.1)",
          opacity: disabled ? 0.6 : 1,
        }}
        aria-label={isRunning ? "Pause timer" : "Start timer"}
      >
        {isRunning ? <Pause size={28} /> : <Play size={28} className="translate-x-0.5" />}
      </motion.button>

      {/* Skip */}
      <motion.button
        onClick={onSkip}
        whileTap={{ scale: 0.92 }}
        className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200"
        style={{
          background: "color-mix(in srgb, var(--color-surface-variant) 40%, transparent)",
          color: "var(--color-on-surface-variant)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
        aria-label="Skip session"
      >
        <SkipForward size={20} />
      </motion.button>
    </div>
  );
}
