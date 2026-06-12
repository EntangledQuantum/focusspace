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

  return (
    <div className="flex items-center" style={{ gap: 20 }}>
      {/* Reset */}
      <motion.button
        onClick={onReset}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.06 }}
        className="glass-soft rounded-full flex items-center justify-center"
        style={{ width: 52, height: 52, color: "var(--color-on-surface-variant)" }}
        aria-label="Reset timer"
      >
        <RotateCcw size={19} />
      </motion.button>

      {/* Play / Pause — main action, pink → purple gradient */}
      <motion.button
        onClick={onPlayPause}
        disabled={disabled}
        whileTap={{ scale: 0.93 }}
        whileHover={{ scale: 1.04 }}
        className="grad-primary rounded-full flex items-center justify-center"
        style={{
          width: 76,
          height: 76,
          color: "var(--color-on-primary)",
          boxShadow: "0 14px 40px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)",
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
        whileHover={{ scale: 1.06 }}
        className="glass-soft rounded-full flex items-center justify-center"
        style={{ width: 52, height: 52, color: "var(--color-on-surface-variant)" }}
        aria-label="Skip session"
      >
        <SkipForward size={19} />
      </motion.button>
    </div>
  );
}
