"use client";

import { CheckCircle2, Circle, Play } from "lucide-react";
import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const TASKS = [
  { title: "Write the brief", done: true, tags: ["docs"], pomos: null as string | null, sub: [] as string[] },
  { title: "Design system", done: false, tags: ["design"], pomos: "2", sub: ["Color tokens", "Type scale"] },
  { title: "Ship homepage", done: false, tags: ["frontend", "launch"], pomos: "2.5", sub: [] as string[] },
];

export function ProjectsVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass"
      style={{ borderRadius: 24, padding: 20 }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <span className="rounded-full" style={{ width: 10, height: 10, background: "var(--color-primary)" }} />
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: "var(--color-on-surface)" }}>
            Launch site
          </p>
        </div>
        <span className="pill chip-accent" style={{ padding: "3px 9px", fontSize: 11 }}>3 tasks</span>
      </div>

      <div className="flex flex-col" style={{ gap: 8 }}>
        {TASKS.map((t) => (
          <div
            key={t.title}
            style={{
              borderRadius: 16,
              padding: "11px 12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              opacity: t.done ? 0.62 : 1,
            }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              {t.done
                ? <CheckCircle2 size={15} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                : <Circle size={15} style={{ color: "var(--color-on-surface-variant)", flexShrink: 0 }} />}
              <p
                className="min-w-0 flex-1"
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--color-on-surface)",
                  textDecoration: t.done ? "line-through" : "none",
                }}
              >
                {t.title}
              </p>
              {t.pomos && (
                <span className="tabular-nums" style={{ fontSize: 11, color: "var(--color-on-surface-variant)" }}>
                  {t.pomos}
                </span>
              )}
              {!t.done && (
                <span
                  className="pill chip-primary shrink-0"
                  style={{ padding: "3px 8px", fontSize: 11, fontWeight: 700 }}
                >
                  <Play size={10} fill="currentColor" /> Run
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 8, paddingLeft: 23 }}>
              {t.tags.map((tag) => (
                <span
                  key={tag}
                  className="pill"
                  style={{
                    padding: "2px 8px",
                    fontSize: 10.5,
                    color: "var(--color-on-surface-variant)",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            {t.sub.length > 0 && (
              <div className="flex flex-col" style={{ gap: 5, marginTop: 8, paddingLeft: 23 }}>
                {t.sub.map((s) => (
                  <span key={s} className="flex items-center" style={{ gap: 6, fontSize: 12, color: "var(--color-on-surface-variant)" }}>
                    <Circle size={10} /> {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
