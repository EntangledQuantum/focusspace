"use client";

/**
 * Central Spotify Web API client.
 *
 * Every call goes through `spotifyFetch`, which attaches a token from
 * /api/spotify/token (the server refreshes it when it's near expiry) and
 * retries once with a forced refresh on 401. This replaces the scattered
 * raw `fetch` calls that silently broke an hour after connecting, when the
 * access token captured at mount expired.
 */

const API_BASE = "https://api.spotify.com/v1";

let cachedToken: string | null = null;
let cachedAt = 0;
let inflight: Promise<string | null> | null = null;

// Server-side expiry buffer is 60s; refetch client-side every 30 min at most.
const TOKEN_TTL_MS = 30 * 60 * 1000;

async function requestToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/spotify/token");
    if (!res.ok) return null;
    const { token } = await res.json();
    cachedToken = (token as string) ?? null;
    cachedAt = Date.now();
    return cachedToken;
  } catch {
    return null;
  }
}

export async function getSpotifyToken(force = false): Promise<string | null> {
  if (!force && cachedToken && Date.now() - cachedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }
  if (!inflight) {
    inflight = requestToken().finally(() => { inflight = null; });
  }
  return inflight;
}

export function clearSpotifyToken() {
  cachedToken = null;
  cachedAt = 0;
}

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

  let token = await getSpotifyToken();
  if (!token) throw new Error("Spotify is not connected");

  let res = await doFetch(token);
  if (res.status === 401) {
    token = await getSpotifyToken(true);
    if (!token) throw new Error("Spotify session expired");
    res = await doFetch(token);
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
