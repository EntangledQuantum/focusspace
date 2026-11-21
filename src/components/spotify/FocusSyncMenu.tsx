"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Timer } from "lucide-react";
import { useMusicPrefs, type MusicSettingsPatch } from "@/lib/hooks/useMusicPrefs";

const ROWS: { key: keyof MusicSettingsPatch; label: string; hint: string }[] = [
  { key: "spotify_auto_start", label: "Play when focus starts", hint: "Starts your pick, or resumes what's paused" },
  { key: "spotify_auto_pause", label: "Pause when focus ends", hint: "Breaks, timer pause, stop" },
  { key: "spotify_resume_on_focus", label: "Resume on next focus", hint: "Continues music that was auto-paused" },
];

const POPOVER_WIDTH = 260;

/**
 * Small "music follows focus" control for the Spotify panel header. Same
 * per-user settings as Settings → Music. Portaled to <body> because the dock
 * clips overflow and sits in a transformed ancestor.
 */
export function FocusSyncMenu() {
  const { settings, prefs, update } = useMusicPrefs();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setAnchor(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const values: Record<keyof MusicSettingsPatch, boolean> = {
    spotify_auto_start: prefs.autoPlay,
    spotify_auto_pause: prefs.autoPause,
    spotify_resume_on_focus: prefs.resumeOnFocus,
    spotify_takeover: prefs.takeover,
  };
  const anyOn = prefs.autoPlay || prefs.autoPause || prefs.resumeOnFocus;

  let pos: { top: number; left: number } | null = null;
  if (anchor && typeof window !== "undefined") {
    const left = Math.min(
      Math.max(8, anchor.left + anchor.width / 2 - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - 8,
    );
    // Prefer below the button; flip above when the dock sits at the bottom.
    const below = anchor.bottom + 8;
    const top = below + 190 > window.innerHeight ? Math.max(8, anchor.top - 8 - 190) : below;
    pos = { top, left };
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setAnchor(open ? null : btnRef.current?.getBoundingClientRect() ?? null)}
        title="Music follows focus"
        aria-expanded={open}
        disabled={!settings}
        className="flex items-center shrink-0 rounded-full transition-all active:scale-95 disabled:opacity-40"
        style={{
          gap: 4, padding: "2px 7px", fontSize: 10, fontWeight: 600,
          color: anyOn ? "#1DB954" : "var(--color-on-surface-variant)",
          background: anyOn ? "rgba(29,185,84,0.12)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${anyOn ? "rgba(29,185,84,0.25)" : "rgba(255,255,255,0.07)"}`,
        }}
      >
        <Timer size={10} />
        Focus sync
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Music follows focus"
          className="fixed z-[95]"
          style={{
            top: pos.top, left: pos.left, width: POPOVER_WIDTH, padding: 8,
            borderRadius: 16,
            background: "color-mix(in srgb, var(--color-surface-container) 94%, transparent)",
            backdropFilter: "blur(24px) saturate(140%)",
            WebkitBackdropFilter: "blur(24px) saturate(140%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 20px 50px -16px rgba(0,0,0,0.6)",
          }}
        >
          <p
            className="uppercase"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--color-on-surface-variant)", opacity: 0.8, padding: "4px 8px 6px" }}
          >
            Music follows focus
          </p>
          {ROWS.map((row) => {
            const on = values[row.key];
            return (
              <button
                key={row.key}
                role="switch"
                aria-checked={on}
                onClick={() => update({ [row.key]: !on })}
                className="w-full flex items-center text-left rounded-xl transition-colors hover:bg-white/5"
                style={{ gap: 10, padding: "7px 8px" }}
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-on-surface)" }}>{row.label}</span>
                  <span className="block truncate" style={{ fontSize: 10.5, color: "var(--color-on-surface-variant)", opacity: 0.8 }}>{row.hint}</span>
                </span>
                <span
                  className="flex shrink-0"
                  style={{
                    width: 30, height: 18, borderRadius: 99, padding: 2,
                    justifyContent: on ? "flex-end" : "flex-start",
                    background: on ? "#1DB954" : "rgba(255,255,255,0.13)",
                    transition: "background .2s",
                  }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff" }} />
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
