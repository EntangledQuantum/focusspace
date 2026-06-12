"use client";

import { useState, useEffect, useRef } from "react";
import { useSpotifyContext } from "@/lib/context/SpotifyContext";
import { MusicPicker } from "@/components/spotify/MusicPicker";
import {
  Music, Play, Pause, SkipBack, SkipForward, ChevronDown, ListMusic,
  Shuffle, Volume2, VolumeX, ExternalLink,
} from "lucide-react";

function SpotifyLogo({ size = 16, color = "#1DB954" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

/**
 * Compact music column for the FocusDock. Hidden entirely until Spotify is
 * connected (connect lives in Settings → Music). "Choose music" opens the
 * big MusicPicker modal (browse + unified search).
 */
export function SpotifyPanel() {
  const {
    isConnected, tokenLoading, state, isReady, sdkError,
    selectedPlaylist, setSelectedPlaylist, externalState, progress,
    volume, setVolume, shuffle, setShuffle,
    playPause, next, previous, transferToSdk, playContext,
  } = useSpotifyContext();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(60);
  const volumeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) setVolumeOpen(false);
    }
    if (volumeOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [volumeOpen]);

  if (tokenLoading || !isConnected) return null;

  if (sdkError) {
    return (
      <div className="flex items-center gap-3 h-full">
        <SpotifyLogo size={16} />
        <p className="text-xs" style={{ color: "var(--color-error)" }}>{sdkError}</p>
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
    <div className="flex flex-col h-full" style={{ gap: 9 }}>
      {/* Header — the pop-out button lives in the dock corner, not here */}
      <div className="flex items-center" style={{ gap: 7, paddingRight: 104 }}>
        <SpotifyLogo size={13} />
        <span
          className="uppercase truncate"
          style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            color: "var(--color-on-surface-variant)", opacity: 0.8,
          }}
        >
          Now playing
        </span>
      </div>

      {/* Music chooser — opens the big browse/search modal */}
      <button
        onClick={() => setPickerOpen(true)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors btn-hover-surface"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          color: "var(--color-on-surface-variant)",
        }}
      >
        <ListMusic size={12} />
        <span className="flex-1 text-[11px] truncate">
          {selectedPlaylist ? selectedPlaylist.name : "Choose music…"}
        </span>
        <ChevronDown size={12} />
      </button>
      <MusicPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(ctx) => {
          setSelectedPlaylist(ctx);
          playContext(ctx);
        }}
      />

      {/* Now playing row */}
      <div className="flex items-center gap-2.5">
        {albumArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={albumArt} alt={trackName} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        ) : (
          <div
            className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
            style={{ background: "var(--color-surface-container-high)" }}
          >
            <Music size={16} style={{ color: "var(--color-on-surface-variant)" }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--color-on-surface)" }}>
            {trackName ?? (isReady ? "Ready" : "Connecting…")}
          </p>
          <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            {trackArtists ?? (extTrack ? "" : "Pick something to play")}
            {isExternal && externalState?.device && (
              <span className="inline-flex items-center gap-1 ml-1">
                <ExternalLink size={8} /> {externalState.device.name}
              </span>
            )}
          </p>
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
      <div className="flex items-center justify-between mt-auto">
        {/* Shuffle */}
        <button
          onClick={() => setShuffle(!shuffle)}
          title={shuffle ? "Shuffle on" : "Shuffle off"}
          className="w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90"
          style={{
            color: shuffle ? "#1DB954" : "var(--color-on-surface-variant)",
            background: shuffle ? "rgba(29,185,84,0.12)" : "transparent",
          }}
        >
          <Shuffle size={13} />
        </button>

        <div className="flex items-center gap-3.5">
          <button
            onClick={previous}
            disabled={!isReady && !isExternal}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <SkipBack size={15} />
          </button>
          <button
            onClick={playPause}
            disabled={!isReady && !isExternal}
            className="w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30 btn-hover-green"
            style={{ background: "#1DB954", color: "#000" }}
          >
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <button
            onClick={next}
            disabled={!isReady && !isExternal}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <SkipForward size={15} />
          </button>
        </div>

        {/* Volume */}
        <div ref={volumeRef} className="relative">
          <button
            onClick={() => setVolumeOpen((v) => !v)}
            title="Volume"
            className="w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
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
                className="flex-1 rng"
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
          className="w-full text-[10.5px] py-1 rounded-lg transition-all btn-hover-surface"
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
