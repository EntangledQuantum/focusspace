import type { NextRequest } from "next/server";
import { json, preflight, readBody, withExtension } from "@/lib/extension/http";
import { getExtensionState, listTasks, runTaskCommand, type TaskAction } from "@/lib/extension/service";

/** Projects + open tasks for the extension's task picker. */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => json(req, await listTasks(db, userId)));
}

/**
 * POST { action: "select", taskId | null } | { action: "toggle_done", taskId }
 *    | { action: "toggle_subtask", subtaskId } → fresh state.
 */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const body = await readBody(req);
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const taskId = str(body.taskId);
    const subtaskId = str(body.subtaskId);
    let cmd: TaskAction | null = null;
    if (body.action === "select") cmd = { action: "select", taskId };
    else if (body.action === "toggle_done" && taskId) cmd = { action: "toggle_done", taskId };
    else if (body.action === "toggle_subtask" && subtaskId) cmd = { action: "toggle_subtask", subtaskId };
    if (!cmd) return json(req, { error: "Unknown task action." }, 400);
    await runTaskCommand(db, userId, cmd);
    return json(req, await getExtensionState(db, userId));
  });
}

export const OPTIONS = preflight;
