"use client";

import {
  Check, CheckCircle2, Circle, ListChecks,
  Shrink, Expand, Maximize2, Minimize2, Play, Pause, Music, PictureInPicture2,
} from "lucide-react";
import { toast } from "sonner";
import { SpotifyPanel } from "@/components/spotify/SpotifyPanel";
import { useSpotifyContext } from "@/lib/context/SpotifyContext";
import { useMiniPlayer } from "@/lib/hooks/useMiniPlayer";
import { useUiStore } from "@/lib/stores/ui";
import type { TimerMode, TimerStatus } from "@/lib/stores/timer";
import type { Subtask, TaskWithTags } from "@/types/database";

interface Props {
  activeTask: TaskWithTags | null;
  subtasks: Subtask[];
  onToggleSubtask: (st: Subtask) => void;
  onFinishTask: () => void;
  estimated: number;
  completed: number;
  progress: number;
  timerStatus: TimerStatus;
  timerMode: TimerMode;
  longBreakEvery: number;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
  color: "var(--color-on-surface-variant)", opacity: 0.8,
};

function DockEmpty({ text }: { text: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-2"
      style={{ color: "var(--color-on-surface-variant)", opacity: 0.7 }}
    >
      <ListChecks size={20} />
      <span style={{ fontSize: 12.5 }}>{text}</span>
    </div>
  );
}

function SubtasksCol({ activeTask, subtasks, onToggleSubtask }: Pick<Props, "activeTask" | "subtasks" | "onToggleSubtask">) {
  const done = subtasks.filter((s) => s.done).length;

  if (!activeTask) return <DockEmpty text="No task selected" />;
  if (subtasks.length === 0) return <DockEmpty text="No subtasks" />;

  // Always expanded — the list scrolls within a fixed height, so the dock's
  // height stays stable (collapsing it warped the music column).
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center w-full" style={{ gap: 9, marginBottom: 11 }}>
        <span style={LABEL_STYLE}>Subtasks</span>
        <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: "var(--color-primary)" }}>
          {done}/{subtasks.length}
        </span>
        <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.13)" }}>
          <div
            className="grad-primary h-full rounded-full"
            style={{ width: `${(done / subtasks.length) * 100}%`, transition: "width .3s" }}
          />
        </div>
      </div>
      <div className="no-scrollbar flex flex-col overflow-y-auto" style={{ gap: 2, maxHeight: 104, paddingRight: 2 }}>
        {subtasks.map((st) => (
          <button
            key={st.id}
            onClick={() => onToggleSubtask(st)}
            className="flex items-center text-left rounded-lg transition-colors hover:bg-white/5"
            style={{ gap: 10, padding: "7px 8px" }}
          >
            {st.done
              ? <CheckCircle2 size={16} className="shrink-0" style={{ color: "var(--color-primary)" }} />
              : <Circle size={16} className="shrink-0" style={{ color: "var(--color-on-surface-variant)" }} />}
            <span
              className="truncate"
              style={{
                fontSize: 13,
                color: st.done ? "var(--color-on-surface-variant)" : "var(--color-on-surface)",
                textDecoration: st.done ? "line-through" : "none",
              }}
            >
              {st.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionCol({
  activeTask, onFinishTask, estimated, completed, progress, timerStatus, timerMode, longBreakEvery,
}: Pick<Props, "activeTask" | "onFinishTask" | "estimated" | "completed" | "progress" | "timerStatus" | "timerMode" | "longBreakEvery">) {
  const isActive = timerStatus === "running" || timerStatus === "paused";
  const isBreak = timerMode === "short_break" || timerMode === "long_break";
  const est = Math.max(1, Math.ceil(estimated));
  const dots = Math.max(est, completed + (isActive && !isBreak ? 1 : 0));
  const nextBreakLong = longBreakEvery > 0 && (completed + 1) % longBreakEvery === 0;

  return (
    <div className="flex flex-col h-full">
      <span style={{ ...LABEL_STYLE, marginBottom: 12 }}>Session timeline</span>

      {timerMode === "custom" ? (
        <div style={{ marginBottom: "auto" }}>
          <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: "rgba(255,255,255,0.13)" }}>
            <div
              className="grad-primary h-full rounded-full"
              style={{ width: `${Math.min(progress, 1) * 100}%`, transition: "width .5s linear" }}
            />
          </div>
          <p style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", marginTop: 8 }}>Custom session</p>
        </div>
      ) : (
        <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: "auto" }}>
          {Array.from({ length: dots }).map((_, i) => {
            const isDone = i < completed;
            const isCurrent = i === completed && isActive && !isBreak;
            return (
              <div
                key={i}
                title={`Session ${i + 1}`}
                className={isCurrent ? "pulse-dot" : isDone ? "grad-primary" : ""}
                style={{
                  width: isCurrent ? 16 : 13, height: isCurrent ? 16 : 13, borderRadius: "50%",
                  background: isDone ? undefined : isCurrent ? "var(--color-primary)" : "rgba(255,255,255,0.13)",
                  border: isCurrent ? "2px solid color-mix(in srgb, var(--color-primary) 40%, transparent)" : "none",
                  transition: "all .3s",
                }}
              />
            );
          })}
          <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-on-surface-variant)", marginLeft: 4 }}>
            {completed}/{est}
          </span>
          {isBreak && isActive && (
            <span className="pill chip-accent" style={{ padding: "2px 9px", fontSize: 10.5 }}>
              {timerMode === "long_break" ? "Long break" : "Short break"}
            </span>
          )}
          {!isBreak && isActive && (
            <span style={{ fontSize: 10.5, color: "var(--color-on-surface-variant)", opacity: 0.7 }}>
              {nextBreakLong ? "Long break next" : "Short break next"}
            </span>
          )}
        </div>
      )}

      {activeTask && (
        <button
          onClick={onFinishTask}
          className="pill hover-lift chip-accent justify-center"
          style={{ marginTop: 12, padding: "8px 14px", fontSize: 12.5 }}
        >
          <Check size={14} /> Mark task done
        </button>
      )}
    </div>
  );
}

