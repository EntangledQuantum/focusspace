"use client";

import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Deterministic-looking week × 12 activity so the heatmap feels lived-in. */
const WEEKS = 12;
const DAYS = 7;
const LEVELS = [
  0, 1, 0, 2, 3, 1, 0,
  2, 3, 4, 2, 1, 0, 1,
  0, 2, 3, 4, 3, 1, 0,
  1, 0, 2, 3, 4, 2, 1,
  0, 1, 2, 1, 3, 4, 2,
  1, 0, 0, 2, 3, 3, 1,
  2, 3, 4, 4, 2, 1, 0,
  0, 1, 2, 3, 2, 0, 1,
  1, 2, 4, 3, 2, 1, 0,
  0, 0, 1, 2, 3, 4, 2,
  1, 2, 3, 2, 1, 0, 0,
  2, 3, 4, 3, 2, 1, 0,
];

const FILL = [
  "rgba(255,255,255,0.06)",
  "color-mix(in srgb, var(--color-primary) 28%, transparent)",
  "color-mix(in srgb, var(--color-primary) 48%, transparent)",
  "color-mix(in srgb, var(--color-primary) 72%, transparent)",
  "var(--color-primary)",
];

const BARS = [
  { name: "Launch site", h: 0.92, color: "#ff5fa2" },
  { name: "Writing", h: 0.64, color: "#b06bf6" },
  { name: "Research", h: 0.4, color: "#8fb6ff" },
];

export function AnalyticsVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass"
      style={{ borderRadius: 24, padding: 20 }}
    >
      <div className="flex items-end justify-between" style={{ marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-on-surface-variant)" }}>
            Current streak
          </p>
          <p className="tabular-nums" style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 800, letterSpacing: "-.03em", color: "var(--color-on-surface)", lineHeight: 1.05 }}>
            12
            <span style={{ fontSize: 16, fontWeight: 600, marginLeft: 6, color: "var(--color-on-surface-variant)" }}>days</span>
          </p>
        </div>
        <span className="pill chip-primary" style={{ padding: "4px 10px", fontSize: 11 }}>
          same numbers over MCP
        </span>
      </div>

      <div className="flex" style={{ gap: 4, marginBottom: 18 }}>
        {Array.from({ length: WEEKS }, (_, w) => (
          <div key={w} className="flex flex-col flex-1" style={{ gap: 4 }}>
            {Array.from({ length: DAYS }, (_, d) => {
              const lvl = LEVELS[w * DAYS + d] ?? 0;
              return (
                <div
                  key={d}
                  className="w-full"
                  style={{
                    aspectRatio: "1",
                    borderRadius: 3,
                    background: FILL[lvl],
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-on-surface-variant)", marginBottom: 10 }}>
        By project
      </p>
      <div className="flex items-end" style={{ gap: 14, height: 88 }}>
        {BARS.map((b) => (
          <div key={b.name} className="flex-1 flex flex-col items-center" style={{ height: "100%" }}>
            <div className="w-full flex-1 flex items-end">
              <div
                className="rise-bar w-full rounded-md"
                style={{
                  height: `${b.h * 100}%`,
                  background: `linear-gradient(to top, ${b.color}, color-mix(in srgb, ${b.color} 40%, transparent))`,
                }}
              />
            </div>
            <span style={{ fontSize: 10.5, color: "var(--color-on-surface-variant)", marginTop: 6, textAlign: "center" }}>
              {b.name}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
