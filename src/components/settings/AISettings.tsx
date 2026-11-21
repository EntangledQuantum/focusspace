"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2, KeyRound, Check, Trash2, RefreshCw, Server } from "lucide-react";
import { ModelPicker } from "@/components/ai/ModelPicker";
import { useAIModels } from "@/components/ai/useAIModels";
import type { ModelOption } from "@/lib/ai/models";
import { isLocalMode } from "@/lib/mode";
import type { UserSettings } from "@/types/database";

interface AiStatus {
  globallyEnabled: boolean;
  gatewayConfigured: boolean;
  defaultModel: string;
  freeMonthlyTokens: number;
  hasOwnKey: boolean;
  ownKey: { baseUrl: string | null; model: string | null } | null;
  usage: { period: string; used: number; requestCount: number };
}

interface Discovery { models: ModelOption[]; litellm: boolean; error?: string }

// OpenAI-compatible endpoints people commonly use. LiteLLM is "your proxy URL + /v1".
const PRESETS: { label: string; url: string; localOnly?: boolean }[] = [
  { label: "OpenAI", url: "https://api.openai.com/v1" },
  { label: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { label: "Groq", url: "https://api.groq.com/openai/v1" },
  { label: "Anthropic", url: "https://api.anthropic.com/v1" },
  { label: "OpenCode Go", url: "https://opencode.ai/inference/go/openai/v1" },
  { label: "Ollama", url: "http://localhost:11434/v1", localOnly: true },
];

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--color-surface-container-high)", color: "var(--color-on-surface)", border: "1px solid var(--color-outline-variant)",
};

