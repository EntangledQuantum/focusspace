import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/focus";
  const oauthError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");

  if (oauthError) {
    if (errorCode === "provider_email_needs_verification") {
      return NextResponse.redirect(`${origin}/?error=spotify_email_verify`);
    }
    return NextResponse.redirect(`${origin}/?error=auth_callback_failed`);
  }

  if (code) {
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

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && session) {
      const hasSpotify = session.user.identities?.some(i => i.provider === "spotify");
      if (hasSpotify && session.provider_token) {
        const expiry = new Date(Date.now() + 3600 * 1000).toISOString();
        await supabase.from("user_settings").update({
          spotify_access_token: session.provider_token,
          spotify_refresh_token: session.provider_refresh_token ?? null,
          spotify_token_expires_at: expiry,
        }).eq("user_id", session.user.id);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_callback_failed`);
}
