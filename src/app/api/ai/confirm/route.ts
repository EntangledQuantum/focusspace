import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DESTRUCTIVE_ACTIONS, performDelete, type DestructiveAction } from "@/lib/ai/confirm";
import { scopeToUser } from "@/lib/ai/scoped";
import { UUID_RE } from "@/lib/ai/resolve";

// Performs a destructive action the agent deferred (confirm mode) after the
// user pressed Confirm on the tool card. Scoped to the user's own rows.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, id } = await req.json();
  if (!(DESTRUCTIVE_ACTIONS as readonly string[]).includes(action) || typeof id !== "string" || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    const result = await performDelete(scopeToUser(supabase, user.id), action as DestructiveAction, id);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}
