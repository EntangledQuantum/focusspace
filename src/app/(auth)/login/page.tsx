"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowRight, Timer, Headphones, BarChart2 } from "lucide-react";

const URL_ERROR_MESSAGES: Record<string, string> = {
  spotify_email_verify: "Your Spotify account email isn't verified. Check your inbox and verify it, then try signing in again.",
  auth_callback_failed: "Sign-in failed. Please try again.",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  color: "var(--color-on-surface)",
  border: "1px solid rgba(255,255,255,0.10)",
};

function UrlErrorBanner({ formError }: { formError: string | null }) {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const message = urlError ? (URL_ERROR_MESSAGES[urlError] ?? "Sign-in failed. Please try again.") : formError;
  if (!message) return null;
  return (
    <div className="mb-4 rounded-xl px-4 py-3 text-sm"
      style={{ background: "color-mix(in srgb, var(--color-error-container) 30%, transparent)", color: "var(--color-error)" }}>
      {message}
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/focus");
      router.refresh();
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  }

  async function handleSpotify() {
    setSpotifyLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        scopes: "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private user-library-read",
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) { setError(error.message); setSpotifyLoading(false); }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center lg:justify-between gap-16 px-6 lg:px-24" style={{ paddingTop: 72, paddingBottom: 48 }}>
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex flex-col fade-up" style={{ maxWidth: 460 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "-.03em",
            fontSize: "clamp(36px, 4vw, 52px)", lineHeight: 1.08, color: "var(--color-on-surface)",
          }}
        >
          Back to your{" "}
          <span style={{
            background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>
            space.
          </span>
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--color-on-surface-variant)", marginTop: 14 }}>
          Your tasks, timeline and streaks are exactly where you left them.
        </p>
        <div className="flex flex-col" style={{ gap: 12, marginTop: 28 }}>
          {[
            { icon: Timer, text: "Pick one task and run the timer" },
            { icon: Headphones, text: "Your music takes over the room" },
            { icon: BarChart2, text: "Watch the deep-work hours stack up" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center" style={{ gap: 12 }}>
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 30, height: 30, borderRadius: 10,
                  color: "var(--color-primary)",
                  background: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                }}
              >
                <Icon size={15} />
              </div>
              <span style={{ fontSize: 13.5, color: "var(--color-on-surface-variant)" }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form — directly on the background, no card */}
      <div className="w-full fade-up" style={{ maxWidth: 380 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800,
            letterSpacing: "-.02em", color: "var(--color-on-surface)", marginBottom: 4,
          }}
        >
          Welcome back
        </h2>
        <p className="text-sm mb-7" style={{ color: "var(--color-on-surface-variant)" }}>
          Log in and get to work.
        </p>

        <Suspense fallback={null}>
          <UrlErrorBanner formError={error} />
        </Suspense>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--color-on-surface-variant)" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all input-field"
              style={INPUT_STYLE}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--color-on-surface-variant)" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all input-field"
              style={INPUT_STYLE}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="grad-primary w-full rounded-full py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 btn-hover-primary"
            style={{
              color: "var(--color-on-primary)",
              boxShadow: "0 10px 32px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={15} />}
            Log in
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
          <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>or</span>
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
        </div>

        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full rounded-full py-3 text-sm font-medium flex items-center justify-center gap-3 transition-all active:scale-95 btn-hover-surface"
          style={{ ...INPUT_STYLE, opacity: googleLoading ? 0.7 : 1 }}
        >
          {googleLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.3z"/>
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.1-9.7H2.7v6.2C6.7 42.8 14.8 48 24 48z"/>
              <path fill="#FBBC05" d="M10.9 28.8A14.5 14.5 0 0 1 10 24c0-1.7.3-3.3.9-4.8v-6.2H2.7A23.9 23.9 0 0 0 .1 24c0 3.9.9 7.5 2.6 10.8l8.2-6z"/>
              <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.7-6.7C35.9 2.4 30.5 0 24 0 14.8 0 6.7 5.2 2.7 13.2l8.2 6.1C12.7 13.6 17.9 9.5 24 9.5z"/>
            </svg>
          )}
          Continue with Google
        </button>

        <button
          onClick={handleSpotify}
          disabled={spotifyLoading}
          className="mt-3 w-full rounded-full py-3 text-sm font-medium flex items-center justify-center gap-3 transition-all active:scale-95 btn-hover-green"
          style={{ background: "#1DB954", color: "#000", opacity: spotifyLoading ? 0.7 : 1 }}
        >
          {spotifyLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
          )}
          Continue with Spotify
        </button>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
          No account?{" "}
          <Link href="/signup" className="font-semibold" style={{ color: "var(--color-primary)" }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
