import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const API = "https://api.spotify.com/v1";

export async function getUserSpotifyAccessToken(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ token: string } | { error: string }> {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("spotify_access_token, spotify_refresh_token, spotify_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings?.spotify_access_token || !settings?.spotify_refresh_token) {
    return { error: "Spotify is not connected. The user must connect it in Settings → Music." };
  }

  const expiresAt = settings.spotify_token_expires_at ? new Date(settings.spotify_token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) {
    return { token: settings.spotify_access_token };
  }

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    return { error: "Spotify client credentials are not configured on this host." };
  }

  const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.spotify_refresh_token,
    }).toString(),
  });

  if (!refreshRes.ok) return { error: "Spotify session expired. Reconnect in Settings → Music." };

  const refreshed = await refreshRes.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase.from("user_settings").update({
    spotify_access_token: refreshed.access_token,
    spotify_token_expires_at: expiry,
    ...(refreshed.refresh_token ? { spotify_refresh_token: refreshed.refresh_token } : {}),
  }).eq("user_id", userId);

  return { token: refreshed.access_token };
}

export async function spotifyUserFetch(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const url = new URL(`${API}${path}`);
  if (init.params) Object.entries(init.params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try { json = JSON.parse(text); } catch { /* not json */ }
  }
  return { ok: res.ok, status: res.status, json, text };
}
