"use client";

import Image from "next/image";
import Link from "next/link";
import appIcon from "@/app/icon.png";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Smartphone, UserRound } from "lucide-react";
import { Toaster } from "sonner";
import { AnimatedBackdrop } from "@/components/effects/AnimatedBackdrop";
import { AuthModal } from "@/components/auth/AuthModal";
import { GithubMark, REPO_URL, SiteFooter } from "@/components/layout/SiteFooter";
import { isLocalMode } from "@/lib/mode";
import { CopyInstallBox } from "@/components/landing/CopyInstallBox";
import { DemoRing } from "@/components/landing/DemoRing";
import { HowItWorksDiagram } from "@/components/landing/HowItWorksDiagram";
import { AskAIDiagram } from "@/components/landing/AskAIDiagram";
import { McpDiagram } from "@/components/landing/McpDiagram";
import { PomodoroVisual } from "@/components/landing/PomodoroVisual";
import { ProjectsVisual } from "@/components/landing/ProjectsVisual";
import { AnalyticsVisual } from "@/components/landing/AnalyticsVisual";
import { AtmosphereVisual } from "@/components/landing/AtmosphereVisual";
import { LandingSection, NAV_BG, SectionHead, StartCta } from "@/components/landing/primitives";

const ROTATING = ["focus", "flow", "deep work", "momentum"];
const LOCAL = isLocalMode();

