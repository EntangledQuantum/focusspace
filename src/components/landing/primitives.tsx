"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

export const NAV_BG: React.CSSProperties = {
  background: "color-mix(in srgb, var(--color-surface-container) 88%, transparent)",
  backdropFilter: "blur(24px) saturate(140%)",
  WebkitBackdropFilter: "blur(24px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 18px 48px -16px rgba(0,0,0,0.6)",
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span
      className="pill chip-primary"
      style={{ padding: "4px 11px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}
    >
      {children}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  copy,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  copy: string;
  align?: "left" | "center";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: EASE }}
      className={`flex flex-col ${align === "center" ? "items-center text-center" : "items-start text-left"}`}
      style={{ gap: 12, maxWidth: align === "center" ? 640 : 520 }}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          letterSpacing: "-.03em",
          fontSize: "clamp(28px, 4.2vw, 42px)",
          lineHeight: 1.12,
          color: "var(--color-on-surface)",
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--color-on-surface-variant)" }}>{copy}</p>
    </motion.div>
  );
}

export function LandingSection({
  id,
  children,
  pad = true,
}: {
  id: string;
  children: ReactNode;
  pad?: boolean;
}) {
  return (
    <section
      id={id}
      className="landing-section w-full"
      style={{ padding: pad ? "92px 0 8px" : undefined }}
    >
      {children}
    </section>
  );
}

export function StartCta({
  isLocal,
  onStart,
  children,
  size = "md",
}: {
  isLocal: boolean;
  onStart: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "8px 16px" : "13px 26px";
  const fontSize = size === "sm" ? 13.5 : 15;
  const style: React.CSSProperties = {
    padding: pad,
    fontSize,
    fontWeight: 700,
    color: "var(--color-on-primary)",
    boxShadow: "0 14px 40px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)",
  };

  if (isLocal) {
    return (
      <Link href="/focus" className="pill hover-lift grad-primary" style={style}>
        {children} <ArrowRight size={size === "sm" ? 14 : 16} />
      </Link>
    );
  }

  return (
    <button type="button" onClick={onStart} className="pill hover-lift grad-primary" style={style}>
      {children} <ArrowRight size={size === "sm" ? 14 : 16} />
    </button>
  );
}
