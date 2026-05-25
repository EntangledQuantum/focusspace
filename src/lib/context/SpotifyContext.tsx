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
  device?: { id: string; name: string; volume_percent: number } | null;
  shuffle_state?: boolean;
}

export interface PlayableContext {
  uri: string;
  name: string;
  images?: { url: string }[];
  type: "playlist" | "album" | "artist" | "track";
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
  selectedPlaylist: PlayableContext | null;
  setSelectedPlaylist: (p: PlayableContext | null) => void;
  externalState: ExternalPlaybackState | null;
  progress: number;
  /** percent 0–100, kept in sync across SDK + external */
  volume: number;
  setVolume: (percent: number) => Promise<void>;
  shuffle: boolean;
  setShuffle: (on: boolean) => Promise<void>;
  /** Targets whichever device is actually playing (SDK preferred, falls back to external) */
  playPause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  /** Transfer playback to this app's SDK device */
  transferToSdk: (play?: boolean) => Promise<boolean>;
  /** Play a specific context (playlist/album/artist) or track on the SDK device */
  playContext: (ctx: PlayableContext) => Promise<void>;
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

  const [selectedPlaylist, setSelectedPlaylist] = useState<PlayableContext | null>(null);
  const [externalState, setExternalState] = useState<ExternalPlaybackState | null>(null);
  const [progress, setProgress] = useState(0);
  const [volume, setVolumeState] = useState(60);
  const [shuffle, setShuffleState] = useState(false);

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

  // Track which device is "current" for control routing
  const sdkActive = !!(state && !state.paused);

