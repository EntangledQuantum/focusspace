"use client";

import { useTimer } from "@/lib/hooks/useTimer";
import { useSpotifyContext } from "@/lib/context/SpotifyContext";
import { Play, Pause, RotateCcw, SkipForward as SkipFwd, Music, SkipBack } from "lucide-react";

/**
 * Compact player rendered inside a Document PiP window (300×400).
 * Shows the focus timer + controls and the current Spotify track + controls.
 * Shares React state with the main app via portal — no cross-window sync needed.
 */
export function MiniPlayer() {
  const timer = useTimer();
  const {
    state, externalState, isReady, isConnected,
    playPause, next, previous,
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

  const modeLabel =
    timer.mode === "short_break" ? "Short Break"
      : timer.mode === "long_break" ? "Long Break"
      : timer.mode === "custom" ? "Custom" : "Focus";

  const card: React.CSSProperties = {
    borderRadius: 16,
    background: "color-mix(in srgb, var(--color-surface-container) 80%, transparent)",
    border: "1px solid rgba(255,255,255,0.07)",
  };
  const ghostBtn: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 999, border: "none",
    background: "rgba(255,255,255,0.06)",
    color: "var(--color-on-surface-variant)",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  };

  return (
    <div
      style={{
        height: "100dvh",
        boxSizing: "border-box",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "var(--color-background)",
        color: "var(--color-on-surface)",
        overflow: "hidden",
      }}
    >
      {/* Timer */}
      <div style={{ ...card, padding: 16, textAlign: "center" }}>
        <p style={{ fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase", opacity: 0.5, marginBottom: 6 }}>
          {modeLabel}
        </p>
        <p style={{ fontSize: 46, fontFamily: "var(--font-display)", fontWeight: 600, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {timer.displayTime}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 14 }}>
          <button onClick={timer.resetSession} title="Reset" style={ghostBtn}>
            <RotateCcw size={14} />
          </button>
          <button
            onClick={handlePlayPause}
            title={timer.status === "running" ? "Pause" : "Start"}
            style={{
              width: 48, height: 48, borderRadius: 999, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
              color: "var(--color-on-primary)",
              boxShadow: "0 6px 20px -6px color-mix(in srgb, var(--color-primary) 60%, transparent)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {timer.status === "running" ? <Pause size={19} /> : <Play size={19} style={{ marginLeft: 2 }} />}
          </button>
          <button onClick={timer.skipSession} title="Skip" style={ghostBtn}>
            <SkipFwd size={14} />
          </button>
        </div>
      </div>

      {/* Spotify — sized to its content, not stretched */}
      {isConnected && (
        <div style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {albumArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={albumArt} alt={trackName} style={{ width: 40, height: 40, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: 9, flexShrink: 0,
                background: "rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Music size={17} style={{ opacity: 0.6 }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {trackName ?? "Nothing playing"}
              </p>
              {trackArtists && (
                <p style={{ fontSize: 10.5, opacity: 0.6, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {trackArtists}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <button
              onClick={previous}
              disabled={!controlsEnabled}
              style={{ ...ghostBtn, width: 30, height: 30, background: "transparent", opacity: controlsEnabled ? 1 : 0.3 }}
            >
              <SkipBack size={15} />
            </button>
            <button
              onClick={playPause}
              disabled={!controlsEnabled}
              style={{
                width: 38, height: 38, borderRadius: 999, border: "none", cursor: "pointer",
                background: "#1DB954", color: "#000",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: controlsEnabled ? 1 : 0.3,
              }}
            >
              {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 1 }} />}
            </button>
            <button
              onClick={next}
              disabled={!controlsEnabled}
              style={{ ...ghostBtn, width: 30, height: 30, background: "transparent", opacity: controlsEnabled ? 1 : 0.3 }}
            >
              <SkipFwd size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
