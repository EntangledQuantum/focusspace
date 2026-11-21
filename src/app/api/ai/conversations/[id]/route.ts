import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/ai/resolve";
import { saveConversation } from "@/lib/ai/chat-store";

type Ctx = { params: Promise<{ id: string }> };

async function authed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET: load a conversation's messages + run state (the chat route saves turns
// server-side; a reconnecting client polls this). PUT: create-or-replace it
// (used when the user stops a reply, to keep what they saw). DELETE: remove it.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: convo }, { data, error }] = await Promise.all([
    // "*" so this keeps working before migration 0014 adds the run_* columns.
    supabase.from("ai_conversations").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("ai_messages").select("id, role, parts, created_at").eq("conversation_id", id).eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const c = convo as { id: string; title: string; run_state?: string | null; run_error?: string | null; run_updated_at?: string | null };
  return NextResponse.json({
    conversation: { id: c.id, title: c.title, runState: c.run_state ?? null, runError: c.run_error ?? null, runUpdatedAt: c.run_updated_at ?? null },
    messages: data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const { messages, title } = await req.json();
  if (!Array.isArray(messages)) return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
  const saved = await saveConversation(supabase, user.id, id, messages, typeof title === "string" ? title : null);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("ai_conversations").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
