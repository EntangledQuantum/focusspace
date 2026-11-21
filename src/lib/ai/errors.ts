// Turn provider / gateway errors (OpenAI, LiteLLM, Gemini, OpenRouter…) into
// one actionable sentence for the chat UI. The AI SDK otherwise masks stream
// errors as "An error occurred."

interface ErrLike {
  message?: string;
  statusCode?: number;
  status?: number;
  responseBody?: string;
  lastError?: unknown;
  cause?: unknown;
}

function flatten(e: unknown): { status?: number; text: string } {
  const parts: string[] = [];
  let status: number | undefined;
  let cur: unknown = e;
  for (let depth = 0; cur && depth < 4; depth++) {
    if (typeof cur === "string") { parts.push(cur); break; }
    const o = cur as ErrLike;
    status ??= o.statusCode ?? o.status;
    if (o.message) parts.push(o.message);
    if (o.responseBody) parts.push(o.responseBody);
    cur = o.lastError ?? o.cause;
  }
  return { status, text: parts.join(" ") };
}

export function friendlyAiError(e: unknown, ctx: { modelId?: string } = {}): string {
  const { status, text } = flatten(e);
  const t = text.toLowerCase();
  const model = ctx.modelId ? `"${ctx.modelId}"` : "This model";

  if (/budget|exceededbudget|insufficient_quota|quota|billing|credit/.test(t)) {
    return "The AI provider says this key's budget or quota is used up. Top it up or switch keys in Settings → AI.";
  }
  if (/(tool|function)[ _-]?(use|call|calling)?/.test(t) && /(not support|unsupported|no endpoints)/.test(t)) {
    return `${model} doesn't support tool calling, which Focus AI needs. Pick another model from the model menu.`;
  }
  if (status === 401 || status === 403 || /invalid api key|incorrect api key|authentication|unauthori[sz]ed|api key not valid|permission denied/.test(t)) {
    return "The AI provider rejected the API key. Check it in Settings → AI.";
  }
  if (/context[_ ]length|maximum context|too many tokens|context window|prompt is too long/.test(t)) {
    return "This chat is too long for the model. Start a new chat.";
  }
  if (status === 404 || /model.{0,40}(not found|does not exist|not available|invalid)|no such model|unknown model|invalid model/.test(t)) {
    return `${model} isn't available on this provider. Pick another model from the model menu.`;
  }
  if (status === 429 || /rate.?limit|too many requests/.test(t)) {
    return "Rate limited by the AI provider — wait a few seconds and try again.";
  }
  if ((status && status >= 500) || /fetch failed|econnrefused|enotfound|timed? ?out|network|socket/.test(t)) {
    return `Couldn't reach the AI provider${status ? ` (${status})` : ""}. Try again in a moment.`;
  }
  const first = text.split("\n")[0].trim();
  return first ? first.slice(0, 200) : "AI request failed.";
}
