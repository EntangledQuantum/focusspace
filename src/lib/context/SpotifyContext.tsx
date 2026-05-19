"use client";

import {
  createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useSpotify } from "@/lib/hooks/useSpotify";
import { useSpotifyPlayer, type SpotifyPlaybackState } from "@/lib/hooks/useSpotifyPlayer";
import { useTimerStore } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";
import type { UserSettings } from "@/types/database";

export interface Playlist {
  id: string;
  name: string;
  images: { url: string }[];
  uri: string;
  tracks?: { total: number } | null;
}

export interface ExternalTrack {
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
}

export interface ExternalPlaybackState {
  is_playing: boolean;
  progress_ms: number;
  item: ExternalTrack | null;
}

interface SpotifyContextValue {
  token: string | null;
  isConnected: boolean;
  tokenLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  player: any | null;
  deviceId: string | null;
  state: SpotifyPlaybackState | null;
  isReady: boolean;
  sdkError: string | null;
  selectedPlaylist: Playlist | null;
  setSelectedPlaylist: (p: Playlist | null) => void;
  externalState: ExternalPlaybackState | null;
  progress: number;
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();

  const { data: spotifyData, isLoading: tokenLoading, refetch: refreshToken } = useSpotify();
  const token = spotifyData?.token ?? null;
  const isConnected = spotifyData?.isConnected ?? false;

  const { data: settings } = useQuery<UserSettings | null>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return data as UserSettings | null;
    },
    staleTime: 5 * 60_000,
  });

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [externalState, setExternalState] = useState<ExternalPlaybackState | null>(null);
  const [progress, setProgress] = useState(0);

  const handleTokenRefresh = useCallback(async () => {
    const result = await refreshToken();
    return result.data?.token ?? null;
  }, [refreshToken]);

  const { player, deviceId, state, isReady, error: sdkError } = useSpotifyPlayer({
    token,
    onTokenRefresh: handleTokenRefresh,
  });

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const externalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStatus = useTimerStore((s) => s.status);
  const prevTimerStatus = useRef(timerStatus);

  // Progress bar tick
  useEffect(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    if (!state) return;
    if (state.paused) {
      setProgress(state.duration > 0 ? state.position / state.duration : 0);
      return;
    }
    const tick = () => {
      player?.getCurrentState().then((s: SpotifyPlaybackState | null) => {
        if (s) setProgress(s.duration > 0 ? s.position / s.duration : 0);
      });
    };
    progressInterval.current = setInterval(tick, 500);
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, [state, player]);

  // Poll GET /me/player for external device state
  useEffect(() => {
    if (!token) return;
    if (externalPollRef.current) clearInterval(externalPollRef.current);

    async function poll() {
      if (!token) return;
      if (state && !state.paused) { setExternalState(null); return; }
      try {
        const res = await fetch("https://api.spotify.com/v1/me/player", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 204 || !res.ok) { setExternalState(null); return; }
        const d = await res.json();
        if (d?.item) {
          setExternalState({ is_playing: d.is_playing, progress_ms: d.progress_ms ?? 0, item: d.item });
        } else {
          setExternalState(null);
        }
      } catch { /* ignore */ }
    }

    poll();
    externalPollRef.current = setInterval(poll, 3000);
    return () => { if (externalPollRef.current) clearInterval(externalPollRef.current); };
  }, [token, state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer-driven playback: auto-start on run, pause on stop, resume on un-pause
  useEffect(() => {
    const prev = prevTimerStatus.current;
    prevTimerStatus.current = timerStatus;

    if (!isReady || !deviceId || !token) return;

    const autoStart = settings?.spotify_auto_start ?? true;
    const wasIdle = prev === "idle" || prev === "completed";
    const wasPaused = prev === "paused";
    const wasRunning = prev === "running";

    if (autoStart && wasIdle && timerStatus === "running") {
      // Only start/restart if nothing is already playing — avoids jarring restart
      // when auto_start_breaks transitions completed → running with music going
      const alreadyPlaying = state && !state.paused;
      if (!alreadyPlaying) {
        if (selectedPlaylist) {
          fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ context_uri: selectedPlaylist.uri }),
          });
        } else {
          player?.resume();
        }
      }
    } else if (autoStart && wasPaused && timerStatus === "running") {
      // Timer resumed from pause → resume music
      player?.resume();
    } else if (wasRunning && (timerStatus === "idle" || timerStatus === "completed" || timerStatus === "paused")) {
      if (state && !state.paused) {
        player?.pause();
      }
    }
  }, [timerStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SpotifyContext.Provider value={{
      token, isConnected, tokenLoading,
      player, deviceId, state, isReady, sdkError,
      selectedPlaylist, setSelectedPlaylist,
      externalState, progress,
    }}>
      {children}
    </SpotifyContext.Provider>
  );
}

export function useSpotifyContext() {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotifyContext must be used within SpotifyProvider");
  return ctx;
}
