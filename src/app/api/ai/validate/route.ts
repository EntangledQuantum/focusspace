import { NextResponse, type NextRequest } from "next/server";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { aiServerConfig } from "@/lib/ai/config";
import { isAllowedGlobalModel } from "@/lib/ai/discovery";
import { loadOwnCredentials, modelFromCreds } from "@/lib/ai/gateway";
import { friendlyAiError } from "@/lib/ai/errors";
import { checkBaseUrl } from "@/lib/ai/models";
import { isLocalMode } from "@/lib/mode";

// Tests a model/credentials combo with a tiny completion. Own-key: uses the
// typed key, or the stored one when the field is left blank. Without a base
// URL it validates the shared gateway — but only for allow-listed models.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { baseUrl, apiKey, model } = await req.json().catch(() => ({}));
  const cfg = aiServerConfig();

  let useBase: string | undefined;
  let useKey: string | undefined;
  let useModel: string = model || cfg.defaultModel;

  if (baseUrl || apiKey) {
    const stored = apiKey ? null : await loadOwnCredentials(supabase);
    const check = checkBaseUrl(baseUrl || stored?.baseUrl || "", { allowPrivate: isLocalMode() });
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error });
    useBase = check.url;
    useKey = apiKey || stored?.apiKey;
    useModel = model || stored?.model || "";
    if (!useModel) return NextResponse.json({ ok: false, error: "Pick or type a model first." });
  } else {
    useBase = cfg.baseURL;
    useKey = cfg.apiKey;
    if (!(await isAllowedGlobalModel(useModel))) {
      return NextResponse.json({ ok: false, error: `"${useModel}" isn't offered on the shared gateway.` });
    }
  }

  if (!useBase || !useKey) {
    return NextResponse.json({ ok: false, error: "Missing base URL or API key." });
  }

  try {
    const { text } = await generateText({
      model: modelFromCreds(useBase, useKey, useModel),
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 256, // headroom: reasoning models (e.g. gemini-2.5) spend tokens thinking
      maxRetries: 0,
    });
    return NextResponse.json({ ok: true, model: useModel, sample: text.trim().slice(0, 40) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: friendlyAiError(e, { modelId: useModel }) });
  }
}
