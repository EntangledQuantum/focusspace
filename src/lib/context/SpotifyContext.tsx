"use client";

import {
  createContext, useContext, useState, useRef, useEffect, useCallback, useMemo, type ReactNode,
} from "react";
import { toast } from "sonner";
import { useSpotify } from "@/lib/hooks/useSpotify";
import {
  useSpotifyPlayer, type SpotifyPlaybackState, type SpotifyPlayerInstance,
} from "@/lib/hooks/useSpotifyPlayer";
import { useMusicPrefs } from "@/lib/hooks/useMusicPrefs";
import { spotifyErrorMessage, spotifyFetch } from "@/lib/spotify/api";
import {
  decideMusicAction, focusTransition, isFocusRunning, type FocusTransition,
} from "@/lib/spotify/focusMusic";
import { useTimerStore } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";
import { describeSpotifyFailure, uriKind } from "@/lib/spotify/devices";

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
  player: SpotifyPlayerInstance | null;
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
  playContext: (ctx: PlayableContext) => Promise<boolean>;
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Backoff for "device not found yet" right after the SDK reports ready. */
const PLAY_RETRY_DELAYS_MS = [0, 400, 1000, 2000];
/** A focus start seen before the player was ready is replayed this long after. */
const PENDING_TRANSITION_TTL_MS = 60_000;
const POLL_MS = 5000;
/** Re-publish the web player's device id this often while the tab is open. */
const DEVICE_HEARTBEAT_MS = 10 * 60 * 1000;

