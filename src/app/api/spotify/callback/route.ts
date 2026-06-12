import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("spotify_oauth_state")?.value;
  const next = cookieStore.get("spotify_oauth_next")?.value ?? "/settings";

  if (oauthError || !code || !state || state !== savedState) {
    return NextResponse.redirect(`${origin}${next}?error=spotify_connect_failed`);
  }

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/spotify/callback`,
    }).toString(),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}${next}?error=spotify_token_failed`);
  }

  const tokens = await tokenRes.json();

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
  if (!user) {
    return NextResponse.redirect(`${origin}/`);
  }

  const expiry = new Date(Date.now() + (tokens.expires_in as number) * 1000).toISOString();
  await supabase.from("user_settings").update({
    spotify_access_token: tokens.access_token as string,
    spotify_refresh_token: tokens.refresh_token as string,
    spotify_token_expires_at: expiry,
  }).eq("user_id", user.id);

  cookieStore.delete("spotify_oauth_state");
  cookieStore.delete("spotify_oauth_next");

  return NextResponse.redirect(`${origin}${next}`);
}
