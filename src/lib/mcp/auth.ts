import { createHash } from "node:crypto";
import { isLocalMode } from "@/lib/mode";
import { LOCAL_USER_ID } from "@/lib/local/ids";
import { createClient } from "@/lib/supabase/server";
import { createClient as createJsClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newMcpToken(): { token: string; hash: string; prefix: string } {
  const raw = `fs_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return { token: raw, hash: hashToken(raw), prefix: raw.slice(0, 10) };
}

/** The token from an `Authorization: Bearer …` header (scheme is case-insensitive). */
export function bearerFrom(header: string | null | undefined): string | null {
  const m = header?.match(/^\s*bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}

export interface McpContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  destructive: "allow" | "confirm";
}

/**
 * Personal access token → user. Tokens are stored only as sha256 hashes; the
 * tools then run on the service-role client, scoped to that user by
 * scopeToUser() inside makeTaskTools (and explicit user_id filters in the
 * extension service).
 */
export async function lookupToken(admin: SupabaseClient<Database>, bearer: string): Promise<McpContext | null> {
  const { data: row } = await admin.from("mcp_tokens").select("user_id, id").eq("token_hash", hashToken(bearer)).maybeSingle();
  if (!row) return null;
  const [, { data: settings }] = await Promise.all([
    admin.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id),
    admin.from("user_settings").select("ai_destructive").eq("user_id", row.user_id).maybeSingle(),
  ]);
  return {
    supabase: admin,
    userId: row.user_id,
    destructive: settings?.ai_destructive === "confirm" ? "confirm" : "allow",
  };
}

export async function resolveMcpContext(authHeader: string | null): Promise<McpContext | null> {
  if (isLocalMode()) {
    const supabase = await createClient();
    return { supabase, userId: LOCAL_USER_ID, destructive: "allow" };
  }

  const bearer = bearerFrom(authHeader);
  if (!bearer) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[mcp] SUPABASE_SERVICE_ROLE_KEY is not set — personal access tokens cannot be verified.");
    return null;
  }
  return lookupToken(createJsClient<Database>(url, key, { auth: { persistSession: false } }), bearer);
}
