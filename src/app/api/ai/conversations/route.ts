import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: the user's previous chats (most recent first). Chats are created
// lazily by the first PUT to /conversations/[id], so opening the panel never
// creates (or loads) anything. Legacy empty "New chat" placeholders are hidden.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversations, error } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .neq("title", "New chat")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ conversations: conversations ?? [] });
}
