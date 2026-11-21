// Server-side AI gateway configuration (reads env). The only client-visible
// flag is NEXT_PUBLIC_AI_ENABLED; everything else (keys, model list) stays here
// and is surfaced to the client through /api/ai/status, never as raw env.

export const AI_GLOBALLY_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "true";

export interface AiServerConfig {
  baseURL?: string;
  apiKey?: string;
  defaultModel: string;
  /** Explicit allow-list from AI_ALLOWED_MODELS (or just the default model). */
  allowedModels: string[];
  /** AI_ALLOWED_MODELS=* → expose every chat model the gateway key can list. */
  allowAllModels: boolean;
  freeMonthlyTokens: number;
  maxSteps: number;
}

export function aiServerConfig(): AiServerConfig {
  const defaultModel = process.env.AI_DEFAULT_MODEL || "gpt-4o-mini";
  const rawAllowed = (process.env.AI_ALLOWED_MODELS || "").trim();
  const allowAllModels = rawAllowed === "*";
  const allowed = (allowAllModels ? "" : rawAllowed || defaultModel)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    baseURL: process.env.AI_BASE_URL?.trim().replace(/\/+$/, "") || undefined,
    apiKey: process.env.AI_API_KEY,
    defaultModel,
    allowedModels: allowed.length ? allowed : [defaultModel],
    allowAllModels,
    freeMonthlyTokens: parseInt(process.env.AI_FREE_MONTHLY_TOKENS || "150000", 10),
    maxSteps: parseInt(process.env.AI_MAX_STEPS || "8", 10),
  };
}

/** Whether the shared/global gateway has usable credentials. */
export function globalGatewayConfigured(): boolean {
  const c = aiServerConfig();
  return !!(c.baseURL && c.apiKey);
}
