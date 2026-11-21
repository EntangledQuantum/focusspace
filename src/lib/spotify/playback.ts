import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getUserSpotifyAccessToken, spotifyUserFetch, type SpotifyUserResponse } from "./server";
import {
  NO_DEVICE_MESSAGE, WEB_PLAYER_NAME, describeSpotifyFailure, findWebPlayer, pickDevice, playBodyFor,
  rankDevices, uriKind, type PlaybackErrorCode, type SpotifyDevice,
} from "./devices";

/**
 * Server-side Spotify playback with device resolution — the one path used by
 * the in-app AI, the hosted MCP and the Chrome extension.
 *
 * Fast path first: every command is sent as-is, which targets Spotify's
 * active device in one round trip. Only when Spotify answers 404 (no active
 * device) do we list devices (cached for a few seconds), pick a target —
 * the FocusSpace web player the browser registered, else the best other
 * device — and address it with `device_id`, transferring playback to it if
 * Spotify still doesn't treat it as a Connect target.
 */

type DB = SupabaseClient<Database>;

/** What the browser told us about its player and music pick (user_settings). */
export interface PlaybackHints {
  webDeviceId: string | null;
  webDeviceSeenAt: string | null;
  selectedUri: string | null;
  selectedName: string | null;
}

export const NO_HINTS: PlaybackHints = { webDeviceId: null, webDeviceSeenAt: null, selectedUri: null, selectedName: null };

/** A web player that reported `ready` this recently is worth trying even if Spotify doesn't list it. */
const WEB_PLAYER_FRESH_MS = 30 * 60 * 1000;

/**
 * Reads the hint columns (migration 0015). Tolerates the columns not existing
 * yet — the query then errors and we simply have no hints.
 */
export async function loadPlaybackHints(db: DB, userId: string): Promise<PlaybackHints> {
  try {
    const { data, error } = await db
      .from("user_settings")
      .select("spotify_web_device_id, spotify_web_device_seen_at, spotify_selected_uri, spotify_selected_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return NO_HINTS;
    return {
      webDeviceId: data.spotify_web_device_id ?? null,
      webDeviceSeenAt: data.spotify_web_device_seen_at ?? null,
      selectedUri: data.spotify_selected_uri ?? null,
      selectedName: data.spotify_selected_name ?? null,
    };
  } catch {
    return NO_HINTS;
  }
}

// ── Device list (briefly cached) ───────────────────────────────────────────
const DEVICE_CACHE_TTL_MS = 5000;
const deviceCache = new Map<string, { at: number; devices: SpotifyDevice[] }>();

export function clearDeviceCache() {
  deviceCache.clear();
}

async function listDevices(token: string): Promise<{ devices: SpotifyDevice[] } | { error: SpotifyUserResponse }> {
  const hit = deviceCache.get(token);
  if (hit && Date.now() - hit.at < DEVICE_CACHE_TTL_MS) return { devices: hit.devices };
  const res = await spotifyUserFetch(token, "/me/player/devices");
  if (!res.ok) return { error: res };
  const devices = ((res.json as { devices?: SpotifyDevice[] } | null)?.devices ?? []).filter(Boolean);
  if (deviceCache.size > 500) deviceCache.clear();
  deviceCache.set(token, { at: Date.now(), devices });
  return { devices };
}

// ── Commands ───────────────────────────────────────────────────────────────
export type PlaybackCommand =
  | { kind: "play"; uri: string; label?: string }
  | { kind: "resume" }
  | { kind: "pause" }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "volume"; percent: number }
  | { kind: "shuffle"; on: boolean };

export type PlaybackResult =
  | { ok: true; message: string; device: string | null }
  | { ok: false; code: PlaybackErrorCode; message: string };

type Failure = Extract<PlaybackResult, { ok: false }>;

function fail(res: SpotifyUserResponse, verb: string): Failure {
  return { ok: false, ...describeSpotifyFailure(res.status, res.json, { verb, retryAfterSec: res.retryAfterSec }) };
}

