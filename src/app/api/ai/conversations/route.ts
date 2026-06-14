import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: list the user's conversations (most recent first), bootstrapping one if
// none exist. POST: create a fresh conversation ("New chat").
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let { data: conversations } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);

  if (!conversations?.length) {
    const { data: created } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id, title: "New chat" })
      .select("id, title, updated_at")
      .single();
    conversations = created ? [created] : [];
  }

  return NextResponse.json({ conversations: conversations ?? [] });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: user.id, title: "New chat" })
    .select("id, title, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ conversation: data });
}
