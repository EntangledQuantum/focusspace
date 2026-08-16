"use client";

import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

function Node({
  x, y, w, h, title, sub, fill, stroke,
}: {
  x: number; y: number; w: number; h: number;
  title: string; sub?: string; fill: string; stroke: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={18} fill={fill} stroke={stroke} strokeWidth={1.4} />
      <text
        x={x + w / 2} y={sub ? y + h / 2 - 6 : y + h / 2 + 5}
        textAnchor="middle"
        fill="var(--color-on-surface)"
        style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700 }}
      >
        {title}
      </text>
      {sub && (
        <text
          x={x + w / 2} y={y + h / 2 + 12}
          textAnchor="middle"
          fill="var(--color-on-surface-variant)"
          style={{ fontFamily: "var(--font-sans)", fontSize: 11 }}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function Desktop() {
  return (
    <svg viewBox="0 0 720 420" className="w-full h-auto" role="img" aria-label="How FocusSpace connects you, Ask AI, and agents to the same tools">
      <defs>
        <linearGradient id="how-core" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,95,162,0.22)" />
          <stop offset="100%" stopColor="rgba(176,107,246,0.22)" />
        </linearGradient>
        <linearGradient id="how-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5fa2" />
          <stop offset="100%" stopColor="#b06bf6" />
        </linearGradient>
        <linearGradient id="how-ai" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(143,182,255,0.18)" />
          <stop offset="100%" stopColor="rgba(176,107,246,0.16)" />
        </linearGradient>
        <filter id="how-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="how-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1.4 L 10 5 L 0 8.6 Z" fill="#ff5fa2" />
        </marker>
        <marker id="how-ah-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1.4 L 10 5 L 0 8.6 Z" fill="#8fb6ff" />
        </marker>
        <marker id="how-ah-pur" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1.4 L 10 5 L 0 8.6 Z" fill="#b06bf6" />
        </marker>
      </defs>

      {/* You ↔ Core */}
      <path
        className="landing-flow"
        d="M 168 92 H 268"
        fill="none"
        stroke="url(#how-stroke)"
        strokeWidth="1.8"
        markerEnd="url(#how-ah)"
        markerStart="url(#how-ah)"
      />
      <path
        className="landing-flow-rev"
        d="M 168 108 H 268"
        fill="none"
        stroke="url(#how-stroke)"
        strokeWidth="1.8"
        opacity={0.55}
      />

      {/* Ask AI → tools */}
      <path
        className="landing-flow"
        d="M 500 78 C 460 78, 448 220, 430 248"
        fill="none"
        stroke="#8fb6ff"
        strokeWidth="1.7"
        markerEnd="url(#how-ah-blue)"
      />
      {/* Hermes / OpenClaw → tools */}
      <path
        className="landing-flow-slow"
        d="M 500 168 C 460 176, 448 236, 430 258"
        fill="none"
        stroke="#b06bf6"
        strokeWidth="1.7"
        markerEnd="url(#how-ah-pur)"
      />

      {/* Core → tools */}
      <path
        className="landing-flow"
        d="M 360 176 V 232"
        fill="none"
        stroke="url(#how-stroke)"
        strokeWidth="1.8"
        markerEnd="url(#how-ah)"
      />

      <Node x={36} y={64} w={132} h={72} title="You" sub="the human" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.14)" />

      <g filter="url(#how-glow)">
        <rect x={268} y={48} width={184} height={128} rx={22} fill="url(#how-core)" stroke="url(#how-stroke)" strokeWidth={1.8} />
      </g>
      <text
        x={360} y={102}
        textAnchor="middle"
        fill="var(--color-on-surface)"
        style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800 }}
      >
        FocusSpace
      </text>
      <text
        x={360} y={124}
        textAnchor="middle"
        fill="var(--color-on-surface-variant)"
        style={{ fontFamily: "var(--font-sans)", fontSize: 11.5 }}
      >
        the core
      </text>

      <Node x={500} y={42} w={184} h={72} title="Ask AI" sub="in-app assistant" fill="url(#how-ai)" stroke="rgba(143,182,255,0.45)" />
      <Node x={500} y={132} w={184} h={72} title="Hermes / OpenClaw" sub="via MCP" fill="rgba(176,107,246,0.12)" stroke="rgba(176,107,246,0.42)" />

      <rect x={150} y={248} width={420} height={118} rx={22} fill="rgba(19,16,23,0.55)" stroke="rgba(255,255,255,0.12)" strokeWidth={1.4} />
      <text
        x={360} y={286}
        textAnchor="middle"
        fill="var(--color-on-surface)"
        style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800 }}
      >
        Same tool layer. Same data.
      </text>
      <text
        x={360} y={308}
        textAnchor="middle"
        fill="var(--color-on-surface-variant)"
        style={{ fontFamily: "var(--font-sans)", fontSize: 12 }}
      >
        tasks · timer · music · analytics
      </text>
      <g>
        {["create_task", "start_timer", "get_stats"].map((t, i) => (
          <g key={t}>
            <rect x={196 + i * 112} y={322} width={100} height={26} rx={13} fill="rgba(255,95,162,0.10)" stroke="rgba(255,95,162,0.28)" />
            <text
              x={246 + i * 112} y={339}
              textAnchor="middle"
              fill="var(--color-primary)"
              style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, fontWeight: 600 }}
            >
              {t}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function Mobile() {
  const cards = [
    { title: "You", sub: "Pick a task. Run the ring.", tone: "rgba(255,255,255,0.06)" },
    { title: "FocusSpace core", sub: "One workspace. Your data.", tone: "color-mix(in srgb, var(--color-primary) 14%, transparent)" },
    { title: "Ask AI · in-app", sub: "Type it. Tools run. Board updates.", tone: "color-mix(in srgb, #8fb6ff 16%, transparent)" },
    { title: "Hermes / OpenClaw · MCP", sub: "Agents use the same tools you do.", tone: "color-mix(in srgb, var(--color-secondary) 16%, transparent)" },
    { title: "Same tool layer", sub: "tasks · timer · music · analytics", tone: "rgba(255,255,255,0.05)" },
  ];

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {cards.map((c, i) => (
        <motion.div
          key={c.title}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
          className="glass"
          style={{ borderRadius: 20, padding: "14px 16px", background: c.tone }}
        >
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5, color: "var(--color-on-surface)" }}>
            {c.title}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", marginTop: 3 }}>{c.sub}</p>
        </motion.div>
      ))}
    </div>
  );
}

export function HowItWorksDiagram() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass overflow-hidden"
      style={{ borderRadius: 24, padding: "18px 12px 10px" }}
    >
      <div className="hidden md:block">
        <Desktop />
      </div>
      <div className="md:hidden" style={{ padding: 6 }}>
        <Mobile />
      </div>
    </motion.div>
  );
}
