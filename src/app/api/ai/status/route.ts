import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiServerConfig, AI_GLOBALLY_ENABLED, globalGatewayConfigured } from "@/lib/ai/config";
import { getUsage } from "@/lib/ai/usage";

// Single source of truth for the client: feature flags, the model allow-list,
// the user's own-key status, and their monthly usage. Never returns secrets.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = aiServerConfig();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("ai_enabled, ai_model, ai_use_own_key, ai_has_own_key, ai_destructive")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: cred } = await supabase
    .from("ai_credentials")
    .select("base_url, model")
    .maybeSingle();

  const usage = await getUsage(supabase, user.id);

  return NextResponse.json({
    globallyEnabled: AI_GLOBALLY_ENABLED,
    gatewayConfigured: globalGatewayConfigured(),
    models: cfg.allowedModels,
    defaultModel: cfg.defaultModel,
    freeMonthlyTokens: cfg.freeMonthlyTokens,
    enabled: settings?.ai_enabled ?? false,
    model: settings?.ai_model ?? cfg.defaultModel,
    useOwnKey: settings?.ai_use_own_key ?? false,
    hasOwnKey: settings?.ai_has_own_key ?? false,
    destructive: settings?.ai_destructive ?? "allow",
    ownKey: cred ? { baseUrl: cred.base_url, model: cred.model } : null,
    usage,
  });
}
