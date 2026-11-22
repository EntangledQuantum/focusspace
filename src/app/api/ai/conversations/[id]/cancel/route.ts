import { NextResponse, type NextRequest } from "next/server";
import { aiAuth } from "@/lib/ai/request-auth";
import { UUID_RE } from "@/lib/ai/resolve";
import { setRunState } from "@/lib/ai/chat-store";

/**
 * POST — the user pressed Stop. Replies keep generating server-side when the
 * connection drops, so an explicit stop has to be recorded: the chat route
 * watches run_state and aborts the model call when it flips to "cancelled".
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await aiAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await setRunState(supabase, user.id, id, "cancelled");
  return NextResponse.json({ ok: true });
}