/** Slim now-playing bar shown while focus mode hides the dock. */
function MiniMusicBar() {
  const { isConnected, state, externalState, isReady, playPause } = useSpotifyContext();
  if (!isConnected) return null;

  const track = state?.track_window?.current_track;
  const extTrack = !track ? externalState?.item ?? null : null;
  const albumArt = track?.album?.images?.[0]?.url ?? extTrack?.album?.images?.[0]?.url;
  const trackName = track?.name ?? extTrack?.name ?? "Nothing playing";
  const trackArtists =
    track?.artists?.map((a) => a.name).join(", ") ??
    extTrack?.artists?.map((a) => a.name).join(", ") ?? "";
  const isPlaying = state ? !state.paused : (externalState?.is_playing ?? false);
  const enabled = isReady || !!externalState?.device;

  return (
    <>
      {albumArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={albumArt} alt={trackName} style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: "linear-gradient(135deg, #1DB954, #0d6b32)", display: "grid", placeItems: "center",
        }}>
          <Music size={16} style={{ color: "rgba(255,255,255,0.9)" }} />
        </div>
      )}
      <div style={{ minWidth: 0, width: 130 }}>
        <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-on-surface)" }}>{trackName}</p>
        <p className="truncate" style={{ fontSize: 11, color: "var(--color-on-surface-variant)" }}>{trackArtists}</p>
      </div>
      <button
        onClick={playPause}
        disabled={!enabled}
        className="disabled:opacity-30"
        style={{
          width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center",
          color: "#000", background: "#1DB954", flexShrink: 0,
        }}
      >
        {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 1 }} />}
      </button>
    </>
  );
}

export function FocusDock(props: Props) {
  const { focusMode, setFocusMode } = useUiStore();
  const { isConnected } = useSpotifyContext();
  const { isFullscreen, onToggleFullscreen } = props;
  const { open: openPip } = useMiniPlayer();

  async function openMiniPlayer() {
    const ok = await openPip();
    if (!ok) toast.error("Mini player needs Chrome 116+ (Document Picture-in-Picture).");
  }

  const divider = <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.06)" }} />;

  return (
    <>
      {/* Full dock — wrapper centers via flex (no transform!) so the glass
          card's backdrop-filter can actually sample the page behind it.
          A transformed ancestor silently kills backdrop blur in Chromium. */}
      <div
        className="fixed left-0 right-0 flex justify-center"
        style={{ bottom: 22, zIndex: 50, pointerEvents: "none" }}
      >
        <div
          className="glass relative"
          style={{
            borderRadius: 22, padding: "16px 18px",
            width: "min(880px, calc(100vw - 36px))",
            transform: focusMode ? "translateY(160%)" : "none",
            opacity: focusMode ? 0 : 1,
            transition: "transform .5s var(--ease), opacity .4s",
            pointerEvents: focusMode ? "none" : "auto",
          }}
        >
          {/* Corner controls: fullscreen · pop-out · focus mode */}
          <div className="absolute flex items-center" style={{ top: 12, right: 12, gap: 6, zIndex: 2 }}>
            <button
              onClick={onToggleFullscreen}
              className="icon-btn"
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              style={{ width: 30, height: 30 }}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={openMiniPlayer}
              className="icon-btn"
              title="Pop out mini player"
              style={{ width: 30, height: 30 }}
            >
              <PictureInPicture2 size={14} />
            </button>
            <button
              onClick={() => setFocusMode(true)}
              className="icon-btn"
              title="Enter focus mode — hide the dock"
              style={{ width: 30, height: 30 }}
            >
              <Shrink size={15} />
            </button>
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: isConnected ? "1.1fr 1px 1fr 1px 1.05fr" : "1.2fr 1px 1fr",
              gap: 18, minHeight: 108,
            }}
          >
            <SubtasksCol activeTask={props.activeTask} subtasks={props.subtasks} onToggleSubtask={props.onToggleSubtask} />
            {divider}
            <SessionCol
              activeTask={props.activeTask}
              onFinishTask={props.onFinishTask}
              estimated={props.estimated}
              completed={props.completed}
              progress={props.progress}
              timerStatus={props.timerStatus}
              timerMode={props.timerMode}
              longBreakEvery={props.longBreakEvery}
            />
            {isConnected && (
              <>
                {divider}
                <SpotifyPanel />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Focus-mode mini bar — music persists, plus exit affordance */}
      <div
        className="fixed left-0 right-0 flex justify-center"
        style={{ bottom: 22, zIndex: 50, pointerEvents: "none" }}
      >
        <div
          className="glass flex items-center"
          style={{
            borderRadius: 999, padding: "8px 10px 8px 14px", gap: 14,
            transform: focusMode ? "none" : "translateY(160%)",
            opacity: focusMode ? 1 : 0,
            transition: "transform .5s var(--ease), opacity .4s",
            pointerEvents: focusMode ? "auto" : "none",
          }}
        >
          {isConnected && (
            <>
              <MiniMusicBar />
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.06)" }} />
            </>
          )}
          <button
            onClick={() => setFocusMode(false)}
            className="pill hover-lift"
            style={{ padding: "8px 14px", fontSize: 12.5, color: "var(--color-on-surface-variant)" }}
          >
            <Expand size={15} /> Show dock
          </button>
        </div>
      </div>
    </>
  );
}