const done = (message: string, device: string | null = null): PlaybackResult => ({ ok: true, message, device });

function isRecent(iso: string | null): boolean {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && Date.now() - t < WEB_PLAYER_FRESH_MS;
}

/** Best device to address when nothing is active, or a no-device failure. */
async function resolveTarget(token: string, hints: Promise<PlaybackHints>): Promise<SpotifyDevice | Failure> {
  const [list, h] = await Promise.all([listDevices(token), hints]);
  if ("error" in list) return fail(list.error, "Device lookup");
  const best = pickDevice(list.devices, h.webDeviceId);
  if (best) return best;
  // Spotify can lag in listing a freshly connected SDK player; if the tab
  // reported itself recently, address it directly (a 404 then means it's gone).
  if (h.webDeviceId && isRecent(h.webDeviceSeenAt)) {
    return { id: h.webDeviceId, name: WEB_PLAYER_NAME, type: "Computer", is_active: false };
  }
  return { ok: false, code: "no_device", message: NO_DEVICE_MESSAGE };
}

const isFailure = (x: SpotifyDevice | Failure): x is Failure => "ok" in x;

function transfer(token: string, deviceId: string, play: boolean) {
  return spotifyUserFetch(token, "/me/player", { method: "PUT", body: { device_ids: [deviceId], play } });
}

/**
 * Send a command addressed to `device`. If Spotify says the device isn't a
 * Connect target yet (404/502 — typical for a web player nobody activated),
 * transfer playback to it once and retry.
 */
async function onDevice(
  token: string,
  device: SpotifyDevice,
  call: (deviceId: string) => Promise<SpotifyUserResponse>,
): Promise<SpotifyUserResponse> {
  const id = device.id!;
  const first = await call(id);
  if (first.status !== 404 && first.status !== 502) return first;
  const moved = await transfer(token, id, false);
  if (!moved.ok) return moved;
  return call(id);
}

interface StartSource {
  bodies: Record<string, unknown>[];
  label: string;
}

/**
 * Something sensible to start when "resume" has nothing to resume: the
 * context (or track) the user played last, else the FocusSpace music pick.
 */
async function startSource(token: string, hints: Promise<PlaybackHints>): Promise<StartSource | null> {
  const [recent, h] = await Promise.all([
    spotifyUserFetch(token, "/me/player/recently-played", { params: { limit: "1" } }),
    hints,
  ]);
  type Recent = { items?: { track?: { uri?: string; name?: string; artists?: { name: string }[] }; context?: { uri?: string } | null }[] };
  const item = recent.ok ? (recent.json as Recent | null)?.items?.[0] : undefined;
  const track = item?.track;
  if (track?.uri) {
    const title = `“${track.name ?? "your last track"}”${track.artists?.length ? ` — ${track.artists.map((a) => a.name).join(", ")}` : ""}`;
    const ctx = item?.context?.uri ?? null;
    const kind = ctx ? uriKind(ctx) : null;
    if (ctx && (kind === "playlist" || kind === "album")) {
      return {
        // Continue the same playlist/album at that track; if the track has
        // left the playlist, Spotify rejects the offset — fall back to the start.
        bodies: [{ context_uri: ctx, offset: { uri: track.uri } }, { context_uri: ctx }],
        label: `your last played ${kind} from ${title}`,
      };
    }
    if (ctx && kind === "artist") return { bodies: [{ context_uri: ctx }], label: `the artist you last played (${title})` };
    return { bodies: [{ uris: [track.uri] }], label: title };
  }
  if (h.selectedUri) {
    return { bodies: [playBodyFor(h.selectedUri)], label: `“${h.selectedName ?? h.selectedUri}” (your FocusSpace music pick)` };
  }
  return null;
}

const put = (token: string, path: string, opts: { params?: Record<string, string>; body?: unknown } = {}) =>
  spotifyUserFetch(token, path, { method: "PUT", ...opts });
