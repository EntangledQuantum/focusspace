import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeConfirmedAction } from "@/lib/ai/confirm";
import type { ConfirmRequest } from "@/lib/ai/tools";

const ACTIONS = new Set(["delete_project", "delete_task", "delete_subtask", "delete_tag"]);

// Performs a destructive action the agent deferred (confirm mode). RLS scopes
// the delete to the user's own rows.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, id } = await req.json();
  if (!ACTIONS.has(action) || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const result = await executeConfirmedAction(supabase, action as ConfirmRequest["action"], id);
  return NextResponse.json({ ok: true, result });
}
