"use client";

import Link from "next/link";
import Image from "next/image";
import appIcon from "@/app/icon.png";
import { usePathname, useRouter } from "next/navigation";
import { Timer, FolderKanban, BarChart2, Settings, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { useTimerStore } from "@/lib/stores/timer";
import { useUiStore } from "@/lib/stores/ui";
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
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const isRunning = status === "running" || status === "paused";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const collapsed = sidebarCollapsed;

  return (
    <nav
      className="hidden md:flex flex-col fixed left-0 top-0 h-dvh z-40 py-6 transition-all duration-300"
      style={{
        width: collapsed ? 64 : 240,
        padding: collapsed ? "24px 12px" : "24px 16px",
        background: "color-mix(in srgb, var(--color-surface-container-lowest) 85%, transparent)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Brand + collapse toggle */}
      <div className={`flex items-center mb-10 ${collapsed ? "justify-center" : "justify-between px-2"}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <Image src={appIcon} alt="FocusSpace" width={36} height={36} className="rounded-xl shrink-0" />
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
        )}
        <button
          onClick={toggleSidebar}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 btn-hover-ghost shrink-0"
          style={{ color: "var(--color-on-surface-variant)", background: "rgba(255,255,255,0.04)" }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav links */}
      <div className="flex flex-col gap-1 flex-1">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center rounded-xl text-sm font-medium transition-all duration-200 ${!active ? "nav-link-hover" : ""}`}
              style={{
                gap: collapsed ? 0 : 12,
                padding: collapsed ? "10px 0" : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: active ? "rgba(255,255,255,0.06)" : "transparent",
                color: active ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                border: active ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
              }}
            >
              <Icon size={17} />
              {!collapsed && <span>{label}</span>}
              {!collapsed && href === "/focus" && isRunning && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--color-primary)" }} />
              )}
              {collapsed && href === "/focus" && isRunning && (
                <span className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full animate-pulse"
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
          title={collapsed ? "Settings" : undefined}
          className={`flex items-center rounded-xl text-sm font-medium transition-all duration-200 ${pathname !== "/settings" ? "nav-link-hover" : ""}`}
          style={{
            gap: collapsed ? 0 : 12,
            padding: collapsed ? "10px 0" : "10px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            color: pathname === "/settings" ? "var(--color-primary)" : "var(--color-on-surface-variant)",
            background: pathname === "/settings" ? "rgba(255,255,255,0.06)" : "transparent",
            border: pathname === "/settings" ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
          }}
        >
          <Settings size={17} />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={handleSignOut}
          title={collapsed ? "Sign out" : undefined}
          className="flex items-center rounded-xl text-sm font-medium transition-all duration-200 text-left btn-hover-error"
          style={{
            gap: collapsed ? 0 : 12,
            padding: collapsed ? "10px 0" : "10px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            color: "var(--color-on-surface-variant)",
          }}
        >
          <LogOut size={17} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </nav>
  );
}
