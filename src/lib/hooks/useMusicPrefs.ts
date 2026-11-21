"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { musicPrefsFromSettings } from "@/lib/spotify/focusMusic";
import type { UserSettings } from "@/types/database";

export type MusicSettingsPatch = Partial<
  Pick<UserSettings, "spotify_auto_start" | "spotify_auto_pause" | "spotify_resume_on_focus" | "spotify_takeover">
>;

/**
 * Per-user "music follows focus" preferences, stored on user_settings and
 * shared through the app-wide ["settings"] query so the Settings page, the
 * Spotify panel and the SpotifyProvider all see the same values instantly.
 */
export function useMusicPrefs() {
  const supabase = createClient();
  const qc = useQueryClient();

  const { data: settings, isSuccess } = useQuery<UserSettings | null>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return data as UserSettings | null;
    },
    staleTime: 5 * 60_000,
  });

  const prefs = useMemo(() => musicPrefsFromSettings(settings), [settings]);

  const mutation = useMutation({
    mutationFn: async (patch: MusicSettingsPatch) => {
      if (!settings?.user_id) throw new Error("Settings not loaded");
      const { error } = await supabase.from("user_settings").update(patch).eq("user_id", settings.user_id);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["settings"] });
      const prev = qc.getQueryData<UserSettings | null>(["settings"]);
      qc.setQueryData<UserSettings | null>(["settings"], (old) => (old ? { ...old, ...patch } : old));
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      qc.setQueryData(["settings"], ctx?.prev);
      toast.error("Couldn't save music setting");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  return { settings, prefs, loaded: isSuccess, update: mutation.mutate };
}
