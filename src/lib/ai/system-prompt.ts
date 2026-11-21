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
  opts: { destructive: "allow" | "confirm"; focusProjectId?: string | null; page?: string | null },
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
    const focus = opts.focusProjectId === p.id ? " (the user is looking at this one)" : "";
    return `- ${p.name} (id: ${p.id}) — ${open} open, ${done} done${focus}`;
  });
  const tagList = (tags ?? []).map((t) => `#${t.name}`).join(", ") || "(none)";

  return [
    `You are the FocusSpace agent. You manage the same board, timer, music, settings and analytics a human uses in the UI. Be concise and friendly.`,
    `Today is ${todayNatural} (${today}, timezone ${tz})${profile?.display_name ? `. The user's name is ${profile.display_name}.` : "."}`,
    pageLine(opts.page),
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
    `- You may refer to projects/tasks by name in tool args. If a tool reports that a name is ambiguous, ask the user which one (or use the listed id) — never guess.`,
    `- If a tool returns an error, explain it briefly and fix the call or ask; don't repeat the identical call.`,
    `- Timer: start_timer / pause_timer / resume_timer / skip_timer / reset_timer (= stop) / set_active_task. "Stop" means reset_timer.`,
    `- Keep task titles short and action-oriented. Put longer detail in notes.`,
    `- For any focus-time / productivity / streak / heatmap / by-project question, call analytics_overview, analytics_by_project, analytics_by_tag, analytics_heatmap, analytics_sessions, analytics_compare, or focus_stats — never guess numbers.`,
    `- Music is the user's Spotify (same dock as the UI). Call now_playing / search_music / play_music / pause_music / resume_music / next_track / previous_track / set_volume / set_shuffle. If Spotify is not connected, tell them to connect it in Settings → Music — do not invent a track.`,
    `- Always write dates and times naturally for the user, e.g. "June 11th, 2026" or "yesterday", never raw ISO like "2026-06-11".`,
    `- After you finish acting, give a brief markdown summary of what changed (bullet list). Do not restate tool outputs verbatim.`,
    opts.destructive === "confirm"
      ? `- Destructive actions (deletes) require user confirmation: the UI shows a Confirm button after you call a delete tool. Call it once, then tell the user to press Confirm. Nothing is deleted until they do.`
      : `- Destructive deletes execute immediately; only delete when the user clearly asked.`,
    `- If the request is ambiguous or impossible, say so briefly instead of guessing.`,
  ].join("\n");
}

const PAGES: Record<string, string> = {
  "/focus": "the Focus tab (timer + current task)",
  "/projects": "the Projects tab (task board)",
  "/analytics": "the Analytics tab",
  "/settings": "Settings",
};

function pageLine(page?: string | null): string {
  const where = page ? PAGES[page] : null;
  return where ? `The user currently has ${where} open.` : "";
}
