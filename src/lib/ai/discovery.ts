import { aiServerConfig } from "./config";
import {
  isProxyLike, litellmRoot, mergeModels, normalizeBaseUrl, parseLiteLLMInfo, parseModelList, providerHeaders,
  type ModelOption,
} from "./models";

// Server-side model discovery against an OpenAI-compatible endpoint. Only
// ever called with a key the user (or the deployment) supplied — never from
// the browser directly, so the key stays server-side.

export interface DiscoveryResult {
  models: ModelOption[];
  /** The endpoint answered LiteLLM's /model_group/info → it's a LiteLLM proxy. */
  litellm: boolean;
  /** Set when /models failed; the UI falls back to manual model entry. */
  error?: string;
}

const TIMEOUT_MS = 8000;

function authHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...providerHeaders(baseUrl) };
  // Anthropic's native /v1/models wants x-api-key + a version header.
  if (/api\.anthropic\.com/i.test(baseUrl)) {
    h["x-api-key"] = apiKey;
    h["anthropic-version"] = "2023-06-01";
  }
  return h;
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function describe(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403) return "The provider rejected this API key.";
  if (status === 404) return "This endpoint doesn't list models — type the model id instead.";
  if (status) return `Model list failed (HTTP ${status}) — type the model id instead.`;
  if ((e as Error)?.name === "TimeoutError") return "The provider took too long to list models — type the model id instead.";
  return "Couldn't reach that base URL — check it, or type the model id instead.";
}

export async function discoverModels(baseUrlRaw: string, apiKey: string): Promise<DiscoveryResult> {
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  const headers = authHeaders(baseUrl, apiKey);
  const [list, info] = await Promise.allSettled([
    getJson(`${baseUrl}/models`, headers),
    isProxyLike(baseUrl) ? getJson(`${litellmRoot(baseUrl)}/model_group/info`, headers) : Promise.reject(new Error("skip")),
  ]);

  const infoMap = info.status === "fulfilled" ? parseLiteLLMInfo(info.value) : null;
  const litellm = !!infoMap && infoMap.size > 0;
  const parsed = list.status === "fulfilled" ? parseModelList(list.value) : [];
  const models = mergeModels(parsed, infoMap);

  if (list.status === "rejected" && !models.length) {
    return { models: [], litellm, error: describe(list.reason) };
  }
  return { models, litellm };
}

// ── Shared gateway ────────────────────────────────────────────────────
// AI_ALLOWED_MODELS stays the allow-list. When the gateway is a LiteLLM
// proxy we enrich those ids with its model-group metadata (provider,
// context window, tool support). `AI_ALLOWED_MODELS=*` opts into exposing
// every model the gateway key can see (LiteLLM key `models` restrictions).

let globalCache: { at: number; value: DiscoveryResult } | null = null;
const GLOBAL_TTL_MS = 10 * 60_000;

export async function globalModelOptions(): Promise<DiscoveryResult> {
  const cfg = aiServerConfig();
  if (globalCache && Date.now() - globalCache.at < GLOBAL_TTL_MS) return globalCache.value;

  const fallback: DiscoveryResult = { models: cfg.allowedModels.map((id) => ({ id })), litellm: false };
  if (!cfg.baseURL || !cfg.apiKey) return fallback;

  let value = fallback;
  if (cfg.allowAllModels) {
    const found = await discoverModels(cfg.baseURL, cfg.apiKey);
    value = found.models.length ? found : { ...fallback, error: found.error };
  } else if (isProxyLike(cfg.baseURL)) {
    try {
      const info = parseLiteLLMInfo(await getJson(`${litellmRoot(cfg.baseURL)}/model_group/info`, authHeaders(cfg.baseURL, cfg.apiKey)));
      if (info.size) {
        // Keep allow-list order/membership; only enrich.
        const enriched = new Map(mergeModels(fallback.models, info).map((m) => [m.id, m]));
        value = { models: fallback.models.map((m) => enriched.get(m.id) ?? m), litellm: true };
      }
    } catch { /* not LiteLLM, or key can't read model info — plain list is fine */ }
  }
  globalCache = { at: Date.now(), value };
  return value;
}

/** Whether a model id may be used on the shared gateway. */
export async function isAllowedGlobalModel(modelId: string): Promise<boolean> {
  const cfg = aiServerConfig();
  if (!cfg.allowAllModels) return cfg.allowedModels.includes(modelId);
  const { models } = await globalModelOptions();
  return models.some((m) => m.id === modelId) || modelId === cfg.defaultModel;
}
