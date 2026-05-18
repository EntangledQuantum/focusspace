"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

interface SpotifyPlayerInstance {
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
}

interface UseSpotifyPlayerOptions {
  token: string | null;
  onTokenRefresh?: () => Promise<string | null>;
}

export function useSpotifyPlayer({ token, onTokenRefresh }: UseSpotifyPlayerOptions) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [state, setState] = useState<SpotifyPlaybackState | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const tokenRef = useRef<string | null>(token);

  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    if (!token) return;

    function initPlayer() {
      const player = new window.Spotify.Player({
        name: "FocusSpace",
        getOAuthToken: async (cb) => {
          let t = tokenRef.current;
          if (!t && onTokenRefresh) t = await onTokenRefresh();
          if (t) cb(t);
        },
        volume: 0.6,
      });

      player.addListener("ready", (data) => {
        const { device_id } = data as { device_id: string };
        setDeviceId(device_id);
        setIsReady(true);
        setError(null);
      });

      player.addListener("not_ready", () => {
        setIsReady(false);
        setDeviceId(null);
      });

      player.addListener("player_state_changed", (s) => {
        setState(s as SpotifyPlaybackState | null);
      });

      player.addListener("initialization_error", (data) => {
        const { message } = data as { message: string };
        setError(`Initialization failed: ${message}`);
      });

      player.addListener("authentication_error", (data) => {
        const { message } = data as { message: string };
        setError(`Authentication failed: ${message}`);
      });

      player.addListener("account_error", () => {
        setError("Spotify Premium is required for in-browser playback.");
      });

      player.connect();
      playerRef.current = player;
    }

    if (typeof window !== "undefined" && window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      if (!document.querySelector('script[src*="spotify-player"]')) {
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
        setIsReady(false);
        setDeviceId(null);
        setState(null);
      }
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const playContext = useCallback(async (contextUri: string) => {
    if (!deviceId || !tokenRef.current) return;
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenRef.current}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ context_uri: contextUri }),
    });
  }, [deviceId]);

  const transferPlayback = useCallback(async (play = false) => {
    if (!deviceId || !tokenRef.current) return;
    await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenRef.current}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device_ids: [deviceId], play }),
    });
  }, [deviceId]);

  return {
    player: playerRef.current,
    deviceId,
    state,
    isReady,
    error,
    playContext,
    transferPlayback,
  };
}