const post = (token: string, path: string, params?: Record<string, string>) =>
  spotifyUserFetch(token, path, { method: "POST", params });

const withDevice = (params: Record<string, string> | undefined, deviceId: string) => ({ ...(params ?? {}), device_id: deviceId });

/**
 * Run one playback command. `hints` is only awaited when the fast path fails,
 * so a plain command against an active device costs one Spotify call and no DB read.
 */
export async function runPlayback(
  token: string,
  cmd: PlaybackCommand,
  loadHints: () => Promise<PlaybackHints> = async () => NO_HINTS,
): Promise<PlaybackResult> {
  let hintsP: Promise<PlaybackHints> | null = null;
  const hints = () => (hintsP ??= loadHints().catch(() => NO_HINTS));

  switch (cmd.kind) {
    case "pause": {
      const r = await put(token, "/me/player/pause");
      if (r.ok) return done("Paused.");
      // No active device → nothing is playing anywhere, which is what pause wants.
      if (r.status === 404) return done("Nothing is playing.");
      const f = fail(r, "Pause");
      // 403 "Restriction violated" here means it's already paused.
      if (f.code === "restricted") return done("Already paused.");
      return f;
    }

    case "play": {
      const body = playBodyFor(cmd.uri);
      const label = cmd.label ?? cmd.uri;
      const r = await put(token, "/me/player/play", { body });
      if (r.ok) return done(`Playing ${label}.`);
      if (r.status !== 404) return fail(r, "Play");
      const target = await resolveTarget(token, hints());
      if (isFailure(target)) return target;
      const r2 = await onDevice(token, target, (id) => put(token, "/me/player/play", { params: { device_id: id }, body }));
      return r2.ok ? done(`Playing ${label} on ${target.name}.`, target.name) : fail(r2, "Play");
    }

    case "resume": {
      const r = await put(token, "/me/player/play", { body: {} });
      if (r.ok) return done("Resumed.");
      if (r.status === 403) {
        const f = fail(r, "Resume");
        if (f.code !== "restricted") return f;
        // "Restriction violated" usually means it is already playing.
        const now = await spotifyUserFetch(token, "/me/player");
        const p = now.json as { is_playing?: boolean; device?: { name?: string } } | null;
        return p?.is_playing ? done(`Already playing${p.device?.name ? ` on ${p.device.name}` : ""}.`, p.device?.name ?? null) : f;
      }
      if (r.status !== 404) return fail(r, "Resume");

      // No active device, so Spotify has nothing paused to resume: pick a
      // device and start what the user played last (or their music pick).
      const [target, source] = await Promise.all([resolveTarget(token, hints()), startSource(token, hints())]);
      if (isFailure(target)) return target;
      if (!source) {
        // Nothing to go on — hand playback to the device and let Spotify
        // continue its last session if it still remembers one.
        const t = await transfer(token, target.id!, true);
        return t.ok
          ? done(`Sent play to ${target.name}. If nothing starts, pick something with play_music.`, target.name)
          : fail(t, "Resume");
      }
      let last: SpotifyUserResponse | null = null;
      for (const body of source.bodies) {
        last = await onDevice(token, target, (id) => put(token, "/me/player/play", { params: { device_id: id }, body }));
        if (last.ok) return done(`Nothing was paused, so I started ${source.label} on ${target.name}.`, target.name);
        if (last.status !== 400 && last.status !== 404) break; // only a bad offset is worth another body
      }
      return fail(last!, "Resume");
    }

    case "next":
    case "previous":
    case "volume":
    case "shuffle": {
      const verb = { next: "Skip", previous: "Previous track", volume: "Volume change", shuffle: "Shuffle change" }[cmd.kind];
      const send = (deviceId?: string) => {
        if (cmd.kind === "next" || cmd.kind === "previous") {
          return post(token, `/me/player/${cmd.kind}`, deviceId ? { device_id: deviceId } : undefined);
        }
        const params: Record<string, string> = cmd.kind === "volume"
          ? { volume_percent: String(Math.max(0, Math.min(100, Math.round(cmd.percent)))) }
          : { state: cmd.on ? "true" : "false" };
        return put(token, `/me/player/${cmd.kind}`, { params: deviceId ? withDevice(params, deviceId) : params });
      };
      const okText = () => {
        if (cmd.kind === "next") return "Skipped to next track.";
        if (cmd.kind === "previous") return "Went to previous track.";
        if (cmd.kind === "volume") return `Volume set to ${Math.max(0, Math.min(100, Math.round(cmd.percent)))}%.`;
        return `Shuffle ${cmd.on ? "on" : "off"}.`;
      };
      const r = await send();
      if (r.ok) return done(okText());
      if (r.status !== 404) return fail(r, verb);
      const target = await resolveTarget(token, hints());
      if (isFailure(target)) return target;
      const r2 = await onDevice(token, target, (id) => send(id));
      return r2.ok ? done(`${okText().replace(/\.$/, "")} on ${target.name}.`, target.name) : fail(r2, verb);
    }
  }
}