const NAV_LINKS = [
  { href: "#pomodoro", label: "Pomodoro" },
  { href: "#ai", label: "AI" },
  { href: "#agents", label: "Agents" },
  { href: "#analytics", label: "Analytics" },
  { href: "#open-source", label: "Open source" },
] as const;

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

  function openStart() {
    setAuthOpen(true);
  }

  return (
    <div className="landing-scroll relative h-dvh overflow-y-auto overflow-x-hidden">
      {!LOCAL && (
        <Suspense fallback={null}>
          <AuthErrorWatcher onError={(code) => { setUrlError(code); setAuthOpen(true); }} />
        </Suspense>
      )}

      <div className="wp-noir fixed inset-0 z-0">
        <AnimatedBackdrop variant="aurora" interactive intensity={0.26} className="absolute inset-0" />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 flex justify-center" style={{ padding: "14px 16px" }}>
        <nav
          className="flex flex-col w-full"
          style={{ ...NAV_BG, maxWidth: 1040, borderRadius: 24, padding: "8px 10px" }}
        >
          <div className="flex items-center w-full" style={{ gap: 8 }}>
            <Image src={appIcon} alt="FocusSpace" width={30} height={30} className="rounded-[9px] shrink-0" />
            <span
              style={{
                fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15.5,
                letterSpacing: "-.01em", color: "var(--color-on-surface)",
              }}
            >
              FocusSpace
            </span>

            <div className="hidden lg:flex items-center flex-1 justify-center" style={{ gap: 2 }}>
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="pill nav-link-hover"
                  style={{ padding: "6px 11px", fontSize: 13, color: "var(--color-on-surface-variant)" }}
                >
                  {l.label}
                </a>
              ))}
              <Link
                href="/for-agents"
                className="pill nav-link-hover"
                style={{ padding: "6px 11px", fontSize: 13, color: "var(--color-on-surface-variant)" }}
              >
                For agents
              </Link>
            </div>

            <div className="flex-1 lg:hidden" />
            <StartCta isLocal={LOCAL} onStart={openStart} size="sm">
              {LOCAL ? "Open FocusSpace" : "Get started"}
            </StartCta>
          </div>
          <div className="flex lg:hidden overflow-x-auto no-scrollbar" style={{ gap: 2, padding: "6px 2px 2px" }}>
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="pill nav-link-hover shrink-0"
                style={{ padding: "5px 10px", fontSize: 12.5, color: "var(--color-on-surface-variant)" }}
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/for-agents"
              className="pill nav-link-hover shrink-0"
              style={{ padding: "5px 10px", fontSize: 12.5, color: "var(--color-on-surface-variant)" }}
            >
              For agents
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10 flex flex-col items-center" style={{ padding: "0 20px" }}>
        <div className="w-full" style={{ maxWidth: 1040 }}>

          {/* ── Hero ─────────────────────────────────────────────── */}
          <section
            className="w-full flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16"
            style={{ minHeight: "92dvh", paddingTop: 108 }}
          >
            <div className="fade-up flex flex-col items-center lg:items-start text-center lg:text-left" style={{ maxWidth: 560 }}>
              <span className="pill chip-primary" style={{ padding: "4px 11px", fontSize: 11.5, marginBottom: 16 }}>
                Fully open source
              </span>
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

              <p style={{ fontSize: 16.5, lineHeight: 1.65, color: "var(--color-on-surface-variant)", marginTop: 18, maxWidth: 480 }}>
                One task, one timer, your music, and a space that disappears around the work.
                FocusSpace is a pomodoro workspace — and the same tools are open to Hermes and OpenClaw.
                Fully open source.
              </p>

              <div className="flex flex-col items-center lg:items-start w-full" style={{ gap: 14, marginTop: 28 }}>
                <StartCta isLocal={LOCAL} onStart={openStart}>
                  {LOCAL ? "Open FocusSpace" : "Start focusing — it's free"}
                </StartCta>
                <CopyInstallBox />
              </div>

              <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.7, marginTop: 14 }}>
                Click anywhere — the space reacts to you.
              </p>
            </div>

            <div className="fade-up shrink-0">
              <DemoRing />
            </div>
          </section>

          {/* ── How it works ─────────────────────────────────────── */}
          <LandingSection id="how">
            <div className="flex flex-col" style={{ gap: 28 }}>
              <SectionHead
                eyebrow="How it works"
                title="One core. Two ways in."
                copy="You, Ask AI, and your agents all hit the same tools and the same data. Nothing forks. The board you see is the board they edit."
              />
              <HowItWorksDiagram />
            </div>
          </LandingSection>

          {/* ── Pomodoro ─────────────────────────────────────────── */}
          <LandingSection id="pomodoro">
            <div className="grid grid-cols-1 lg:grid-cols-2 items-center" style={{ gap: 36 }}>
              <SectionHead
                eyebrow="Pomodoro"
                title="Your length. Your count."
                copy="Focus is 5–120 minutes — you set it. Three pomodoros at 25 minutes is not three at 50. Estimates, including half-pomo leftovers, scale with the length you chose. Sessions stay tied to a task, with smart breaks and a timeline of dots so you can see where you are."
              />
              <PomodoroVisual />
            </div>
          </LandingSection>

          {/* ── Projects ─────────────────────────────────────────── */}
          <LandingSection id="projects">
            <div className="grid grid-cols-1 lg:grid-cols-2 items-center" style={{ gap: 36 }}>
              <div className="lg:order-2">
                <SectionHead
                  eyebrow="Projects & tasks"
                  title="Break it down. Then run."
                  copy="Projects hold tasks. Tasks hold subtasks, tags, notes, and a pomodoro estimate. One tap on Run and you're in the ring with that task already selected."
                />
              </div>
              <div className="lg:order-1">
                <ProjectsVisual />
              </div>
            </div>
          </LandingSection>

          {/* ── Focus AI ─────────────────────────────────────────── */}
          <LandingSection id="ai">
            <div className="flex flex-col" style={{ gap: 24 }}>
              <div className="flex flex-col lg:flex-row lg:items-end justify-between" style={{ gap: 20 }}>
                <SectionHead
                  eyebrow="Focus AI"
                  title="Say it. The board moves."
                  copy="Ask AI is the in-app assistant. Plain language becomes tool calls — add, edit, retag, re-estimate. Deletes wait for a confirm. Conversations stay in your database, not a pile we train on."
                />
                <div className="flex items-center shrink-0" style={{ gap: 14 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/focus-ai.png"
                    alt="Focus AI"
                    style={{ width: 88, height: 88, objectFit: "contain", filter: "drop-shadow(0 12px 30px rgba(90,160,255,0.4))" }}
                  />
                </div>
              </div>
              <AskAIDiagram />
              <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", opacity: 0.75 }}>
                Optional — turn Ask AI off any time in Settings.
              </p>
            </div>
          </LandingSection>

          {/* ── MCP & agents ─────────────────────────────────────── */}
          <LandingSection id="agents">
            <div className="flex flex-col" style={{ gap: 24 }}>
              <SectionHead
                eyebrow="MCP & agents"
                title="Hermes and OpenClaw. Same hands as you."
                copy="Paste the one-liner. The agent installs a local, no-login FocusSpace and wires MCP. It can do everything a human can: tasks, timer, analytics. After it adds a task, it asks before starting the timer. Individual login on a self-host is coming later. iOS and Android are planned — Hermes and OpenClaw work today."
              />
              <McpDiagram />
              <CopyInstallBox />
            </div>
          </LandingSection>

          {/* ── Analytics ────────────────────────────────────────── */}
          <LandingSection id="analytics">
            <div className="grid grid-cols-1 lg:grid-cols-2 items-center" style={{ gap: 36 }}>
              <SectionHead
                eyebrow="Analytics"
                title="The hours, not the dopamine."
                copy="Heatmaps, streaks, breakdowns by project and by tag. The same numbers are available over MCP — an agent can fetch your week, not just look at the charts in the UI."
              />
              <AnalyticsVisual />
            </div>
          </LandingSection>

          {/* ── Atmosphere ───────────────────────────────────────── */}
          <LandingSection id="atmosphere">
            <div className="grid grid-cols-1 lg:grid-cols-2 items-center" style={{ gap: 36 }}>
              <div className="lg:order-2">
                <SectionHead
                  eyebrow="The space"
                  title="It disappears around the work."
                  copy="Spotify lives in the dock. Living wallpapers and weather effects sit behind the glass. Focus mode hides everything but the ring. Tint and blur so the UI sits on your space — not on a stock theme."
                />
              </div>
              <div className="lg:order-1">
                <AtmosphereVisual />
              </div>
            </div>
          </LandingSection>

          {/* ── Open source ──────────────────────────────────────── */}
          <LandingSection id="open-source">
            <div className="flex flex-col" style={{ gap: 24 }}>
              <SectionHead
                align="center"
                eyebrow="Open source & self-host"
                title="Yours to run."
                copy="Clone it. Change it. Host it. Local mode is npm or Docker, SQLite, no login — one implicit user on the machine. The hosted cloud at focusspace.live uses Supabase. Want that stack on your own servers? The README has the steps."
              />

              <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 14 }}>
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="glass"
                  style={{ borderRadius: 24, padding: 22 }}
                >
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--color-on-surface)" }}>
                    Local
                  </p>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-on-surface-variant)", marginTop: 8 }}>
                    npm or Docker. SQLite in ~/.focusspace. No account. Point Hermes or OpenClaw at it and work.
                  </p>
                  <div className="flex flex-wrap" style={{ gap: 8, marginTop: 16 }}>
                    {["npm", "Docker", "SQLite", "No login"].map((c) => (
                      <span key={c} className="pill chip-primary" style={{ padding: "4px 10px", fontSize: 11.5 }}>{c}</span>
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                  className="glass"
                  style={{ borderRadius: 24, padding: 22 }}
                >
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--color-on-surface)" }}>
                    Hosted cloud
                  </p>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-on-surface-variant)", marginTop: 8 }}>
                    focusspace.live — Supabase for auth and data. Sign in and start. Self-hosting the cloud stack is documented on GitHub, not here.
                  </p>
                  <div className="flex flex-wrap" style={{ gap: 8, marginTop: 16 }}>
                    {["Supabase", "Google / email", "focusspace.live"].map((c) => (
                      <span key={c} className="pill chip-accent" style={{ padding: "4px 10px", fontSize: 11.5 }}>{c}</span>
                    ))}
                  </div>
                </motion.div>
              </div>

              <div className="flex justify-center">
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="pill hover-lift"
                  style={{
                    padding: "10px 16px",
                    fontSize: 13.5,
                    color: "var(--color-on-surface)",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <GithubMark size={16} /> View on GitHub <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </LandingSection>

          {/* ── Coming soon ──────────────────────────────────────── */}
          <LandingSection id="coming-soon">
            <div className="flex flex-col" style={{ gap: 24 }}>
              <SectionHead
                align="center"
                eyebrow="Coming soon"
                title="What's already here, and what isn't."
                copy="Hermes and OpenClaw work today. Per-user auth on an individual self-host, plus native iOS and Android apps, are next."
              />
              <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
                {[
                  { icon: UserRound, title: "Per-user login on self-host", body: "Local is one implicit user right now. Individual accounts on a personal install are coming later." },
                  { icon: Smartphone, title: "iOS", body: "A native app is planned. Not shipping yet — Hermes and OpenClaw cover the agent side today." },
                  { icon: Smartphone, title: "Android", body: "Same story. Planned. The desktop agents and the web app are the path that exists now." },
                ].map(({ icon: Icon, title, body }, i) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className="glass"
                    style={{ borderRadius: 22, padding: 18 }}
                  >
                    <div
                      className="flex items-center justify-center"
                      style={{
                        width: 34, height: 34, borderRadius: 11, marginBottom: 12,
                        color: "var(--color-primary)",
                        background: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                      }}
                    >
                      <Icon size={17} />
                    </div>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--color-on-surface)" }}>
                      {title}
                    </p>
                    <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-on-surface-variant)", marginTop: 6 }}>
                      {body}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </LandingSection>

          {/* ── Final CTA ────────────────────────────────────────── */}
          <LandingSection id="start">
            <div className="flex flex-col items-center text-center" style={{ gap: 18, paddingBottom: 72 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  letterSpacing: "-.03em",
                  fontSize: "clamp(28px, 4.4vw, 44px)",
                  color: "var(--color-on-surface)",
                }}
              >
                Sit down. Start the ring.
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--color-on-surface-variant)", maxWidth: 440 }}>
                Free to use on the web. Free to run on your machine. Hand the line to an agent if you&apos;d rather it set things up.
              </p>
              <StartCta isLocal={LOCAL} onStart={openStart}>
                {LOCAL ? "Open FocusSpace" : "Start focusing — it's free"}
              </StartCta>
              <CopyInstallBox />
            </div>
          </LandingSection>
        </div>
      </main>

      <SiteFooter />

      {!LOCAL && (
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} urlError={urlError} />
      )}

      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--color-surface-container-high)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--color-on-surface)",
            backdropFilter: "blur(20px)",
          },
        }}
      />
    </div>
  );
}
