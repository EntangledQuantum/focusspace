import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ConfirmRequest } from "./tools";

/**
 * Executes a destructive action that was deferred for confirmation
 * (when the user is in `ai_destructive: "confirm"` mode). Runs under the
 * per-request RLS-scoped client, so it can only touch the user's own rows.
 */
export async function executeConfirmedAction(
  supabase: SupabaseClient<Database>,
  action: ConfirmRequest["action"],
  id: string,
): Promise<string> {
  switch (action) {
    case "delete_project": {
      await supabase.from("tasks").delete().eq("project_id", id);
      const { error } = await supabase.from("projects").delete().eq("id", id);
      return error ? `Failed: ${error.message}` : "Project deleted.";
    }
    case "delete_task": {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      return error ? `Failed: ${error.message}` : "Task deleted.";
    }
    case "delete_subtask": {
      const { error } = await supabase.from("subtasks").delete().eq("id", id);
      return error ? `Failed: ${error.message}` : "Subtask deleted.";
    }
    case "delete_tag": {
      await supabase.from("task_tags").delete().eq("tag_id", id);
      const { error } = await supabase.from("tags").delete().eq("id", id);
      return error ? `Failed: ${error.message}` : "Tag deleted.";
    }
    default:
      return "Unknown action.";
  }
}
