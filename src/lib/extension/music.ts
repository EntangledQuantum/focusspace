import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getUserSpotifyAccessToken, spotifyUserFetch } from "@/lib/spotify/server";
import { runPlaybackForUser, type PlaybackCommand } from "@/lib/spotify/playback";
import { SESSION_EXPIRED_MESSAGE, describeSpotifyFailure } from "@/lib/spotify/devices";

/** Spotify "now playing" + transport controls for the Chrome extension, via the user's stored token. */

export interface MusicState {
  connected: boolean;
  message?: string;
  isPlaying: boolean;
  device: string | null;
  track: {
    name: string;
    artists: string;
    album: string | null;
    artUrl: string | null;
    url: string | null;
    durationMs: number;
    progressMs: number;
  } | null;
}

interface PlayerJson {
  is_playing?: boolean;
  progress_ms?: number | null;
  device?: { name?: string };
  item?: {
    name?: string;
    duration_ms?: number;
    external_urls?: { spotify?: string };
    artists?: { name: string }[];
    album?: { name?: string; images?: { url: string; width?: number | null }[] };
    show?: { name?: string; images?: { url: string; width?: number | null }[] };
  } | null;
}

function smallestArt(images?: { url: string; width?: number | null }[]): string | null {
  if (!images?.length) return null;
  // Spotify lists largest first; ~300px is plenty for a 56px thumbnail at 2x.
  const pick = [...images].reverse().find((i) => (i.width ?? 0) >= 100) ?? images[0];
  return pick.url;
}

export function mapPlayer(json: PlayerJson | null): MusicState {
  const item = json?.item;
  if (!json || !item) return { connected: true, isPlaying: false, device: json?.device?.name ?? null, track: null };
  return {
    connected: true,
    isPlaying: !!json.is_playing,
    device: json.device?.name ?? null,
    track: {
      name: item.name ?? "Unknown",
      artists: (item.artists ?? []).map((a) => a.name).join(", ") || item.show?.name || "",
      album: item.album?.name ?? null,
      artUrl: smallestArt(item.album?.images ?? item.show?.images),
      url: item.external_urls?.spotify ?? null,
      durationMs: item.duration_ms ?? 0,
      progressMs: json.progress_ms ?? 0,
    },
  };
}

export async function getMusicState(db: SupabaseClient<Database>, userId: string): Promise<MusicState> {
  const auth = await getUserSpotifyAccessToken(db, userId);
  if ("error" in auth) return { connected: false, message: auth.error, isPlaying: false, device: null, track: null };
  const res = await spotifyUserFetch(auth.token, "/me/player", { params: { additional_types: "episode" } });
  if (res.status === 204) return { connected: true, isPlaying: false, device: null, track: null };
  if (res.status === 401) return { connected: false, message: SESSION_EXPIRED_MESSAGE, isPlaying: false, device: null, track: null };
  if (!res.ok) {
    const { message } = describeSpotifyFailure(res.status, res.json, { verb: "Now playing", retryAfterSec: res.retryAfterSec });
    return { connected: true, message, isPlaying: false, device: null, track: null };
  }
  return mapPlayer(res.json as PlayerJson);
}

export type MusicAction = "play" | "pause" | "next" | "previous";

const COMMANDS: Record<MusicAction, PlaybackCommand> = {
  // The popup's play button means "resume": continue what's paused, or start
  // the last-played music on the best available device when nothing is.
  play: { kind: "resume" },
  pause: { kind: "pause" },
  next: { kind: "next" },
  previous: { kind: "previous" },
};

/**
 * Returns null on success, or a human-readable error. Shares device
 * resolution with the AI/MCP music tools (lib/spotify/playback.ts): the active
 * device first, else the FocusSpace web player, else another available device.
 */
export async function runMusicCommand(db: SupabaseClient<Database>, userId: string, action: MusicAction): Promise<string | null> {
  const res = await runPlaybackForUser(db, userId, COMMANDS[action]);
  return res.ok ? null : res.message;
}
