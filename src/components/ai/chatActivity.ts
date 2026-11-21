import type { UIMessage } from "ai";

type Status = "submitted" | "streaming" | "ready" | "error";
type Part = { type: string; state?: string };

/**
 * What to show in the "working" row while a reply is in flight, or null when
 * something on screen is already visibly moving (text or reasoning streaming
 * in, a tool card spinning). Covers the silent gaps: waiting for the first
 * byte, and the pause between a tool result and the model's next step.
 */
export function pendingActivity(messages: UIMessage[], status: Status): string | null {
  if (status === "submitted") return "Thinking…";
  if (status !== "streaming") return null;
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return "Thinking…";
  const parts = (last.parts as Part[]).filter((p) => p.type !== "step-start");
  const tail = parts.at(-1);
  if (!tail) return "Thinking…";
  if ((tail.type === "text" || tail.type === "reasoning") && tail.state === "streaming") return null;
  const isTool = tail.type === "dynamic-tool" || tail.type.startsWith("tool-");
  if (isTool && (tail.state === "input-streaming" || tail.state === "input-available")) return null;
  return "Thinking…";
}

/** A dropped connection (offline, reset, proxy cut) — as opposed to a provider error with a message. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const err = e as { name?: string; message?: string } | null;
  if (!err || err.name === "AbortError") return false;
  return /failed to fetch|networkerror|network error|load failed|fetch failed|terminated|econnreset|network connection was lost|err_network|err_internet_disconnected|err_connection|socket hang up|stream.*(closed|aborted)/i
    .test(err.message ?? "");
}
