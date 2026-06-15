import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
type SubtaskUpdate = Database["public"]["Tables"]["subtasks"]["Update"];

const TAG_COLORS = ["#ff5fa2", "#b06bf6", "#5fb0ff", "#46c98b", "#f2a341", "#ff8fbe", "#8fb6ff", "#c89bff"];
const randTagColor = () => TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signals a destructive action that needs the user's confirmation in the UI. */
export interface ConfirmRequest {
  __confirm: true;
  action: "delete_project" | "delete_task" | "delete_subtask" | "delete_tag";
  id: string;
  summary: string;
}

export interface MakeToolsOpts {
  /** "allow" runs deletes immediately; "confirm" defers them to a UI card. */
  destructive: "allow" | "confirm";
}

export function makeTaskTools(supabase: DB, userId: string, opts: MakeToolsOpts): ToolSet {
  // ── resolvers (accept id OR fuzzy name) ──────────────────────────────
  async function resolveProject(ref: string) {
    if (UUID_RE.test(ref)) {
      const { data } = await supabase.from("projects").select("*").eq("id", ref).maybeSingle();
      if (data) return data;
    }
    const { data: exact } = await supabase.from("projects").select("*").is("archived_at", null).ilike("name", ref).limit(1);
    if (exact?.[0]) return exact[0];
    const { data: fuzzy } = await supabase.from("projects").select("*").is("archived_at", null).ilike("name", `%${ref}%`).limit(1);
    return fuzzy?.[0] ?? null;
  }

  async function resolveTask(ref: string, projectId?: string) {
    if (UUID_RE.test(ref)) {
      const { data } = await supabase.from("tasks").select("*").eq("id", ref).maybeSingle();
      if (data) return data;
    }
    let q = supabase.from("tasks").select("*").ilike("title", `%${ref}%`).order("created_at", { ascending: false }).limit(1);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    return data?.[0] ?? null;
  }

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

  const deferOrRun = async (
    action: ConfirmRequest["action"], id: string, summary: string, run: () => Promise<string>,
  ): Promise<string | ConfirmRequest> => {
    if (opts.destructive === "confirm") return { __confirm: true, action, id, summary };
    return run();
  };

  return {
    // ─── READ / CONTEXT ────────────────────────────────────────────────
    list_projects: tool({
      description: "List the user's projects with open/done task counts. Use to find the right project id before mutating.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: projects } = await supabase.from("projects").select("id, name, color").is("archived_at", null).order("sort_order");
        if (!projects?.length) return "No projects yet.";
        const { data: tasks } = await supabase.from("tasks").select("project_id, status");
        const lines = projects.map((p) => {
          const t = (tasks ?? []).filter((x) => x.project_id === p.id);
          const open = t.filter((x) => x.status === "todo").length;
          const done = t.filter((x) => x.status === "done").length;
          return `- ${p.name} (id: ${p.id}) — ${open} open, ${done} done`;
        });
        return lines.join("\n");
      },
    }),

    list_tasks: tool({
      description: "List tasks, optionally filtered by project and status. Returns ids, titles, priority, pomodoro estimate, tags.",
      inputSchema: z.object({
        projectRef: z.string().optional().describe("Project id or name to filter by"),
        status: z.enum(["todo", "done", "all"]).optional().default("todo"),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ projectRef, status, limit }) => {
        let projectId: string | undefined;
        if (projectRef) {
          const p = await resolveProject(projectRef);
          if (!p) return `No project matching "${projectRef}".`;
          projectId = p.id;
        }
        let q = supabase.from("tasks").select("id, title, status, priority, estimated_pomodoros, completed_pomodoros, project_id").order("sort_order").limit(limit);
        if (projectId) q = q.eq("project_id", projectId);
        if (status !== "all") q = q.eq("status", status);
        const { data } = await q;
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
        // Try Postgres case-insensitive regex; fall back to substring if the
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
        "Get full detail for a single task by id or name: notes, priority, pomodoro progress, tags, and ALL its subtasks (with done state). " +
        "Use after search_tasks/list_tasks to inspect a task before editing its subtasks or notes.",
      inputSchema: z.object({ taskRef: z.string() }),
      execute: async ({ taskRef }) => {
        const t = await resolveTask(taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        const [{ data: subs }, { data: tt }] = await Promise.all([
          supabase.from("subtasks").select("title, done").eq("task_id", t.id).order("sort_order"),
          supabase.from("task_tags").select("tag_id").eq("task_id", t.id),
        ]);
        const tagIds = (tt ?? []).map((r) => r.tag_id);
        let tagNames: string[] = [];
        if (tagIds.length) {
          const { data: tg } = await supabase.from("tags").select("name").in("id", tagIds);
          tagNames = (tg ?? []).map((r) => r.name);
        }
        const lines = [
          `${t.title} (id: ${t.id})`,
          `Status: ${t.status} · Priority: ${t.priority} · ${t.completed_pomodoros}/${t.estimated_pomodoros} pomos`,
          tagNames.length ? `Tags: ${tagNames.map((n) => `#${n}`).join(", ")}` : null,
          t.notes ? `Notes: ${t.notes}` : null,
          subs?.length
            ? `Subtasks:\n${subs.map((s) => `  - [${s.done ? "x" : " "}] ${s.title}`).join("\n")}`
            : "Subtasks: (none)",
        ].filter(Boolean);
        return lines.join("\n");
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
        const { data } = await supabase
          .from("v_daily_focus")
          .select("day, total_seconds, sessions")
          .order("day", { ascending: false })
          .limit(400);
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
        const rowFor = (iso: string) => rows.find((r) => r.day.slice(0, 10) === iso);
        const sumSince = (iso: string) =>
          rows.filter((r) => r.day.slice(0, 10) >= iso).reduce(
            (a, r) => ({ sec: a.sec + (r.total_seconds ?? 0), sess: a.sess + (r.sessions ?? 0) }),
            { sec: 0, sess: 0 },
          );
        const all = rows.reduce(
          (a, r) => ({ sec: a.sec + (r.total_seconds ?? 0), sess: a.sess + (r.sessions ?? 0) }),
          { sec: 0, sess: 0 },
        );
        const today = rowFor(dayOf(0));
        const yest = rowFor(dayOf(-1));
        const last7 = sumSince(dayOf(-6));
        const last30 = sumSince(dayOf(-29));

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
      inputSchema: z.object({ name: z.string().min(1), color: z.string().optional() }),
      execute: async ({ name, color }) => {
        const { count } = await supabase.from("projects").select("id", { count: "exact", head: true });
        const { data, error } = await supabase.from("projects").insert({ user_id: userId, name, color: color || "#ff5fa2", sort_order: count ?? 0 }).select("id, name").single();
        if (error) return `Failed to create project: ${error.message}`;
        return `Created project "${data.name}" (id: ${data.id}).`;
      },
    }),

    rename_project: tool({
      description: "Rename a project.",
      inputSchema: z.object({ projectRef: z.string(), newName: z.string().min(1) }),
      execute: async ({ projectRef, newName }) => {
        const p = await resolveProject(projectRef);
        if (!p) return `No project matching "${projectRef}".`;
        const { error } = await supabase.from("projects").update({ name: newName }).eq("id", p.id);
        return error ? `Failed: ${error.message}` : `Renamed "${p.name}" → "${newName}".`;
      },
    }),

    recolor_project: tool({
      description: "Change a project's color (hex).",
      inputSchema: z.object({ projectRef: z.string(), color: z.string() }),
      execute: async ({ projectRef, color }) => {
        const p = await resolveProject(projectRef);
        if (!p) return `No project matching "${projectRef}".`;
        const { error } = await supabase.from("projects").update({ color }).eq("id", p.id);
        return error ? `Failed: ${error.message}` : `Recolored "${p.name}".`;
      },
    }),

    delete_project: tool({
      description: "Delete a project AND all its tasks. Destructive.",
      inputSchema: z.object({ projectRef: z.string() }),
      execute: async ({ projectRef }) => {
        const p = await resolveProject(projectRef);
        if (!p) return `No project matching "${projectRef}".`;
        return deferOrRun("delete_project", p.id, `Delete project "${p.name}" and all its tasks?`, async () => {
          await supabase.from("tasks").delete().eq("project_id", p.id);
          const { error } = await supabase.from("projects").delete().eq("id", p.id);
          return error ? `Failed: ${error.message}` : `Deleted project "${p.name}".`;
        });
      },
    }),

    // ─── TASKS ─────────────────────────────────────────────────────────
    create_task: tool({
      description: "Create a task in a project, optionally with notes, priority, pomodoro estimate, tags, and subtasks.",
      inputSchema: z.object({
        title: z.string().min(1),
        projectRef: z.string().optional().describe("Project id or name; defaults to the first project"),
        notes: z.string().optional(),
        priority: z.enum(["low", "med", "high", "urgent"]).optional(),
        estimatedPomodoros: z.number().min(0.5).max(20).optional(),
        tags: z.array(z.string()).optional(),
        subtasks: z.array(z.string()).optional(),
      }),
      execute: async ({ title, projectRef, notes, priority, estimatedPomodoros, tags, subtasks }) => {
        let project = projectRef ? await resolveProject(projectRef) : null;
        if (!project) {
          const { data } = await supabase.from("projects").select("*").is("archived_at", null).order("sort_order").limit(1);
          project = data?.[0] ?? null;
        }
        if (!project) return "No project to add the task to — create one first.";
        const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", project.id);
        const { data: task, error } = await supabase.from("tasks").insert({
          user_id: userId, project_id: project.id, title,
          notes: notes?.trim() || null,
          priority: priority ?? "med",
          estimated_pomodoros: estimatedPomodoros ?? 1,
          sort_order: count ?? 0,
        }).select("id").single();
        if (error || !task) return `Failed to create task: ${error?.message}`;
        if (subtasks?.length) {
          await supabase.from("subtasks").insert(subtasks.map((t, i) => ({ task_id: task.id, user_id: userId, title: t, sort_order: i })));
        }
        if (tags?.length) {
          const ids = await resolveTagIds(tags);
          if (ids.length) await supabase.from("task_tags").insert(ids.map((tag_id) => ({ task_id: task.id, tag_id })));
        }
        const extra = [subtasks?.length ? `${subtasks.length} subtasks` : "", tags?.length ? `tags ${tags.join(", ")}` : ""].filter(Boolean).join(", ");
        return `Created task "${title}" in ${project.name}${extra ? ` · ${extra}` : ""}.`;
      },
    }),

    update_task: tool({
      description: "Edit a task: title, notes, priority, pomodoro estimate, move to another project, or change tags.",
      inputSchema: z.object({
        taskRef: z.string(),
        title: z.string().optional(),
        notes: z.string().optional(),
        priority: z.enum(["low", "med", "high", "urgent"]).optional(),
        estimatedPomodoros: z.number().min(0.5).max(20).optional(),
        moveToProjectRef: z.string().optional(),
        setTags: z.array(z.string()).optional().describe("Replace all tags with this set"),
      }),
      execute: async ({ taskRef, title, notes, priority, estimatedPomodoros, moveToProjectRef, setTags }) => {
        const t = await resolveTask(taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        const patch: TaskUpdate = {};
        if (title !== undefined) patch.title = title;
        if (notes !== undefined) patch.notes = notes.trim() || null;
        if (priority !== undefined) patch.priority = priority;
        if (estimatedPomodoros !== undefined) patch.estimated_pomodoros = estimatedPomodoros;
        if (moveToProjectRef) {
          const p = await resolveProject(moveToProjectRef);
          if (!p) return `No project matching "${moveToProjectRef}".`;
          patch.project_id = p.id;
        }
        if (Object.keys(patch).length) {
          const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
          if (error) return `Failed: ${error.message}`;
        }
        if (setTags) {
          await supabase.from("task_tags").delete().eq("task_id", t.id);
          const ids = await resolveTagIds(setTags);
          if (ids.length) await supabase.from("task_tags").insert(ids.map((tag_id) => ({ task_id: t.id, tag_id })));
        }
        return `Updated task "${title ?? t.title}".`;
      },
    }),

    set_task_status: tool({
      description: "Mark a task done or todo.",
      inputSchema: z.object({ taskRef: z.string(), status: z.enum(["todo", "done"]) }),
      execute: async ({ taskRef, status }) => {
        const t = await resolveTask(taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        const { error } = await supabase.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", t.id);
        return error ? `Failed: ${error.message}` : `Marked "${t.title}" as ${status}.`;
      },
    }),

    delete_task: tool({
      description: "Delete a task and its subtasks. Destructive.",
      inputSchema: z.object({ taskRef: z.string() }),
      execute: async ({ taskRef }) => {
        const t = await resolveTask(taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        return deferOrRun("delete_task", t.id, `Delete task "${t.title}"?`, async () => {
          const { error } = await supabase.from("tasks").delete().eq("id", t.id);
          return error ? `Failed: ${error.message}` : `Deleted task "${t.title}".`;
        });
      },
    }),

    // ─── SUBTASKS ──────────────────────────────────────────────────────
    add_subtasks: tool({
      description: "Add one or more subtasks to a task.",
      inputSchema: z.object({ taskRef: z.string(), titles: z.array(z.string().min(1)).min(1) }),
      execute: async ({ taskRef, titles }) => {
        const t = await resolveTask(taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        const { count } = await supabase.from("subtasks").select("id", { count: "exact", head: true }).eq("task_id", t.id);
        const base = count ?? 0;
        const { error } = await supabase.from("subtasks").insert(titles.map((title, i) => ({ task_id: t.id, user_id: userId, title, sort_order: base + i })));
        return error ? `Failed: ${error.message}` : `Added ${titles.length} subtask(s) to "${t.title}".`;
      },
    }),

    update_subtask: tool({
      description: "Toggle a subtask done/undone or rename it (matched by its text within a task).",
      inputSchema: z.object({ taskRef: z.string(), subtaskTitle: z.string(), done: z.boolean().optional(), newTitle: z.string().optional() }),
      execute: async ({ taskRef, subtaskTitle, done, newTitle }) => {
        const t = await resolveTask(taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        const { data: subs } = await supabase.from("subtasks").select("id, title").eq("task_id", t.id).ilike("title", `%${subtaskTitle}%`).limit(1);
        const sub = subs?.[0];
        if (!sub) return `No subtask matching "${subtaskTitle}" in "${t.title}".`;
        const patch: SubtaskUpdate = {};
        if (done !== undefined) patch.done = done;
        if (newTitle !== undefined) patch.title = newTitle;
        const { error } = await supabase.from("subtasks").update(patch).eq("id", sub.id);
        return error ? `Failed: ${error.message}` : `Updated subtask "${sub.title}".`;
      },
    }),

    delete_subtask: tool({
      description: "Delete a subtask of a task (matched by text). Destructive.",
      inputSchema: z.object({ taskRef: z.string(), subtaskTitle: z.string() }),
      execute: async ({ taskRef, subtaskTitle }) => {
        const t = await resolveTask(taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        const { data: subs } = await supabase.from("subtasks").select("id, title").eq("task_id", t.id).ilike("title", `%${subtaskTitle}%`).limit(1);
        const sub = subs?.[0];
        if (!sub) return `No subtask matching "${subtaskTitle}".`;
        return deferOrRun("delete_subtask", sub.id, `Delete subtask "${sub.title}"?`, async () => {
          const { error } = await supabase.from("subtasks").delete().eq("id", sub.id);
          return error ? `Failed: ${error.message}` : `Deleted subtask "${sub.title}".`;
        });
      },
    }),

    // ─── TAGS ──────────────────────────────────────────────────────────
    create_tag: tool({
      description: "Create a tag.",
      inputSchema: z.object({ name: z.string().min(1), color: z.string().optional() }),
      execute: async ({ name, color }) => {
        const clean = name.replace(/^#/, "").trim().toLowerCase();
        const { data, error } = await supabase.from("tags").insert({ user_id: userId, name: clean, color: color || randTagColor() }).select("name").single();
        return error ? `Failed: ${error.message}` : `Created tag #${data.name}.`;
      },
    }),

    delete_tag: tool({
      description: "Delete a tag (removes it from all tasks). Destructive.",
      inputSchema: z.object({ tagName: z.string() }),
      execute: async ({ tagName }) => {
        const clean = tagName.replace(/^#/, "").trim().toLowerCase();
        const { data: tags } = await supabase.from("tags").select("id, name").ilike("name", clean).limit(1);
        const tg = tags?.[0];
        if (!tg) return `No tag matching "${tagName}".`;
        return deferOrRun("delete_tag", tg.id, `Delete tag #${tg.name} from all tasks?`, async () => {
          await supabase.from("task_tags").delete().eq("tag_id", tg.id);
          const { error } = await supabase.from("tags").delete().eq("id", tg.id);
          return error ? `Failed: ${error.message}` : `Deleted tag #${tg.name}.`;
        });
      },
    }),
  };
}
