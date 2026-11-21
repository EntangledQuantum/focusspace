import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/ai/resolve";

type Ctx = { params: Promise<{ id: string }> };

async function authed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET: load a conversation's messages. PUT: create-or-replace it (called after
// each completed turn; the client mints the id for a new chat). DELETE: remove it.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: convo }, { data, error }] = await Promise.all([
    supabase.from("ai_conversations").select("id, title").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("ai_messages").select("id, role, parts, created_at").eq("conversation_id", id).eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: convo, messages: data ?? [] });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const { messages, title } = await req.json();
  if (!Array.isArray(messages)) return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
  const cleanTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : null;

  const { data: convo } = await supabase.from("ai_conversations").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!convo) {
    // First save of a new chat. If the id belongs to someone else, RLS hides
    // the row and this insert fails on the primary key — never overwrites.
    const { error } = await supabase.from("ai_conversations").insert({ id, user_id: user.id, title: cleanTitle ?? "Untitled chat" });
    if (error) return NextResponse.json({ error: "Couldn't save chat" }, { status: 400 });
  }

  await supabase.from("ai_messages").delete().eq("conversation_id", id).eq("user_id", user.id);
  // Rows of one insert share now(); stamp increasing times so reloads keep order.
  const valid = (messages as { role?: string; parts?: unknown }[])
    .filter((m) => m && (m.role === "user" || m.role === "assistant" || m.role === "system"));
  const base = Date.now() - valid.length;
  const rows = valid.map((m, i) => ({
    conversation_id: id,
    user_id: user.id,
    role: m.role as string,
    parts: (m.parts ?? []) as never,
    created_at: new Date(base + i).toISOString(),
  }));
  if (rows.length) {
    const { error } = await supabase.from("ai_messages").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await supabase.from("ai_conversations")
    .update({ updated_at: new Date().toISOString(), ...(cleanTitle ? { title: cleanTitle } : {}) })
    .eq("id", id);

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
