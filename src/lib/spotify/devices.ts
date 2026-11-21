/**
 * Pure Spotify Connect device logic shared by every surface that controls
 * playback (in-app AI, hosted MCP, Chrome extension, the browser player).
 * No network, no React: the ranking and error wording live here so they can
 * be unit-tested and stay identical everywhere.
 *
 * Why this exists: Spotify's player endpoints without `device_id` act on the
 * "currently active" device only. A device stops being active a few minutes
 * after playback stops, and the FocusSpace web player (Web Playback SDK) is
 * never active until something transfers playback to it. So "resume the
 * music" from a server used to fail with 404 NO_ACTIVE_DEVICE even with a
 * perfectly good player open in a tab. Callers now resolve a target device
 * with `rankDevices` and address it explicitly.
 */

/** Name the Web Playback SDK registers the FocusSpace in-browser player under. */
export const WEB_PLAYER_NAME = "FocusSpace";

/** One entry of GET /me/player/devices. */
export interface SpotifyDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted?: boolean;
  is_private_session?: boolean;
  volume_percent?: number | null;
  supports_volume?: boolean;
}

export const NO_DEVICE_MESSAGE =
  "No Spotify device available — open FocusSpace in a browser tab (its built-in player), " +
  "or open the Spotify app on any device, then try again.";

export const PREMIUM_REQUIRED_MESSAGE =
  "Spotify Premium is required: Spotify only lets apps control playback (play, pause, skip, volume) " +
  "on Premium accounts. Music can still be played from the Spotify app directly.";

export const SESSION_EXPIRED_MESSAGE = "Spotify session expired. Reconnect in Settings → Music.";

export function isWebPlayerName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === WEB_PLAYER_NAME.toLowerCase();
}

/** Lower = preferred, among devices that are not active and not our web player. */
const TYPE_RANK: Record<string, number> = {
  computer: 0,
  smartphone: 1,
  tablet: 2,
};

/**
 * Order the devices a command may target, best first:
 *  1. the device that is already active (it holds the current playback);
 *  2. the FocusSpace web player whose id the browser last reported;
 *  3. any other device named like the web player (e.g. a newer tab);
 *  4. a computer, then a smartphone, then a tablet, then anything else —
 *     ties keep Spotify's order, which lists recently used devices first.
 * Restricted devices (can't accept Web API commands) and id-less ones are dropped.
 */
export function rankDevices(devices: readonly SpotifyDevice[], webDeviceId?: string | null): SpotifyDevice[] {
  const score = (d: SpotifyDevice): number => {
    if (d.is_active) return 0;
    if (webDeviceId && d.id === webDeviceId) return 1;
    if (isWebPlayerName(d.name)) return 2;
    return 3 + (TYPE_RANK[(d.type ?? "").toLowerCase()] ?? 3);
  };
  return devices
    .filter((d): d is SpotifyDevice & { id: string } => !!d.id && !d.is_restricted)
    .map((d, i) => ({ d, i, s: score(d) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.d);
}

export function pickDevice(devices: readonly SpotifyDevice[], webDeviceId?: string | null): SpotifyDevice | null {
  return rankDevices(devices, webDeviceId)[0] ?? null;
}

/** The FocusSpace web player in a device list, if a tab has one registered. */
export function findWebPlayer(devices: readonly SpotifyDevice[], webDeviceId?: string | null): SpotifyDevice | null {
  return (
    devices.find((d) => !!webDeviceId && d.id === webDeviceId) ??
    devices.find((d) => !!d.id && isWebPlayerName(d.name)) ??
    null
  );
}

export type PlaybackErrorCode =
  | "no_device"
  | "premium_required"
  | "rate_limited"
  | "auth"
  | "restricted"
  | "unavailable"
  | "error";

export interface PlaybackError {
  code: PlaybackErrorCode;
  message: string;
}

interface SpotifyErrorBody {
  error?: { status?: number; message?: string; reason?: string } | string;
}

function errorParts(json: unknown): { reason: string | null; message: string | null } {
  const e = (json as SpotifyErrorBody | null)?.error;
  if (!e || typeof e !== "object") return { reason: null, message: typeof e === "string" ? e : null };
  return { reason: e.reason ?? null, message: e.message ?? null };
}

/**
 * Turn a failed Spotify player response into one clear message. 404 means
 * "no active device / device not found" for every player endpoint.
 */
export function describeSpotifyFailure(
  status: number,
  json: unknown,
  opts: { verb?: string; retryAfterSec?: number | null } = {},
): PlaybackError {
  const { reason, message } = errorParts(json);
  const verb = opts.verb ?? "Spotify command";
  if (status === 401) return { code: "auth", message: SESSION_EXPIRED_MESSAGE };
  if (status === 404) return { code: "no_device", message: NO_DEVICE_MESSAGE };
  if (status === 403) {
    if (reason === "PREMIUM_REQUIRED" || /premium/i.test(message ?? "")) {
      return { code: "premium_required", message: PREMIUM_REQUIRED_MESSAGE };
    }
    return {
      code: "restricted",
      message: `Spotify refused the ${verb.toLowerCase()}${message ? `: ${message}` : ""}.`,
    };
  }
  if (status === 429) {
    const s = opts.retryAfterSec;
    return {
      code: "rate_limited",
      message: `Spotify is rate limiting requests — try again in ${s && s > 0 ? `${Math.ceil(s)}s` : "a moment"}.`,
    };
  }
  if (status >= 500) {
    return { code: "unavailable", message: `Spotify is having trouble right now (${status}). Try again in a moment.` };
  }
  return { code: "error", message: `${verb} failed (Spotify ${status}${message ? `: ${message}` : ""}).` };
}

/** PlayableContext type from a spotify: uri (track / album / playlist / artist). */
export function uriKind(uri: string): "track" | "album" | "playlist" | "artist" | "episode" | "show" | null {
  const m = /^spotify:(track|album|playlist|artist|episode|show):/.exec(uri);
  return (m?.[1] as ReturnType<typeof uriKind>) ?? null;
}

/** Request body for PUT /me/player/play that starts `uri`. */
export function playBodyFor(uri: string): { uris: string[] } | { context_uri: string } {
  const kind = uriKind(uri);
  return kind === "track" || kind === "episode" ? { uris: [uri] } : { context_uri: uri };
}