  // Helpers for hitting Web API endpoints with optional device_id
  const apiPut = useCallback(
    async (path: string, body?: Record<string, unknown>, params?: Record<string, string>) => {
      if (!token) return;
      const url = new URL(`https://api.spotify.com/v1${path}`);
      if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      await fetch(url.toString(), {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    [token],
  );
  const apiPost = useCallback(
    async (path: string, params?: Record<string, string>) => {
      if (!token) return;
      const url = new URL(`https://api.spotify.com/v1${path}`);
      if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    [token],
  );

  // Progress bar tick
  useEffect(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    if (!state) return;
    if (state.paused) {
      setProgress(state.duration > 0 ? state.position / state.duration : 0);
      return;
    }
    const tick = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (player as any)?.getCurrentState().then((s: SpotifyPlaybackState | null) => {
        if (s) setProgress(s.duration > 0 ? s.position / s.duration : 0);
      });
    };
    progressInterval.current = setInterval(tick, 500);
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, [state, player]);

  // Sync shuffle state from SDK player_state_changed
  useEffect(() => {
    if (state) setShuffleState(state.shuffle ?? false);
  }, [state]);

  // Poll GET /me/player for external device state + global shuffle/volume
  useEffect(() => {
    if (!token) return;
    if (externalPollRef.current) clearInterval(externalPollRef.current);

    async function poll() {
      if (!token) return;
      try {
        const res = await fetch("https://api.spotify.com/v1/me/player", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 204 || !res.ok) {
          if (!state) setExternalState(null);
          return;
        }
        const d = await res.json();
        // Only treat as external when our SDK isn't the active source
        const isOurDevice = d?.device?.id && d.device.id === deviceId;
        if (d?.item && !isOurDevice && !sdkActive) {
          setExternalState({
            is_playing: d.is_playing,
            progress_ms: d.progress_ms ?? 0,
            item: d.item,
            device: d.device,
            shuffle_state: d.shuffle_state,
          });
          if (d.device?.volume_percent != null) setVolumeState(d.device.volume_percent);
          if (typeof d.shuffle_state === "boolean") setShuffleState(d.shuffle_state);
        } else if (isOurDevice && d.device?.volume_percent != null) {
          setVolumeState(d.device.volume_percent);
          setExternalState(null);
        } else if (sdkActive) {
          setExternalState(null);
        }
      } catch { /* ignore */ }
    }

    poll();
    externalPollRef.current = setInterval(poll, 3000);
    return () => { if (externalPollRef.current) clearInterval(externalPollRef.current); };
  }, [token, deviceId, sdkActive, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const transferToSdk = useCallback(
    async (play = false) => {
      if (!deviceId || !token) return false;
      const res = await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ device_ids: [deviceId], play }),
      });
      setExternalState(null);
      return res.ok || res.status === 204;
    },
    [deviceId, token],
  );

  // For an artist context Spotify wants their top tracks — fetch and play as uris
  const fetchArtistTopTracks = useCallback(
    async (artistUri: string): Promise<string[]> => {
      if (!token) return [];
      const id = artistUri.split(":").pop();
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${id}/top-tracks?market=from_token`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.tracks ?? []).map((t: { uri: string }) => t.uri).slice(0, 20);
    },
    [token],
  );

  const playContext = useCallback(
    async (ctx: PlayableContext) => {
      if (!deviceId || !token) return;
      // 1. Transfer playback to SDK device so it becomes the "active device" —
      //    fixes 404 "no active device" from /play against an inactive Connect device.
      await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      });
      setExternalState(null);
      await new Promise((r) => setTimeout(r, 300));

      let body: Record<string, unknown>;
      if (ctx.type === "track") {
        body = { uris: [ctx.uri] };
      } else if (ctx.type === "artist") {
        const uris = await fetchArtistTopTracks(ctx.uri);
        if (uris.length === 0) return;
        body = { uris };
      } else {
        body = { context_uri: ctx.uri };
      }

      const url = new URL("https://api.spotify.com/v1/me/player/play");
      url.searchParams.set("device_id", deviceId);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok && res.status !== 204) {
        await new Promise((r) => setTimeout(r, 600));
        await fetch(url.toString(), {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    },
    [deviceId, token, fetchArtistTopTracks],
  );

  // Control helpers — auto-route to whichever device is active
  const playPause = useCallback(async () => {
    if (sdkActive || (state && state.paused)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (player as any)?.togglePlay();
      return;
    }
    // External device
    if (externalState?.device?.id) {
      const path = externalState.is_playing ? "/me/player/pause" : "/me/player/play";
      await apiPut(path, undefined, { device_id: externalState.device.id });
      setExternalState((p) => p ? { ...p, is_playing: !p.is_playing } : p);
      return;
    }
    // No active device but we have one selected — kick off via playContext (handles transfer)
    if (selectedPlaylist) {
      await playContext(selectedPlaylist);
    }
  }, [sdkActive, state, player, externalState, selectedPlaylist, deviceId, apiPut, playContext]);

  const next = useCallback(async () => {
    if (sdkActive) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (player as any)?.nextTrack();
    } else if (externalState?.device?.id) {
      await apiPost("/me/player/next", { device_id: externalState.device.id });
    } else {
      await apiPost("/me/player/next");
    }
  }, [sdkActive, player, externalState, apiPost]);

  const previous = useCallback(async () => {
    if (sdkActive) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (player as any)?.previousTrack();
    } else if (externalState?.device?.id) {
      await apiPost("/me/player/previous", { device_id: externalState.device.id });
    } else {
      await apiPost("/me/player/previous");
    }
  }, [sdkActive, player, externalState, apiPost]);

  const setVolume = useCallback(
    async (percent: number) => {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      setVolumeState(p);
      const targetId = sdkActive ? deviceId : externalState?.device?.id ?? deviceId;
      if (sdkActive && player) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        try { await (player as any).setVolume(p / 100); } catch { /* ignore */ }
      }
      if (!targetId) return;
      await apiPut("/me/player/volume", undefined, {
        volume_percent: String(p),
        device_id: targetId,
      });
    },
    [sdkActive, deviceId, externalState, player, apiPut],
  );

  const setShuffle = useCallback(
    async (on: boolean) => {
      setShuffleState(on);
      const targetId = sdkActive ? deviceId : externalState?.device?.id ?? deviceId;
      if (!targetId) return;
      await apiPut("/me/player/shuffle", undefined, {
        state: String(on),
        device_id: targetId,
      });
    },
    [sdkActive, deviceId, externalState, apiPut],
  );

  // Timer-driven playback: takeover on start, pause on stop
  useEffect(() => {
    const prev = prevTimerStatus.current;
    prevTimerStatus.current = timerStatus;

    if (!isReady || !deviceId || !token) return;

    const autoStart = settings?.spotify_auto_start ?? true;
    const wasIdle = prev === "idle" || prev === "completed";
    const wasPaused = prev === "paused";
    const wasRunning = prev === "running";

    if (autoStart && wasIdle && timerStatus === "running") {
      const alreadyPlaying = state && !state.paused;
      const externallyPlaying = externalState?.is_playing;
      if (externallyPlaying) {
        // Takeover from external device, keep playing
        transferToSdk(true);
      } else if (!alreadyPlaying) {
        if (selectedPlaylist) {
          playContext(selectedPlaylist);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (player as any)?.resume();
        }
      }
    } else if (autoStart && wasPaused && timerStatus === "running") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (player as any)?.resume();
    } else if (wasRunning && (timerStatus === "idle" || timerStatus === "completed" || timerStatus === "paused")) {
      if (state && !state.paused) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (player as any)?.pause();
      }
    }
  }, [timerStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SpotifyContext.Provider value={{
      token, isConnected, tokenLoading,
      player, deviceId, state, isReady, sdkError,
      selectedPlaylist, setSelectedPlaylist,
      externalState, progress,
      volume, setVolume,
      shuffle, setShuffle,
      playPause, next, previous,
      transferToSdk, playContext,
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
