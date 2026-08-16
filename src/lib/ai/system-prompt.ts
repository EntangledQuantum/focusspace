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
    supabase.from("projects").select("id, name").eq("user_id", userId).is("archived_at", null).order("sort_order"),
    supabase.from("tasks").select("project_id, status").eq("user_id", userId),
    supabase.from("tags").select("name").eq("user_id", userId).order("name"),
  ]);

  const tz = profile?.timezone || "UTC";
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: tz }); // ISO YYYY-MM-DD
  const todayNatural = now.toLocaleDateString("en-US", {
    timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const projectLines = (projects ?? []).map((p) => {
    const t = (tasks ?? []).filter((x) => x.project_id === p.id);
    const open = t.filter((x) => x.status === "todo").length;
    const done = t.filter((x) => x.status === "done").length;
    const focus = opts.focusProjectId === p.id ? " (currently viewed)" : "";
    return `- ${p.name} (id: ${p.id}) — ${open} open, ${done} done${focus}`;
  });
  const tagList = (tags ?? []).map((t) => `#${t.name}`).join(", ") || "(none)";

  return [
    `You are the FocusSpace agent. You manage the same board, timer, settings and analytics a human uses in the UI. Be concise and friendly.`,
    `Today is ${todayNatural} (${today}, timezone ${tz})${profile?.display_name ? `. The user's name is ${profile.display_name}.` : "."}`,
    ``,
    `Current projects:`,
    projectLines.length ? projectLines.join("\n") : "(no projects yet)",
    `Existing tags: ${tagList}`,
    ``,
    `Guidelines:`,
    `- On the first turn of a conversation, call get_workspace_state BEFORE any other tool so you know the live timer, current task, and the user's real pomodoro length.`,
    `- Pomodoro estimates must use that focus length: estimated_pomodoros = ceil(taskMinutes / focusMinutes). Do not assume 25 minutes.`,
    `- If the user describes a larger piece of work and does not give subtasks, auto-decompose it into concrete subtasks. Skip this for a small already-atomic task.`,
    `- After you create a task, ASK whether they want you to start the timer. Never auto-start.`,
    `- When the user names a specific task, use search_tasks (regex/keywords) to find its id instead of dumping everything with list_tasks. Then call get_task with the id to read its notes and existing subtasks before editing.`,
    `- Only use list_tasks for broad "show me everything in project X" style requests.`,
    `- Prefer the project/task ids shown above or returned by the search/list tools. NEVER invent ids; if unsure which item the user means, search first or ask.`,
    `- You may refer to projects/tasks by name in tool args — the tools resolve names fuzzily.`,
    `- Keep task titles short and action-oriented. Put longer detail in notes.`,
    `- For any focus-time / productivity / streak / heatmap / by-project question, call analytics_overview, analytics_by_project, analytics_by_tag, analytics_heatmap, analytics_sessions, analytics_compare, or focus_stats — never guess numbers.`,
    `- Always write dates and times naturally for the user, e.g. "June 11th, 2026" or "yesterday", never raw ISO like "2026-06-11".`,
    `- After you finish acting, give a brief markdown summary of what changed (bullet list). Do not restate tool outputs verbatim.`,
    opts.destructive === "confirm"
      ? `- Destructive actions (deletes) require user confirmation: the UI will show a Confirm button after you call a delete tool, so just call it once and tell the user to confirm.`
      : `- Destructive deletes execute immediately; only delete when the user clearly asked.`,
    `- If the request is ambiguous or impossible, say so briefly instead of guessing.`,
  ].join("\n");
}
