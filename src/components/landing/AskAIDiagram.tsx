"use client";

import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  { k: "01", title: "You type", body: "“Break Launch site into subtasks and tag them frontend.”" },
  { k: "02", title: "Tools run", body: "search_tasks → add_subtask × 4 → set_tags. Live action cards." },
  { k: "03", title: "Board updates", body: "The project changes in place. Deletes wait for a confirm." },
];

export function AskAIDiagram() {
  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <div className="hidden sm:block">
        <svg viewBox="0 0 640 168" className="w-full h-auto" role="img" aria-label="Ask AI flow from a typed sentence to board updates">
          <defs>
            <linearGradient id="ai-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ff5fa2" />
              <stop offset="55%" stopColor="#b06bf6" />
              <stop offset="100%" stopColor="#8fb6ff" />
            </linearGradient>
            <marker id="ai-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 1.4 L 10 5 L 0 8.6 Z" fill="#b06bf6" />
            </marker>
          </defs>
          <path
            className="landing-flow"
            d="M 118 84 H 206"
            fill="none"
            stroke="url(#ai-line)"
            strokeWidth="1.8"
            markerEnd="url(#ai-ah)"
          />
          <path
            className="landing-flow"
            d="M 334 84 H 422"
            fill="none"
            stroke="url(#ai-line)"
            strokeWidth="1.8"
            markerEnd="url(#ai-ah)"
          />

          <rect x={16} y={28} width={100} height={112} rx={20} fill="rgba(255,95,162,0.10)" stroke="rgba(255,95,162,0.35)" />
          <text x={66} y={78} textAnchor="middle" fill="var(--color-on-surface)" style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800 }}>You type</text>
          <text x={66} y={98} textAnchor="middle" fill="var(--color-on-surface-variant)" style={{ fontFamily: "var(--font-sans)", fontSize: 10 }}>plain language</text>

          <rect x={208} y={28} width={124} height={112} rx={20} fill="rgba(176,107,246,0.10)" stroke="rgba(176,107,246,0.35)" />
          <text x={270} y={70} textAnchor="middle" fill="var(--color-on-surface)" style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800 }}>Tools run</text>
          <text x={270} y={90} textAnchor="middle" fill="#b06bf6" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 9.5 }}>add_subtask</text>
          <text x={270} y={106} textAnchor="middle" fill="#8fb6ff" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 9.5 }}>set_tags</text>

          <rect x={424} y={28} width={200} height={112} rx={20} fill="rgba(143,182,255,0.10)" stroke="rgba(143,182,255,0.35)" />
          <text x={524} y={68} textAnchor="middle" fill="var(--color-on-surface)" style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800 }}>Board updates</text>
          <rect x={448} y={82} width={152} height={8} rx={4} fill="rgba(255,255,255,0.14)" />
          <rect x={448} y={96} width={118} height={8} rx={4} fill="rgba(255,95,162,0.45)" />
          <rect x={448} y={110} width={136} height={8} rx={4} fill="rgba(176,107,246,0.40)" />
        </svg>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
        {STEPS.map((s, i) => (
          <motion.div
            key={s.k}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
            className="glass"
            style={{ borderRadius: 20, padding: 16 }}
          >
            <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, color: "var(--color-primary)" }}>
              {s.k}
            </span>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--color-on-surface)", marginTop: 6 }}>
              {s.title}
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-on-surface-variant)", marginTop: 6 }}>
              {s.body}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
