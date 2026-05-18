"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Toaster } from "sonner";
import { SideNav } from "@/components/layout/SideNav";
import { WallpaperRenderer, SOLID_WALLPAPERS } from "@/components/layout/WallpaperRenderer";
import type { UserSettings, Wallpaper } from "@/types/database";

const THEME_KEY = "focusspace-theme";

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
      const isSolid = SOLID_WALLPAPERS.some((s) => s.id === id);
      if (isSolid) {
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
    <>
      <WallpaperRenderer
        wallpaper={wallpaper ?? null}
        supabaseUrl={supabaseUrl}
        blur={settings?.wallpaper_blur ?? 60}
        opacity={settings?.wallpaper_opacity ?? 40}
      />
      <SideNav displayName={displayName ?? null} />
      <main className="relative z-10 md:ml-60 h-dvh overflow-y-auto flex flex-col">
        {children}
      </main>
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
  );
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
