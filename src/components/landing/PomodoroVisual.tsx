"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const LENGTHS = [15, 25, 50, 90] as const;
const EASE = [0.22, 1, 0.36, 1] as const;

function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function Dot({ state }: { state: "done" | "half" | "now" | "empty" }) {
  const fill =
    state === "empty"
      ? "transparent"
      : state === "half"
        ? "url(#pomo-half)"
        : "url(#pomo-fill)";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle
        cx="11" cy="11" r="8"
        fill={fill}
        stroke={state === "empty" ? "rgba(255,255,255,0.22)" : "var(--color-primary)"}
        strokeWidth="1.6"
      />
      {state === "now" && (
        <circle cx="11" cy="11" r="3.2" fill="var(--color-on-primary)" className="pulse-dot" />
      )}
    </svg>
  );
}

export function PomodoroVisual() {
  const [mins, setMins] = useState<(typeof LENGTHS)[number]>(25);
  const three = 3 * mins;
  const half = Math.round(mins / 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass relative"
      style={{ borderRadius: 24, padding: 22 }}
    >
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="pomo-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff5fa2" />
            <stop offset="100%" stopColor="#b06bf6" />
          </linearGradient>
          <linearGradient id="pomo-half" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff5fa2" />
            <stop offset="50%" stopColor="#ff5fa2" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 10, marginBottom: 18 }}>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--color-on-surface)" }}>
          Focus length
        </p>
        <div className="flex" style={{ gap: 6 }}>
          {LENGTHS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMins(n)}
              className={`pill ${n === mins ? "grad-primary" : ""}`}
              style={{
                padding: "5px 11px",
                fontSize: 12.5,
                fontWeight: 700,
                color: n === mins ? "var(--color-on-primary)" : "var(--color-on-surface)",
                background: n === mins ? undefined : "rgba(255,255,255,0.06)",
                border: n === mins ? "none" : "1px solid rgba(255,255,255,0.10)",
              }}
            >
              {n}m
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end justify-between" style={{ gap: 16, marginBottom: 22 }}>
        <div>
          <p className="tabular-nums" style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 800, letterSpacing: "-.03em", color: "var(--color-on-surface)", lineHeight: 1 }}>
            {mins}
            <span style={{ fontSize: 18, fontWeight: 600, marginLeft: 4, color: "var(--color-on-surface-variant)" }}>min</span>
          </p>
          <p style={{ fontSize: 13, color: "var(--color-on-surface-variant)", marginTop: 6 }}>
            You set it — anywhere from 5 to 120.
          </p>
        </div>
        <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }} aria-hidden>
          <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
          <circle
            className="ring-loop"
            cx="36" cy="36" r="28" fill="none"
            stroke="url(#pomo-fill)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="176"
          />
        </svg>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-on-surface-variant)", marginBottom: 10 }}>
        Session timeline
      </p>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
        <Dot state="done" />
        <Dot state="done" />
        <Dot state="now" />
        <Dot state="half" />
        <Dot state="empty" />
      </div>
      <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", marginBottom: 18 }}>
        Two done · this session · a half-pomo leftover · one still queued.
      </p>

      <div
        className="flex flex-col sm:flex-row"
        style={{ gap: 10 }}
      >
        <div className="flex-1" style={{ borderRadius: 16, padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)" }}>3 pomodoros</p>
          <p className="tabular-nums" style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--color-on-surface)", marginTop: 2 }}>
            {formatHours(three)}
          </p>
        </div>
        <div className="flex-1" style={{ borderRadius: 16, padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)" }}>half-pomo</p>
          <p className="tabular-nums" style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--color-on-surface)", marginTop: 2 }}>
            {half} min
          </p>
        </div>
      </div>
    </motion.div>
  );
}
