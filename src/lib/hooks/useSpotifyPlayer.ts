"use client";

import { useEffect, useRef, useState } from "react";
import { getSpotifyToken } from "@/lib/spotify/api";

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayerInstance;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

export interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (data: unknown) => void) => boolean;
  removeListener: (event: string) => boolean;
  getCurrentState: () => Promise<SpotifyPlaybackState | null>;
  setVolume: (volume: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
  /** Unlocks audio on browsers with autoplay restrictions; call from a user gesture. */
  activateElement?: () => Promise<void>;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
}

export interface SpotifyPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: SpotifyTrack };
  shuffle: boolean;
  repeat_mode: number;
  /** Date.now() when this state arrived from the SDK (set by this hook). */
  receivedAt?: number;
}

interface UseSpotifyPlayerOptions {
  /** Create the in-browser player while true (i.e. Spotify is connected). */
  enabled: boolean;
  /** Fired when the browser blocked audio that wasn't started by a click. */
  onAutoplayBlocked?: () => void;
}

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

/**
 * Owns the Web Playback SDK player. Keyed only on `enabled` — NOT on the
 * access token: the token rotates hourly and tearing the player down on every
 * rotation used to cut playback mid-song and mint a new device id. The SDK
 * pulls fresh tokens itself through getOAuthToken.
 */
export function useSpotifyPlayer({ enabled, onAutoplayBlocked }: UseSpotifyPlayerOptions) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [state, setState] = useState<SpotifyPlaybackState | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<SpotifyPlayerInstance | null>(null);

  // Ref so the init effect doesn't depend on the callback identity.
  const autoplayCb = useRef(onAutoplayBlocked);
  useEffect(() => { autoplayCb.current = onAutoplayBlocked; }, [onAutoplayBlocked]);

  useEffect(() => {
    if (!enabled) return;

    // Guards every async callback below. React 19 StrictMode (dev) mounts,
    // unmounts and remounts this effect; without the flag the first, already
    // disconnected player could still deliver a late "ready" and overwrite the
    // live device id with a dead one, and an SDK that finished loading after
    // unmount would spin up an orphan player.
    let cancelled = false;
    let instance: SpotifyPlayerInstance | null = null;
    let lastAuthRetry = 0;

    function initPlayer() {
      if (cancelled || instance) return;
      const p = new window.Spotify.Player({
        name: "FocusSpace",
        // Called on connect and whenever the SDK's token expires — always
        // hand it a token with real life left (see getSpotifyToken).
        getOAuthToken: async (cb) => {
          const t = (await getSpotifyToken()) ?? (await getSpotifyToken(true));
          if (t) cb(t);
        },
        volume: 0.6,
      });
      instance = p;

      p.addListener("ready", (data) => {
        if (cancelled) return;
        const { device_id } = data as { device_id: string };
        setDeviceId(device_id);
        setIsReady(true);
        setError(null);
      });
      p.addListener("not_ready", () => {
        if (cancelled) return;
        // The SDK reconnects by itself and fires "ready" again.
        setIsReady(false);
        setDeviceId(null);
      });
      p.addListener("player_state_changed", (s) => {
        if (cancelled) return;
        // Stamp arrival time so progress can be extrapolated locally instead
        // of polling getCurrentState() every second.
        setState(s ? { ...(s as SpotifyPlaybackState), receivedAt: Date.now() } : null);
      });
      p.addListener("autoplay_failed", () => {
        if (cancelled) return;
        autoplayCb.current?.();
      });
      p.addListener("initialization_error", (data) => {
        if (cancelled) return;
        setError(`Initialization failed: ${(data as { message: string }).message}`);
      });
      p.addListener("authentication_error", async (data) => {
        if (cancelled) return;
        // Usually an expired/revoked token: force a refresh and reconnect —
        // at most once a minute, so a token that's bad for another reason
        // (e.g. missing scope) can't spin a reconnect loop.
        const canRetry = Date.now() - lastAuthRetry > 60_000;
        lastAuthRetry = Date.now();
        const fresh = canRetry ? await getSpotifyToken(true) : null;
        if (cancelled) return;
        if (fresh) {
          p.disconnect();
          const ok = await p.connect();
          if (ok || cancelled) return;
        }
        setError(`Authentication failed: ${(data as { message: string }).message}`);
      });
      p.addListener("account_error", () => {
        if (cancelled) return;
        setError("Spotify Premium is required for in-browser playback.");
      });
      p.addListener("playback_error", (data) => {
        if (cancelled) return;
        console.warn("[spotify] playback_error", (data as { message?: string })?.message);
      });

      void p.connect();
      setPlayer(p);
    }

    // Browsers block audio that wasn't started by a user gesture; the SDK
    // needs activateElement() inside one so timer/MCP-driven auto-play works.
    const unlock = () => {
      void instance?.activateElement?.().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });

    if (window.Spotify) {
      initPlayer();
    } else {
      // The SDK calls this global exactly once when it loads. Chain any
      // previous handler so a StrictMode remount still gets initialised.
      const prev = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        prev?.();
        initPlayer();
      };
      if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
        const script = document.createElement("script");
        script.src = SDK_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
      if (instance) {
        for (const ev of [
          "ready", "not_ready", "player_state_changed", "autoplay_failed",
          "initialization_error", "authentication_error", "account_error", "playback_error",
        ]) instance.removeListener(ev);
        instance.disconnect();
        instance = null;
      }
      setPlayer(null);
      setIsReady(false);
      setDeviceId(null);
      setState(null);
    };
  }, [enabled]);

  return { player, deviceId, state, isReady, error };
}
