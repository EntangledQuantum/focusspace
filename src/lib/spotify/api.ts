"use client";

/**
 * Central Spotify Web API client.
 *
 * Every call goes through `spotifyFetch`, which attaches a token from
 * /api/spotify/token (the server refreshes it when it's near expiry) and
 * retries once with a forced refresh on 401. It also honours 429 Retry-After
 * globally so the 5s player poll can't keep a rate-limit window open.
 */

const API_BASE = "https://api.spotify.com/v1";

let cachedToken: string | null = null;
/** Epoch ms after which the cached token must not be handed out. */
let cachedUntil = 0;
let inflight: Promise<string | null> | null = null;

// Hand out a token only while it has at least this much life left — the SDK
// holds on to what getOAuthToken gives it, so a nearly-expired token there
// surfaces as an authentication_error mid-song.
const EXPIRY_MARGIN_MS = 90 * 1000;
// Upper bound when the server doesn't report an expiry.
const FALLBACK_TTL_MS = 5 * 60 * 1000;

async function requestToken(force: boolean): Promise<string | null> {
  try {
    const res = await fetch(force ? "/api/spotify/token?force=1" : "/api/spotify/token", { cache: "no-store" });
    if (!res.ok) {
      clearSpotifyToken();
      return null;
    }
    const { token, expires_at } = (await res.json()) as { token?: string; expires_at?: string | null };
    cachedToken = token ?? null;
    const exp = expires_at ? Date.parse(expires_at) : NaN;
    cachedUntil = Number.isFinite(exp)
      ? Math.min(exp - EXPIRY_MARGIN_MS, Date.now() + 30 * 60 * 1000)
      : Date.now() + FALLBACK_TTL_MS;
    return cachedToken;
  } catch {
    return null;
  }
}

export async function getSpotifyToken(force = false): Promise<string | null> {
  if (!force && cachedToken && Date.now() < cachedUntil) return cachedToken;
  // A forced refresh must not piggy-back on a non-forced request already in
  // flight (that one may return the very token Spotify just rejected).
  if (force || !inflight) {
    const p: Promise<string | null> = requestToken(force).finally(() => {
      if (inflight === p) inflight = null;
    });
    inflight = p;
  }
  return inflight;
}

export function clearSpotifyToken() {
  cachedToken = null;
  cachedUntil = 0;
}

// ── Rate limiting ──────────────────────────────────────────────────────────
let rateLimitedUntil = 0;
/** Commands wait out a Retry-After up to this long instead of failing. */
const MAX_COMMAND_WAIT_MS = 5000;

function retryAfterMs(res: Response): number {
  const raw = res.headers.get("Retry-After");
  const sec = raw ? Number(raw) : NaN;
  return (Number.isFinite(sec) && sec >= 0 ? sec : 2) * 1000;
}

/** ms until Spotify's last Retry-After window closes (0 when not limited). */
export function spotifyRateLimitRemainingMs(): number {
  return Math.max(0, rateLimitedUntil - Date.now());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SpotifyFetchOptions {
  method?: "GET" | "PUT" | "POST" | "DELETE";
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

export async function spotifyFetch(path: string, options: SpotifyFetchOptions = {}): Promise<Response> {
  const { method = "GET", params, body } = options;

  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const doFetch = async (token: string) =>
    fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  // Inside a Retry-After window: reads (polls, browse) fail fast without
  // touching the network; user commands wait it out when it's short.
  const wait = spotifyRateLimitRemainingMs();
  if (wait > 0) {
    if (method === "GET" || wait > MAX_COMMAND_WAIT_MS) {
      return new Response(null, { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } });
    }
    await sleep(wait);
  }

  let token = await getSpotifyToken();
  if (!token) throw new Error("Spotify is not connected");

  let res = await doFetch(token);
  if (res.status === 401) {
    token = await getSpotifyToken(true);
    if (!token) throw new Error("Spotify session expired");
    res = await doFetch(token);
  }
  if (res.status === 429) {
    const ms = retryAfterMs(res);
    rateLimitedUntil = Date.now() + ms;
    if (method !== "GET" && ms <= MAX_COMMAND_WAIT_MS) {
      await sleep(ms);
      res = await doFetch(token);
      if (res.status === 429) rateLimitedUntil = Date.now() + retryAfterMs(res);
    }
  }
  return res;
}

/** Like spotifyFetch but parses JSON, returning null on 204/empty/error. */
export async function spotifyJson<T>(path: string, options: SpotifyFetchOptions = {}): Promise<T | null> {
  const res = await spotifyFetch(path, options);
  if (res.status === 204 || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Best-effort human message from a failed Spotify response. */
export async function spotifyErrorMessage(res: Response): Promise<string | null> {
  try {
    const j = (await res.clone().json()) as { error?: { message?: string; reason?: string } };
    return j?.error?.message ?? j?.error?.reason ?? null;
  } catch {
    return null;
  }
}
