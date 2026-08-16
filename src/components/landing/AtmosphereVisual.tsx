"use client";

import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

export function AtmosphereVisual() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="relative overflow-hidden"
      style={{ borderRadius: 24, minHeight: 320, border: "1px solid rgba(255,255,255,0.10)" }}
    >
      <div className="absolute inset-0 wp-aurora" />
      <div
        className="blob-shift absolute rounded-full"
        style={{ width: 180, height: 180, top: -40, left: -30, background: "rgba(255,95,162,0.45)", filter: "blur(36px)" }}
      />
      <div
        className="blob-shift absolute rounded-full"
        style={{ width: 160, height: 160, bottom: -36, right: -20, background: "rgba(176,107,246,0.42)", filter: "blur(36px)", animationDelay: "1.4s" }}
      />

      <div className="relative z-10 flex flex-col items-center" style={{ padding: "28px 20px 18px", gap: 18 }}>
        <span className="pill chip-primary" style={{ padding: "3px 10px", fontSize: 11 }}>Focus mode</span>

        <div className="relative" style={{ width: 132, height: 132, display: "grid", placeItems: "center" }}>
          <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: "rotate(-90deg)" }} aria-hidden>
            <circle cx="66" cy="66" r="54" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="6" />
            <circle
              className="ring-loop"
              cx="66" cy="66" r="54" fill="none"
              stroke="url(#atmo-ring)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray="339"
            />
            <defs>
              <linearGradient id="atmo-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff5fa2" />
                <stop offset="100%" stopColor="#b06bf6" />
              </linearGradient>
            </defs>
          </svg>
          <p className="tabular-nums absolute" style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: "var(--color-on-surface)" }}>
            24:12
          </p>
        </div>

        <div className="w-full glass" style={{ borderRadius: 18, padding: "12px 14px", marginTop: 8 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <div className="flex items-end shrink-0" style={{ gap: 3, height: 22 }}>
              {[0.7, 1, 0.55, 0.9].map((h, i) => (
                <div
                  key={i}
                  className="eq-bar rounded-full"
                  style={{
                    width: 3.5,
                    height: 22 * h,
                    background: i % 2 === 0 ? "var(--color-primary)" : "rgba(29,185,84,0.85)",
                    animationDelay: `${i * 0.14}s`,
                  }}
                />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-on-surface)" }}>Deep Work mix</p>
              <p style={{ fontSize: 11, color: "var(--color-on-surface-variant)" }}>Spotify · in the dock</p>
            </div>
          </div>
        </div>

        <div className="w-full flex" style={{ gap: 10 }}>
          <div className="flex-1 glass-soft" style={{ borderRadius: 14, padding: "8px 10px" }}>
            <p style={{ fontSize: 10.5, color: "var(--color-on-surface-variant)" }}>Tint</p>
            <div className="rounded-full" style={{ height: 4, marginTop: 6, background: "rgba(255,255,255,0.12)" }}>
              <div className="rounded-full h-full" style={{ width: "55%", background: "var(--color-primary)" }} />
            </div>
          </div>
          <div className="flex-1 glass-soft" style={{ borderRadius: 14, padding: "8px 10px" }}>
            <p style={{ fontSize: 10.5, color: "var(--color-on-surface-variant)" }}>Blur</p>
            <div className="rounded-full" style={{ height: 4, marginTop: 6, background: "rgba(255,255,255,0.12)" }}>
              <div className="rounded-full h-full" style={{ width: "70%", background: "var(--color-secondary)" }} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
