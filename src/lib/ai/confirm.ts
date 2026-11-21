import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

export const DESTRUCTIVE_ACTIONS = ["delete_project", "delete_task", "delete_subtask", "delete_tag"] as const;
export type DestructiveAction = (typeof DESTRUCTIVE_ACTIONS)[number];

/** Signals a destructive action that needs the user's confirmation in the UI. */
export interface ConfirmRequest {
  __confirm: true;
  action: DestructiveAction;
  id: string;
  summary: string;
}

/**
 * The single implementation of every destructive action — used directly by
 * the delete tools ("allow" mode) and later by /api/ai/confirm or the MCP
 * `confirm_action` tool ("confirm" mode). Ownership is checked first so a
 * guessed id can't touch another user's rows even on a non-RLS client.
 */
export async function performDelete(supabase: DB, action: DestructiveAction, id: string): Promise<string> {
  switch (action) {
    case "delete_project": {
      const { data: p } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
      if (!p) return "That project no longer exists.";
      await supabase.from("tasks").delete().eq("project_id", id);
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw new Error(`Couldn't delete project: ${error.message}`);
      return `Deleted project "${p.name}" and its tasks.`;
    }
    case "delete_task": {
      const { data: t } = await supabase.from("tasks").select("id, title").eq("id", id).maybeSingle();
      if (!t) return "That task no longer exists.";
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw new Error(`Couldn't delete task: ${error.message}`);
      return `Deleted task "${t.title}".`;
    }
    case "delete_subtask": {
      const { data: s } = await supabase.from("subtasks").select("id, title").eq("id", id).maybeSingle();
      if (!s) return "That subtask no longer exists.";
      const { error } = await supabase.from("subtasks").delete().eq("id", id);
      if (error) throw new Error(`Couldn't delete subtask: ${error.message}`);
      return `Deleted subtask "${s.title}".`;
    }
    case "delete_tag": {
      const { data: tg } = await supabase.from("tags").select("id, name").eq("id", id).maybeSingle();
      if (!tg) return "That tag no longer exists.";
      await supabase.from("task_tags").delete().eq("tag_id", id);
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw new Error(`Couldn't delete tag: ${error.message}`);
      return `Deleted tag #${tg.name}.`;
    }
  }
}

/** Back-compat name used by the confirm route. */
export const executeConfirmedAction = performDelete;
