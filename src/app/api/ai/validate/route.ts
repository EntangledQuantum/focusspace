import { NextResponse, type NextRequest } from "next/server";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { aiServerConfig } from "@/lib/ai/config";
import { modelFromCreds } from "@/lib/ai/gateway";

// Tests a model/credentials combo with a tiny completion before the user saves.
// If baseUrl/apiKey are omitted, validates the global gateway with the given model.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { baseUrl, apiKey, model } = await req.json();
  const cfg = aiServerConfig();
  const useBase = baseUrl || cfg.baseURL;
  const useKey = apiKey || cfg.apiKey;
  const useModel = model || cfg.defaultModel;

  if (!useBase || !useKey) {
    return NextResponse.json({ ok: false, error: "Missing base URL or API key." }, { status: 200 });
  }

  try {
    const { text } = await generateText({
      model: modelFromCreds(useBase, useKey, useModel),
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 256, // headroom: reasoning models (e.g. gemini-2.5) spend tokens thinking
    });
    return NextResponse.json({ ok: true, model: useModel, sample: text.trim().slice(0, 40) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
