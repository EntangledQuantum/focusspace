"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Timer, Loader2 } from "lucide-react";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

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
      <div className="min-h-dvh flex items-center justify-center p-6" style={{ background: "var(--color-background)" }}>
        <div className="glass w-full max-w-sm rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "color-mix(in srgb, var(--color-secondary-container) 40%, transparent)" }}>
            <span className="text-xl">✓</span>
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--color-on-surface)" }}>Check your email</h2>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: "var(--color-background)" }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full opacity-10"
          style={{ background: "var(--color-secondary)", filter: "blur(100px)" }} />
      </div>

      <div className="glass w-full max-w-sm rounded-2xl p-8 relative z-10">
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
          Create account
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-on-surface-variant)" }}>
          Start getting shit done today.
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
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--color-surface-container-high)",
                  color: "var(--color-on-surface)",
                  border: "1px solid var(--color-outline-variant)",
                }}
              />
            </div>
          ))}

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
            Create account
          </button>
        </form>

        <p className="mt-5 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-medium" style={{ color: "var(--color-primary)" }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
