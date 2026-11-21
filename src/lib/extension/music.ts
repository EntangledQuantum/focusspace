import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getUserSpotifyAccessToken, spotifyUserFetch } from "@/lib/spotify/server";

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
  if (res.status === 401) return { connected: false, message: "Spotify session expired. Reconnect in Settings → Music.", isPlaying: false, device: null, track: null };
  if (!res.ok) return { connected: true, message: `Spotify is unavailable right now (${res.status}).`, isPlaying: false, device: null, track: null };
  return mapPlayer(res.json as PlayerJson);
}

export type MusicAction = "play" | "pause" | "next" | "previous";

const NO_DEVICE = "No active Spotify device. Open Spotify (or the FocusSpace player) and press play once.";

function failure(status: number, verb: string): string {
  if (status === 404) return NO_DEVICE;
  if (status === 403) return "Spotify refused the command (playback control needs Spotify Premium).";
  if (status === 401) return "Spotify session expired. Reconnect in Settings → Music.";
  if (status === 429) return "Spotify is rate limiting — try again in a moment.";
  return `${verb} failed (Spotify ${status}).`;
}

/** Returns null on success, or a human-readable error. */
export async function runMusicCommand(db: SupabaseClient<Database>, userId: string, action: MusicAction): Promise<string | null> {
  const auth = await getUserSpotifyAccessToken(db, userId);
  if ("error" in auth) return auth.error;
  const token = auth.token;

  if (action === "pause") {
    const res = await spotifyUserFetch(token, "/me/player/pause", { method: "PUT" });
    return res.ok ? null : failure(res.status, "Pause");
  }
  if (action === "next" || action === "previous") {
    const res = await spotifyUserFetch(token, `/me/player/${action}`, { method: "POST" });
    return res.ok ? null : failure(res.status, action === "next" ? "Next" : "Previous");
  }

  const res = await spotifyUserFetch(token, "/me/player/play", { method: "PUT", body: {} });
  if (res.ok) return null;
  if (res.status !== 404) return failure(res.status, "Play");

  // No active device: wake the first available one (desktop app, phone, or the FocusSpace web player).
  const devices = await spotifyUserFetch(token, "/me/player/devices");
  const list = ((devices.json as { devices?: { id: string | null; is_restricted?: boolean }[] } | null)?.devices ?? [])
    .filter((d) => d.id && !d.is_restricted);
  if (!list.length) return NO_DEVICE;
  const transfer = await spotifyUserFetch(token, "/me/player", { method: "PUT", body: { device_ids: [list[0].id], play: true } });
  return transfer.ok ? null : failure(transfer.status, "Play");
}