/** runPlayback for a user: token from user_settings, hints loaded only if needed. */
export async function runPlaybackForUser(db: DB, userId: string, cmd: PlaybackCommand): Promise<PlaybackResult> {
  const auth = await getUserSpotifyAccessToken(db, userId);
  if ("error" in auth) return { ok: false, code: "auth", message: auth.error };
  return runPlayback(auth.token, cmd, () => loadPlaybackHints(db, userId));
}

// ── Now playing ────────────────────────────────────────────────────────────
interface PlayerJson {
  is_playing?: boolean;
  device?: { name?: string; type?: string } | null;
  item?: {
    name?: string;
    artists?: { name: string }[];
    album?: { name?: string };
    show?: { name?: string };
  } | null;
}

/**
 * One line for the agent: what's playing and where, or — when nothing is —
 * which device a play/resume would use (and whether the web player is ready).
 */
export async function describeNowPlaying(
  token: string,
  loadHints: () => Promise<PlaybackHints> = async () => NO_HINTS,
): Promise<string> {
  const res = await spotifyUserFetch(token, "/me/player", { params: { additional_types: "episode" } });
  if (!res.ok) return fail(res, "Now playing").message;
  const p = res.status === 204 ? null : (res.json as PlayerJson | null);
  if (p?.item) {
    const by = (p.item.artists ?? []).map((a) => a.name).join(", ") || p.item.show?.name || "";
    const album = p.item.album?.name ? ` (${p.item.album.name})` : "";
    const where = p.device?.name ? ` on ${p.device.name}${p.device.type ? ` (${p.device.type})` : ""}` : "";
    return `${p.is_playing ? "Playing" : "Paused"}: ${p.item.name}${by ? ` — ${by}` : ""}${album}${where}.`;
  }

  const [list, h] = await Promise.all([listDevices(token), loadHints().catch(() => NO_HINTS)]);
  if ("error" in list) return `Nothing is playing. ${fail(list.error, "Device lookup").message}`;
  if (findWebPlayer(list.devices, h.webDeviceId)) {
    return "Nothing is playing and no Spotify device is active. The FocusSpace web player is open and ready, " +
      "so play_music / resume_music will start music there.";
  }
  const ranked = rankDevices(list.devices, h.webDeviceId);
  if (ranked.length) {
    const names = ranked.slice(0, 4).map((d) => `${d.name} (${d.type})`).join(", ");
    return `Nothing is playing and no device is active. Available: ${names}; play_music / resume_music will use ${ranked[0].name}.`;
  }
  return `Nothing is playing. ${NO_DEVICE_MESSAGE}`;
}

export async function describeNowPlayingForUser(db: DB, userId: string): Promise<string> {
  const auth = await getUserSpotifyAccessToken(db, userId);
  if ("error" in auth) return auth.error;
  return describeNowPlaying(auth.token, () => loadPlaybackHints(db, userId));
}
