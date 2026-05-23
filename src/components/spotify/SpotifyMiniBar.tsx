"use client";

import { usePathname } from "next/navigation";
import { useSpotifyContext } from "@/lib/context/SpotifyContext";
import { Play, Pause, SkipForward } from "lucide-react";

function SpotifyLogo() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="#1DB954">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

export function SpotifyMiniBar() {
  const pathname = usePathname();
  const { state, externalState, isReady, playPause, next } = useSpotifyContext();

  if (pathname === "/focus") return null;
  if (pathname === "/miniplayer") return null;

  const track = state?.track_window?.current_track;
  const extTrack = !track ? externalState?.item ?? null : null;
  const displayTrack = track ?? extTrack;

  if (!displayTrack) return null;

  const isPlaying = state ? !state.paused : (externalState?.is_playing ?? false);
  const albumArt = track?.album?.images?.[0]?.url ?? extTrack?.album?.images?.[0]?.url;
  const isExternal = !track && !!extTrack;
  const controlsEnabled = isReady || isExternal;

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-2xl z-50"
      style={{
        background: "var(--color-surface-container-high)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      {albumArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={albumArt} alt={displayTrack.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
      ) : (
        <div
          className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
          style={{ background: "var(--color-surface-container-highest)" }}
        >
          <SpotifyLogo />
        </div>
      )}
      <div className="min-w-0" style={{ maxWidth: 160 }}>
        <p className="text-xs font-semibold truncate" style={{ color: "var(--color-on-surface)" }}>
          {displayTrack.name}
        </p>
        <p className="text-[10px] truncate" style={{ color: "var(--color-on-surface-variant)" }}>
          {displayTrack.artists?.map((a) => a.name).join(", ")}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={playPause}
          disabled={!controlsEnabled}
          className="w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30 btn-hover-green"
          style={{ background: "#1DB954", color: "#000" }}
        >
          {isPlaying
            ? <Pause size={12} fill="currentColor" />
            : <Play size={12} fill="currentColor" />}
        </button>
        <button
          onClick={next}
          disabled={!controlsEnabled}
          className="w-6 h-6 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          <SkipForward size={12} />
        </button>
        <SpotifyLogo />
      </div>
    </div>
  );
}
