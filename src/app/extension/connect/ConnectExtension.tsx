"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, Loader2, ShieldAlert } from "lucide-react";
import appIcon from "@/app/icon.png";
import { AuthModal } from "@/components/auth/AuthModal";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode } from "@/lib/mode";

/**
 * The extension opens /extension/connect?ext=<its id>. With the user's existing
 * site session we mint a "Chrome extension" token and hand it straight to the
 * extension via chrome.runtime.sendMessage (allowed by the extension's
 * externally_connectable). Where that channel is unavailable (e.g. a
 * self-hosted domain) the token is shown for pasting into the extension options.
 */

// The ID of the unpacked extension in /extension (fixed by its manifest "key").
const KNOWN_IDS = (process.env.NEXT_PUBLIC_EXTENSION_IDS || "geafjhcohahpagdejhgfgefeoifnkijk")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ID_RE = /^[a-p]{32}$/;
const LOCAL = isLocalMode();

type Phase = "checking" | "signed-out" | "ready" | "connecting" | "done" | "manual" | "error";

interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb: (resp: { ok?: boolean; error?: string } | undefined) => void) => void;
  lastError?: { message?: string };
}

function chromeRuntime(): ChromeRuntime | null {
  const rt = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
  return rt && typeof rt.sendMessage === "function" ? rt : null;
}

function deliver(ext: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const rt = chromeRuntime();
  if (!rt) return Promise.resolve({ ok: false });
  return new Promise((resolve) => {
    try {
      rt.sendMessage(ext, { type: "focusspace:connect", token, apiBase: window.location.origin }, (resp) => {
        if (rt.lastError || !resp) resolve({ ok: false });
        else resolve({ ok: !!resp.ok, error: resp.ok ? undefined : resp.error });
      });
    } catch {
      resolve({ ok: false });
    }
  });
}

export function ConnectExtension() {
  const params = useSearchParams();
  const rawExt = params.get("ext") ?? "";
  const ext = ID_RE.test(rawExt) ? rawExt : null;
  const known = !!ext && KNOWN_IDS.includes(ext);

  const [phase, setPhase] = useState<Phase>(LOCAL ? "ready" : "checking");
  const [email, setEmail] = useState<string | null>(LOCAL ? "Local self-host" : null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (LOCAL) return;
    createClient().auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
      setPhase(user ? "ready" : "signed-out");
    });
  }, []);

  async function connect() {
    setPhase("connecting");
    setError(null);
    try {
      const res = await fetch("/api/extension/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !body.token) throw new Error(body.error || `Request failed (${res.status})`);
      setToken(body.token);
      if (!ext) { setPhase("manual"); return; }
      const res2 = await deliver(ext, body.token);
      if (res2.ok) setPhase("done");
      else if (res2.error) throw new Error(res2.error);
      else setPhase("manual");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  const here = `/extension/connect${ext ? `?ext=${ext}` : ""}`;

  return (
    <div className="glass fade-up w-full flex flex-col items-center text-center"
      style={{ maxWidth: 420, padding: "32px 28px", borderRadius: 28, gap: 16 }}>
      <Image src={appIcon} alt="FocusSpace" width={56} height={56} className="rounded-[16px]" />
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700 }}>
        {phase === "done" ? "Extension connected" : "Connect FocusSpace for Chrome"}
      </h1>

      {phase === "checking" && <Loader2 className="animate-spin" size={20} style={{ color: "var(--color-primary)" }} />}

      {phase === "signed-out" && (
        <>
          <p style={{ color: "var(--color-on-surface-variant)", fontSize: 14 }}>
            Sign in to FocusSpace first — you&apos;ll come right back here.
          </p>
          <AuthModal open onClose={() => { /* keep the sign-in open: it is the whole page */ }} redirectTo={here} />
        </>
      )}

      {(phase === "ready" || phase === "connecting") && (
        <>
          <p style={{ color: "var(--color-on-surface-variant)", fontSize: 14, lineHeight: 1.5 }}>
            The extension will be able to see and control your timer, tasks and Spotify playback
            {email ? <> as <strong style={{ color: "var(--color-on-surface)" }}>{email}</strong></> : null}.
            You can revoke it any time in Settings → Agents &amp; MCP.
          </p>
          {ext && !known && (
            <p className="flex items-start text-left" style={{ gap: 8, fontSize: 12.5, color: "var(--color-error)" }}>
              <ShieldAlert size={16} className="shrink-0" style={{ marginTop: 1 }} />
              This request comes from an extension FocusSpace doesn&apos;t recognise ({ext}). Only continue if you
              installed it yourself.
            </p>
          )}
          <button onClick={connect} disabled={phase === "connecting"} className="pill hover-lift flex items-center justify-center"
            style={{
              gap: 8, padding: "11px 22px", fontWeight: 600, fontSize: 14,
              background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
              color: "var(--color-on-primary)",
            }}>
            {phase === "connecting" && <Loader2 size={16} className="animate-spin" />}
            {ext ? "Connect extension" : "Create extension token"}
          </button>
        </>
      )}

      {phase === "done" && (
        <p className="flex items-center" style={{ gap: 8, color: "var(--color-on-surface-variant)", fontSize: 14 }}>
          <Check size={16} style={{ color: "var(--color-primary)" }} />
          You&apos;re all set. Open the extension from the toolbar — this tab will close.
        </p>
      )}

      {phase === "manual" && token && (
        <>
          <p style={{ color: "var(--color-on-surface-variant)", fontSize: 14, lineHeight: 1.5 }}>
            Couldn&apos;t reach the extension directly from this site. Copy this token and paste it in the
            extension&apos;s options (right-click the icon → Options). It won&apos;t be shown again.
          </p>
          <button
            onClick={() => { void navigator.clipboard.writeText(token); setCopied(true); }}
            className="glass-soft w-full flex items-center justify-between"
            style={{ gap: 10, padding: "10px 14px", borderRadius: 14, fontFamily: "monospace", fontSize: 12.5 }}>
            <span className="truncate">{token}</span>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </>
      )}

      {phase === "error" && (
        <>
          <p style={{ color: "var(--color-error)", fontSize: 14 }}>{error}</p>
          <button onClick={connect} className="pill" style={{ padding: "9px 18px", fontSize: 13 }}>Try again</button>
        </>
      )}
    </div>
  );
}
