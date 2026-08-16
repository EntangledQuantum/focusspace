import { createHash } from "node:crypto";
import { isLocalMode } from "@/lib/mode";
import { LOCAL_USER_ID } from "@/lib/local/ids";
import { createClient } from "@/lib/supabase/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newMcpToken(): { token: string; hash: string; prefix: string } {
  const raw = `fs_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return { token: raw, hash: hashToken(raw), prefix: raw.slice(0, 10) };
}

export async function resolveMcpContext(authHeader: string | null) {
  if (isLocalMode()) {
    const supabase = await createClient();
    return { supabase, userId: LOCAL_USER_ID, destructive: "allow" as const };
  }

  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const admin = createJsClient<Database>(url, key);
  const { data: row } = await admin.from("mcp_tokens").select("user_id, id").eq("token_hash", hashToken(bearer)).maybeSingle();
  if (!row) return null;
  await admin.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);

  const { data: settings } = await admin.from("user_settings").select("ai_destructive").eq("user_id", row.user_id).maybeSingle();
  return {
    supabase: admin,
    userId: row.user_id,
    destructive: (settings?.ai_destructive === "confirm" ? "confirm" : "allow") as "allow" | "confirm",
  };
}
