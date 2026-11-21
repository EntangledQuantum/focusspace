import { NextResponse, type NextRequest } from "next/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/mode";
import { bearerFrom, forgetToken, hashToken, newMcpToken, tokenAuthConfigured, TOKEN_AUTH_MISSING } from "@/lib/mcp/auth";
import { json, preflight } from "@/lib/extension/http";
import type { Database } from "@/types/database";

/**
 * POST — called by /extension/connect with the user's site session (cookies).
 * Mints a personal access token named "Chrome extension" in the same table as
 * MCP tokens, so it is listed and revocable under Settings → Agents & MCP.
 * Same-origin only: no CORS headers, and cross-site callers are refused.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(req.url).origin) || (site && site !== "same-origin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isLocalMode()) {
    // Local self-host has one implicit user and no tokens; any bearer value is accepted.
    return NextResponse.json({ token: "local", local: true });
  }
  if (!tokenAuthConfigured()) {
    console.error("[extension]", TOKEN_AUTH_MISSING);
    return NextResponse.json({ error: TOKEN_AUTH_MISSING }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { token, hash, prefix } = newMcpToken();
  const { error } = await supabase.from("mcp_tokens").insert({ user_id: user.id, name: "Chrome extension", token_hash: hash, prefix });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token, prefix }, { headers: { "Cache-Control": "no-store" } });
}

/** DELETE — the extension's "Log out": revokes the bearer token it was called with. */
export async function DELETE(req: NextRequest) {
  if (isLocalMode()) return json(req, { ok: true });
  const bearer = bearerFrom(req.headers.get("authorization"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!bearer || !url || !key) return json(req, { ok: false }, 401);
  const admin = createJsClient<Database>(url, key);
  forgetToken(bearer);
  await admin.from("mcp_tokens").delete().eq("token_hash", hashToken(bearer));
  return json(req, { ok: true });
}

export const OPTIONS = preflight;
