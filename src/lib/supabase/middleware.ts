import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLocal =
    process.env.FOCUSSPACE_MODE === "local" ||
    process.env.NEXT_PUBLIC_FOCUSSPACE_MODE === "local";

  if (isLocal) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isCallbackRoute = pathname.startsWith("/auth/callback");
  // "/" is the public landing page (sign-in lives in its auth modal)
  const isLanding = pathname === "/";
  // Legal + agent-install pages are public — viewable without an account
  const isLegal =
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/for-agents");

  if (!user && !isAuthRoute && !isCallbackRoute && !isLanding && !isLegal) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Signed-in users skip the landing + legacy auth routes and go straight to work
  if (user && (isAuthRoute || isLanding)) {
    const url = request.nextUrl.clone();
    url.pathname = "/focus";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
