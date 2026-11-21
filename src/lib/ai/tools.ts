import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { makeExtraTools } from "./extra-tools";
import { MAX_ESTIMATED_POMOS } from "@/lib/mode";
import { performDelete, type ConfirmRequest, type DestructiveAction } from "./confirm";
import { makeResolvers, ToolError } from "./resolve";
import { scopeToUser } from "./scoped";

export type { ConfirmRequest } from "./confirm";

type DB = SupabaseClient<Database>;
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
type SubtaskUpdate = Database["public"]["Tables"]["subtasks"]["Update"];

const TAG_COLORS = ["#ff5fa2", "#b06bf6", "#5fb0ff", "#46c98b", "#f2a341", "#ff8fbe", "#8fb6ff", "#c89bff"];
const randTagColor = () => TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
const HEX = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a 6-digit hex color like #ff5fa2");
const PRIORITY = z.enum(["low", "med", "high", "urgent"]);
const ESTIMATE = z.number().min(0.5).max(MAX_ESTIMATED_POMOS);

export interface MakeToolsOpts {
  /** "allow" runs deletes immediately; "confirm" defers them to a UI card. */
  destructive: "allow" | "confirm";
  /**
   * "chat" = in-app assistant: confirmations happen via the UI card, so the
   * model must NOT be able to self-confirm. "mcp" = external agents, which
   * confirm through the `confirm_action` tool after asking their user.
   */
  surface?: "chat" | "mcp";
}

/**
 * The single tool catalog shared by the in-app assistant (/api/ai/chat) and
 * the MCP server (/api/mcp, scripts/mcp-stdio.ts). Tools throw ToolError for
 * user-facing failures → the AI SDK reports a tool error the model can react
 * to, and MCP returns `isError: true`.
 */
