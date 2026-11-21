"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square, Volume1, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { playSound, stopSound } from "@/lib/audio/tones";
import { getPattern, patternDuration } from "@/lib/audio/presets";
import {
  SOUND_PRESETS,
  clampVolume,
  resolveSoundSettings,
  type SoundKind,
  type SoundPresetId,
} from "@/lib/audio/sound-settings";
import type { UserSettings } from "@/types/database";

type SoundPatch = Partial<Pick<UserSettings, "sound_enabled" | "sound_volume" | "completion_tone" | "break_end_tone">>;

/**
 * Notification-sound controls: on/off, volume and a tone per event with a
 * preview that plays exactly what the timer will play, at the current volume.
 */
export function SoundSettings({
  settings,
  onSave,
}: {
  settings: Partial<UserSettings> | null | undefined;
  onSave: (patch: SoundPatch) => void;
}) {
  // Local edits win over the (possibly still refetching) query data.
  const [draft, setDraft] = useState<SoundPatch>({});
  const s = resolveSoundSettings({ ...settings, ...draft });
  const [playing, setPlaying] = useState<SoundKind | null>(null);
  const playingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (playingTimer.current) clearTimeout(playingTimer.current);
    if (volumeSave.current) clearTimeout(volumeSave.current);
    stopSound();
  }, []);

  function update(patch: SoundPatch, persist = true) {
    setDraft((d) => ({ ...d, ...patch }));
    if (persist) onSave(patch);
  }

  function setVolume(v: number) {
    const volume = clampVolume(v);
    update({ sound_volume: volume }, false);
    if (volumeSave.current) clearTimeout(volumeSave.current);
    volumeSave.current = setTimeout(() => onSave({ sound_volume: volume }), 400);
  }

  /** Plays exactly what the timer will play. `toggle` lets the Preview button stop itself. */
  async function preview(kind: SoundKind, opts: { tone?: SoundPresetId; volume?: number; toggle?: boolean } = {}) {
    const tone = opts.tone ?? (kind === "break" ? s.breakTone : s.focusTone);
    const volume = opts.volume ?? s.volume;
    if (playingTimer.current) clearTimeout(playingTimer.current);
    if (opts.toggle && playing === kind) {
      stopSound();
      setPlaying(null);
      return;
    }
    if (volume === 0) {
      toast("Volume is at 0% — turn it up to hear the sound.");
      return;
    }
    // playSound unlocks audio synchronously, i.e. still inside this click.
    const ok = await playSound(tone, { kind, volume });
    if (!ok) {
      setPlaying(null);
      toast.error("Your browser blocked audio. Click Preview again, or check the tab isn't muted.");
      return;
    }
    setPlaying(kind);
    playingTimer.current = setTimeout(
      () => setPlaying(null),
      patternDuration(getPattern(tone, kind)) * 1000,
    );
  }

  const VolumeIcon = !s.enabled || s.volume === 0 ? VolumeX : s.volume < 50 ? Volume1 : Volume2;
  const dim = s.enabled ? 1 : 0.45;

  return (
    <>
      <Row label="Sounds" description="Play a sound when a focus session or break ends.">
        <Switch
          label="Sounds"
          checked={s.enabled}
          onChange={(v) => update({ sound_enabled: v })}
        />
      </Row>

      <Row label="Volume" description="100% is loud — sized to cut through music and a busy room.">
        <div className="flex items-center gap-2" style={{ opacity: dim }}>
          <button
            type="button"
            aria-label={s.enabled ? "Mute sounds" : "Unmute sounds"}
            title={s.enabled ? "Mute" : "Unmute"}
            onClick={() => update({ sound_enabled: !s.enabled })}
            className="flex items-center justify-center rounded-full"
            style={{ width: 30, height: 30, color: "var(--color-on-surface-variant)", background: "rgba(255,255,255,0.06)" }}
          >
            <VolumeIcon size={15} />
          </button>
          <input
            type="range"
            aria-label="Notification volume"
            className="rng"
            style={{ width: 150 }}
            min={0} max={100} step={1}
            value={s.volume}
            onChange={(e) => setVolume(parseInt(e.target.value, 10))}
            // Play the focus sound on release so you hear the level you picked.
            onPointerUp={(e) => void preview("focus", { volume: clampVolume(e.currentTarget.value) })}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End" || e.key.startsWith("Page")) {
                void preview("focus", { volume: clampVolume(e.currentTarget.value) });
              }
            }}
          />
          <span className="tabular-nums text-right" style={{ width: 38, fontSize: 12.5, fontWeight: 700, color: "var(--color-primary)" }}>
            {s.volume}%
          </span>
        </div>
      </Row>

      <ToneRow
        label="Focus session ends"
        description="Falling notes — time for a break."
        kind="focus"
        value={s.focusTone}
        playing={playing === "focus"}
        dim={dim}
        onChange={(tone) => { update({ completion_tone: tone }); void preview("focus", { tone }); }}
        onPreview={() => void preview("focus", { toggle: true })}
      />
      <ToneRow
        label="Break ends"
        description="Rising notes — back to work."
        kind="break"
        value={s.breakTone}
        playing={playing === "break"}
        dim={dim}
        onChange={(tone) => { update({ break_end_tone: tone }); void preview("break", { tone }); }}
        onPreview={() => void preview("break", { toggle: true })}
      />
    </>
  );
}

function ToneRow({
  label, description, kind, value, playing, dim, onChange, onPreview,
}: {
  label: string;
  description: string;
  kind: SoundKind;
  value: SoundPresetId;
  playing: boolean;
  dim: number;
  onChange: (tone: SoundPresetId) => void;
  onPreview: () => void;
}) {
  return (
    <Row label={label} description={description}>
      <div className="flex items-center gap-2" style={{ opacity: dim }}>
        <select
          aria-label={`${label} sound`}
          value={value}
          onChange={(e) => onChange(e.target.value as SoundPresetId)}
          className="px-3 py-2 rounded-xl text-sm outline-none"
          style={{
            background: "var(--color-surface-container-high)",
            color: "var(--color-on-surface)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          {SOUND_PRESETS.map((p) => (
            <option key={p.id} value={p.id} title={p.hint}>{p.label}</option>
          ))}
        </select>
        <button
          type="button"
          data-testid={`preview-${kind}`}
          aria-label={playing ? `Stop ${label.toLowerCase()} preview` : `Preview ${label.toLowerCase()} sound`}
          onClick={onPreview}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
          style={{
            background: playing
              ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
              : "var(--color-surface-container-high)",
            color: playing ? "var(--color-primary)" : "var(--color-on-surface-variant)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          {playing ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
          {playing ? "Stop" : "Preview"}
        </button>
      </div>
    </Row>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-4 flex-wrap"
      style={{ padding: "11px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="min-w-0">
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-on-surface)" }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.8, marginTop: 2 }}>{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex shrink-0 ${checked ? "grad-primary justify-end" : "justify-start"}`}
      style={{
        width: 46, height: 27, borderRadius: 99, padding: 3,
        background: checked ? undefined : "rgba(255,255,255,0.13)",
        transition: "background .2s",
      }}
    >
      <span
        style={{
          width: 21, height: 21, borderRadius: "50%", background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all .2s",
        }}
      />
    </button>
  );
}
