import { createHash } from "node:crypto";
import { after } from "next/server";
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

/**
 * Hosted tokens are verified with the service-role client. Without
 * SUPABASE_SERVICE_ROLE_KEY every token is rejected, so refuse to mint
 * tokens that could never work and say why.
 */
export const TOKEN_AUTH_MISSING =
  "This server can't verify agent/extension tokens yet: SUPABASE_SERVICE_ROLE_KEY is not set. Add it in the hosting env (Vercel → Settings → Environment Variables) and redeploy.";

export function tokenAuthConfigured(): boolean {
  return isLocalMode() || (!!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export interface McpContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  destructive: "allow" | "confirm";
}

/** Positive token lookups, cached briefly so warm instances skip the DB on every request. */
const TOKEN_CACHE_TTL_MS = 30_000;
const LAST_USED_THROTTLE_MS = 5 * 60_000;
const tokenCache = new Map<string, { userId: string; destructive: "allow" | "confirm"; withSettings: boolean; exp: number }>();

/** Drop a token from this instance's cache (logout / revoke). Other instances expire it within TOKEN_CACHE_TTL_MS. */
export function forgetToken(bearer: string) {
  tokenCache.delete(hashToken(bearer));
}

/** Run a side effect after the response is sent; falls back to fire-and-forget outside a request. */
function background(fn: () => PromiseLike<unknown>) {
  const run = () => Promise.resolve(fn()).catch(() => { /* best-effort bookkeeping */ });
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Personal access token → user. Tokens are stored only as sha256 hashes; the
 * tools then run on the service-role client, scoped to that user by
 * scopeToUser() inside makeTaskTools (and explicit user_id filters in the
 * extension service).
 *
 * One round trip: `last_used_at` is bookkeeping, so it is written after the
 * response and at most every 5 minutes; MCP's destructive-action setting is
 * only read when asked for (the Chrome extension never needs it).
 */
export async function lookupToken(
  admin: SupabaseClient<Database>,
  bearer: string,
  opts: { withSettings?: boolean } = {},
): Promise<McpContext | null> {
  const withSettings = opts.withSettings ?? true;
  const { data: row } = await admin.from("mcp_tokens").select("user_id, id, last_used_at").eq("token_hash", hashToken(bearer)).maybeSingle();
  if (!row) return null;
  const lastUsed = row.last_used_at ? Date.parse(row.last_used_at) : 0;
  if (!(Date.now() - lastUsed < LAST_USED_THROTTLE_MS)) {
    background(() => admin.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id));
  }
  let destructive: "allow" | "confirm" = "allow";
  if (withSettings) {
    const { data: settings } = await admin.from("user_settings").select("ai_destructive").eq("user_id", row.user_id).maybeSingle();
    destructive = settings?.ai_destructive === "confirm" ? "confirm" : "allow";
  }
  return { supabase: admin, userId: row.user_id, destructive };
}

let adminClient: SupabaseClient<Database> | null = null;

export async function resolveMcpContext(
  authHeader: string | null,
  opts: { withSettings?: boolean } = {},
): Promise<McpContext | null> {
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
  // One service-role client per instance: reuses its HTTP keep-alive connections to Supabase.
  adminClient ??= createJsClient<Database>(url, key, { auth: { persistSession: false } });
  const withSettings = opts.withSettings ?? true;
  const hash = hashToken(bearer);
  const hit = tokenCache.get(hash);
  if (hit && hit.exp > Date.now() && (hit.withSettings || !withSettings)) {
    return { supabase: adminClient, userId: hit.userId, destructive: hit.destructive };
  }
  const ctx = await lookupToken(adminClient, bearer, { withSettings });
  if (ctx) {
    if (tokenCache.size > 500) tokenCache.clear();
    tokenCache.set(hash, { userId: ctx.userId, destructive: ctx.destructive, withSettings, exp: Date.now() + TOKEN_CACHE_TTL_MS });
  }
  return ctx;
}
