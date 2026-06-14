import { NextResponse, type NextRequest } from "next/server";
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { aiServerConfig, AI_GLOBALLY_ENABLED } from "@/lib/ai/config";
import { resolveModel } from "@/lib/ai/gateway";
import { makeTaskTools } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { getUsage, recordUsage } from "@/lib/ai/usage";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!AI_GLOBALLY_ENABLED) return NextResponse.json({ error: "AI is disabled." }, { status: 403 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const messages = (body.messages ?? []) as UIMessage[];
  const focusProjectId = (body.focusProjectId ?? null) as string | null;

  const { data: settings } = await supabase
    .from("user_settings")
    .select("ai_enabled, ai_use_own_key, ai_model, ai_destructive")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.ai_enabled) return NextResponse.json({ error: "Enable AI in Settings first." }, { status: 403 });

  const cfg = aiServerConfig();
  const isOwnKey = !!settings.ai_use_own_key;

  // Budget: global-key users are capped; own-key users are unmetered.
  if (!isOwnKey) {
    const { used } = await getUsage(supabase, user.id);
    if (used >= cfg.freeMonthlyTokens) {
      return NextResponse.json(
        { error: `Monthly free AI limit reached (${cfg.freeMonthlyTokens.toLocaleString()} tokens). Add your own API key in Settings to continue.` },
        { status: 402 },
      );
    }
  }

  const resolved = await resolveModel(supabase, settings);
  if (!resolved) return NextResponse.json({ error: "AI gateway is not configured." }, { status: 503 });

  const destructive = settings.ai_destructive === "confirm" ? "confirm" : "allow";
  const system = await buildSystemPrompt(supabase, user.id, { destructive, focusProjectId });
  const tools = makeTaskTools(supabase, user.id, { destructive });

  const result = streamText({
    model: resolved.model,
    system,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(cfg.maxSteps),
    onFinish: async ({ totalUsage }) => {
      if (!resolved.isOwnKey) {
        try {
          await recordUsage(supabase, user.id, totalUsage?.inputTokens ?? 0, totalUsage?.outputTokens ?? 0);
        } catch { /* non-fatal */ }
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