export function makeTaskTools(db: DB, userId: string, opts: MakeToolsOpts): ToolSet {
  const supabase = scopeToUser(db, userId);
  const resolve = makeResolvers(supabase);

  async function resolveTagIds(names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const raw of names) {
      const name = raw.replace(/^#/, "").trim().toLowerCase();
      if (!name) continue;
      const { data: existing } = await supabase.from("tags").select("id").ilike("name", name).limit(1);
      if (existing?.[0]) { ids.push(existing[0].id); continue; }
      const { data: created } = await supabase
        .from("tags").insert({ user_id: userId, name, color: randTagColor() }).select("id").single();
      if (created) ids.push(created.id);
    }
    return ids;
  }

  const destroy = async (action: DestructiveAction, id: string, summary: string): Promise<string | ConfirmRequest> =>
    opts.destructive === "confirm" ? { __confirm: true, action, id, summary } : performDelete(supabase, action, id);

  const must = (error: { message: string } | null, what: string) => {
    if (error) throw new ToolError(`Couldn't ${what}: ${error.message}`);
  };

  async function projectCounts(): Promise<Map<string, { open: number; done: number }>> {
    const { data: tasks } = await supabase.from("tasks").select("project_id, status");
    const m = new Map<string, { open: number; done: number }>();
    for (const t of tasks ?? []) {
      if (!t.project_id) continue;
      const c = m.get(t.project_id) ?? { open: 0, done: 0 };
      if (t.status === "done") c.done++; else c.open++;
      m.set(t.project_id, c);
    }
    return m;
  }

  const tools: ToolSet = {
    // ─── READ / CONTEXT ────────────────────────────────────────────────
    list_projects: tool({
      description: "List the user's projects with open/done task counts. Use to find the right project id before mutating.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: projects } = await supabase.from("projects").select("id, name, color").is("archived_at", null).order("sort_order");
        if (!projects?.length) return "No projects yet.";
        const counts = await projectCounts();
        return projects.map((p) => {
          const c = counts.get(p.id) ?? { open: 0, done: 0 };
          return `- ${p.name} (id: ${p.id}) — ${c.open} open, ${c.done} done`;
        }).join("\n");
      },
    }),

    list_tasks: tool({
      description: "List tasks in board order, optionally filtered by project and status. Returns ids, titles, priority, pomodoro progress.",
      inputSchema: z.object({
        projectRef: z.string().optional().describe("Project id or name to filter by"),
        status: z.enum(["todo", "done", "all"]).optional().default("todo"),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ projectRef, status, limit }) => {
        const projectId = projectRef ? (await resolve.project(projectRef)).id : undefined;
        let q = supabase.from("tasks").select("id, title, status, priority, estimated_pomodoros, completed_pomodoros, project_id");
        if (projectId) q = q.eq("project_id", projectId);
        if (status !== "all") q = q.eq("status", status);
        const { data } = await q.order("sort_order").limit(limit);
        if (!data?.length) return "No matching tasks.";
        return data.map((t) => `- ${t.title} (id: ${t.id}) [${t.status}, ${t.priority}, ${t.completed_pomodoros}/${t.estimated_pomodoros} pomos]`).join("\n");
      },
    }),

    search_tasks: tool({
      description:
        "Search tasks by a title pattern across ALL projects and return only matching titles + ids (lightweight). " +
        "The pattern is treated as a case-insensitive regex (Postgres regex), falling back to a substring match. " +
        "Prefer this over list_tasks when the user names a specific task — then call get_task with the id for full detail.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Case-insensitive regex or keywords to match against task titles"),
        status: z.enum(["todo", "done", "all"]).optional().default("all"),
        limit: z.number().int().min(1).max(50).optional().default(20),
      }),
      execute: async ({ query, status, limit }) => {
        const base = () => {
          let q = supabase.from("tasks").select("id, title, status, project_id");
          if (status !== "all") q = q.eq("status", status);
          return q.order("created_at", { ascending: false }).limit(limit);
        };
        // Postgres case-insensitive regex; fall back to substring if the
        // pattern is invalid (PostgREST rejects bad regex with an error).
        const regexResult = await base().filter("title", "imatch", query);
        let data = regexResult.data;
        if (regexResult.error) data = (await base().ilike("title", `%${query}%`)).data;
        if (!data?.length) return `No tasks matching /${query}/.`;
        return data.map((t) => `- ${t.title} (id: ${t.id}) [${t.status}]`).join("\n");
      },
    }),

    get_task: tool({
      description:
        "Get full detail for a single task by id or name: notes, priority, pomodoro progress, tags, and ALL its subtasks (with ids and done state). " +
        "Use after search_tasks/list_tasks to inspect a task before editing its subtasks or notes.",
      inputSchema: z.object({ taskRef: z.string().min(1) }),
      execute: async ({ taskRef }) => {
        const t = await resolve.task(taskRef);
        const [{ data: subs }, { data: tt }, { data: project }] = await Promise.all([
          supabase.from("subtasks").select("id, title, done").eq("task_id", t.id).order("sort_order"),
          supabase.from("task_tags").select("tag_id").eq("task_id", t.id),
          supabase.from("projects").select("name").eq("id", t.project_id ?? "").maybeSingle(),
        ]);
        const tagIds = (tt ?? []).map((r) => r.tag_id);
        let tagNames: string[] = [];
        if (tagIds.length) {
          const { data: tg } = await supabase.from("tags").select("name").in("id", tagIds);
          tagNames = (tg ?? []).map((r) => r.name);
        }
        return [
          `${t.title} (id: ${t.id})${project ? ` in ${project.name}` : ""}`,
          `Status: ${t.status} · Priority: ${t.priority} · ${t.completed_pomodoros}/${t.estimated_pomodoros} pomos`,
          tagNames.length ? `Tags: ${tagNames.map((n) => `#${n}`).join(", ")}` : null,
          t.notes ? `Notes: ${t.notes}` : null,
          subs?.length
            ? `Subtasks:\n${subs.map((s) => `  - [${s.done ? "x" : " "}] ${s.title} (id: ${s.id})`).join("\n")}`
            : "Subtasks: (none)",
        ].filter(Boolean).join("\n");
      },
    }),

    recent_completed_tasks: tool({
      description: "List the most recently completed tasks (what the user has finished lately).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional().default(8) }),
      execute: async ({ limit }) => {
        const { data } = await supabase.from("tasks").select("title, completed_at, project_id").eq("status", "done").not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(limit);
        if (!data?.length) return "No completed tasks yet.";
        return data.map((t) => `- ${t.title} (done ${t.completed_at?.slice(0, 10)})`).join("\n");
      },
    }),

    focus_stats: tool({
      description:
        "Read the user's actual focus/productivity time (real pomodoro + custom sessions). Returns focus time and session counts for today, yesterday, the last 7 days, the last 30 days, and all-time. Use this for ANY 'how long/much did I focus' question — never estimate.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase.from("v_daily_focus").select("day, total_seconds, sessions").order("day", { ascending: false }).limit(400);
        const rows = data ?? [];
        if (!rows.length) return "No focus sessions recorded yet.";
        const dayOf = (delta: number) => {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() + delta);
          return d.toISOString().slice(0, 10);
        };
        const fmt = (sec: number) => {
          const m = Math.round(sec / 60);
          const h = Math.floor(m / 60);
          return h ? `${h}h ${m % 60}m` : `${m}m`;
        };
        const sum = (rs: typeof rows) => rs.reduce((a, r) => ({ sec: a.sec + (r.total_seconds ?? 0), sess: a.sess + (r.sessions ?? 0) }), { sec: 0, sess: 0 });
        const rowFor = (iso: string) => rows.find((r) => r.day.slice(0, 10) === iso);
        const since = (iso: string) => sum(rows.filter((r) => r.day.slice(0, 10) >= iso));
        const today = rowFor(dayOf(0));
        const yest = rowFor(dayOf(-1));
        const last7 = since(dayOf(-6));
        const last30 = since(dayOf(-29));
        const all = sum(rows);
        return [
          `Today: ${fmt(today?.total_seconds ?? 0)} (${today?.sessions ?? 0} sessions)`,
          `Yesterday: ${fmt(yest?.total_seconds ?? 0)} (${yest?.sessions ?? 0} sessions)`,
          `Last 7 days: ${fmt(last7.sec)} (${last7.sess} sessions)`,
          `Last 30 days: ${fmt(last30.sec)} (${last30.sess} sessions)`,
          `All time: ${fmt(all.sec)} (${all.sess} sessions)`,
        ].join("\n");
      },
    }),

    // ─── PROJECTS ──────────────────────────────────────────────────────
    create_project: tool({
      description: "Create a new project.",
      inputSchema: z.object({ name: z.string().trim().min(1), color: HEX.optional() }),
      execute: async ({ name, color }) => {
        const { count } = await supabase.from("projects").select("id", { count: "exact", head: true });
        const { data, error } = await supabase.from("projects").insert({ user_id: userId, name, color: color || "#ff5fa2", sort_order: count ?? 0 }).select("id, name").single();
        must(error, "create the project");
        return `Created project "${data!.name}" (id: ${data!.id}).`;
      },
    }),

    rename_project: tool({
      description: "Rename a project.",
      inputSchema: z.object({ projectRef: z.string().min(1), newName: z.string().trim().min(1) }),
      execute: async ({ projectRef, newName }) => {
        const p = await resolve.project(projectRef);
        const { error } = await supabase.from("projects").update({ name: newName }).eq("id", p.id);
        must(error, "rename the project");
        return `Renamed "${p.name}" → "${newName}".`;
      },
    }),

    recolor_project: tool({
      description: "Change a project's color (6-digit hex like #5fb0ff).",
      inputSchema: z.object({ projectRef: z.string().min(1), color: HEX }),
      execute: async ({ projectRef, color }) => {
        const p = await resolve.project(projectRef);
        const { error } = await supabase.from("projects").update({ color }).eq("id", p.id);
        must(error, "recolor the project");
        return `Recolored "${p.name}".`;
      },
    }),

    delete_project: tool({
      description: "Delete a project AND all its tasks. Destructive — only when the user clearly asked.",
      inputSchema: z.object({ projectRef: z.string().min(1) }),
      execute: async ({ projectRef }) => {
        const p = await resolve.project(projectRef);
        return destroy("delete_project", p.id, `Delete project "${p.name}" and all its tasks?`);
      },
    }),

    // ─── TASKS ─────────────────────────────────────────────────────────
    create_task: tool({
      description: "Create a task in a project, optionally with notes, priority, pomodoro estimate, tags, and subtasks. If the user describes a large piece of work and did not give subtasks, invent a sensible subtask breakdown. After creating, ASK before start_timer. Estimate pomodoros from get_workspace_state focus length, not 25 minutes.",
      inputSchema: z.object({
        title: z.string().trim().min(1),
        projectRef: z.string().optional().describe("Project id or name; defaults to the first project"),
        notes: z.string().optional(),
        priority: PRIORITY.optional(),
        estimatedPomodoros: ESTIMATE.optional(),
        tags: z.array(z.string()).optional(),
        subtasks: z.array(z.string().trim().min(1)).optional(),
      }),
      execute: async ({ title, projectRef, notes, priority, estimatedPomodoros, tags, subtasks }) => {
        let project = projectRef ? await resolve.project(projectRef) : null;
        if (!project) {
          const { data } = await supabase.from("projects").select("*").is("archived_at", null).order("sort_order").limit(1);
          project = data?.[0] ?? null;
        }
        if (!project) throw new ToolError("There are no projects yet — create one first (create_project).");
        const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", project.id);
        const { data: task, error } = await supabase.from("tasks").insert({
          user_id: userId, project_id: project.id, title,
          notes: notes?.trim() || null,
          priority: priority ?? "med",
          estimated_pomodoros: estimatedPomodoros ?? 1,
          sort_order: count ?? 0,
        }).select("id").single();
        must(error, "create the task");
        if (subtasks?.length) {
          const { error: subErr } = await supabase.from("subtasks").insert(subtasks.map((t, i) => ({ task_id: task!.id, user_id: userId, title: t, sort_order: i })));
          must(subErr, "add the subtasks");
        }
        if (tags?.length) {
          const ids = await resolveTagIds(tags);
          if (ids.length) await supabase.from("task_tags").insert(ids.map((tag_id) => ({ task_id: task!.id, tag_id })));
        }
        const extra = [subtasks?.length ? `${subtasks.length} subtasks` : "", tags?.length ? `tags ${tags.join(", ")}` : ""].filter(Boolean).join(", ");
        return `Created task "${title}" (id: ${task!.id}) in ${project.name} (id: ${project.id})${extra ? ` · ${extra}` : ""}.`;
      },
    }),

    update_task: tool({
      description: "Edit a task: title, notes, priority, pomodoro estimate, move to another project, or change tags.",
      inputSchema: z.object({
        taskRef: z.string().min(1),
        title: z.string().trim().min(1).optional(),
        notes: z.string().optional(),
        priority: PRIORITY.optional(),
        estimatedPomodoros: ESTIMATE.optional(),
        moveToProjectRef: z.string().optional(),
        setTags: z.array(z.string()).optional().describe("Replace all tags with this set"),
      }),
      execute: async ({ taskRef, title, notes, priority, estimatedPomodoros, moveToProjectRef, setTags }) => {
        const t = await resolve.task(taskRef);
        const patch: TaskUpdate = {};
        if (title !== undefined) patch.title = title;
        if (notes !== undefined) patch.notes = notes.trim() || null;
        if (priority !== undefined) patch.priority = priority;
        if (estimatedPomodoros !== undefined) patch.estimated_pomodoros = estimatedPomodoros;
        let moved = "";
        if (moveToProjectRef) {
          const p = await resolve.project(moveToProjectRef);
          if (p.id !== t.project_id) {
            const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", p.id);
            patch.project_id = p.id;
            patch.sort_order = count ?? 0;
            moved = ` and moved it to ${p.name}`;
          }
        }
        if (!Object.keys(patch).length && !setTags) throw new ToolError("Nothing to change — pass at least one field.");
        if (Object.keys(patch).length) {
          const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
          must(error, "update the task");
        }
        if (setTags) {
          await supabase.from("task_tags").delete().eq("task_id", t.id);
          const ids = await resolveTagIds(setTags);
          if (ids.length) await supabase.from("task_tags").insert(ids.map((tag_id) => ({ task_id: t.id, tag_id })));
        }
        return `Updated task "${title ?? t.title}" (id: ${t.id})${moved}.`;
      },
    }),

    set_task_status: tool({
      description: "Mark a task done (complete it) or reopen it (todo).",
      inputSchema: z.object({ taskRef: z.string().min(1), status: z.enum(["todo", "done"]) }),
      execute: async ({ taskRef, status }) => {
        const t = await resolve.task(taskRef);
        const { error } = await supabase.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", t.id);
        must(error, "change the status");
        return `Marked "${t.title}" (id: ${t.id}) as ${status}.`;
      },
    }),

    reorder_tasks: tool({
      description:
        "Reorder tasks inside one project. Pass the task ids/titles in the desired order (top first); tasks you omit keep their relative order after them.",
      inputSchema: z.object({
        projectRef: z.string().min(1),
        orderedTaskRefs: z.array(z.string().min(1)).min(1),
      }),
      execute: async ({ projectRef, orderedTaskRefs }) => {
        const p = await resolve.project(projectRef);
        const first: string[] = [];
        for (const ref of orderedTaskRefs) {
          const t = await resolve.task(ref, p.id);
          if (!first.includes(t.id)) first.push(t.id);
        }
        const { data: all } = await supabase.from("tasks").select("id").eq("project_id", p.id).order("sort_order");
        const order = [...first, ...(all ?? []).map((r) => r.id).filter((id) => !first.includes(id))];
        for (let i = 0; i < order.length; i++) {
          const { error } = await supabase.from("tasks").update({ sort_order: i }).eq("id", order[i]);
          must(error, "reorder tasks");
        }
        return `Reordered ${first.length} task(s) to the top of ${p.name}.`;
      },
    }),

    delete_task: tool({
      description: "Delete a task and its subtasks. Destructive — only when the user clearly asked.",
      inputSchema: z.object({ taskRef: z.string().min(1) }),
      execute: async ({ taskRef }) => {
        const t = await resolve.task(taskRef);
        return destroy("delete_task", t.id, `Delete task "${t.title}"?`);
      },
    }),

    // ─── SUBTASKS ──────────────────────────────────────────────────────
    add_subtasks: tool({
      description: "Add one or more subtasks to a task (appended at the end).",
      inputSchema: z.object({ taskRef: z.string().min(1), titles: z.array(z.string().trim().min(1)).min(1) }),
      execute: async ({ taskRef, titles }) => {
        const t = await resolve.task(taskRef);
        const { count } = await supabase.from("subtasks").select("id", { count: "exact", head: true }).eq("task_id", t.id);
        const base = count ?? 0;
        const { data: added, error } = await supabase.from("subtasks")
          .insert(titles.map((title, i) => ({ task_id: t.id, user_id: userId, title, sort_order: base + i })))
          .select("id, title");
        must(error, "add subtasks");
        const list = (added ?? []).map((x) => `${x.title} (id: ${x.id})`).join("; ");
        return `Added ${titles.length} subtask(s) to "${t.title}"${list ? `: ${list}` : ""}.`;
      },
    }),

    update_subtask: tool({
      description: "Check/uncheck (complete) a subtask or rename it. subtaskRef is the subtask id from get_task or its title.",
      inputSchema: z.object({
        taskRef: z.string().min(1),
        subtaskRef: z.string().min(1).describe("Subtask id or title"),
        done: z.boolean().optional(),
        newTitle: z.string().trim().min(1).optional(),
      }),
      execute: async ({ taskRef, subtaskRef, done, newTitle }) => {
        const t = await resolve.task(taskRef);
        const sub = await resolve.subtask(t.id, subtaskRef);
        const patch: SubtaskUpdate = {};
        if (done !== undefined) patch.done = done;
        if (newTitle !== undefined) patch.title = newTitle;
        if (!Object.keys(patch).length) throw new ToolError("Nothing to change — pass done and/or newTitle.");
        const { error } = await supabase.from("subtasks").update(patch).eq("id", sub.id);
        must(error, "update the subtask");
        const what = done === undefined ? "Updated" : done ? "Checked off" : "Unchecked";
        return `${what} subtask "${newTitle ?? sub.title}".`;
      },
    }),

    reorder_subtasks: tool({
      description: "Reorder a task's subtasks. Pass subtask ids/titles in the desired order; omitted ones follow in their current order.",
      inputSchema: z.object({ taskRef: z.string().min(1), orderedSubtaskRefs: z.array(z.string().min(1)).min(1) }),
      execute: async ({ taskRef, orderedSubtaskRefs }) => {
        const t = await resolve.task(taskRef);
        const first: string[] = [];
        for (const ref of orderedSubtaskRefs) {
          const s = await resolve.subtask(t.id, ref);
          if (!first.includes(s.id)) first.push(s.id);
        }
        const { data: all } = await supabase.from("subtasks").select("id").eq("task_id", t.id).order("sort_order");
        const order = [...first, ...(all ?? []).map((r) => r.id).filter((id) => !first.includes(id))];
        for (let i = 0; i < order.length; i++) {
          const { error } = await supabase.from("subtasks").update({ sort_order: i }).eq("id", order[i]);
          must(error, "reorder subtasks");
        }
        return `Reordered subtasks of "${t.title}".`;
      },
    }),

    delete_subtask: tool({
      description: "Delete a subtask of a task (by id or title). Destructive.",
      inputSchema: z.object({ taskRef: z.string().min(1), subtaskRef: z.string().min(1).describe("Subtask id or title") }),
      execute: async ({ taskRef, subtaskRef }) => {
        const t = await resolve.task(taskRef);
        const sub = await resolve.subtask(t.id, subtaskRef);
        return destroy("delete_subtask", sub.id, `Delete subtask "${sub.title}"?`);
      },
    }),

    // ─── TAGS ──────────────────────────────────────────────────────────
    create_tag: tool({
      description: "Create a tag.",
      inputSchema: z.object({ name: z.string().trim().min(1), color: HEX.optional() }),
      execute: async ({ name, color }) => {
        const clean = name.replace(/^#/, "").trim().toLowerCase();
        const { data, error } = await supabase.from("tags").insert({ user_id: userId, name: clean, color: color || randTagColor() }).select("name").single();
        must(error, "create the tag");
        return `Created tag #${data!.name}.`;
      },
    }),

    delete_tag: tool({
      description: "Delete a tag (removes it from all tasks). Destructive.",
      inputSchema: z.object({ tagName: z.string().min(1) }),
      execute: async ({ tagName }) => {
        const tg = await resolve.tag(tagName);
        return destroy("delete_tag", tg.id, `Delete tag #${tg.name} from all tasks?`);
      },
    }),

    ...makeExtraTools(supabase, userId, opts, resolve),
  };

  if (opts.surface !== "mcp") delete tools.confirm_action;
  return tools;
}
