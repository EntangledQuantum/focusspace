"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { Toaster } from "sonner";
import { TopNav } from "@/components/layout/TopNav";
import { WallpaperRenderer, isBuiltinWallpaperId } from "@/components/layout/WallpaperRenderer";
import { SpotifyProvider } from "@/lib/context/SpotifyContext";
import { SpotifyMiniBar } from "@/components/spotify/SpotifyMiniBar";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useMiniPlayerStore } from "@/lib/stores/miniplayer";
import { useTimerStore, getRemainingMs } from "@/lib/stores/timer";
import { fetchDailyFocus, fetchTagFocus, fetchRecentSessions, fetchStreak, type AnalyticsFilter } from "@/lib/analytics/queries";
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

/**
 * Warms the react-query cache for every tab on app start, so switching tabs
 * renders instantly from cache (and silently revalidates) instead of showing
 * loading states the first time each page is opened.
 */
function PrefetchAppData() {
  const supabase = createClient();
  const qc = useQueryClient();

  useEffect(() => {
    const filter: AnalyticsFilter = { range: "7d", projectId: null, tagId: null };

    // Projects + per-project tasks (Projects tab)
    qc.prefetchQuery({
      queryKey: ["projects"],
      queryFn: async () => {
        const { data } = await supabase.from("projects").select("*").is("archived_at", null).order("sort_order");
        return data ?? [];
      },
    }).then(() => {
      const projects = (qc.getQueryData(["projects"]) ?? []) as { id: string }[];
      for (const p of projects.slice(0, 10)) {
        qc.prefetchQuery({
          queryKey: ["tasks", p.id],
          queryFn: async () => {
            const { data } = await supabase
              .from("tasks")
              .select("*, task_tags(tag_id, tags(id, name, color))")
              .eq("project_id", p.id)
              .order("sort_order");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data ?? []).map((t: any) => ({
              ...t,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tags: (t.task_tags ?? []).map((tt: any) => tt.tags).filter(Boolean),
            }));
          },
        });
      }
    });

    // Task picker (Focus tab) + tags
    qc.prefetchQuery({
      queryKey: ["projects-with-tasks"],
      queryFn: async () => {
        const { data } = await supabase
          .from("projects")
          .select("*, tasks!inner(*, task_tags(tag_id, tags(id, name, color)))")
          .is("archived_at", null)
          .eq("tasks.status", "todo")
          .order("sort_order");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data ?? []).map((p: any) => ({
          ...p,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tasks: (p.tasks ?? []).map((t: any) => ({
            ...t,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tags: (t.task_tags ?? []).map((tt: any) => tt.tags).filter(Boolean),
          })),
        }));
      },
    });
    qc.prefetchQuery({
      queryKey: ["tags"],
      queryFn: async () => {
        const { data } = await supabase.from("tags").select("*").order("name");
        return data ?? [];
      },
    });

    // Analytics tab (default 7-day view)
    qc.prefetchQuery({ queryKey: ["analytics", "daily", filter], queryFn: () => fetchDailyFocus(filter) });
    qc.prefetchQuery({ queryKey: ["analytics", "tags", filter], queryFn: () => fetchTagFocus(filter) });
    qc.prefetchQuery({ queryKey: ["sessions", filter], queryFn: () => fetchRecentSessions(filter) });
    qc.prefetchQuery({ queryKey: ["analytics", "streak"], queryFn: fetchStreak });

    // Custom wallpapers (Settings tab)
    qc.prefetchQuery({
      queryKey: ["wallpapers"],
      queryFn: async () => {
        const { data } = await supabase
          .from("wallpapers").select("*").eq("is_builtin", false)
          .order("created_at", { ascending: false });
        return data ?? [];
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function AppShell({ supabaseUrl, children }: { supabaseUrl: string; children: ReactNode }) {
  const supabase = createClient();

  const { data: settings } = useQuery<UserSettings | null>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return data as UserSettings | null;
    },
    staleTime: 5 * 60_000,
  });

  const { data: wallpaper } = useQuery<Wallpaper | null>({
    queryKey: ["wallpaper", settings?.active_wallpaper_id],
    queryFn: async () => {
      const id = settings?.active_wallpaper_id;
      if (!id) return null;
      if (isBuiltinWallpaperId(id)) {
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

  // Apply live glass tint/blur from settings
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--glass-tint", String(settings?.glass_tint ?? 0.5));
    r.style.setProperty("--glass-blur", `${settings?.glass_blur ?? 22}px`);
  }, [settings?.glass_tint, settings?.glass_blur]);

  return (
    <SpotifyProvider>
      <>
        <TimerTitle />
        <PrefetchAppData />
        <WallpaperRenderer
          wallpaper={wallpaper ?? null}
          supabaseUrl={supabaseUrl}
          blur={settings?.wallpaper_blur ?? 60}
          opacity={settings?.wallpaper_opacity ?? 40}
        />
        <TopNav />
        <main className="relative z-10 h-dvh overflow-y-auto flex flex-col">
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
      queries: { staleTime: 2 * 60_000, retry: 1 },
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
