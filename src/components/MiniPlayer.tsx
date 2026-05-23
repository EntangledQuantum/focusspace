"use client";

import { useTimer } from "@/lib/hooks/useTimer";
import { useSpotifyContext } from "@/lib/context/SpotifyContext";
import { Play, Pause, RotateCcw, SkipForward as SkipFwd, Music, Shuffle, SkipBack } from "lucide-react";

/**
 * Compact player rendered inside a Document PiP window.
 * Shows the focus timer + controls and current Spotify track + controls.
 * Shares React state with the main app via portal, so no cross-window sync needed.
 */
export function MiniPlayer() {
  const timer = useTimer();
  const {
    state, externalState, isReady, isConnected,
    playPause, next, previous, shuffle, setShuffle,
  } = useSpotifyContext();

  const track = state?.track_window?.current_track;
  const extTrack = !track ? externalState?.item ?? null : null;
  const albumArt = track?.album?.images?.[0]?.url ?? extTrack?.album?.images?.[0]?.url;
  const trackName = track?.name ?? extTrack?.name;
  const trackArtists =
    track?.artists?.map((a) => a.name).join(", ") ??
    extTrack?.artists?.map((a) => a.name).join(", ");
  const isPlaying = state ? !state.paused : (externalState?.is_playing ?? false);
  const controlsEnabled = isReady || !!externalState?.device;

  function handlePlayPause() {
    if (timer.status === "idle" || timer.status === "completed") {
      timer.startSession({ mode: timer.mode, durationSec: timer.plannedDurationSec });
    } else if (timer.status === "running") {
      timer.pause();
    } else if (timer.status === "paused") {
      timer.resume();
    }
  }

  return (
    <div
      style={{
        padding: 18,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "var(--color-background)",
      }}
    >
      {/* Timer block */}
      <div
        style={{
          padding: 16,
          borderRadius: 18,
          background: "color-mix(in srgb, var(--color-surface-container) 60%, transparent)",
          border: "1px solid rgba(255,255,255,0.06)",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.5, marginBottom: 4 }}>
          {timer.mode === "short_break" ? "Short Break"
            : timer.mode === "long_break" ? "Long Break"
            : timer.mode === "custom" ? "Custom" : "Focus"}
        </p>
        <p style={{ fontSize: 48, fontFamily: "var(--font-display)", fontWeight: 600, lineHeight: 1 }}>
          {timer.displayTime}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 12 }}>
          <button
            onClick={timer.resetSession}
            title="Reset"
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              color: "var(--color-on-surface-variant)",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={handlePlayPause}
            title={timer.status === "running" ? "Pause" : "Start"}
            style={{
              width: 52, height: 52, borderRadius: 999,
              background: "var(--color-primary)",
              color: "var(--color-on-primary)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 6px 24px color-mix(in srgb, var(--color-primary) 30%, transparent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {timer.status === "running" ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
          </button>
          <button
            onClick={timer.skipSession}
            title="Skip"
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              color: "var(--color-on-surface-variant)",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <SkipFwd size={14} />
          </button>
        </div>
      </div>

      {/* Spotify block */}
      {isConnected && (
        <div
          style={{
            flex: 1,
            padding: 14,
            borderRadius: 18,
            background: "color-mix(in srgb, var(--color-surface-container) 60%, transparent)",
            border: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {albumArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={albumArt} alt={trackName} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: "rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Music size={18} style={{ opacity: 0.6 }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 12, fontWeight: 600,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {trackName ?? "Nothing playing"}
              </p>
              {trackArtists && (
                <p style={{
                  fontSize: 10, opacity: 0.6, marginTop: 2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {trackArtists}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              onClick={() => setShuffle(!shuffle)}
              title="Shuffle"
              style={{
                width: 28, height: 28, borderRadius: 999, border: "none",
                background: shuffle ? "rgba(29,185,84,0.18)" : "transparent",
                color: shuffle ? "#1DB954" : "var(--color-on-surface-variant)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Shuffle size={12} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={previous}
                disabled={!controlsEnabled}
                style={{
                  width: 30, height: 30, borderRadius: 999, border: "none",
                  background: "transparent",
                  color: "var(--color-on-surface-variant)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: controlsEnabled ? 1 : 0.3,
                }}
              >
                <SkipBack size={15} />
              </button>
              <button
                onClick={playPause}
                disabled={!controlsEnabled}
                style={{
                  width: 38, height: 38, borderRadius: 999, border: "none",
                  background: "#1DB954",
                  color: "#000",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: controlsEnabled ? 1 : 0.3,
                }}
              >
                {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 1 }} />}
              </button>
              <button
                onClick={next}
                disabled={!controlsEnabled}
                style={{
                  width: 30, height: 30, borderRadius: 999, border: "none",
                  background: "transparent",
                  color: "var(--color-on-surface-variant)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: controlsEnabled ? 1 : 0.3,
                }}
              >
                <SkipFwd size={15} />
              </button>
            </div>
            <span style={{ width: 28 }} />
          </div>
        </div>
      )}
    </div>
  );
}
