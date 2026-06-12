"use client";

import Image from "next/image";
import appIcon from "@/app/icon.png";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Timer, FolderKanban, BarChart2, Sparkles, Headphones, Shrink, ArrowRight,
  CheckCircle2, Circle,
} from "lucide-react";
import { AnimatedBackdrop } from "@/components/effects/AnimatedBackdrop";
import { AuthModal } from "@/components/auth/AuthModal";

const ROTATING = ["focus", "flow", "deep work", "momentum"];

const NAV_BG: React.CSSProperties = {
  background: "color-mix(in srgb, var(--color-surface-container) 88%, transparent)",
  backdropFilter: "blur(24px) saturate(1.4)",
  WebkitBackdropFilter: "blur(24px) saturate(1.4)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 18px 48px -16px rgba(0,0,0,0.6)",
};

/* ── animated accents for the feature cards ─────────────────────── */

function TimerVisual() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
      <circle
        className="ring-loop"
        cx="22" cy="22" r="18" fill="none"
        stroke="url(#feat-ring)" strokeWidth="4" strokeLinecap="round"
        strokeDasharray="113"
      />
      <defs>
        <linearGradient id="feat-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-secondary)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function TasksVisual() {
  return (
    <div className="flex flex-col" style={{ gap: 5 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="float-tick flex items-center" style={{ gap: 6, animationDelay: `${i * 0.45}s` }}>
          {i === 0
            ? <CheckCircle2 size={12} style={{ color: "var(--color-primary)" }} />
            : <Circle size={12} style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }} />}
          <div
            className="rounded-full"
            style={{
              height: 4, width: 36 - i * 8,
              background: i === 0
                ? "linear-gradient(90deg, var(--color-primary), var(--color-secondary))"
                : "rgba(255,255,255,0.14)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function MusicVisual() {
  return (
    <div className="flex items-end" style={{ gap: 4, height: 40 }}>
      {[0.9, 0.55, 1, 0.4, 0.75, 0.6].map((h, i) => (
        <div
          key={i}
          className="eq-bar rounded-full"
          style={{
            width: 5, height: 40 * h,
            background: i % 2 === 0
              ? "linear-gradient(to top, var(--color-primary), var(--color-secondary))"
              : "rgba(29,185,84,0.85)",
            animationDelay: `${i * 0.15}s`,
            animationDuration: `${1 + (i % 3) * 0.25}s`,
          }}
        />
      ))}
    </div>
  );
}

function ChartVisual() {
  return (
    <div className="flex items-end" style={{ gap: 5, height: 40 }}>
      {[0.45, 0.7, 0.35, 1, 0.6].map((h, i) => (
        <div
          key={i}
          className="rise-bar rounded-md"
          style={{
            width: 9, height: 40 * h,
            background: "linear-gradient(to top, var(--color-primary), var(--color-secondary))",
            animationDelay: `${i * 0.3}s`,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}

function WallpaperVisual() {
  return (
    <div className="relative overflow-hidden rounded-xl" style={{ width: 56, height: 40, background: "#160a18" }}>
      <div
        className="blob-shift absolute rounded-full"
        style={{ width: 36, height: 36, top: -8, left: -6, background: "rgba(255,95,162,0.6)", filter: "blur(10px)" }}
      />
      <div
        className="blob-shift absolute rounded-full"
        style={{ width: 32, height: 32, bottom: -10, right: -6, background: "rgba(176,107,246,0.6)", filter: "blur(10px)", animationDelay: "1.4s" }}
      />
    </div>
  );
}

function FocusModeVisual() {
  return (
    <div className="relative" style={{ width: 48, height: 40 }}>
      <div
        className="absolute rounded-lg"
        style={{ inset: 0, border: "1.5px solid rgba(255,255,255,0.16)" }}
      />
      <div
        className="pulse-dot absolute rounded-full grad-primary"
        style={{ width: 12, height: 12, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
      />
    </div>
  );
}

const FEATURES = [
  {
    icon: Timer,
    visual: <TimerVisual />,
    title: "Pomodoro, perfected",
    desc: "Task-aware session timelines, smart breaks, auto-start — a timer that knows where you are.",
  },
  {
    icon: FolderKanban,
    visual: <TasksVisual />,
    title: "Projects & subtasks",
    desc: "Break work down with descriptions, subtasks, tags and one-tap Run straight into a session.",
  },
  {
    icon: Headphones,
    visual: <MusicVisual />,
    title: "Spotify built in",
    desc: "Search, playlists and playback in your dock — it can even take over from your phone.",
  },
  {
    icon: BarChart2,
    visual: <ChartVisual />,
    title: "Analytics & streaks",
    desc: "Heatmaps, daily charts and streaks that show your deep-work hours adding up.",
  },
  {
    icon: Sparkles,
    visual: <WallpaperVisual />,
    title: "Living wallpapers",
    desc: "Animated auroras, rain, snow, starfields — generated in code — or your own photos.",
  },
  {
    icon: Shrink,
    visual: <FocusModeVisual />,
    title: "Focus mode",
    desc: "One tap hides everything but the ring. A pop-out mini player follows you anywhere.",
  },
];

/** Live demo ring — endlessly counts down with the gradient stroke. */
function DemoRing() {
  const R = 88;
  const C = 2 * Math.PI * R;
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 0 ? 25 * 60 : s - 7));
    }, 120);
    return () => clearInterval(id);
  }, []);

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const progress = 1 - secondsLeft / (25 * 60);

  return (
    <div className="relative" style={{ width: 220, height: 220, display: "grid", placeItems: "center" }}>
      <div
        className="absolute rounded-full"
        style={{
          width: 210, height: 210,
          background: "radial-gradient(circle, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 68%)",
          filter: "blur(8px)",
        }}
      />
      <svg width="220" height="220" viewBox="0 0 220 220" style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="landing-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-secondary)" />
          </linearGradient>
        </defs>
        <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="6" />
        <circle
          cx="110" cy="110" r={R} fill="none"
          stroke="url(#landing-ring)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
          style={{ filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--color-primary) 45%, transparent))" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 600,
            letterSpacing: "-.03em", color: "var(--color-on-surface)",
          }}
        >
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--color-on-surface-variant)" }}>
          <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--color-primary)" }} />
          deep work in progress
        </span>
      </div>
    </div>
  );
}

