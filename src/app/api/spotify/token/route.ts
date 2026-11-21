import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Returns the user's Spotify access token, refreshing it when it's within 60s
 * of expiry. `?force=1` refreshes regardless — the client uses it after
 * Spotify rejected a token with 401 that our stored expiry still considered
 * valid. `expires_at` lets the client cache the token for exactly as long as
 * it's usable (the Web Playback SDK keeps whatever token it was handed).
 */
export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("force") === "1";
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: settings } = await supabase
    .from("user_settings")
    .select("spotify_access_token, spotify_refresh_token, spotify_token_expires_at")
    .eq("user_id", user.id)
    .single();

  if (!settings?.spotify_access_token || !settings?.spotify_refresh_token) {
    return NextResponse.json({ error: "Spotify not connected" }, { status: 404 });
  }

  const expiresAt = settings.spotify_token_expires_at
    ? new Date(settings.spotify_token_expires_at)
    : null;
  const needsRefresh = force || !expiresAt || expiresAt.getTime() - Date.now() < 60 * 1000;

  if (!needsRefresh) {
    return NextResponse.json(
      { token: settings.spotify_access_token, expires_at: settings.spotify_token_expires_at },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: settings.spotify_refresh_token,
  });

  const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: params.toString(),
  });

  if (!refreshRes.ok) {
    return NextResponse.json({ error: "Token refresh failed" }, { status: 502 });
  }

  const refreshed = await refreshRes.json();
  const newToken: string = refreshed.access_token;
  const newExpiry = new Date(Date.now() + (refreshed.expires_in as number) * 1000).toISOString();

  await supabase.from("user_settings").update({
    spotify_access_token: newToken,
    spotify_token_expires_at: newExpiry,
    ...(refreshed.refresh_token ? { spotify_refresh_token: refreshed.refresh_token as string } : {}),
  }).eq("user_id", user.id);

  return NextResponse.json(
    { token: newToken, expires_at: newExpiry },
    { headers: { "Cache-Control": "no-store" } },
  );
}
