// Pure, client-safe helpers for working with OpenAI-compatible model lists
// (OpenAI, Gemini's OpenAI endpoint, OpenRouter, Groq, Ollama, Anthropic) and
// LiteLLM proxy metadata (/model/info, /model_group/info). No fetches here —
// see discovery.ts for the server-side calls.

export interface ModelOption {
  id: string;
  label?: string;
  provider?: string;
  contextWindow?: number;
  /** true/false when the provider tells us; undefined when unknown. */
  supportsTools?: boolean;
  mode?: string;
}

/** Trim, drop trailing slashes and accidentally pasted endpoint suffixes. */
export function normalizeBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(chat\/completions|completions|models)$/i, "")
    .replace(/\/+$/, "");
}

/** LiteLLM serves /model/info + /model_group/info at the proxy root, not under /v1. */
export function litellmRoot(baseUrl: string): string {
  return normalizeBaseUrl(baseUrl).replace(/\/v1$/i, "");
}

// Direct providers we know are NOT a LiteLLM proxy — no point probing them
// for /model_group/info, and they may reject non-standard request params.
const DIRECT_PROVIDER_HOSTS = [
  "api.openai.com", "generativelanguage.googleapis.com", "openrouter.ai", "api.groq.com",
  "api.anthropic.com", "api.mistral.ai", "api.together.xyz", "api.deepseek.com", "api.x.ai",
  "api.fireworks.ai", "api.perplexity.ai", "api.cerebras.ai",
];