function playErrorText(status: number, detail: string | null): string {
  if (status === 0) return "The Spotify player isn't ready yet — try again in a moment.";
  // 403 PREMIUM_REQUIRED / 429 read the same here as from the AI, MCP and extension.
  if (status === 403 || status === 429) return describeSpotifyFailure(status, { error: { message: detail ?? undefined } }, { verb: "Playback" }).message;
  return detail ? `Couldn't start playback: ${detail}` : "Couldn't start playback on Spotify.";
}

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const { data: spotifyData, isLoading: tokenLoading } = useSpotify();
  const token = spotifyData?.token ?? null;
  const isConnected = spotifyData?.isConnected ?? false;

  const { prefs, loaded: prefsLoaded, settings } = useMusicPrefs();
  const userId = settings?.user_id ?? null;

  // null = nothing picked in this tab yet, so the stored pick (if any) applies.
  const [pick, setPick] = useState<{ value: PlayableContext | null } | null>(null);
  const [externalState, setExternalState] = useState<ExternalPlaybackState | null>(null);
  const [volume, setVolumeState] = useState(60);
  const [extShuffle, setExtShuffle] = useState(false);
  // Optimistic shuffle for our own device until the SDK reports the change.
  const [shuffleOverride, setShuffleOverride] = useState<{ value: boolean; at: number } | null>(null);
  const [now, setNow] = useState(0);

  const onAutoplayBlocked = useCallback(() => {
    toast("Your browser blocked autoplay", {
      description: "Press play once — after that FocusSpace can start music with your timer.",
    });
  }, []);

  // Bumped on every SDK `ready` so a reconnect re-publishes the device id
  // even when Spotify hands back the same one.
  const [readyTick, setReadyTick] = useState(0);
  const onReady = useCallback(() => setReadyTick((n) => n + 1), []);

  // Keyed on the connection, not the token string: see useSpotifyPlayer.
  const { player, deviceId, state, isReady, error: sdkError } = useSpotifyPlayer({
    enabled: isConnected,
    onAutoplayBlocked,
    onReady,
  });

  // ── Make this tab's player discoverable server-side ───────────────────────
  // Focus AI, MCP and the extension control Spotify from the server, where
  // "no device_id" means "the active device" — and this player is never
  // active until something transfers playback to it. Publishing its id lets
  // the server target it directly (lib/spotify/playback.ts). Best effort:
  // errors (e.g. migration 0015 not applied yet) are ignored.
  useEffect(() => {
    if (!deviceId || !userId) return;
    const supabase = createClient();
    const publish = () => {
      void Promise.resolve(
        supabase.from("user_settings").update({
          spotify_web_device_id: deviceId,
          spotify_web_device_seen_at: new Date().toISOString(),
        }).eq("user_id", userId),
      ).catch(() => {});
    };
    publish();
    const id = setInterval(publish, DEVICE_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [deviceId, userId, readyTick]);

  // The music pick is stored too: it survives reloads, and server-side
  // "resume" falls back to it when nothing was playing.
  const setSelectedPlaylist = useCallback((p: PlayableContext | null) => {
    setPick({ value: p });
    if (!p || !userId) return;
    void Promise.resolve(
      createClient().from("user_settings").update({
        spotify_selected_uri: p.uri,
        spotify_selected_name: p.name,
      }).eq("user_id", userId),
    ).catch(() => {});
  }, [userId]);

  const storedUri = settings?.spotify_selected_uri ?? null;
  const storedName = settings?.spotify_selected_name ?? null;
  const storedPick = useMemo<PlayableContext | null>(() => {
    const kind = storedUri ? uriKind(storedUri) : null;
    if (!storedUri || !(kind === "playlist" || kind === "album" || kind === "artist" || kind === "track")) return null;
    return { uri: storedUri, name: storedName ?? "Your music pick", type: kind };
  }, [storedUri, storedName]);
  const selectedPlaylist = pick ? pick.value : storedPick;

  // SDK is actively playing music
  const sdkActive = !!(state && !state.paused);
  // SDK holds a playback context (playing OR paused) — controls must route here,
  // not to "the active external device" which may not exist (404 no active device).
  const sdkHasContext = !!state;

  // Refs so the poll interval and timer subscription stay stable.
  const deviceIdRef = useRef(deviceId);
  const sdkActiveRef = useRef(sdkActive);
  const sdkHasContextRef = useRef(sdkHasContext);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);
  useEffect(() => { sdkActiveRef.current = sdkActive; }, [sdkActive]);
  useEffect(() => { sdkHasContextRef.current = sdkHasContext; }, [sdkHasContext]);

  /** Bumped by every playback command; a /me/player poll that started before it is stale. */
  const cmdGenRef = useRef(0);
  /** Latest play request; earlier ones abandon their retries. */
  const playSeqRef = useRef(0);
  /** True while the current pause is one we made on a focus_end. */
  const autoPausedRef = useRef(false);

  // Any playback on our device — manual or automatic — means there is no
  // auto-pause left to undo, so manual control always wins.
  useEffect(() => { if (sdkActive) autoPausedRef.current = false; }, [sdkActive]);

  // Progress: extrapolate from the last SDK state instead of calling
  // getCurrentState() every second.
  useEffect(() => {
    if (!state || state.paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);

  let progress = 0;
  if (state && state.duration > 0) {
    const elapsed = !state.paused && state.receivedAt ? Math.max(0, now - state.receivedAt) : 0;
    progress = Math.min(1, (state.position + elapsed) / state.duration);
  }

  const shuffle = state
    ? (shuffleOverride && (state.receivedAt ?? 0) < shuffleOverride.at ? shuffleOverride.value : state.shuffle)
    : extShuffle;

  // Poll GET /me/player for playback on other devices. Skipped while our own
  // player is playing (the SDK pushes its state, and it fires a null state if
  // another device takes over), and results are dropped if a command raced
  // them — that stale snapshot used to flash the old device/track after a
  // takeover or play.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    async function poll() {
      if (document.hidden || sdkActiveRef.current) return;
      const gen = cmdGenRef.current;
      try {
        const res = await spotifyFetch("/me/player");
        if (cancelled || gen !== cmdGenRef.current) return;
        if (res.status === 204) {
          if (!sdkHasContextRef.current) setExternalState(null);
          return;
        }
        if (!res.ok) return; // 429 / 5xx: keep what we have and try next tick
        const d = (await res.json()) as {
          is_playing: boolean;
          progress_ms: number | null;
          item: ExternalTrack | null;
          device: { id: string; name: string; volume_percent: number } | null;
          shuffle_state: boolean;
        } | null;
        if (cancelled || gen !== cmdGenRef.current || !d) return;
        const isOurDevice = !!d.device?.id && d.device.id === deviceIdRef.current;
        if (d.item && !isOurDevice && !sdkActiveRef.current) {
          setExternalState({
            is_playing: d.is_playing,
            progress_ms: d.progress_ms ?? 0,
            item: d.item,
            device: d.device,
            shuffle_state: d.shuffle_state,
          });
          if (d.device?.volume_percent != null) setVolumeState(d.device.volume_percent);
          if (typeof d.shuffle_state === "boolean") setExtShuffle(d.shuffle_state);
        } else {
          // Our device (its local volume is the source of truth — Connect's
          // report would fight the slider), or nothing playing elsewhere.
          setExternalState(null);
        }
      } catch { /* not connected / network — ignore */ }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [isConnected]);

  const transferToSdk = useCallback(async (play = false) => {
    const id = deviceIdRef.current;
    if (!id) return false;
    cmdGenRef.current++;
    try {
      const res = await spotifyFetch("/me/player", {
        method: "PUT",
        body: { device_ids: [id], play },
      });
      if (res.ok) setExternalState(null);
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const playContext = useCallback(async (ctx: PlayableContext): Promise<boolean> => {
    const seq = ++playSeqRef.current;
    cmdGenRef.current++;
    // Artists play as an artist context. The old path fetched
    // /artists/{id}/top-tracks, which Spotify removed in the Feb 2026 Web API
    // update — artist picks silently did nothing.
    const body = ctx.type === "track" ? { uris: [ctx.uri] } : { context_uri: ctx.uri };

    let lastStatus = 0;
    let lastDetail: string | null = null;
    for (const delay of PLAY_RETRY_DELAYS_MS) {
      if (delay) await sleep(delay);
      if (seq !== playSeqRef.current) return false; // superseded by a newer pick
      const id = deviceIdRef.current;
      if (!id) { lastStatus = 0; continue; } // SDK (re)connecting
      let res: Response;
      try {
        // Target our device directly; this also makes it the active device.
        res = await spotifyFetch("/me/player/play", { method: "PUT", params: { device_id: id }, body });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Spotify is not connected");
        return false;
      }
      if (res.ok) {
        if (seq === playSeqRef.current) {
          setExternalState(null);
          autoPausedRef.current = false;
        }
        return true;
      }
      lastStatus = res.status;
      lastDetail = await spotifyErrorMessage(res);
      if (res.status === 404 || res.status === 502 || res.status === 503) {
        // Device not registered with Connect yet (just became ready) or no
        // active device: activate it explicitly, then retry.
        await spotifyFetch("/me/player", { method: "PUT", body: { device_ids: [id], play: false } }).catch(() => null);
        continue;
      }
      break; // 400/403/429-after-waiting: retrying won't help
    }
    if (seq === playSeqRef.current) toast.error(playErrorText(lastStatus, lastDetail));
    return false;
  }, []);

  // Control helpers — route to wherever the playback context actually lives
  const playPause = useCallback(async () => {
    cmdGenRef.current++;
    if (sdkHasContext && player) {
      await player.togglePlay();
      return;
    }
    if (externalState?.device?.id) {
      const path = externalState.is_playing ? "/me/player/pause" : "/me/player/play";
      try {
        const res = await spotifyFetch(path, { method: "PUT", params: { device_id: externalState.device.id } });
        if (res.ok) setExternalState((p) => (p ? { ...p, is_playing: !p.is_playing } : p));
        else if (res.status === 404) setExternalState(null); // that device went away
      } catch { /* ignore */ }
      return;
    }
    // No active playback anywhere — kick off the selection
    if (selectedPlaylist) {
      await playContext(selectedPlaylist);
    } else if (deviceIdRef.current) {
      await transferToSdk(true);
    }
  }, [sdkHasContext, player, externalState, selectedPlaylist, playContext, transferToSdk]);

  const skip = useCallback(async (direction: "next" | "previous") => {
    cmdGenRef.current++;
    if (sdkHasContext && player) {
      await (direction === "next" ? player.nextTrack() : player.previousTrack());
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
      // Our in-browser SDK device: set volume locally only — the Web API
      // volume endpoint doesn't reliably control browser devices, and its
      // reported value would just fight the slider.
      if (sdkHasContext && player) {
        try { await player.setVolume(p / 100); } catch { /* ignore */ }
        return;
      }
      const targetId = externalState?.device?.id;
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
      if (sdkHasContext) setShuffleOverride({ value: on, at: Date.now() });
      else setExtShuffle(on);
      const targetId = sdkHasContext ? deviceIdRef.current : externalState?.device?.id ?? deviceIdRef.current;
      if (!targetId) return;
      cmdGenRef.current++;
      try {
        await spotifyFetch("/me/player/shuffle", {
          method: "PUT",
          params: { state: String(on), device_id: targetId },
        });
      } catch { /* ignore */ }
    },
    [sdkHasContext, externalState],
  );

  // ── Music follows focus ──────────────────────────────────────────────────
  // Transitions come from a zustand subscription rather than a render-time
  // status effect: it sees every store change exactly once whether it came
  // from the UI, the completion tick, or MCP (useTimerSync writes the store),
  // and it never mistakes persist-hydration for a session start.
  const runTransitionRef = useRef<(t: FocusTransition) => void>(() => {});
  const pendingRef = useRef<{ t: FocusTransition; at: number } | null>(null);

  useEffect(() => {
    runTransitionRef.current = (t) => {
      if (!isReady || !player || !prefsLoaded) {
        // Player still connecting (page just loaded, SDK reconnecting): keep
        // a start around and replay it once ready. An end needs no replay —
        // nothing can be playing on a player that isn't ready.
        pendingRef.current = t === "focus_end" ? null : { t, at: Date.now() };
        return;
      }
      pendingRef.current = null;
      const action = decideMusicAction(t, prefs, {
        playingHere: !!state && !state.paused,
        pausedHere: !!state && state.paused,
        playingElsewhere: !!externalState?.is_playing,
        autoPaused: autoPausedRef.current,
        hasSelection: !!selectedPlaylist,
      });
      switch (action) {
        case "pause":
          cmdGenRef.current++;
          autoPausedRef.current = true;
          void player.pause().catch(() => {});
          break;
        case "resume":
          cmdGenRef.current++;
          autoPausedRef.current = false;
          void player.resume().catch(() => {});
          break;
        case "play_selection":
          if (selectedPlaylist) void playContext(selectedPlaylist);
          break;
        case "takeover":
          void transferToSdk(true);
          break;
      }
    };
  });

  useEffect(
    () => useTimerStore.subscribe((s, prev) => {
      const t = focusTransition(prev, s);
      if (t) runTransitionRef.current(t);
    }),
    [],
  );

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || !isReady || !player || !prefsLoaded) return;
    pendingRef.current = null;
    if (Date.now() - pending.at > PENDING_TRANSITION_TTL_MS) return;
    if (!isFocusRunning(useTimerStore.getState())) return;
    runTransitionRef.current(pending.t);
  }, [isReady, player, prefsLoaded]);

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
