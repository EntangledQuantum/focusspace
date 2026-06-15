import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

// GET: load a conversation's messages. PUT: replace its messages (called after
// each completed turn). DELETE: remove it.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("ai_messages")
    .select("id, role, parts, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ messages: data ?? [] });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, title } = await req.json();
  // Ownership is enforced by RLS; ensure the conversation belongs to the user.
  const { data: convo } = await supabase.from("ai_conversations").select("id").eq("id", id).maybeSingle();
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("ai_messages").delete().eq("conversation_id", id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (messages as any[]).map((m) => ({
    conversation_id: id,
    user_id: user.id,
    role: m.role,
    parts: m.parts ?? [],
  }));
  if (rows.length) await supabase.from("ai_messages").insert(rows);
  await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString(), ...(title ? { title } : {}) }).eq("id", id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("ai_conversations").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
