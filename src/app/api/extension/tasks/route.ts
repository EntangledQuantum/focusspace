import type { NextRequest } from "next/server";
import { json, preflight, readBody, readHint, withExtension } from "@/lib/extension/http";
import { createTask, listTasks, runTaskCommand, type TaskAction } from "@/lib/extension/service";

/** Projects + open tasks for the extension's task picker. */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => json(req, await listTasks(db, userId)));
}

/**
 * POST { action: "create", title, projectId?, estimatedPomodoros?, subtasks?: string[] } → { task }
 *    | { action: "select", taskId | null } | { action: "toggle_done", taskId, done? }
 *    | { action: "toggle_subtask", subtaskId, done? }  (+ optional `known` hint) → the new state.
 * `done` is the desired value, which makes retries idempotent and skips a read.
 */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const body = await readBody(req);
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const done = typeof body.done === "boolean" ? body.done : undefined;
    const taskId = str(body.taskId);
    const subtaskId = str(body.subtaskId);
    if (body.action === "create") {
      const task = await createTask(db, userId, {
        title: typeof body.title === "string" ? body.title : "",
        projectId: str(body.projectId),
        estimatedPomodoros: typeof body.estimatedPomodoros === "number" ? body.estimatedPomodoros : undefined,
        subtasks: Array.isArray(body.subtasks) ? body.subtasks.filter((x): x is string => typeof x === "string") : [],
      });
      return json(req, { task });
    }
    let cmd: TaskAction | null = null;
    if (body.action === "select") cmd = { action: "select", taskId };
    else if (body.action === "toggle_done" && taskId) cmd = { action: "toggle_done", taskId, done };
    else if (body.action === "toggle_subtask" && subtaskId) cmd = { action: "toggle_subtask", subtaskId, done };
    if (!cmd) return json(req, { error: "Unknown task action." }, 400);
    return json(req, await runTaskCommand(db, userId, cmd, readHint(body.known)));
  });
}

export const OPTIONS = preflight;
