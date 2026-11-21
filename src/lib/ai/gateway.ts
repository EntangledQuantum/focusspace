import { createHash } from "crypto";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { aiServerConfig } from "./config";
import { decryptSecret } from "./crypto";
import { isAllowedGlobalModel } from "./discovery";
import { isProxyLike } from "./models";

export interface ResolvedModel {
  model: LanguageModel;
  modelId: string;
  isOwnKey: boolean;
  /** Per-call provider options (e.g. LiteLLM end-user tracking). */
  providerOptions?: { openaiCompatible: { user: string } };
}

type SettingsLite = { ai_use_own_key?: boolean; ai_model?: string | null };

export interface OwnCredentials { baseUrl: string; apiKey: string; model: string | null }

/** Decrypt the user's stored own-key credentials (server only). */
export async function loadOwnCredentials(supabase: SupabaseClient<Database>): Promise<OwnCredentials | null> {
  const { data: cred } = await supabase
    .from("ai_credentials")
    .select("base_url, model, api_key_cipher")
    .maybeSingle();
  if (!cred?.api_key_cipher || !cred.base_url) return null;
  try {
    return { baseUrl: cred.base_url, apiKey: decryptSecret(cred.api_key_cipher), model: cred.model };
  } catch {
    return null; // AI_ENCRYPTION_KEY rotated — user must re-enter the key
  }
}

function provider(name: string, baseURL: string, apiKey: string) {
  return createOpenAICompatible({ name, baseURL, apiKey, includeUsage: true });
}

/**
 * Build the language model for a request. Prefers the user's own
 * (encrypted) key + base URL when they opted in; otherwise the global
 * env gateway (e.g. a LiteLLM proxy). Returns null if no usable gateway.
 */
export async function resolveModel(
  supabase: SupabaseClient<Database>,
  settings: SettingsLite,
  userId: string,
): Promise<ResolvedModel | null> {
  const cfg = aiServerConfig();

  if (settings.ai_use_own_key) {
    const cred = await loadOwnCredentials(supabase);
    if (cred) {
      const modelId = cred.model || settings.ai_model || cfg.defaultModel;
      return { model: provider("user-gateway", cred.baseUrl, cred.apiKey).chatModel(modelId), modelId, isOwnKey: true };
    }
  }

  if (!cfg.baseURL || !cfg.apiKey) return null;
  let modelId = settings.ai_model || cfg.defaultModel;
  if (!(await isAllowedGlobalModel(modelId))) modelId = cfg.defaultModel;
  return {
    model: provider("global-gateway", cfg.baseURL, cfg.apiKey).chatModel(modelId),
    modelId,
    isOwnKey: false,
    // LiteLLM attributes spend to the OpenAI `user` field (end-user tracking
    // / per-customer budgets). Hashed so the proxy never sees our user ids.
    // Only sent to proxies — some direct providers reject unknown params.
    providerOptions: isProxyLike(cfg.baseURL)
      ? { openaiCompatible: { user: createHash("sha256").update(userId).digest("hex").slice(0, 24) } }
      : undefined,
  };
}

/** Lightweight model build for the validate route (explicit creds, no DB). */
export function modelFromCreds(baseURL: string, apiKey: string, modelId: string): LanguageModel {
  return provider("validate", baseURL, apiKey).chatModel(modelId);
}