/** True when the base URL could be a LiteLLM (or other) proxy rather than a known direct provider. */
export function isProxyLike(baseUrl: string): boolean {
  try {
    const u = new URL(normalizeBaseUrl(baseUrl));
    if (u.port === "11434") return false; // Ollama
    return !DIRECT_PROVIDER_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isPrivateHost(hostRaw: string): boolean {
  const host = hostRaw.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "0.0.0.0" || host === "::" || host === "::1") return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(host) || host.startsWith("fe80:")) return true;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

export type BaseUrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validate a user-supplied base URL before the server calls it. In the hosted
 * app private/loopback addresses are refused (they can't work there and would
 * let the server probe its own network); local mode allows them for Ollama.
 */
export function checkBaseUrl(raw: string, opts: { allowPrivate: boolean }): BaseUrlCheck {
  const normalized = normalizeBaseUrl(raw || "");
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return { ok: false, error: "Base URL must be a full URL, e.g. https://api.openai.com/v1" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Base URL must start with https://" };
  if (u.username || u.password) return { ok: false, error: "Don't put credentials in the URL — use the API key field." };
  if (!opts.allowPrivate && isPrivateHost(u.hostname)) {
    return { ok: false, error: "Local/private addresses aren't reachable from the hosted app. Use a public URL (or self-host FocusSpace for Ollama)." };
  }
  return { ok: true, url: normalized };
}

const NON_CHAT_RE = /(embed|whisper|tts|dall-e|moderation|transcri|rerank|imagen|gpt-image|image-generation|davinci-00|babbage|text-similarity|(^|[/-])aqa$|veo-|lyria|guard)/i;

/** Heuristic: is this a model you can chat with (vs embeddings, TTS, image…)? */
export function isChatModel(m: ModelOption): boolean {
  if (m.id.includes("*")) return false; // LiteLLM wildcard routes aren't callable ids
  if (m.mode) return m.mode === "chat" || m.mode === "responses";
  return !NON_CHAT_RE.test(m.id);
}

type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Parse a `GET {base}/models` response into ModelOptions. Accepts the
 * OpenAI shape `{data:[{id}]}` (OpenAI, LiteLLM, Groq, OpenRouter, Gemini,
 * Anthropic), Ollama's native `{models:[{name}]}`, or a bare array.
 */
export function parseModelList(json: unknown): ModelOption[] {
  const j = json as Raw | unknown[] | null;
  const arr: unknown[] = Array.isArray(j)
    ? j
    : Array.isArray((j as Raw)?.data)
      ? ((j as Raw).data as unknown[])
      : Array.isArray((j as Raw)?.models)
        ? ((j as Raw).models as unknown[])
        : [];
  const out: ModelOption[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      out.push({ id: item.replace(/^models\//, "") });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const it = item as Raw;
    const rawId = str(it.id) ?? str(it.name) ?? str(it.model);
    if (!rawId) continue;
    const id = rawId.replace(/^models\//, ""); // Gemini prefixes ids with "models/"
    const label = str(it.display_name) ?? str(it.displayName) ?? (str(it.name) && str(it.name) !== rawId ? str(it.name) : undefined);
    const params = Array.isArray(it.supported_parameters) ? (it.supported_parameters as unknown[]) : null;
    out.push({
      id,
      label,
      provider: str(it.owned_by),
      contextWindow: num(it.context_window) ?? num(it.context_length) ?? num(it.max_input_tokens) ?? num(it.inputTokenLimit),
      supportsTools: params ? params.includes("tools") : undefined,
      mode: str(it.mode),
    });
  }
  return out;
}

/**
 * Parse LiteLLM `/model_group/info` (`{data:[{model_group, providers, …}]}`)
 * or `/model/info` (`{data:[{model_name, litellm_params, model_info}]}`) into
 * per-model metadata. Multiple deployments of one model name are merged.
 */
export function parseLiteLLMInfo(json: unknown): Map<string, Partial<ModelOption>> {
  const map = new Map<string, Partial<ModelOption>>();
  const data = (json as Raw | null)?.data;
  if (!Array.isArray(data)) return map;
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const it = item as Raw;
    const info = (it.model_info && typeof it.model_info === "object" ? it.model_info : it) as Raw;
    const params = (it.litellm_params && typeof it.litellm_params === "object" ? it.litellm_params : {}) as Raw;
    const name = str(it.model_group) ?? str(it.model_name);
    if (!name) continue;
    const providers = Array.isArray(it.providers) ? (it.providers as unknown[]).filter((p) => typeof p === "string") as string[] : [];
    const provider = str(info.litellm_provider) ?? providers[0] ?? str(params.model)?.split("/")[0];
    const tools = typeof info.supports_function_calling === "boolean" ? info.supports_function_calling : undefined;
    const prev = map.get(name) ?? {};
    map.set(name, {
      provider: prev.provider ?? provider,
      contextWindow: Math.max(prev.contextWindow ?? 0, num(info.max_input_tokens) ?? 0) || undefined,
      supportsTools: prev.supportsTools === true || tools === true ? true : (tools ?? prev.supportsTools),
      mode: prev.mode ?? str(info.mode),
    });
  }
  return map;
}

/** Merge a /models list with LiteLLM metadata, drop non-chat models, dedupe and sort. */
export function mergeModels(list: ModelOption[], info?: Map<string, Partial<ModelOption>> | null): ModelOption[] {
  const byId = new Map<string, ModelOption>();
  for (const m of list) if (!byId.has(m.id)) byId.set(m.id, { ...m });
  if (info) {
    // A key that can't list /models may still read model_group/info.
    if (!byId.size) for (const id of info.keys()) byId.set(id, { id });
    for (const [id, meta] of info) {
      const cur = byId.get(id);
      if (!cur) continue;
      byId.set(id, {
        ...cur,
        provider: meta.provider ?? cur.provider,
        contextWindow: meta.contextWindow ?? cur.contextWindow,
        supportsTools: meta.supportsTools ?? cur.supportsTools,
        mode: meta.mode ?? cur.mode,
      });
    }
  }
  return [...byId.values()]
    .filter(isChatModel)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" }));
}

/** Client-side search across id / label / provider (all terms must match). */
export function filterModels(models: ModelOption[], query: string): ModelOption[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return models;
  return models.filter((m) => {
    const hay = `${m.id} ${m.label ?? ""} ${m.provider ?? ""}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** "128k ctx" style label for a context window. */
export function formatContext(tokens?: number): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${+(tokens / 1_000_000).toFixed(1)}M ctx`;
  return `${Math.round(tokens / 1000)}k ctx`;
}
