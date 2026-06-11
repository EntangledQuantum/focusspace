"use client";

import {
  createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useSpotify } from "@/lib/hooks/useSpotify";
import { useSpotifyPlayer, type SpotifyPlaybackState } from "@/lib/hooks/useSpotifyPlayer";
import { spotifyFetch, spotifyJson } from "@/lib/spotify/api";
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

  const { data: spotifyData, isLoading: tokenLoading } = useSpotify();
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

  const { player, deviceId, state, isReady, error: sdkError } = useSpotifyPlayer({ token });

  const timerStatus = useTimerStore((s) => s.status);
  const prevTimerStatus = useRef(timerStatus);

  // SDK is actively playing music
  const sdkActive = !!(state && !state.paused);
  // SDK holds a playback context (playing OR paused) — controls must route here,
  // not to "the active external device" which may not exist (404 no active device).
  const sdkHasContext = !!state;

  // Refs so the poll interval below stays stable instead of being torn down
  // and recreated on every playback-state change.
  const deviceIdRef = useRef(deviceId);
  const sdkActiveRef = useRef(sdkActive);
  const sdkHasContextRef = useRef(sdkHasContext);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);
  useEffect(() => { sdkActiveRef.current = sdkActive; }, [sdkActive]);
  useEffect(() => { sdkHasContextRef.current = sdkHasContext; }, [sdkHasContext]);

  // Progress bar tick — only while the SDK is actually playing
  useEffect(() => {
    if (!state) return;
    if (state.paused) {
      setProgress(state.duration > 0 ? state.position / state.duration : 0);
      return;
    }
    const id = setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (player as any)?.getCurrentState().then((s: SpotifyPlaybackState | null) => {
        if (s) setProgress(s.duration > 0 ? s.position / s.duration : 0);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state, player]);

  // Sync shuffle state from SDK player_state_changed
  useEffect(() => {
    if (state) setShuffleState(state.shuffle ?? false);
  }, [state]);

  // Poll GET /me/player for external device state + global shuffle/volume
  useEffect(() => {
    if (!isConnected) return;

    async function poll() {
      if (document.hidden) return;
      try {
        const d = await spotifyJson<{
          is_playing: boolean;
          progress_ms: number | null;
          item: ExternalTrack | null;
          device: { id: string; name: string; volume_percent: number } | null;
          shuffle_state: boolean;
        }>("/me/player");
        if (!d) {
          if (!sdkHasContextRef.current) setExternalState(null);
          return;
        }
        const isOurDevice = d.device?.id && d.device.id === deviceIdRef.current;
        if (d.item && !isOurDevice && !sdkActiveRef.current) {
          setExternalState({
            is_playing: d.is_playing,
            progress_ms: d.progress_ms ?? 0,
            item: d.item,
            device: d.device,
            shuffle_state: d.shuffle_state,
          });
          if (d.device?.volume_percent != null) setVolumeState(d.device.volume_percent);
          if (typeof d.shuffle_state === "boolean") setShuffleState(d.shuffle_state);
        } else if (isOurDevice) {
          if (d.device?.volume_percent != null) setVolumeState(d.device.volume_percent);
          setExternalState(null);
        } else if (sdkActiveRef.current) {
          setExternalState(null);
        }
      } catch { /* not connected / network — ignore */ }
    }

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [isConnected]);

  const transferToSdk = useCallback(
    async (play = false) => {
      const id = deviceIdRef.current;
      if (!id) return false;
      try {
        const res = await spotifyFetch("/me/player", {
          method: "PUT",
          body: { device_ids: [id], play },
        });
        setExternalState(null);
        return res.ok || res.status === 204;
      } catch {
        return false;
      }
    },
    [],
  );

  // For an artist context Spotify wants their top tracks — fetch and play as uris
  const fetchArtistTopTracks = useCallback(async (artistUri: string): Promise<string[]> => {
    const id = artistUri.split(":").pop();
    const data = await spotifyJson<{ tracks?: { uri: string }[] }>(
      `/artists/${id}/top-tracks`, { params: { market: "from_token" } },
    );
    return (data?.tracks ?? []).map((t) => t.uri).slice(0, 20);
  }, []);

  const playContext = useCallback(
    async (ctx: PlayableContext) => {
      const id = deviceIdRef.current;
      if (!id) return;
      try {
        // 1. Transfer playback to SDK device so it becomes the "active device" —
        //    fixes 404 "no active device" from /play against an inactive Connect device.
        await spotifyFetch("/me/player", {
          method: "PUT",
          body: { device_ids: [id], play: false },
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

        const res = await spotifyFetch("/me/player/play", {
          method: "PUT",
          params: { device_id: id },
          body,
        });
        if (!res.ok && res.status !== 204) {
          await new Promise((r) => setTimeout(r, 600));
          await spotifyFetch("/me/player/play", {
            method: "PUT",
            params: { device_id: id },
            body,
          });
        }
      } catch { /* surfaced via UI state staying unchanged */ }
    },
    [fetchArtistTopTracks],
  );

  // Control helpers — route to wherever the playback context actually lives
  const playPause = useCallback(async () => {
    if (sdkHasContext) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (player as any)?.togglePlay();
      return;
    }
    if (externalState?.device?.id) {
      const path = externalState.is_playing ? "/me/player/pause" : "/me/player/play";
      try {
        await spotifyFetch(path, { method: "PUT", params: { device_id: externalState.device.id } });
        setExternalState((p) => p ? { ...p, is_playing: !p.is_playing } : p);
      } catch { /* ignore */ }
      return;
    }
    // No active playback anywhere — kick off the selection (handles transfer)
    if (selectedPlaylist) {
      await playContext(selectedPlaylist);
    } else if (deviceIdRef.current) {
      await transferToSdk(true);
    }
  }, [sdkHasContext, player, externalState, selectedPlaylist, playContext, transferToSdk]);

  const skip = useCallback(async (direction: "next" | "previous") => {
    if (sdkHasContext) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = player as any;
      await (direction === "next" ? p?.nextTrack() : p?.previousTrack());
      return;
    }
    const targetId = externalState?.device?.id ?? deviceIdRef.current;
    try {
      await spotifyFetch(`/me/player/${direction}`, {
        method: "POST",
        params: targetId ? { device_id: targetId } : undefined,
      });
    } catch { /* ignore */ }
  }, [sdkHasContext, player, externalState]);

  const next = useCallback(() => skip("next"), [skip]);
  const previous = useCallback(() => skip("previous"), [skip]);

  const setVolume = useCallback(
    async (percent: number) => {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      setVolumeState(p);
      if (sdkHasContext && player) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        try { await (player as any).setVolume(p / 100); } catch { /* ignore */ }
      }
      const targetId = sdkHasContext ? deviceIdRef.current : externalState?.device?.id ?? deviceIdRef.current;
      if (!targetId) return;
      try {
        await spotifyFetch("/me/player/volume", {
          method: "PUT",
          params: { volume_percent: String(p), device_id: targetId },
        });
      } catch { /* ignore */ }
    },
    [sdkHasContext, externalState, player],
  );

  const setShuffle = useCallback(
    async (on: boolean) => {
      setShuffleState(on);
      const targetId = sdkHasContext ? deviceIdRef.current : externalState?.device?.id ?? deviceIdRef.current;
      if (!targetId) return;
      try {
        await spotifyFetch("/me/player/shuffle", {
          method: "PUT",
          params: { state: String(on), device_id: targetId },
        });
      } catch { /* ignore */ }
    },
    [sdkHasContext, externalState],
  );

  // Timer-driven playback: optional takeover on start, pause on stop
  useEffect(() => {
    const prev = prevTimerStatus.current;
    prevTimerStatus.current = timerStatus;

    if (!isReady || !deviceId) return;

    const autoStart = settings?.spotify_auto_start ?? true;
    const takeover = settings?.spotify_takeover ?? true;
    const wasIdle = prev === "idle" || prev === "completed";
    const wasPaused = prev === "paused";
    const wasRunning = prev === "running";

    if (autoStart && wasIdle && timerStatus === "running") {
      const alreadyPlaying = state && !state.paused;
      const externallyPlaying = externalState?.is_playing;
      if (externallyPlaying) {
        // Take over from external device only when the user opted in;
        // otherwise leave their phone/desktop playback alone.
        if (takeover) transferToSdk(true);
      } else if (!alreadyPlaying) {
        if (selectedPlaylist) {
          playContext(selectedPlaylist);
        } else if (state) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (player as any)?.resume();
        }
      }
    } else if (autoStart && wasPaused && timerStatus === "running") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (state?.paused) (player as any)?.resume();
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
