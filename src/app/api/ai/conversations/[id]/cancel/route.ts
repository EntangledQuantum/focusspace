import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/ai/resolve";
import { setRunState } from "@/lib/ai/chat-store";

/**
 * POST — the user pressed Stop. Replies keep generating server-side when the
 * connection drops, so an explicit stop has to be recorded: the chat route
 * watches run_state and aborts the model call when it flips to "cancelled".
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await setRunState(supabase, user.id, id, "cancelled");
  return NextResponse.json({ ok: true });
}
