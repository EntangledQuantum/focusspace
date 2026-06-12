"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowRight, Sparkles, ListChecks, Flame } from "lucide-react";

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  color: "var(--color-on-surface)",
  border: "1px solid rgba(255,255,255,0.10)",
};

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="fade-up w-full max-w-sm text-center">
          <div className="grad-primary w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{ boxShadow: "0 10px 32px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)" }}>
            <span className="text-xl" style={{ color: "var(--color-on-primary)" }}>✓</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--color-on-surface)", marginBottom: 8 }}>
            Check your email
          </h2>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
        </div>
      </div>
    );
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
          Claim your{" "}
          <span style={{
            background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>
            space.
          </span>
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--color-on-surface-variant)", marginTop: 14 }}>
          Thirty seconds to set up. A lifetime of deep work ahead.
        </p>
        <div className="flex flex-col" style={{ gap: 12, marginTop: 28 }}>
          {[
            { icon: ListChecks, text: "Projects, subtasks and tags from day one" },
            { icon: Sparkles, text: "Living wallpapers and frosted glass, your way" },
            { icon: Flame, text: "Streaks that make showing up addictive" },
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
          Create account
        </h2>
        <p className="text-sm mb-7" style={{ color: "var(--color-on-surface-variant)" }}>
          Start getting things done today.
        </p>

        {error && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm"
            style={{ background: "color-mix(in srgb, var(--color-error-container) 30%, transparent)", color: "var(--color-error)" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          {[
            { label: "Name", type: "text", value: name, set: setName, placeholder: "Your name" },
            { label: "Email", type: "email", value: email, set: setEmail, placeholder: "you@example.com" },
            { label: "Password", type: "password", value: password, set: setPassword, placeholder: "min. 8 characters" },
          ].map(({ label, type, value, set, placeholder }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--color-on-surface-variant)" }}>
                {label}
              </label>
              <input
                type={type}
                value={value}
                onChange={(e) => set(e.target.value)}
                required
                minLength={type === "password" ? 8 : undefined}
                placeholder={placeholder}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none input-field"
                style={INPUT_STYLE}
              />
            </div>
          ))}

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
            Create account
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
          <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>or</span>
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
        </div>

        <button
          onClick={handleSpotify}
          disabled={spotifyLoading}
          className="w-full rounded-full py-3 text-sm font-medium flex items-center justify-center gap-3 transition-all active:scale-95 btn-hover-green"
          style={{ background: "#1DB954", color: "#000", opacity: spotifyLoading ? 0.7 : 1 }}
        >
          {spotifyLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
          )}
          Sign up with Spotify
        </button>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold" style={{ color: "var(--color-primary)" }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
