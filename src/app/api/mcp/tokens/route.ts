import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/mode";
import { newMcpToken, tokenAuthConfigured, TOKEN_AUTH_MISSING } from "@/lib/mcp/auth";

export async function GET() {
  if (isLocalMode()) {
    return NextResponse.json({ local: true, tokens: [], hint: "Local mode does not need MCP tokens." });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("mcp_tokens").select("id, name, prefix, last_used_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  return NextResponse.json({ tokens: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (isLocalMode()) {
    return NextResponse.json({ error: "Tokens are not used in local mode." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!tokenAuthConfigured()) {
    console.error("[mcp]", TOKEN_AUTH_MISSING);
    return NextResponse.json({ error: TOKEN_AUTH_MISSING }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "My agent").trim().slice(0, 60) || "My agent";
  const { token, hash, prefix } = newMcpToken();
  const { data: row, error } = await supabase.from("mcp_tokens")
    .insert({ user_id: user.id, name, token_hash: hash, prefix })
    .select("id, name, prefix, created_at, last_used_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    { token, ...row, warning: "Copy this token now. It will not be shown again." },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await supabase.from("mcp_tokens").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