/** Opens the auth modal automatically when the auth callback bounced with ?error= */
function AuthErrorWatcher({ onError }: { onError: (code: string) => void }) {
  const searchParams = useSearchParams();
  const err = searchParams.get("error");
  useEffect(() => {
    if (err) onError(err);
  }, [err, onError]);
  return null;
}

export default function LandingPage() {
  const [wordIdx, setWordIdx] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setWordIdx((i) => (i + 1) % ROTATING.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-dvh overflow-y-auto overflow-x-hidden">
      <Suspense fallback={null}>
        <AuthErrorWatcher onError={(code) => { setUrlError(code); setAuthOpen(true); }} />
      </Suspense>

      {/* Living background — drifts with your cursor, bursts on click */}
      <div className="wp-noir fixed inset-0 z-0">
        <AnimatedBackdrop variant="aurora" interactive intensity={0.26} className="absolute inset-0" />
      </div>

      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-center" style={{ padding: "16px 18px" }}>
        <nav
          className="flex items-center w-full"
          style={{ ...NAV_BG, maxWidth: 880, gap: 10, borderRadius: 999, padding: "8px 10px 8px 12px" }}
        >
          <Image src={appIcon} alt="FocusSpace" width={30} height={30} className="rounded-[9px] shrink-0" />
          <span
            style={{
              fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15.5,
              letterSpacing: "-.01em", color: "var(--color-on-surface)",
            }}
          >
            FocusSpace
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setAuthOpen(true)}
            className="pill hover-lift grad-primary"
            style={{
              padding: "8px 16px", fontSize: 13.5, color: "var(--color-on-primary)",
              boxShadow: "0 6px 20px -6px color-mix(in srgb, var(--color-primary) 60%, transparent)",
            }}
          >
            Get started <ArrowRight size={14} />
          </button>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center" style={{ padding: "0 20px" }}>
        <section
          className="w-full flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20"
          style={{ maxWidth: 980, minHeight: "92dvh", paddingTop: 96 }}
        >
          <div className="fade-up flex flex-col items-center lg:items-start text-center lg:text-left" style={{ maxWidth: 520 }}>
            <h1
              style={{
                fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "-.03em",
                fontSize: "clamp(40px, 6vw, 64px)", lineHeight: 1.05,
                color: "var(--color-on-surface)",
              }}
            >
              Find your{" "}
              <span className="inline-grid text-left align-baseline" style={{ minWidth: "5.2em" }}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={ROTATING[wordIdx]}
                    initial={{ y: 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -18, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      gridArea: "1 / 1",
                      background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    {ROTATING[wordIdx]}.
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>

            <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--color-on-surface-variant)", marginTop: 16, maxWidth: 440 }}>
              One task, one timer, your music, and a wallpaper that breathes.
              FocusSpace is the pomodoro tracker that keeps you accountable — not entertained.
            </p>

            <div style={{ marginTop: 26 }}>
              <button
                onClick={() => setAuthOpen(true)}
                className="pill hover-lift grad-primary"
                style={{
                  padding: "13px 26px", fontSize: 15, fontWeight: 700, color: "var(--color-on-primary)",
                  boxShadow: "0 14px 40px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)",
                }}
              >
                Start focusing — it&apos;s free <ArrowRight size={16} />
              </button>
            </div>

            <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.7, marginTop: 14 }}>
              Click anywhere — the space reacts to you.
            </p>
          </div>

          <div className="fade-up shrink-0">
            <DemoRing />
          </div>
        </section>

        {/* Features */}
        <section className="w-full" style={{ maxWidth: 980, paddingBottom: 24 }}>
          <h2
            className="text-center"
            style={{
              fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800,
              letterSpacing: "-.02em", color: "var(--color-on-surface)", marginBottom: 8,
            }}
          >
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className="text-center" style={{ fontSize: 14, color: "var(--color-on-surface-variant)", marginBottom: 28 }}>
            Compact on purpose — the app is the focus, these are the tools.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 14 }}>
            {FEATURES.map(({ icon: Icon, visual, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: (i % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="glass hover-lift relative overflow-hidden"
                style={{ borderRadius: 20, padding: 18 }}
              >
                <div className="flex items-start justify-between" style={{ marginBottom: 12 }}>
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 34, height: 34, borderRadius: 11,
                      color: "var(--color-primary)",
                      background: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                    }}
                  >
                    <Icon size={17} />
                  </div>
                  <div style={{ opacity: 0.9 }}>{visual}</div>
                </div>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--color-on-surface)" }}>
                  {title}
                </p>
                <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-on-surface-variant)", marginTop: 5 }}>
                  {desc}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="flex flex-col items-center" style={{ marginTop: 48, marginBottom: 56 }}>
            <button
              onClick={() => setAuthOpen(true)}
              className="pill hover-lift grad-primary"
              style={{
                padding: "13px 28px", fontSize: 15, fontWeight: 700, color: "var(--color-on-primary)",
                boxShadow: "0 14px 40px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)",
              }}
            >
              Start focusing — it&apos;s free <ArrowRight size={16} />
            </button>
            <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.7, marginTop: 18 }}>
              FocusSpace · pick one task, run the timer, review the data.
            </p>
          </div>
        </section>
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} urlError={urlError} />
    </div>
  );
}
