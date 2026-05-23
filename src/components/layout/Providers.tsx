"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { Toaster } from "sonner";
import { SideNav } from "@/components/layout/SideNav";
import { WallpaperRenderer, SOLID_WALLPAPERS } from "@/components/layout/WallpaperRenderer";
import { SpotifyProvider } from "@/lib/context/SpotifyContext";
import { SpotifyMiniBar } from "@/components/spotify/SpotifyMiniBar";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useMiniPlayerStore } from "@/lib/stores/miniplayer";
import { useUiStore } from "@/lib/stores/ui";
import { useTimerStore, getRemainingMs } from "@/lib/stores/timer";
import type { UserSettings, Wallpaper } from "@/types/database";

const THEME_KEY = "focusspace-theme";

function TimerTitle() {
  const status = useTimerStore((s) => s.status);

  useEffect(() => {
    if (status !== "running" && status !== "paused") {
      document.title = "FocusSpace";
      return;
    }

    if (status === "paused") {
      const state = useTimerStore.getState();
      const rem = getRemainingMs(state);
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      document.title = `⏸ ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} · FocusSpace`;
      return;
    }

    const tick = () => {
      const state = useTimerStore.getState();
      const rem = getRemainingMs(state);
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      document.title = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} · FocusSpace`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      document.title = "FocusSpace";
    };
  }, [status]);

  return null;
}

function AppShell({ supabaseUrl, children }: { supabaseUrl: string; children: ReactNode }) {
  const supabase = createClient();
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const timerStatus = useTimerStore((s) => s.status);

  useEffect(() => {
    if (timerStatus === "running") setSidebarCollapsed(true);
  }, [timerStatus, setSidebarCollapsed]);

  const { data: settings } = useQuery<UserSettings | null>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return data as UserSettings | null;
    },
    staleTime: 5 * 60_000,
  });

  const { data: displayName } = useQuery<string | null>({
    queryKey: ["profile-name"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      return (data as { display_name: string | null } | null)?.display_name ?? null;
    },
    staleTime: 10 * 60_000,
  });

  const { data: wallpaper } = useQuery<Wallpaper | null>({
    queryKey: ["wallpaper", settings?.active_wallpaper_id],
    queryFn: async () => {
      const id = settings?.active_wallpaper_id;
      if (!id) return null;
      if (SOLID_WALLPAPERS.some((s) => s.id === id)) {
        return { id, user_id: null, name: id, storage_path: id, is_builtin: true, created_at: "" } as Wallpaper;
      }
      const { data } = await supabase.from("wallpapers").select("*").eq("id", id).maybeSingle();
      return data as Wallpaper | null;
    },
    enabled: settings !== undefined,
    staleTime: 5 * 60_000,
  });

  // Apply theme
  useEffect(() => {
    const html = document.documentElement;
    const theme = settings?.theme ?? (localStorage.getItem(THEME_KEY) as "dark" | "light" | "system" | null) ?? "dark";
    html.classList.remove("light", "dark");
    if (theme === "system") {
      html.classList.add(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else {
      html.classList.add(theme);
    }
    if (settings?.theme) localStorage.setItem(THEME_KEY, settings.theme);
  }, [settings?.theme]);

  return (
    <SpotifyProvider>
      <>
        <TimerTitle />
        <WallpaperRenderer
          wallpaper={wallpaper ?? null}
          supabaseUrl={supabaseUrl}
          blur={settings?.wallpaper_blur ?? 60}
          opacity={settings?.wallpaper_opacity ?? 40}
        />
        <SideNav displayName={displayName ?? null} />
        <main
          className="relative z-10 h-dvh overflow-y-auto flex flex-col transition-all duration-300"
          style={{ marginLeft: sidebarCollapsed ? 64 : 240 }}
        >
          {children}
        </main>
        <SpotifyMiniBar />
        <MiniPlayerHost />
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
      </>
    </SpotifyProvider>
  );
}

function MiniPlayerHost() {
  const { pipWindow } = useMiniPlayerStore();
  if (!pipWindow) return null;
  return createPortal(<MiniPlayer />, pipWindow.document.body);
}

export function Providers({ children, supabaseUrl }: { children: ReactNode; supabaseUrl: string }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1 },
    },
  }));

  return (
    <QueryClientProvider client={client}>
      <AppShell supabaseUrl={supabaseUrl}>
        {children}
      </AppShell>
    </QueryClientProvider>
  );
}
