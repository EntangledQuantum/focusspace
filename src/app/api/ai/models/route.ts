import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiServerConfig } from "@/lib/ai/config";
import { discoverModels, globalModelOptions, isAllowedGlobalModel } from "@/lib/ai/discovery";
import { loadOwnCredentials } from "@/lib/ai/gateway";
import { checkBaseUrl } from "@/lib/ai/models";
import { isLocalMode } from "@/lib/mode";

export const maxDuration = 30;

async function authed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * GET — models for the user's *current* mode plus the selected one.
 *   own key  → live discovery from {base}/models (+ LiteLLM /model_group/info)
 *   shared   → the AI_ALLOWED_MODELS allow-list (enriched when it's LiteLLM)
 */
export async function GET() {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = aiServerConfig();
  const { data: settings } = await supabase
    .from("user_settings").select("ai_use_own_key, ai_model").eq("user_id", user.id).maybeSingle();

  if (settings?.ai_use_own_key) {
    const cred = await loadOwnCredentials(supabase);
    if (!cred) return NextResponse.json({ source: "own", models: [], litellm: false, selected: null, error: "Save your API key in Settings → AI first." });
    const found = await discoverModels(cred.baseUrl, cred.apiKey);
    return NextResponse.json({ source: "own", ...found, selected: cred.model });
  }

  const found = await globalModelOptions();
  const selected = settings?.ai_model && (await isAllowedGlobalModel(settings.ai_model)) ? settings.ai_model : cfg.defaultModel;
  return NextResponse.json({ source: "global", ...found, selected });
}

/**
 * POST { baseUrl, apiKey? } — discover models for credentials typed into the
 * settings form (before saving). Without apiKey, the stored key is used.
 */
export async function POST(req: NextRequest) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const stored = body.apiKey ? null : await loadOwnCredentials(supabase);
  const apiKey: string | undefined = body.apiKey || stored?.apiKey;
  const check = checkBaseUrl(body.baseUrl || stored?.baseUrl || "", { allowPrivate: isLocalMode() });
  if (!check.ok) return NextResponse.json({ models: [], litellm: false, error: check.error });
  if (!apiKey) return NextResponse.json({ models: [], litellm: false, error: "Enter an API key to load models." });

  return NextResponse.json(await discoverModels(check.url, apiKey));
}

/** PUT { model } — persist the chosen model for the current mode. */
export async function PUT(req: NextRequest) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { model } = await req.json().catch(() => ({}));
  if (typeof model !== "string" || !model.trim() || model.length > 200) {
    return NextResponse.json({ error: "Pick a model." }, { status: 400 });
  }
  const id = model.trim();

  const { data: settings } = await supabase
    .from("user_settings").select("ai_use_own_key").eq("user_id", user.id).maybeSingle();

  if (settings?.ai_use_own_key) {
    // Own key: any id the provider accepts is fine — it's their account.
    const { error } = await supabase.from("ai_credentials").update({ model: id }).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    if (!(await isAllowedGlobalModel(id))) {
      return NextResponse.json({ error: `"${id}" isn't offered on the shared gateway.` }, { status: 400 });
    }
    const { error } = await supabase.from("user_settings").update({ ai_model: id }).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, model: id });
}
