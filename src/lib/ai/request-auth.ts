import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { bearerFrom, resolveMcpContext } from "@/lib/mcp/auth";
import { isLocalMode } from "@/lib/mode";
import { scopeToUser } from "@/lib/ai/scoped";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Who is calling a Focus AI route: the website (cookie session, RLS client) or
 * the Chrome extension side panel (personal access token). Token callers get
 * the service-role client wrapped in scopeToUser, so every read/update/delete
 * is filtered to that user and every insert is stamped with their id — the
 * same guarantee RLS gives the website, including inside shared helpers
 * (saveConversation, makeTaskTools, buildSystemPrompt, usage).
 *
 * Opt-in per route: token-minting and credential routes stay cookie-only.
 */
export async function aiAuth(req?: NextRequest): Promise<{ supabase: ServerClient; user: { id: string } | null }> {
  const bearer = bearerFrom(req?.headers.get("authorization"));
  if (bearer && !isLocalMode()) {
    const ctx = await resolveMcpContext(`Bearer ${bearer}`, { withSettings: false });
    if (!ctx) return { supabase: null as unknown as ServerClient, user: null };
    const scoped = scopeToUser(ctx.supabase as SupabaseClient<Database>, ctx.userId);
    return { supabase: scoped as unknown as ServerClient, user: { id: ctx.userId } };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user: user ? { id: user.id } : null };
}
