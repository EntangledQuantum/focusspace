"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import appIcon from "@/app/icon.png";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, X, MailCheck } from "lucide-react";

const URL_ERROR_MESSAGES: Record<string, string> = {
  spotify_email_verify: "Your Spotify account email isn't verified. Check your inbox and verify it, then try again.",
  auth_callback_failed: "Sign-in failed. Please try again.",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "var(--color-on-surface)",
  border: "1px solid rgba(255,255,255,0.10)",
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** error code from ?error= (auth callback failures) */
  urlError?: string | null;
}

/**
 * One door for everything: Google/Spotify create-or-sign-in automatically,
 * and email+password first tries to sign in, then transparently creates the
 * account if it doesn't exist yet.
 */
export function AuthModal({ open, onClose, urlError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const bannerMessage = error ?? (urlError ? (URL_ERROR_MESSAGES[urlError] ?? "Sign-in failed. Please try again.") : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // 1) Try signing in
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (!signInError) {
      router.push("/focus");
      router.refresh();
      return;
    }

    // 2) Unknown account → create it on the spot
    if (/invalid login credentials/i.test(signInError.message)) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: email.split("@")[0] },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (!signUpError) {
        if (data.session) {
          router.push("/focus");
          router.refresh();
        } else {
          setEmailSent(true);
          setLoading(false);
        }
        return;
      }
      // Account exists but the password was wrong
      if (/already registered/i.test(signUpError.message)) {
        setError("That email already has an account — the password doesn't match.");
      } else {
        setError(signUpError.message);
      }
      setLoading(false);
      return;
    }

    setError(signInError.message);
    setLoading(false);
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
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
            style={{ background: "rgba(5,3,8,0.55)", backdropFilter: "blur(6px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full"
            style={{ maxWidth: 400, padding: "0 16px" }}
          >
            <div
              className="relative overflow-hidden"
              style={{
                borderRadius: 26,
                background: "color-mix(in srgb, var(--color-surface-container) 92%, transparent)",
                backdropFilter: "blur(28px) saturate(1.4)",
                WebkitBackdropFilter: "blur(28px) saturate(1.4)",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 40px 90px -24px rgba(0,0,0,0.7)",
                padding: 28,
              }}
            >
              {/* top gradient halo */}
              <div
                className="absolute pointer-events-none"
                style={{
                  top: -90, left: "50%", transform: "translateX(-50%)",
                  width: 320, height: 180, borderRadius: "50%",
                  background: "radial-gradient(ellipse, color-mix(in srgb, var(--color-primary) 28%, transparent), transparent 70%)",
                  filter: "blur(10px)",
                }}
              />

              <button
                onClick={onClose}
                className="icon-btn absolute"
                style={{ top: 14, right: 14, width: 30, height: 30 }}
              >
                <X size={16} />
              </button>

              {emailSent ? (
                <div className="relative text-center" style={{ padding: "18px 0 6px" }}>
                  <div
                    className="grad-primary mx-auto flex items-center justify-center"
                    style={{
                      width: 52, height: 52, borderRadius: "50%", marginBottom: 16,
                      boxShadow: "0 10px 32px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)",
                    }}
                  >
                    <MailCheck size={22} style={{ color: "var(--color-on-primary)" }} />
                  </div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 800, color: "var(--color-on-surface)", marginBottom: 6 }}>
                    Check your email
                  </h2>
                  <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                    We created your account and sent a confirmation link to <strong>{email}</strong>.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center" style={{ gap: 10, marginBottom: 18 }}>
                    <Image src={appIcon} alt="FocusSpace" width={34} height={34} className="rounded-xl" />
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, lineHeight: 1.1, color: "var(--color-on-surface)" }}>
                      Enter your space
                    </p>
                  </div>

                  {bannerMessage && (
                    <div className="mb-4 rounded-xl px-4 py-3 text-sm"
                      style={{ background: "color-mix(in srgb, var(--color-error-container) 30%, transparent)", color: "var(--color-error)" }}>
                      {bannerMessage}
                    </div>
                  )}

                  <button
                    onClick={handleGoogle}
                    disabled={googleLoading}
                    className="w-full rounded-full py-2.5 text-sm font-medium flex items-center justify-center gap-3 transition-all active:scale-95 btn-hover-surface"
                    style={{ ...INPUT_STYLE, opacity: googleLoading ? 0.7 : 1 }}
                  >
                    {googleLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 48 48">
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
                    className="mt-3 w-full rounded-full py-2.5 text-sm font-medium flex items-center justify-center gap-3 transition-all active:scale-95 btn-hover-green"
                    style={{ background: "#1DB954", color: "#000", opacity: spotifyLoading ? 0.7 : 1 }}
                  >
                    {spotifyLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    )}
                    Continue with Spotify
                  </button>

                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
                    <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>or use email</span>
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none input-field"
                      style={INPUT_STYLE}
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Password (min. 8 characters)"
                      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none input-field"
                      style={INPUT_STYLE}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="grad-primary w-full rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 btn-hover-primary"
                      style={{
                        color: "var(--color-on-primary)",
                        boxShadow: "0 10px 32px -8px color-mix(in srgb, var(--color-primary) 60%, transparent)",
                        opacity: loading ? 0.7 : 1,
                      }}
                    >
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={15} />}
                      Continue
                    </button>
                  </form>

                  <p className="text-center" style={{ fontSize: 11, color: "var(--color-on-surface-variant)", opacity: 0.75, marginTop: 14 }}>
                    New email? We&apos;ll create your account automatically.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
