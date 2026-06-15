import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { aiServerConfig } from "./config";
import { decryptSecret } from "./crypto";

export interface ResolvedModel {
  model: LanguageModel;
  modelId: string;
  isOwnKey: boolean;
}

type SettingsLite = { ai_use_own_key?: boolean; ai_model?: string | null };

/**
 * Build the language model for a request. Prefers the user's own
 * (encrypted) key + base URL when they opted in; otherwise the global
 * env gateway (e.g. a LiteLLM proxy). Returns null if no usable gateway.
 */
export async function resolveModel(
  supabase: SupabaseClient<Database>,
  settings: SettingsLite,
): Promise<ResolvedModel | null> {
  const cfg = aiServerConfig();

  if (settings.ai_use_own_key) {
    const { data: cred } = await supabase
      .from("ai_credentials")
      .select("base_url, model, api_key_cipher")
      .maybeSingle();
    if (cred?.api_key_cipher && cred.base_url) {
      const provider = createOpenAICompatible({
        name: "user-gateway",
        baseURL: cred.base_url,
        apiKey: decryptSecret(cred.api_key_cipher),
        includeUsage: true,
      });
      const modelId = cred.model || settings.ai_model || cfg.defaultModel;
      return { model: provider.chatModel(modelId), modelId, isOwnKey: true };
    }
  }

  if (!cfg.baseURL || !cfg.apiKey) return null;
  const provider = createOpenAICompatible({ name: "global-gateway", baseURL: cfg.baseURL, apiKey: cfg.apiKey, includeUsage: true });
  let modelId = settings.ai_model || cfg.defaultModel;
  if (cfg.allowedModels.length && !cfg.allowedModels.includes(modelId)) modelId = cfg.defaultModel;
  return { model: provider.chatModel(modelId), modelId, isOwnKey: false };
}

/** Lightweight model build for the validate route (explicit creds, no DB). */
export function modelFromCreds(baseURL: string, apiKey: string, modelId: string): LanguageModel {
  const provider = createOpenAICompatible({ name: "validate", baseURL, apiKey, includeUsage: true });
  return provider.chatModel(modelId);
}
