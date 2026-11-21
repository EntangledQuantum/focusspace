"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Music } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearSpotifyToken } from "@/lib/spotify/api";
import { useMusicPrefs } from "@/lib/hooks/useMusicPrefs";

const SPOTIFY_PATH =
  "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z";

/** Settings → Music: Spotify connection + "music follows focus" toggles. */
export function MusicSettings() {
  const supabase = createClient();
  const qc = useQueryClient();
  const { settings, prefs, update } = useMusicPrefs();
  const isConnected = !!settings?.spotify_access_token;

  function connectSpotify() { window.location.href = "/api/spotify/connect?next=/settings"; }

  async function disconnectSpotify() {
    if (!settings) return;
    const { error } = await supabase.from("user_settings").update({
      spotify_access_token: null,
      spotify_refresh_token: null,
      spotify_token_expires_at: null,
    }).eq("user_id", settings.user_id);
    if (error) {
      toast.error("Couldn't disconnect Spotify");
      return;
    }
    clearSpotifyToken();
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["spotify-token"] });
    toast.success("Spotify disconnected");
  }

  return (
    <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
      <div className="flex items-center" style={{ gap: 11, marginBottom: 14 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 34, height: 34, borderRadius: 11,
            background: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
            color: "var(--color-primary)",
          }}
        >
          <Music size={18} />
        </div>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700, color: "var(--color-on-surface)" }}>
          Music
        </p>
      </div>

      <Row label="Spotify" description={isConnected ? "Spotify is connected." : "Connect to play music during focus sessions."}>
        {isConnected ? (
          <button
            onClick={disconnectSpotify}
            className="px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95"
            style={{
              background: "color-mix(in srgb, var(--color-error) 15%, transparent)",
              color: "var(--color-error)",
              border: "1px solid color-mix(in srgb, var(--color-error) 30%, transparent)",
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={connectSpotify}
            className="px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 flex items-center gap-2"
            style={{ background: "#1DB954", color: "#000" }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d={SPOTIFY_PATH} /></svg>
            Connect Spotify
          </button>
        )}
      </Row>

      {isConnected && (
        <>
          <Row
            label="Auto-play music when a focus session starts"
            description="Resumes paused music, or plays what you picked in the music picker."
          >
            <Switch checked={prefs.autoPlay} onChange={(v) => update({ spotify_auto_start: v })} />
          </Row>
          <Row
            label="Auto-pause music when a focus session ends"
            description="Pauses FocusSpace's player when focus completes, is paused or stopped, or a break starts."
          >
            <Switch checked={prefs.autoPause} onChange={(v) => update({ spotify_auto_pause: v })} />
          </Row>
          <Row
            label="Resume on next focus"
            description="Picks up music that was auto-paused when the next focus session starts or the timer resumes."
          >
            <Switch checked={prefs.resumeOnFocus} onChange={(v) => update({ spotify_resume_on_focus: v })} />
          </Row>
          <Row
            label="Take over playback"
            description="If Spotify is already playing on another device when auto-play kicks in, move it here. Off keeps playing there."
          >
            <Switch checked={prefs.takeover} onChange={(v) => update({ spotify_takeover: v })} />
          </Row>
        </>
      )}
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-4"
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

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex shrink-0 ${checked ? "grad-primary justify-end" : "justify-start"}`}
      style={{
        width: 46, height: 27, borderRadius: 99, padding: 3,
        background: checked ? undefined : "rgba(255,255,255,0.13)",
        transition: "background .2s",
      }}
    >
      <span style={{ width: 21, height: 21, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all .2s" }} />
    </button>
  );
}
