"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Timer, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: "var(--color-background)" }}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10"
          style={{ background: "var(--color-primary)", filter: "blur(100px)" }} />
        <div className="absolute bottom-1/4 right-1/3 w-72 h-72 rounded-full opacity-8"
          style={{ background: "var(--color-secondary)", filter: "blur(80px)" }} />
      </div>

      <div className="glass w-full max-w-sm rounded-2xl p-8 relative z-10">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "var(--color-primary-container)" }}>
            <Timer size={18} style={{ color: "var(--color-on-primary)" }} />
          </div>
          <div>
            <p className="font-semibold text-sm leading-none" style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}>FocusSpace</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>Deep Work</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}>
          Welcome back
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-on-surface-variant)" }}>
          Log in and get to work.
        </p>

        {error && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm"
            style={{ background: "color-mix(in srgb, var(--color-error-container) 30%, transparent)", color: "var(--color-error)" }}>
            {error}
          </div>
        )}

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
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              style={{
                background: "var(--color-surface-container-high)",
                color: "var(--color-on-surface)",
                border: "1px solid var(--color-outline-variant)",
              }}
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
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              style={{
                background: "var(--color-surface-container-high)",
                color: "var(--color-on-surface)",
                border: "1px solid var(--color-outline-variant)",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: "var(--color-primary-container)",
              color: "var(--color-on-primary-container)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Log in
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: "var(--color-outline-variant)" }} />
          <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>or</span>
          <div className="flex-1 h-px" style={{ background: "var(--color-outline-variant)" }} />
        </div>

        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full rounded-full py-2.5 text-sm font-medium flex items-center justify-center gap-3 transition-all active:scale-95"
          style={{
            background: "var(--color-surface-container-high)",
            color: "var(--color-on-surface)",
            border: "1px solid var(--color-outline-variant)",
            opacity: googleLoading ? 0.7 : 1,
          }}
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

        <p className="mt-5 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
          No account?{" "}
          <Link href="/signup" className="font-medium" style={{ color: "var(--color-primary)" }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