/** Settings → Focus AI: enable, model, usage, delete confirmation, own key + model discovery. */
export function AISettings({
  settings,
  onSave,
}: {
  settings: UserSettings | null | undefined;
  onSave: (patch: Partial<UserSettings>) => void;
}) {
  const qc = useQueryClient();
  const local = isLocalMode();
  const { data: status, refetch } = useQuery<AiStatus | null>({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const res = await fetch("/api/ai/status");
      return res.ok ? res.json() : null;
    },
  });

  const enabled = settings?.ai_enabled ?? false;
  const useOwnKey = settings?.ai_use_own_key ?? false;
  const shared = useAIModels(enabled && !useOwnKey && !!status?.globallyEnabled);

  // Form fields fall back to the saved credentials (never the key itself) until edited.
  const savedBase = status?.ownKey?.baseUrl ?? "";
  const savedModel = status?.ownKey?.model ?? "";
  const [baseDraft, setBaseDraft] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<string | null>(null);
  const baseUrl = baseDraft ?? savedBase;
  const ownModel = modelDraft ?? savedModel;
  const [apiKey, setApiKey] = useState("");
  const [discoverNonce, setDiscoverNonce] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [saving, setSaving] = useState(false);

  const canUseKey = !!baseUrl && (!!apiKey || !!status?.hasOwnKey);
  // Discovery runs only with a key: on "Load models", or automatically for the saved key.
  const autoDiscover = !!status?.hasOwnKey && !!savedBase && baseUrl === savedBase && !apiKey;
  const discovery = useQuery<Discovery>({
    queryKey: ["ai-discover", baseUrl, discoverNonce],
    queryFn: async () => {
      const res = await fetch("/api/ai/models", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: apiKey || undefined }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: enabled && useOwnKey && canUseKey && (discoverNonce > 0 || autoDiscover),
    staleTime: Infinity,
    retry: false,
  });
  const found: Discovery | null = discovery.isError
    ? { models: [], litellm: false, error: "Couldn't load models — type the model id instead." }
    : discovery.data ?? null;
  const discovering = discovery.isFetching;

  function setBase(url: string) {
    setBaseDraft(url);
    setDiscoverNonce(0);
  }

  if (status && !status.globallyEnabled) return null; // feature off for this deployment
  if (!status) {
    return (
      <Shell>
        <div className="flex items-center gap-2 py-2" style={{ color: "var(--color-on-surface-variant)" }}>
          <Loader2 size={14} className="animate-spin" /> <span className="text-xs">Loading…</span>
        </div>
      </Shell>
    );
  }

  const usingGlobal = enabled && !useOwnKey;
  const pct = status.freeMonthlyTokens ? Math.min(100, (status.usage.used / status.freeMonthlyTokens) * 100) : 0;

  async function testKey() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("/api/ai/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: apiKey || undefined, model: ownModel || undefined }),
      }).then((r) => r.json());
      setTestResult(res.ok ? { ok: true, msg: `Works · ${res.model}` } : { ok: false, msg: res.error || "Failed" });
    } catch { setTestResult({ ok: false, msg: "Request failed" }); }
    finally { setTesting(false); }
  }

  async function saveKey() {
    if (!canUseKey) { toast.error("Base URL and API key are required"); return; }
    if (!ownModel) { toast.error("Pick a model first"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/ai/credentials", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: apiKey || undefined, model: ownModel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save key");
      setApiKey("");
      toast.success("Saved");
      for (const k of ["settings", "ai-models"]) qc.invalidateQueries({ queryKey: [k] });
      refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save key"); } finally { setSaving(false); }
  }

  async function removeKey() {
    await fetch("/api/ai/credentials", { method: "DELETE" });
    setApiKey(""); setTestResult(null); setBaseDraft(null); setModelDraft(null); setDiscoverNonce(0);
    toast.success("Own key removed");
    for (const k of ["settings", "ai-models"]) qc.invalidateQueries({ queryKey: [k] });
    refetch();
  }

  return (
    <Shell>
      <Row label="Enable Focus AI" description="Adds the Focus AI button to every tab.">
        <Toggle checked={enabled} onChange={(v) => onSave({ ai_enabled: v })} />
      </Row>

      {enabled && (
        <>
          <Row label="Use my own API key" description="Unmetered. Any OpenAI-compatible endpoint — OpenAI, Gemini, OpenRouter, Groq, or a LiteLLM proxy.">
            <Toggle checked={useOwnKey} onChange={(v) => { onSave({ ai_use_own_key: v }); qc.invalidateQueries({ queryKey: ["ai-models"] }); }} />
          </Row>

          {usingGlobal && (
            <Row label="Model" description={shared.data?.litellm ? "Shared gateway (LiteLLM)." : "Used with the shared gateway."}>
              <ModelPicker
                align="right"
                models={shared.data?.models ?? []}
                value={shared.data?.selected ?? settings?.ai_model ?? status.defaultModel}
                loading={shared.isLoading || shared.select.isPending}
                error={shared.data?.error ?? null}
                onChange={(id) => shared.select.mutate(id)}
              />
            </Row>
          )}

          {usingGlobal && (
            <Row label="Monthly free usage" description={`${status.usage.used.toLocaleString()} / ${status.freeMonthlyTokens.toLocaleString()} tokens`}>
              <div className="rounded-full overflow-hidden" style={{ width: 140, height: 6, background: "var(--color-surface-container-high)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 85 ? "var(--color-error)" : "var(--color-primary)" }} />
              </div>
            </Row>
          )}

          <Row label="Confirm before deleting" description="Ask before Focus AI deletes a project, task, subtask or tag.">
            <Toggle
              checked={(settings?.ai_destructive ?? "allow") === "confirm"}
              onChange={(v) => onSave({ ai_destructive: v ? "confirm" : "allow" })}
            />
          </Row>

          {useOwnKey && (
            <div className="flex flex-col" style={{ gap: 9, padding: "12px 0 4px", borderTop: "1px solid rgba(var(--ink), 0.06)" }}>
              <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
                {PRESETS.filter((p) => !p.localOnly || local).map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setBase(p.url)}
                    className="pill btn-hover-surface"
                    style={{
                      padding: "4px 10px", fontSize: 11.5,
                      color: baseUrl === p.url ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                      background: baseUrl === p.url ? "color-mix(in srgb, var(--color-primary) 14%, transparent)" : "rgba(var(--ink), 0.05)",
                      border: "1px solid rgba(var(--ink), 0.08)",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                value={baseUrl} onChange={(e) => setBase(e.target.value)}
                placeholder="Base URL (e.g. https://your-litellm-host/v1)"
                className="w-full rounded-xl px-3 py-2 text-sm outline-none input-field" style={INPUT_STYLE}
              />
              <input
                value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off"
                placeholder={status.hasOwnKey ? "API key saved — type to replace" : "API key (or LiteLLM virtual key)"}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none input-field" style={INPUT_STYLE}
              />
              <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
                <div className="flex-1" style={{ minWidth: 200 }}>
                  <ModelPicker
                    models={found?.models ?? []}
                    value={ownModel || null}
                    loading={discovering}
                    error={found?.error ?? null}
                    allowCustom
                    onRefresh={canUseKey ? () => setDiscoverNonce((n) => n + 1) : undefined}
                    onChange={(id) => { setModelDraft(id); setTestResult(null); }}
                  />
                </div>
                <button
                  onClick={() => setDiscoverNonce((n) => n + 1)} disabled={discovering || !canUseKey}
                  className="pill text-xs px-3 py-1.5 btn-hover-surface disabled:opacity-50"
                  style={{ color: "var(--color-on-surface)", background: "var(--color-surface-container-high)", border: "1px solid var(--color-outline-variant)" }}
                >
                  {discovering ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Load models
                </button>
              </div>
              {found && !found.error && found.models.length > 0 && (
                <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                  {found.models.length} chat model{found.models.length === 1 ? "" : "s"} available from this endpoint.
                </p>
              )}
              {found?.litellm && (
                <p className="flex items-center text-xs" style={{ gap: 6, color: "var(--color-secondary)" }}>
                  <Server size={12} /> LiteLLM proxy detected — showing its model groups.
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={testKey} disabled={testing || !canUseKey || !ownModel}
                  className="pill text-xs px-3 py-1.5 btn-hover-surface disabled:opacity-50"
                  style={{ color: "var(--color-on-surface)", background: "var(--color-surface-container-high)", border: "1px solid var(--color-outline-variant)" }}>
                  {testing ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Test
                </button>
                <button onClick={saveKey} disabled={saving}
                  className="pill grad-primary text-xs px-3 py-1.5 font-semibold"
                  style={{ color: "var(--color-on-primary)", opacity: saving ? 0.6 : 1 }}>
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                </button>
                {status.hasOwnKey && (
                  <button onClick={removeKey} className="pill text-xs px-3 py-1.5 btn-hover-error" style={{ color: "var(--color-error)" }}>
                    <Trash2 size={12} /> Remove
                  </button>
                )}
                {testResult && (
                  <span className="text-xs" style={{ color: testResult.ok ? "var(--color-secondary)" : "var(--color-error)" }}>
                    {testResult.msg}
                  </span>
                )}
              </div>
            </div>
          )}

          {!status.gatewayConfigured && !useOwnKey && (
            <p className="text-xs" style={{ color: "var(--color-error)", paddingTop: 6 }}>
              No shared AI gateway is configured on this deployment — add your own key above.
            </p>
          )}
        </>
      )}
    </Shell>
  );
}

// Small local copies of the settings page's Section/Field/Toggle look, kept here
// so this component doesn't depend on page-private helpers.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
      <div className="flex items-center" style={{ gap: 11, marginBottom: 14 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 34, height: 34, borderRadius: 11, background: "color-mix(in srgb, var(--color-primary) 14%, transparent)", color: "var(--color-primary)" }}
        >
          <Sparkles size={18} />
        </div>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700, color: "var(--color-on-surface)" }}>Focus AI</p>
          <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", opacity: 0.8, marginTop: 1 }}>
            Your assistant on every tab — manages tasks, the timer, stats and music.
          </p>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4" style={{ padding: "11px 0", borderTop: "1px solid rgba(var(--ink), 0.06)" }}>
      <div className="min-w-0">
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-on-surface)" }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.8, marginTop: 2 }}>{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex shrink-0 ${checked ? "grad-primary justify-end" : "justify-start"}`}
      style={{ width: 46, height: 27, borderRadius: 99, padding: 3, background: checked ? undefined : "rgba(var(--ink), 0.13)", transition: "background .2s" }}
    >
      <span style={{ width: 21, height: 21, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all .2s" }} />
    </button>
  );
}
