"use client";

import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

function Desktop() {
  return (
    <svg viewBox="0 0 720 380" className="w-full h-auto" role="img" aria-label="Hermes and OpenClaw connect to FocusSpace over MCP">
      <defs>
        <linearGradient id="mcp-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5fa2" />
          <stop offset="100%" stopColor="#b06bf6" />
        </linearGradient>
        <linearGradient id="mcp-bus" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8fb6ff" />
          <stop offset="100%" stopColor="#b06bf6" />
        </linearGradient>
        <filter id="mcp-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="10" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="mcp-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 1.4 L 10 5 L 0 8.6 Z" fill="#b06bf6" />
        </marker>
      </defs>

      {/* Hermes → MCP */}
      <path className="landing-flow" d="M 176 78 C 260 78, 280 168, 300 188" fill="none" stroke="#ff5fa2" strokeWidth="1.8" markerEnd="url(#mcp-ah)" />
      {/* OpenClaw → MCP */}
      <path className="landing-flow-slow" d="M 176 302 C 260 302, 280 212, 300 196" fill="none" stroke="#8fb6ff" strokeWidth="1.8" markerEnd="url(#mcp-ah)" />
      {/* MCP → tools */}
      <path className="landing-flow" d="M 420 190 H 508" fill="none" stroke="url(#mcp-bus)" strokeWidth="1.9" markerEnd="url(#mcp-ah)" />

      {/* Agents */}
      <rect x={28} y={36} width={148} height={84} rx={20} fill="rgba(255,95,162,0.10)" stroke="rgba(255,95,162,0.38)" />
      <text x={102} y={74} textAnchor="middle" fill="var(--color-on-surface)" style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800 }}>Hermes</text>
      <text x={102} y={94} textAnchor="middle" fill="var(--color-on-surface-variant)" style={{ fontFamily: "var(--font-sans)", fontSize: 11 }}>desktop agent</text>

      <rect x={28} y={260} width={148} height={84} rx={20} fill="rgba(143,182,255,0.10)" stroke="rgba(143,182,255,0.38)" />
      <text x={102} y={298} textAnchor="middle" fill="var(--color-on-surface)" style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800 }}>OpenClaw</text>
      <text x={102} y={318} textAnchor="middle" fill="var(--color-on-surface-variant)" style={{ fontFamily: "var(--font-sans)", fontSize: 11 }}>desktop agent</text>

      {/* MCP bus */}
      <g filter="url(#mcp-glow)">
        <rect x={300} y={148} width={120} height={84} rx={22} fill="rgba(176,107,246,0.16)" stroke="url(#mcp-stroke)" strokeWidth="1.8" />
      </g>
      <text x={360} y={186} textAnchor="middle" fill="var(--color-on-surface)" style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800 }}>MCP</text>
      <text x={360} y={206} textAnchor="middle" fill="var(--color-on-surface-variant)" style={{ fontFamily: "var(--font-sans)", fontSize: 11 }}>one protocol</text>

      {/* FocusSpace tools */}
      <rect x={508} y={78} width={184} height={224} rx={22} fill="rgba(19,16,23,0.55)" stroke="rgba(255,255,255,0.12)" />
      <text x={600} y={112} textAnchor="middle" fill="var(--color-on-surface)" style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800 }}>FocusSpace</text>
      <text x={600} y={130} textAnchor="middle" fill="var(--color-on-surface-variant)" style={{ fontFamily: "var(--font-sans)", fontSize: 11 }}>local · no login</text>
      {["tasks & subtasks", "start / pause timer", "analytics", "asks before the ring"].map((label, i) => (
        <g key={label}>
          <rect x={528} y={148 + i * 34} width={144} height={26} rx={13} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" />
          <text x={600} y={165 + i * 34} textAnchor="middle" fill="var(--color-on-surface)" style={{ fontFamily: "var(--font-sans)", fontSize: 11 }}>
            {label}
          </text>
        </g>
      ))}

      <text x={360} y={364} textAnchor="middle" fill="var(--color-on-surface-variant)" style={{ fontFamily: "var(--font-sans)", fontSize: 11.5 }}>
        Paste the one-liner. The agent installs the app and wires the tools.
      </text>
    </svg>
  );
}

const MOBILE = [
  { title: "Hermes or OpenClaw", sub: "The agents that work today. iOS and Android are planned." },
  { title: "MCP", sub: "One protocol into the same tool layer a human uses." },
  { title: "Local FocusSpace", sub: "No login. SQLite on the machine. Tasks, timer, analytics." },
  { title: "Then it asks", sub: "After adding a task, the agent asks before starting the timer." },
];

export function McpDiagram() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass overflow-hidden"
      style={{ borderRadius: 24, padding: "16px 10px 8px" }}
    >
      <div className="hidden md:block">
        <Desktop />
      </div>
      <div className="md:hidden flex flex-col" style={{ gap: 10, padding: 8 }}>
        {MOBILE.map((c) => (
          <div key={c.title} className="glass-soft" style={{ borderRadius: 18, padding: "14px 16px" }}>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5, color: "var(--color-on-surface)" }}>
              {c.title}
            </p>
            <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", marginTop: 4 }}>{c.sub}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
