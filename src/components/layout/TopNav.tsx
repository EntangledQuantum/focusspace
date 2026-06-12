"use client";

import Link from "next/link";
import Image from "next/image";
import appIcon from "@/app/icon.png";
import { useRef, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Timer, FolderKanban, BarChart2, Settings, Sun, Moon, SlidersHorizontal } from "lucide-react";
import { useTimerStore } from "@/lib/stores/timer";
import { useUiStore } from "@/lib/stores/ui";
import { createClient } from "@/lib/supabase/client";
import type { UserSettings } from "@/types/database";

const NAV_LINKS = [
  { href: "/focus",     label: "Focus",     icon: Timer },
  { href: "/projects",  label: "Projects",  icon: FolderKanban },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/settings",  label: "Settings",  icon: Settings },
] as const;

function GlassControls({ settings }: { settings: UserSettings | null | undefined }) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [tint, setTint] = useState(settings?.glass_tint ?? 0.5);
  const [blur, setBlur] = useState(settings?.glass_blur ?? 22);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (settings) {
      setTint(settings.glass_tint ?? 0.5);
      setBlur(settings.glass_blur ?? 22);
    }
  }, [settings?.glass_tint, settings?.glass_blur]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function apply(nextTint: number, nextBlur: number) {
    // Live CSS-var update, debounced Supabase write
    const r = document.documentElement;
    r.style.setProperty("--glass-tint", String(nextTint));
    r.style.setProperty("--glass-blur", `${nextBlur}px`);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!settings) return;
      await supabase.from("user_settings")
        .update({ glass_tint: nextTint, glass_blur: nextBlur })
        .eq("user_id", settings.user_id);
      qc.invalidateQueries({ queryKey: ["settings"] });
    }, 300);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="icon-btn"
        style={{ width: 36, height: 36 }}
        title="Glass tint & blur"
      >
        <SlidersHorizontal size={16} />
      </button>
      {open && (
        <div
          className="glass pop absolute right-0"
          style={{ top: 46, width: 244, borderRadius: 18, padding: 16, zIndex: 80 }}
        >
          <p
            className="uppercase"
            style={{
              fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700,
              letterSpacing: ".08em", color: "var(--color-on-surface-variant)", marginBottom: 14,
            }}
          >
            Glass
          </p>
          <SliderRow
            label="Tint" display={`${Math.round(tint * 100)}%`}
            value={tint} min={0} max={1} step={0.01}
            onChange={(v) => { setTint(v); apply(v, blur); }}
          />
          <div style={{ height: 14 }} />
          <SliderRow
            label="Blur" display={`${blur}px`} accent
            value={blur} min={0} max={48} step={1}
            onChange={(v) => { setBlur(v); apply(tint, v); }}
          />
        </div>
      )}
    </div>
  );
}

export function SliderRow({
  label, value, min, max, step, onChange, display, accent,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display: string; accent?: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between" style={{ marginBottom: 7 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-on-surface-variant)" }}>{label}</span>
        <span className="tabular-nums" style={{
          fontSize: 12.5, fontWeight: 700,
          color: accent ? "var(--color-secondary)" : "var(--color-primary)",
        }}>{display}</span>
      </div>
      <input
        type="range"
        className={"rng w-full" + (accent ? " accent" : "")}
        value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const supabase = createClient();
  const qc = useQueryClient();
  const timerStatus = useTimerStore((s) => s.status);
  const focusMode = useUiStore((s) => s.focusMode);
  const isRunning = timerStatus === "running" || timerStatus === "paused";
  const hidden = focusMode && pathname === "/focus";

  const { data: settings } = useQuery<UserSettings | null>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return data as UserSettings | null;
    },
    staleTime: 5 * 60_000,
  });

  const isDark = (settings?.theme ?? "dark") !== "light";

  const setTheme = useMutation({
    mutationFn: async (theme: "dark" | "light") => {
      if (!settings) return;
      await supabase.from("user_settings").update({ theme }).eq("user_id", settings.user_id);
    },
    onMutate: (theme) => {
      const html = document.documentElement;
      html.classList.remove("light", "dark");
      html.classList.add(theme);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  return (
    <header
      className="fixed top-0 left-0 right-0 flex justify-center pointer-events-none"
      style={{
        zIndex: 60, padding: "16px 18px",
        opacity: hidden ? 0 : 1,
        transform: hidden ? "translateY(-12px)" : "none",
        transition: "opacity .4s var(--ease), transform .4s var(--ease)",
      }}
    >
      <nav
        className="flex items-center"
        style={{
          pointerEvents: hidden ? "none" : "auto",
          gap: 6, borderRadius: 999, padding: "8px 10px 8px 12px",
          width: "100%", maxWidth: 880,
          // More opaque than .glass so the bar stays readable over any wallpaper
          background: "color-mix(in srgb, var(--color-surface-container) 88%, transparent)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 18px 48px -16px rgba(0,0,0,0.6)",
        }}
      >
        <div className="flex items-center" style={{ gap: 10, paddingRight: 6 }}>
          <Image src={appIcon} alt="FocusSpace" width={30} height={30} className="rounded-[9px] shrink-0" />
          <span
            className="hidden sm:inline"
            style={{
              fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15.5,
              letterSpacing: "-.01em", color: "var(--color-on-surface)",
            }}
          >
            FocusSpace
          </span>
        </div>

        <div className="flex mx-auto" style={{ gap: 2 }}>
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="pill hover-lift relative"
                style={{
                  padding: "8px 15px", fontSize: 13.5,
                  color: active ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                  background: active ? "color-mix(in srgb, var(--color-primary) 14%, transparent)" : "transparent",
                  border: active
                    ? "1px solid color-mix(in srgb, var(--color-primary) 26%, transparent)"
                    : "1px solid transparent",
                }}
              >
                <Icon size={16} />
                <span className="hidden md:inline">{label}</span>
                {href === "/focus" && isRunning && (
                  <span
                    className="pulse-dot absolute"
                    style={{
                      top: 7, right: 9, width: 6, height: 6, borderRadius: 99,
                      background: "var(--color-primary)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        <button
          onClick={() => setTheme.mutate(isDark ? "light" : "dark")}
          className="icon-btn"
          style={{ width: 36, height: 36 }}
          title="Toggle theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <GlassControls settings={settings} />
      </nav>
    </header>
  );
}
