"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Timer, FolderKanban, BarChart2, Settings, LogOut } from "lucide-react";
import { useTimerStore } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";

const NAV_LINKS = [
  { href: "/focus",     label: "Focus",     icon: Timer },
  { href: "/projects",  label: "Projects",  icon: FolderKanban },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
] as const;

export function SideNav({ displayName }: { displayName?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useTimerStore();
  const isRunning = status === "running" || status === "paused";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="hidden md:flex flex-col fixed left-0 top-0 h-dvh w-60 z-40 py-8 px-4"
      style={{
        background: "color-mix(in srgb, var(--color-surface-container-lowest) 85%, transparent)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}>

      {/* Brand */}
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--color-primary-container)" }}>
          <Timer size={17} style={{ color: "var(--color-on-primary)" }} />
        </div>
        <div className="overflow-hidden">
          <p className="font-bold text-sm leading-none truncate"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}>
            FocusSpace
          </p>
          <p className="text-[11px] mt-0.5 uppercase tracking-wider truncate"
            style={{ color: "var(--color-on-surface-variant)" }}>
            {displayName ?? "Deep Work"}
          </p>
        </div>
      </div>

      {/* Nav links */}
      <div className="flex flex-col gap-1 flex-1">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: active ? "rgba(255,255,255,0.06)" : "transparent",
                color: active ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                border: active ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
              }}
            >
              <Icon size={17} />
              {label}
              {href === "/focus" && isRunning && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--color-primary)" }} />
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom: Settings + Sign out */}
      <div className="flex flex-col gap-1">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          style={{
            color: pathname === "/settings" ? "var(--color-primary)" : "var(--color-on-surface-variant)",
            background: pathname === "/settings" ? "rgba(255,255,255,0.06)" : "transparent",
            border: pathname === "/settings" ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
          }}
        >
          <Settings size={17} />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </nav>
  );
}
