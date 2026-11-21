"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { buildAgentSetup } from "@/lib/agent/setup";
import { isLocalMode } from "@/lib/mode";

interface TokenRow { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }

const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, lineHeight: 1.5,
  color: "var(--color-on-surface)", whiteSpace: "pre-wrap", wordBreak: "break-all",
};

const noop = () => () => {};

function when(iso: string | null): string {
  if (!iso) return "never used";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 3_600_000) return `used ${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `used ${Math.floor(diff / 3_600_000)}h ago`;
  return `used ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function CopyBlock({ label, text, primary }: { label: string; text: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — select the text instead");
    }
  }
  return (
    <div className="flex flex-col" style={{ gap: 5 }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-on-surface-variant)" }}>{label}</span>
        <button
          onClick={copy}
          className={`pill ${primary ? "grad-primary" : "btn-hover-surface"}`}
          style={{ padding: "3px 10px", fontSize: 11.5, fontWeight: 600, color: primary ? "var(--color-on-primary)" : "var(--color-on-surface)", background: primary ? undefined : "rgba(255,255,255,0.07)" }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div style={{ ...MONO, padding: "9px 11px", borderRadius: 11, background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.08)" }}>{text}</div>
    </div>
  );
}

/** Settings → Agents & MCP: personal access tokens + copy-paste agent setup. */
export function AgentsSettings() {
  const qc = useQueryClient();
  const local = isLocalMode();
  // Server render has no origin; the client snapshot swaps it in after hydration.
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "https://focusspace.live");
  const [name, setName] = useState("My agent");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const tokens = useQuery<TokenRow[]>({
    queryKey: ["mcp-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/mcp/tokens");
      if (!res.ok) throw new Error();
      return (await res.json()).tokens ?? [];
    },
    enabled: !local,
  });

  async function createToken() {
    setCreating(true);
    try {
      const res = await fetch("/api/mcp/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || "My agent" }) });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.error || "Could not create token");
      setFresh({ token: data.token, name: data.name });
      qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create token");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setConfirmRevoke(null);
    qc.setQueryData<TokenRow[]>(["mcp-tokens"], (l) => l?.filter((t) => t.id !== id));
    const res = await fetch(`/api/mcp/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) toast.error("Couldn't revoke token");
    else toast.success("Token revoked — agents using it lose access immediately");
    qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
  }

  const setup = buildAgentSetup(origin, local ? null : fresh?.token ?? null);

  return (
    <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
      <div className="flex items-center" style={{ gap: 11, marginBottom: 12 }}>
        <div className="flex items-center justify-center shrink-0" style={{ width: 34, height: 34, borderRadius: 11, background: "color-mix(in srgb, var(--color-primary) 14%, transparent)", color: "var(--color-primary)" }}>
          <Bot size={18} />
        </div>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700, color: "var(--color-on-surface)" }}>Agents &amp; MCP</p>
          <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", opacity: 0.8, marginTop: 1 }}>
            Let Claude, ChatGPT, Cursor, Hermes, OpenClaw — any MCP agent — run your timer, tasks and projects.
          </p>
        </div>
      </div>

      {local ? (
        <div className="flex flex-col" style={{ gap: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", lineHeight: 1.5 }}>
            Local install — no token needed. Paste this into your agent (the app must be running), or use stdio: <code>npm run mcp</code>.
          </p>
          <CopyBlock label="Tell your agent" text={setup.oneLiner} primary />
          <CopyBlock label="Claude Code" text={setup.claudeCode} />
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createToken(); }}
              placeholder="Token name (e.g. Claude Code)"
              maxLength={60}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none input-field"
              style={{ background: "var(--color-surface-container-high)", color: "var(--color-on-surface)", border: "1px solid var(--color-outline-variant)", minWidth: 0 }}
            />
            <button onClick={createToken} disabled={creating} className="pill grad-primary" style={{ padding: "8px 14px", fontSize: 12.5, fontWeight: 600, color: "var(--color-on-primary)", opacity: creating ? 0.6 : 1 }}>
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} New token
            </button>
          </div>

          {fresh && (
            <div className="flex flex-col" style={{ gap: 10, padding: 13, borderRadius: 16, background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)" }}>
              <p style={{ fontSize: 12.5, color: "var(--color-on-surface)", lineHeight: 1.5 }}>
                <strong>“{fresh.name}” is ready.</strong> Copy one of these now — the token is shown only once.
              </p>
              <CopyBlock label="Tell your agent (any MCP client)" text={setup.oneLiner} primary />
              <CopyBlock label="Claude Code" text={setup.claudeCode} />
              <CopyBlock label="JSON config (Cursor, .mcp.json, …)" text={setup.json} />
              <button onClick={() => setFresh(null)} className="self-end pill btn-hover-surface" style={{ padding: "5px 12px", fontSize: 12, color: "var(--color-on-surface-variant)", background: "rgba(255,255,255,0.06)" }}>
                Done, I&apos;ve copied it
              </button>
            </div>
          )}

          {tokens.isLoading ? (
            <div className="flex items-center" style={{ gap: 8, fontSize: 12, color: "var(--color-on-surface-variant)", padding: "4px 2px" }}>
              <Loader2 size={12} className="animate-spin" /> Loading tokens…
            </div>
          ) : tokens.isError ? (
            <p style={{ fontSize: 12, color: "var(--color-error)" }}>Couldn&apos;t load tokens.</p>
          ) : !tokens.data?.length ? (
            <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", padding: "2px" }}>No tokens yet.</p>
          ) : (
            <div className="flex flex-col">
              {tokens.data.map((t) => (
                <div key={t.id} className="flex items-center" style={{ gap: 10, padding: "9px 2px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <KeyRound size={14} style={{ color: "var(--color-on-surface-variant)", flexShrink: 0 }} />
                  <div className="min-w-0 flex-1">
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                    <p style={{ fontSize: 11, color: "var(--color-on-surface-variant)", opacity: 0.8 }}>
                      <code>{t.prefix}…</code> · {when(t.last_used_at)}
                    </p>
                  </div>
                  {confirmRevoke === t.id ? (
                    <div className="flex items-center" style={{ gap: 4 }}>
                      <button onClick={() => revoke(t.id)} className="pill" style={{ padding: "4px 10px", fontSize: 11.5, fontWeight: 600, color: "#fff", background: "var(--color-error)" }}>Revoke</button>
                      <button onClick={() => setConfirmRevoke(null)} className="pill" style={{ padding: "4px 9px", fontSize: 11.5, color: "var(--color-on-surface-variant)", background: "rgba(255,255,255,0.06)" }}>Keep</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmRevoke(t.id)} className="icon-btn" title="Revoke token" style={{ width: 28, height: 28, color: "var(--color-error)" }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", opacity: 0.8, lineHeight: 1.5 }}>
            Your agent connects to this hosted account — nothing is installed on your machine and your data stays on FocusSpace.
            Endpoint <code>{setup.mcpUrl}</code> · header <code>Authorization: Bearer fs_…</code> · agent guide{" "}
            <a href={`${origin.replace(/\/+$/, "")}/for-agents/cloud.md`} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "var(--color-primary)" }}>for-agents/cloud.md</a>
          </p>
        </div>
      )}
    </div>
  );
}
