"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSpotifyContext, type PlayableContext } from "@/lib/context/SpotifyContext";
import { spotifyFetch, spotifyJson } from "@/lib/spotify/api";
import { useTimerStore } from "@/lib/stores/timer";
import { useMiniPlayer } from "@/lib/hooks/useMiniPlayer";
import { toast } from "sonner";
import {
  Music, Play, Pause, SkipBack, SkipForward, ChevronDown, Search, ListMusic,
  Shuffle, Volume2, VolumeX, ExternalLink, PictureInPicture2,
} from "lucide-react";

type SearchType = "playlist" | "track" | "album" | "artist";

interface SearchHit extends PlayableContext {
  subtitle?: string;
}

function SpotifyLogo({ size = 16, color = "#1DB954" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function SearchPicker({
  onSelect,
  onClose,
}: {
  onSelect: (ctx: PlayableContext) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  // Default to track since playlist search is restricted for unverified apps (Spotify Nov 2024)
  const [searchType, setSearchType] = useState<SearchType>("track");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // User's own playlists — used as the "Playlists" tab list (search-for-playlist is restricted)
  const { data: playlists = [] } = useQuery<SearchHit[]>({
    queryKey: ["spotify-playlists"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await spotifyJson<{ items: any[] }>("/me/playlists", { params: { limit: "50" } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data?.items ?? []) as any[]).filter(Boolean).map((p: any) => ({
        uri: p.uri,
        name: p.name,
        images: p.images,
        type: "playlist" as const,
        subtitle: `${p.tracks?.total ?? 0} tracks`,
      }));
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim();
    if (!q) { setSearchResults([]); setSearchError(null); return; }
    // Playlist tab uses client-side filter on user's own playlists (Spotify restricts playlist search)
    if (searchType === "playlist") { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const res = await spotifyFetch("/search", {
          params: { q, type: searchType, limit: "20" },
        });
        if (!res.ok) {
          setSearchResults([]);
          setSearchError(res.status === 403
            ? "Spotify rejected the search — check your account permissions."
            : `Search failed (${res.status}) — try again.`);
          return;
        }
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const key = (searchType + "s") as keyof typeof data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = ((data[key]?.items ?? []) as any[]).filter(Boolean);
        const hits: SearchHit[] = items.map((it) => {
          if (searchType === "track") {
            return {
              uri: it.uri,
              name: it.name,
              images: it.album?.images,
              type: "track" as const,
              subtitle: it.artists?.map((a: { name: string }) => a.name).join(", "),
            };
          }
          if (searchType === "album") {
            return {
              uri: it.uri,
              name: it.name,
              images: it.images,
              type: "album" as const,
              subtitle: it.artists?.map((a: { name: string }) => a.name).join(", "),
            };
          }
          return {
            uri: it.uri,
            name: it.name,
            images: it.images,
            type: "artist" as const,
            subtitle: it.genres?.[0] ?? "Artist",
          };
        });
        setSearchResults(hits);
      } catch {
        setSearchResults([]);
        setSearchError("Spotify isn't reachable — reconnect in Settings.");
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, [search, searchType]);

  // For playlist tab: client-side filter user's own playlists by query
  const filteredOwnPlaylists = search.trim()
    ? playlists.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : playlists;
  const displayList = searchType === "playlist" ? filteredOwnPlaylists : searchResults;

  return (
    <div
      className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl overflow-hidden z-50"
      style={{
        background: "var(--color-surface-container-high)",
        border: "1px solid rgba(255,255,255,0.08)",
        maxHeight: 380,
        boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
      }}
    >
      <div className="p-3 space-y-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "var(--color-surface-container-highest)" }}
        >
          <Search size={13} style={{ color: "var(--color-on-surface-variant)" }} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchType === "playlist" ? "Filter your playlists…" : `Search ${searchType}s…`}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-on-surface)" }}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["track", "album", "artist", "playlist"] as SearchType[]).map((t) => (
            <button
              key={t}
              onClick={() => setSearchType(t)}
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-all"
              style={{
                background: searchType === t ? "rgba(29,185,84,0.18)" : "transparent",
                color: searchType === t ? "#1DB954" : "var(--color-on-surface-variant)",
                border: searchType === t ? "1px solid rgba(29,185,84,0.35)" : "1px solid transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
        {isSearching ? (
          <div className="p-4 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            Searching…
          </div>
        ) : searchError && searchType !== "playlist" ? (
          <div className="p-4 text-center text-sm" style={{ color: "var(--color-error)" }}>
            {searchError}
          </div>
        ) : displayList.length === 0 ? (
          <div className="p-4 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            {searchType === "playlist"
              ? (search ? "No matching playlists" : "No playlists yet")
              : (search ? "No results" : "Type to search")}
          </div>
        ) : (
          displayList.map((hit) => (
            <button
              key={hit.uri}
              onClick={() => { onSelect(hit); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
            >
              {hit.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hit.images[0].url}
                  alt={hit.name}
                  className="w-9 h-9 rounded-lg object-cover shrink-0"
                  style={{ borderRadius: hit.type === "artist" ? "50%" : undefined }}
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
                  {hit.name}
                </p>
                {hit.subtitle && (
                  <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
                    {hit.subtitle}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function SpotifyPanel() {
  const {
    isConnected, tokenLoading, state, isReady, sdkError,
    selectedPlaylist, setSelectedPlaylist, externalState, progress,
    volume, setVolume, shuffle, setShuffle,
    playPause, next, previous, transferToSdk, playContext,
  } = useSpotifyContext();
  const qc = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(60);
  const pickerRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const timerStatus = useTimerStore((s) => s.status);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) setVolumeOpen(false);
    }
    if (pickerOpen || volumeOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen, volumeOpen]);

  function connectSpotify() {
    window.location.href = "/api/spotify/connect?next=/focus";
  }

  const { open: openPip } = useMiniPlayer();

  async function openMiniPlayer() {
    const ok = await openPip();
    if (!ok) toast.error("Mini player needs Chrome 116+ (Document Picture-in-Picture).");
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
          className="px-4 py-2 rounded-full text-xs font-semibold shrink-0 transition-all active:scale-95 btn-hover-green"
          style={{ background: "#1DB954", color: "#000" }}
        >
          Connect
        </button>
      </div>
    );
  }

  if (sdkError) {
    return (
      <div className="glass rounded-2xl px-6 py-3 flex items-center gap-3 w-full max-w-[420px] mt-4">
        <SpotifyLogo size={16} />
        <p className="text-sm" style={{ color: "var(--color-error)" }}>{sdkError}</p>
      </div>
    );
  }

  const track = state?.track_window?.current_track;
  const extTrack = !track ? externalState?.item ?? null : null;
  const albumArt = track?.album?.images?.[0]?.url ?? extTrack?.album?.images?.[0]?.url;
  const isPlaying = state ? !state.paused : (externalState?.is_playing ?? false);
  const trackName = track?.name ?? extTrack?.name;
  const trackArtists =
    track?.artists?.map((a) => a.name).join(", ") ??
    extTrack?.artists?.map((a) => a.name).join(", ");
  const isExternal = !track && !!extTrack;

  const extProgress = extTrack && externalState && extTrack.duration_ms
    ? externalState.progress_ms / extTrack.duration_ms
    : progress;

  function toggleMute() {
    if (volume > 0) {
      setLastVolume(volume);
      setVolume(0);
    } else {
      setVolume(lastVolume || 60);
    }
  }

  return (
    <div className="glass rounded-2xl p-4 w-full max-w-[420px] mt-4 space-y-3">
      {/* Playlist / search selector */}
      <div ref={pickerRef} className="relative">
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-left transition-colors btn-hover-surface"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          <ListMusic size={14} />
          <span className="flex-1 text-xs truncate">
            {selectedPlaylist ? selectedPlaylist.name : "Choose music…"}
          </span>
          <ChevronDown size={13} className={`transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
        </button>
        {pickerOpen && (
          <SearchPicker
            onSelect={(ctx) => {
              setSelectedPlaylist(ctx);
              playContext(ctx);
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
          <img src={albumArt} alt={trackName} className="w-12 h-12 rounded-xl object-cover shrink-0" />
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
            {trackName ?? (isReady ? "Ready" : "Connecting…")}
          </p>
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            {trackArtists ?? (extTrack ? "" : "Pick something to play")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={openMiniPlayer}
            title="Open mini player"
            className="transition-opacity opacity-60 hover:opacity-100"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <PictureInPicture2 size={13} />
          </button>
          {isExternal && externalState?.device && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--color-on-surface-variant)" }}>
              <ExternalLink size={9} />
              {externalState.device.name}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${extProgress * 100}%`, background: "#1DB954" }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        {/* Shuffle */}
        <button
          onClick={() => setShuffle(!shuffle)}
          title={shuffle ? "Shuffle on" : "Shuffle off"}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90"
          style={{
            color: shuffle ? "#1DB954" : "var(--color-on-surface-variant)",
            background: shuffle ? "rgba(29,185,84,0.12)" : "transparent",
          }}
        >
          <Shuffle size={14} />
        </button>

        <div className="flex items-center gap-4">
          <button
            onClick={previous}
            disabled={!isReady && !isExternal}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <SkipBack size={17} />
          </button>
          <button
            onClick={playPause}
            disabled={!isReady && !isExternal}
            className="w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30 btn-hover-green"
            style={{ background: "#1DB954", color: "#000" }}
          >
            {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
          </button>
          <button
            onClick={next}
            disabled={!isReady && !isExternal}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <SkipForward size={17} />
          </button>
        </div>

        {/* Volume */}
        <div ref={volumeRef} className="relative">
          <button
            onClick={() => setVolumeOpen((v) => !v)}
            title="Volume"
            className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          {volumeOpen && (
            <div
              className="absolute bottom-full right-0 mb-2 p-3 rounded-xl flex items-center gap-2"
              style={{
                background: "var(--color-surface-container-high)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
                width: 180,
              }}
            >
              <button onClick={toggleMute} style={{ color: "var(--color-on-surface-variant)" }}>
                {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                className="flex-1 accent-[#1DB954]"
              />
              <span className="text-[10px] w-7 text-right" style={{ color: "var(--color-on-surface-variant)" }}>
                {volume}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Takeover hint */}
      {isExternal && (
        <button
          onClick={() => transferToSdk(true)}
          className="w-full text-[11px] py-1.5 rounded-lg transition-all btn-hover-surface"
          style={{
            color: "var(--color-on-surface-variant)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          Take over playback here
        </button>
      )}
    </div>
  );
}
