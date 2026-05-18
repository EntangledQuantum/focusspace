"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSpotify } from "@/lib/hooks/useSpotify";
import { useSpotifyPlayer } from "@/lib/hooks/useSpotifyPlayer";
import { useTimerStore } from "@/lib/stores/timer";
import { Music, Play, Pause, SkipBack, SkipForward, ChevronDown, Search, ListMusic } from "lucide-react";

interface Playlist {
  id: string;
  name: string;
  images: { url: string }[];
  uri: string;
  tracks: { total: number };
}

function SpotifyLogo({ size = 16, color = "#1DB954" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function PlaylistPicker({
  token,
  onSelect,
  onClose,
}: {
  token: string;
  onSelect: (playlist: Playlist) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Playlist[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: playlists = [] } = useQuery<Playlist[]>({
    queryKey: ["spotify-playlists"],
    queryFn: async () => {
      const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return (data.items ?? []) as Playlist[];
    },
    staleTime: 60 * 1000,
  });

  function handleSearchChange(q: string) {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `https://api.spotify.com/v1/search?type=playlist&q=${encodeURIComponent(q)}&limit=20`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        setSearchResults(
          ((data.playlists?.items ?? []) as (Playlist | null)[]).filter(Boolean) as Playlist[]
        );
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }

  const displayList = search.trim() ? searchResults : playlists;

  return (
    <div
      className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl overflow-hidden z-50"
      style={{
        background: "var(--color-surface-container-high)",
        border: "1px solid rgba(255,255,255,0.08)",
        maxHeight: 320,
        boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
      }}
    >
      <div className="p-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "var(--color-surface-container-highest)" }}
        >
          <Search size={13} style={{ color: "var(--color-on-surface-variant)" }} />
          <input
            autoFocus
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search playlists…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-on-surface)" }}
          />
        </div>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
        {isSearching ? (
          <div className="p-4 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            Searching…
          </div>
        ) : displayList.length === 0 ? (
          <div className="p-4 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            {search ? "No results" : "No playlists found"}
          </div>
        ) : (
          displayList.map((pl) => (
            <button
              key={pl.id}
              onClick={() => { onSelect(pl); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
            >
              {pl.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pl.images[0].url}
                  alt={pl.name}
                  className="w-9 h-9 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
                  style={{ background: "var(--color-surface-container-highest)" }}
                >
                  <ListMusic size={14} style={{ color: "var(--color-on-surface-variant)" }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--color-on-surface)" }}>
                  {pl.name}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--color-on-surface-variant)" }}>
                  {pl.tracks.total} tracks
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

interface SpotifyPanelProps {
  autoStart?: boolean;
}

export function SpotifyPanel({ autoStart = true }: SpotifyPanelProps) {
  const qc = useQueryClient();
  const { data, isLoading: tokenLoading, refetch: refreshToken } = useSpotify();
  const token = data?.token ?? null;
  const isConnected = data?.isConnected ?? false;

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const timerStatus = useTimerStore((s) => s.status);
  const prevTimerStatus = useRef(timerStatus);

  const handleTokenRefresh = useCallback(async () => {
    const result = await refreshToken();
    return result.data?.token ?? null;
  }, [refreshToken]);

  const { player, deviceId, state, isReady, error } = useSpotifyPlayer({
    token,
    onTokenRefresh: handleTokenRefresh,
  });

  // Progress bar tick
  useEffect(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    if (!state) return;
    if (state.paused) {
      setProgress(state.duration > 0 ? state.position / state.duration : 0);
      return;
    }
    const tick = () => {
      player?.getCurrentState().then((s) => {
        if (s) setProgress(s.duration > 0 ? s.position / s.duration : 0);
      });
    };
    progressInterval.current = setInterval(tick, 500);
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, [state, player]);

  // Auto-start on timer run
  useEffect(() => {
    if (!autoStart || !isReady || !deviceId || !token) return;
    const wasIdle = prevTimerStatus.current === "idle" || prevTimerStatus.current === "completed";
    if (wasIdle && timerStatus === "running") {
      if (selectedPlaylist) {
        fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ context_uri: selectedPlaylist.uri }),
        });
      } else if (state?.paused !== false) {
        player?.resume();
      }
    }
    prevTimerStatus.current = timerStatus;
  }, [timerStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  function connectSpotify() {
    window.location.href = "/api/spotify/connect?next=/focus";
  }

  const isSessionActive = timerStatus === "running" || timerStatus === "paused";

  if (tokenLoading) return null;

  if (!isConnected) {
    if (isSessionActive) return null;
    return (
      <div className="glass rounded-2xl px-6 py-4 flex items-center gap-4 w-full max-w-[420px] mt-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "color-mix(in srgb, #1DB954 15%, transparent)" }}
        >
          <SpotifyLogo size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>
            Connect Spotify
          </p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Play music during focus sessions
          </p>
        </div>
        <button
          onClick={connectSpotify}
          className="px-4 py-2 rounded-full text-xs font-semibold shrink-0 transition-all active:scale-95"
          style={{ background: "#1DB954", color: "#000" }}
        >
          Connect
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl px-6 py-3 flex items-center gap-3 w-full max-w-[420px] mt-4">
        <SpotifyLogo size={16} />
        <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>
      </div>
    );
  }

  const track = state?.track_window?.current_track;
  const albumArt = track?.album?.images?.[0]?.url;
  const isPlaying = state ? !state.paused : false;

  function handlePlayPause() {
    if (!isReady) return;
    if (!state && selectedPlaylist && deviceId && token) {
      fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ context_uri: selectedPlaylist.uri }),
      });
    } else {
      player?.togglePlay();
    }
  }

  return (
    <div className="glass rounded-2xl p-4 w-full max-w-[420px] mt-4 space-y-3">
      {/* Playlist selector */}
      <div ref={pickerRef} className="relative">
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-left transition-colors"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          <ListMusic size={14} />
          <span className="flex-1 text-xs truncate">
            {selectedPlaylist ? selectedPlaylist.name : "Choose a playlist…"}
          </span>
          <ChevronDown
            size={13}
            className={`transition-transform ${pickerOpen ? "rotate-180" : ""}`}
          />
        </button>
        {pickerOpen && token && (
          <PlaylistPicker
            token={token}
            onSelect={(pl) => {
              setSelectedPlaylist(pl);
              qc.invalidateQueries({ queryKey: ["spotify-playlists"] });
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* Now playing */}
      <div className="flex items-center gap-3">
        {albumArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={albumArt} alt={track?.album?.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
        ) : (
          <div
            className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center"
            style={{ background: "var(--color-surface-container-high)" }}
          >
            <Music size={18} style={{ color: "var(--color-on-surface-variant)" }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--color-on-surface)" }}>
            {track?.name ?? (isReady ? "Ready" : "Connecting…")}
          </p>
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            {track?.artists?.map((a) => a.name).join(", ") ?? "Pick a playlist to start"}
          </p>
        </div>
        <SpotifyLogo size={15} />
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress * 100}%`, background: "#1DB954" }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => player?.previousTrack()}
          disabled={!isReady}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          <SkipBack size={17} />
        </button>
        <button
          onClick={handlePlayPause}
          disabled={!isReady}
          className="w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30"
          style={{ background: "#1DB954", color: "#000" }}
        >
          {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
        </button>
        <button
          onClick={() => player?.nextTrack()}
          disabled={!isReady}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          <SkipForward size={17} />
        </button>
      </div>
    </div>
  );
}
