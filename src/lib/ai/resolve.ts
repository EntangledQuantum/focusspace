import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown by tools for user-facing failures; surfaces as a tool error the model can recover from. */
export class ToolError extends Error {}

export type MatchResult<T> = { match: T } | { ambiguous: T[] } | { none: true };

/**
 * Choose the row a free-text reference means. An exact (case-insensitive)
 * name wins; otherwise a single substring match; several substring matches
 * are ambiguous rather than silently picking one (which used to make
 * update/delete hit the wrong task). `prefer` breaks ties between exact
 * duplicates (e.g. open tasks over done ones).
 */
export function pickMatch<T>(
  rows: T[],
  ref: string,
  name: (r: T) => string,
  prefer?: (r: T) => boolean,
): MatchResult<T> {
  const needle = ref.trim().replace(/^#/, "").toLowerCase();
  if (!rows.length || !needle) return { none: true };
  const exact = rows.filter((r) => name(r).trim().toLowerCase() === needle);
  if (exact.length === 1) return { match: exact[0] };
  if (exact.length > 1) {
    const preferred = prefer ? exact.filter(prefer) : [];
    return preferred.length === 1 ? { match: preferred[0] } : { ambiguous: exact };
  }
  const partial = rows.filter((r) => name(r).toLowerCase().includes(needle));
  if (partial.length === 1) return { match: partial[0] };
  if (partial.length > 1) {
    const preferred = prefer ? partial.filter(prefer) : [];
    return preferred.length === 1 ? { match: preferred[0] } : { ambiguous: partial };
  }
  return { none: true };
}

function unwrap<T>(kind: string, ref: string, picked: MatchResult<T>, label: (r: T) => string): T {
  if ("match" in picked) return picked.match;
  if ("ambiguous" in picked) {
    const list = picked.ambiguous.slice(0, 6).map((r) => `- ${label(r)}`).join("\n");
    throw new ToolError(`"${ref}" matches several ${kind}s — ask the user which one, or retry with the id:\n${list}`);
  }
  throw new ToolError(`No ${kind} matching "${ref}". Use search_tasks / list_projects to find it.`);
}

// ILIKE candidates are re-checked by pickMatch, so `%`/`_` in user text only
// widen the candidate set; they never cause a wrong match.
export function makeResolvers(supabase: DB) {
  async function project(ref: string): Promise<Row<"projects">> {
    if (UUID_RE.test(ref)) {
      const { data } = await supabase.from("projects").select("*").eq("id", ref).maybeSingle();
      if (data) return data;
    }
    const { data } = await supabase.from("projects").select("*").is("archived_at", null)
      .ilike("name", `%${ref.trim()}%`).limit(25);
    return unwrap("project", ref, pickMatch(data ?? [], ref, (p) => p.name), (p) => `${p.name} (id: ${p.id})`);
  }

  async function task(ref: string, projectId?: string): Promise<Row<"tasks">> {
    if (UUID_RE.test(ref)) {
      const { data } = await supabase.from("tasks").select("*").eq("id", ref).maybeSingle();
      if (data) return data;
    }
    let q = supabase.from("tasks").select("*").ilike("title", `%${ref.trim()}%`);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q.order("created_at", { ascending: false }).limit(25);
    return unwrap("task", ref, pickMatch(data ?? [], ref, (t) => t.title, (t) => t.status === "todo"),
      (t) => `${t.title} (id: ${t.id}) [${t.status}]`);
  }

  async function subtask(taskId: string, ref: string): Promise<Row<"subtasks">> {
    if (UUID_RE.test(ref)) {
      const { data } = await supabase.from("subtasks").select("*").eq("id", ref).eq("task_id", taskId).maybeSingle();
      if (data) return data;
    }
    const { data } = await supabase.from("subtasks").select("*").eq("task_id", taskId).order("sort_order");
    return unwrap("subtask", ref, pickMatch(data ?? [], ref, (s) => s.title, (s) => !s.done),
      (s) => `${s.title} (id: ${s.id})`);
  }

  async function tag(ref: string): Promise<Row<"tags">> {
    const clean = ref.replace(/^#/, "").trim();
    const { data } = await supabase.from("tags").select("*").ilike("name", `%${clean}%`).limit(25);
    return unwrap("tag", ref, pickMatch(data ?? [], clean, (t) => t.name), (t) => `#${t.name}`);
  }

  return { project, task, subtask, tag };
}
