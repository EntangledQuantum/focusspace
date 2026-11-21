import type { SupabaseClient } from "@supabase/supabase-js";
import type { UIMessage } from "ai";
import type { Database } from "@/types/database";

/**
 * Server-side chat persistence. The chat route saves the conversation itself
 * (user turn up front, full reply in onFinish), so a reply survives the
 * browser disconnecting, the tab closing or the panel unmounting mid-answer.
 *
 * Run state (`run_state` on ai_conversations, migration 0014) tells a
 * reconnecting client whether the server is still working, finished, failed
 * or was cancelled. Every run-state write is best-effort: if the migration
 * isn't applied yet the update fails quietly and clients fall back to
 * "did an assistant reply appear?".
 */

type DB = SupabaseClient<Database>;
export type RunState = "running" | "done" | "error" | "cancelled";

export function deriveTitle(messages: Pick<UIMessage, "role" | "parts">[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser?.parts.find((p) => p.type === "text") as { text?: string } | undefined;
  return (text?.text ?? "Untitled chat").replace(/\s+/g, " ").trim().slice(0, 60) || "Untitled chat";
}

/** Create-or-replace a conversation's messages. Never overwrites another user's chat (RLS + PK). */
export async function saveConversation(
  supabase: DB,
  userId: string,
  id: string,
  messages: Pick<UIMessage, "role" | "parts">[],
  title?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleanTitle = title?.trim() ? title.trim().slice(0, 80) : null;

  const { data: convo } = await supabase.from("ai_conversations").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!convo) {
    const { error } = await supabase.from("ai_conversations").insert({ id, user_id: userId, title: cleanTitle ?? deriveTitle(messages) });
    if (error) return { ok: false, error: "Couldn't save chat" };
  }

  await supabase.from("ai_messages").delete().eq("conversation_id", id).eq("user_id", userId);
  const valid = messages.filter((m) => m && (m.role === "user" || m.role === "assistant" || m.role === "system"));
  // Rows of one insert share now(); stamp increasing times so reloads keep order.
  const base = Date.now() - valid.length;
  const rows = valid.map((m, i) => ({
    conversation_id: id,
    user_id: userId,
    role: m.role as string,
    parts: (m.parts ?? []) as never,
    created_at: new Date(base + i).toISOString(),
  }));
  if (rows.length) {
    const { error } = await supabase.from("ai_messages").insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  await supabase.from("ai_conversations")
    .update({ updated_at: new Date().toISOString(), ...(cleanTitle ? { title: cleanTitle } : {}) })
    .eq("id", id).eq("user_id", userId);
  return { ok: true };
}

export async function setRunState(supabase: DB, userId: string, id: string, state: RunState, error?: string | null) {
  try {
    await supabase.from("ai_conversations")
      .update({ run_state: state, run_error: error ?? null, run_updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", userId);
  } catch { /* migration 0014 not applied — degrade quietly */ }
}

export async function getRunState(supabase: DB, userId: string, id: string): Promise<RunState | null> {
  try {
    const { data } = await supabase.from("ai_conversations").select("run_state").eq("id", id).eq("user_id", userId).maybeSingle();
    return ((data as { run_state?: RunState | null } | null)?.run_state) ?? null;
  } catch {
    return null;
  }
}
