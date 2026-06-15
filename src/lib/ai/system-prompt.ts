import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

/**
 * Build the agent's system prompt with a compact snapshot of the user's
 * current projects/tags so it can act without always querying first, plus
 * behavioural guardrails.
 */
export async function buildSystemPrompt(
  supabase: DB,
  userId: string,
  opts: { destructive: "allow" | "confirm"; focusProjectId?: string | null },
): Promise<string> {
  const [{ data: profile }, { data: projects }, { data: tasks }, { data: tags }] = await Promise.all([
    supabase.from("profiles").select("display_name, timezone").eq("id", userId).maybeSingle(),
    supabase.from("projects").select("id, name").is("archived_at", null).order("sort_order"),
    supabase.from("tasks").select("project_id, status"),
    supabase.from("tags").select("name").order("name"),
  ]);

  const tz = profile?.timezone || "UTC";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  const projectLines = (projects ?? []).map((p) => {
    const t = (tasks ?? []).filter((x) => x.project_id === p.id);
    const open = t.filter((x) => x.status === "todo").length;
    const done = t.filter((x) => x.status === "done").length;
    const focus = opts.focusProjectId === p.id ? " (currently viewed)" : "";
    return `- ${p.name} (id: ${p.id}) — ${open} open, ${done} done${focus}`;
  });
  const tagList = (tags ?? []).map((t) => `#${t.name}`).join(", ") || "(none)";

  return [
    `You are the task assistant inside FocusSpace, a focus/pomodoro app. You help the user manage projects, tasks, subtasks and tags by calling tools. Be concise and friendly.`,
    `Today is ${today} (timezone ${tz})${profile?.display_name ? `. The user's name is ${profile.display_name}.` : "."}`,
    ``,
    `Current projects:`,
    projectLines.length ? projectLines.join("\n") : "(no projects yet)",
    `Existing tags: ${tagList}`,
    ``,
    `Guidelines:`,
    `- Prefer the project/task ids shown above or returned by the list_* / find tools. NEVER invent ids; if unsure which item the user means, call a list tool first or ask.`,
    `- You may refer to projects/tasks by name in tool args — the tools resolve names fuzzily.`,
    `- Keep task titles short and action-oriented. Put longer detail in notes.`,
    `- After you finish acting, give a brief markdown summary of what changed (bullet list). Do not restate tool outputs verbatim.`,
    opts.destructive === "confirm"
      ? `- Destructive actions (deletes) require user confirmation: the UI will show a Confirm button after you call a delete tool, so just call it once and tell the user to confirm.`
      : `- Destructive deletes execute immediately; only delete when the user clearly asked.`,
    `- If the request is ambiguous or impossible, say so briefly instead of guessing.`,
  ].join("\n");
}
