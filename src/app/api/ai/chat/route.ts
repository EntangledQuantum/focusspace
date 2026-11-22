import { NextResponse, after, type NextRequest } from "next/server";
import { streamText, convertToModelMessages, stepCountIs, smoothStream, createIdGenerator, createUIMessageStreamResponse, type UIMessage } from "ai";
import { aiAuth } from "@/lib/ai/request-auth";
import { aiServerConfig, AI_GLOBALLY_ENABLED } from "@/lib/ai/config";
import { resolveModel, sessionIdFor } from "@/lib/ai/gateway";
import { makeTaskTools } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { getUsage, recordUsage } from "@/lib/ai/usage";
import { friendlyAiError } from "@/lib/ai/errors";
import { UUID_RE } from "@/lib/ai/resolve";
import { deriveTitle, getRunState, saveConversation, setRunState } from "@/lib/ai/chat-store";

// Room for slow reasoning models + several tool steps. The run continues after
// the client disconnects (see consumeStream below), so this is the real cap.
export const maxDuration = 300;

const messageId = createIdGenerator({ prefix: "msg", size: 16 });
/** A provider that goes silent this long mid-stream is treated as hung. */
const CHUNK_TIMEOUT_MS = 90_000;

export async function POST(req: NextRequest) {
  if (!AI_GLOBALLY_ENABLED) return NextResponse.json({ error: "AI is disabled." }, { status: 403 });

  const { supabase, user } = await aiAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const messages = (body.messages ?? []) as UIMessage[];
  // Page context from the global launcher (cheap hints, never trusted for auth).
  const focusProjectId = typeof body.focusProjectId === "string" && UUID_RE.test(body.focusProjectId) ? body.focusProjectId : null;
  const page = typeof body.page === "string" ? body.page.slice(0, 40) : null;
  const chatId = typeof body.chatId === "string" && UUID_RE.test(body.chatId) ? body.chatId : null;

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

  const resolved = await resolveModel(supabase, settings, user.id, { sessionId: sessionIdFor(user.id, chatId) });
  if (!resolved) return NextResponse.json({ error: "AI gateway is not configured." }, { status: 503 });

  const destructive = settings.ai_destructive === "confirm" ? "confirm" : "allow";
  const tools = makeTaskTools(supabase, user.id, { destructive, surface: "chat" });

  // Persist the user's turn before generating, so the question is never lost
  // and a reconnecting client can see the run is in progress.
  const [system] = await Promise.all([
    buildSystemPrompt(supabase, user.id, { destructive, focusProjectId, page }),
    chatId
      ? saveConversation(supabase, user.id, chatId, messages, deriveTitle(messages)).then(() => setRunState(supabase, user.id, chatId, "running"))
      : Promise.resolve(),
  ]);

  // The run is NOT tied to the HTTP request: a dropped connection must not
  // kill the reply. Only an explicit Stop (POST …/cancel → run_state
  // "cancelled") aborts the model call.
  const abort = new AbortController();
  const cancelWatch = chatId
    ? setInterval(() => {
        void getRunState(supabase, user.id, chatId).then((s) => { if (s === "cancelled") abort.abort(); });
      }, 2500)
    : null;
  const stopWatch = () => { if (cancelWatch) clearInterval(cancelWatch); };
  let failure: string | null = null;

  const result = streamText({
    model: resolved.model,
    system,
    messages: await convertToModelMessages(messages),
    tools,
    providerOptions: resolved.providerOptions,
    stopWhen: stepCountIs(cfg.maxSteps),
    abortSignal: abort.signal,
    // Retries transient provider/LiteLLM failures (429, 5xx, network) with backoff.
    maxRetries: 2,
    timeout: { chunkMs: CHUNK_TIMEOUT_MS },
    // Providers often deliver text in bursts; re-emit it word by word.
    experimental_transform: smoothStream({ chunking: "word", delayInMs: 10 }),
    onError: ({ error }) => { console.error("[ai/chat]", error); },
    onFinish: async ({ totalUsage }) => {
      if (!resolved.isOwnKey) {
        try {
          await recordUsage(supabase, user.id, totalUsage?.inputTokens ?? 0, totalUsage?.outputTokens ?? 0);
        } catch { /* non-fatal */ }
      }
    },
  });

  const uiStream = result.toUIMessageStream({
    originalMessages: messages,
    generateMessageId: messageId,
    sendReasoning: true,
    // Default would mask every provider error as "An error occurred."
    onError: (e) => {
      failure = friendlyAiError(e, { modelId: resolved.modelId });
      return failure;
    },
    messageMetadata: ({ part }) => (part.type === "start" ? { model: resolved.modelId } : undefined),
    onFinish: async ({ messages: all, isAborted }) => {
      stopWatch();
      if (!chatId) return;
      // Stopped by the user: the client saves what it showed; don't overwrite.
      if (isAborted || abort.signal.aborted || (await getRunState(supabase, user.id, chatId)) === "cancelled") {
        await setRunState(supabase, user.id, chatId, "cancelled");
        return;
      }
      await saveConversation(supabase, user.id, chatId, all, deriveTitle(all));
      await setRunState(supabase, user.id, chatId, failure ? "error" : "done", failure);
    },
  });

  // Two copies of the UI stream: one for the browser, one drained here. If the
  // browser goes away its copy is cancelled, but draining ours keeps the model
  // running and the message assembly (→ onFinish → save) going to the end.
  // after() keeps the function alive until that's done.
  const [toClient, toServer] = uiStream.tee();
  after(drain(toServer).finally(stopWatch));
  return createUIMessageStreamResponse({ stream: toClient });
}

async function drain(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  try {
    while (!(await reader.read()).done) { /* discard */ }
  } catch { /* errors are reported to the client and recorded in onFinish */ }
}
