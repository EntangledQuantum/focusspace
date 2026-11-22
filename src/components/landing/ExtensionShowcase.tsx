"use client";

import { motion } from "framer-motion";
import { Check, Download, Pause, SkipBack, SkipForward } from "lucide-react";
import { REPO_URL } from "@/components/layout/SiteFooter";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Always redirects to the newest extension zip on GitHub Releases. */
export const EXTENSION_DOWNLOAD_URL = "/extension/download";
const INSTALL_GUIDE_URL = `${REPO_URL}/tree/master/extension#readme`;

const STEPS = [
  "Download and unzip",
  "chrome://extensions → Developer mode → Load unpacked",
  "Click the icon → Log in",
];

/** Landing-page block for the Chrome extension: copy + download on the left, a popup mock on the right. */
export function ExtensionShowcase() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 items-center" style={{ gap: 36 }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-col items-start"
        style={{ gap: 14 }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-primary)" }}>
            Chrome extension
          </span>
          <span className="pill chip-primary" style={{ padding: "2px 8px", fontSize: 10.5, fontWeight: 700 }}>Beta</span>
        </div>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "-.03em", fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.08, color: "var(--color-on-surface)" }}>
          Your focus, one click away.
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--color-on-surface-variant)", maxWidth: 520 }}>
          The timer, your task and its subtasks, and what&apos;s playing — right in the toolbar.
          Open the side panel for your projects, Focus AI and Spotify search. One shared clock:
          every tab and the extension show the same time, even with the site closed.
        </p>

        <div className="flex flex-wrap items-center" style={{ gap: 10, marginTop: 4 }}>
          <a
            href={EXTENSION_DOWNLOAD_URL}
            className="pill hover-lift grad-primary"
            style={{ padding: "12px 22px", fontSize: 14.5, fontWeight: 700, color: "var(--color-on-primary)", boxShadow: "0 14px 40px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)" }}
          >
            <Download size={16} /> Download for Chrome
          </a>
          <a
            href={INSTALL_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="pill nav-link-hover"
            style={{ padding: "11px 16px", fontSize: 13.5, color: "var(--color-on-surface-variant)", border: "1px solid rgba(var(--ink), 0.10)" }}
          >
            Install guide
          </a>
        </div>

        <ol className="flex flex-col" style={{ gap: 6, marginTop: 6, fontSize: 12.5, color: "var(--color-on-surface-variant)" }}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center" style={{ gap: 8 }}>
              <span
                className="flex items-center justify-center shrink-0"
                style={{ width: 18, height: 18, borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: "var(--color-primary)", background: "color-mix(in srgb, var(--color-primary) 14%, transparent)" }}
              >
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </motion.div>

      <PopupMock />
    </div>
  );
}

function PopupMock() {
  const subtasks = [
    { t: "Outline the post", done: true },
    { t: "Draft the intro", done: true },
    { t: "Pick screenshots", done: false },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
      className="glass mx-auto w-full"
      aria-hidden
      style={{ maxWidth: 340, borderRadius: 22, padding: 18, boxShadow: "0 30px 80px -30px color-mix(in srgb, var(--color-primary) 45%, transparent)" }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, color: "var(--color-on-surface)" }}>FocusSpace</span>
        <span className="pill chip-primary" style={{ padding: "2px 9px", fontSize: 10.5, fontWeight: 700 }}>Focus</span>
      </div>

      <div className="flex flex-col items-center" style={{ gap: 4 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 46, letterSpacing: "-.02em", color: "var(--color-on-surface)", lineHeight: 1 }}>
          18:42
        </span>
        <span style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)" }}>Writing · pomodoro 2 of 4</span>
        <div style={{ width: "100%", height: 4, borderRadius: 4, background: "rgba(var(--ink), 0.08)", marginTop: 10, overflow: "hidden" }}>
          <div className="grad-primary" style={{ width: "25%", height: "100%" }} />
        </div>
      </div>

      <div className="flex items-center justify-center" style={{ gap: 10, margin: "14px 0" }}>
        <span className="flex items-center justify-center grad-primary" style={{ width: 40, height: 40, borderRadius: 999, color: "var(--color-on-primary)" }}>
          <Pause size={17} />
        </span>
        <span className="pill" style={{ padding: "7px 12px", fontSize: 12, color: "var(--color-on-surface-variant)", background: "rgba(var(--ink), 0.06)" }}>Skip</span>
        <span className="pill" style={{ padding: "7px 12px", fontSize: 12, color: "var(--color-on-surface-variant)", background: "rgba(var(--ink), 0.06)" }}>Stop</span>
      </div>

      <div style={{ borderTop: "1px solid rgba(var(--ink), 0.07)", paddingTop: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-on-surface)" }}>Ship the launch blog post</p>
        <div className="flex flex-col" style={{ gap: 6, marginTop: 8 }}>
          {subtasks.map((s) => (
            <div key={s.t} className="flex items-center" style={{ gap: 8, fontSize: 12, color: "var(--color-on-surface-variant)" }}>
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 15, height: 15, borderRadius: 5,
                  border: s.done ? "none" : "1px solid rgba(var(--ink), 0.25)",
                  background: s.done ? "var(--color-primary)" : "transparent",
                  color: "var(--color-on-primary)",
                }}
              >
                {s.done && <Check size={10} strokeWidth={3} />}
              </span>
              <span style={{ textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.7 : 1 }}>{s.t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center" style={{ gap: 10, marginTop: 14, padding: 10, borderRadius: 14, background: "rgba(var(--ink), 0.05)" }}>
        <span className="shrink-0 grad-primary" style={{ width: 34, height: 34, borderRadius: 9, opacity: 0.85 }} />
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-on-surface)" }}>Weightless</p>
          <p style={{ fontSize: 11, color: "var(--color-on-surface-variant)" }}>Marconi Union</p>
        </div>
        <div className="flex items-center" style={{ gap: 8, color: "var(--color-on-surface-variant)" }}>
          <SkipBack size={13} /> <Pause size={13} /> <SkipForward size={13} />
        </div>
      </div>
    </motion.div>
  );
}
