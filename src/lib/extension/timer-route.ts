import type { NextRequest } from "next/server";
import { json, readBody, readHint, type ExtensionContext } from "@/lib/extension/http";
import { getExtensionState, peekState, runTaskCommand, runTimerCommand, type TimerCommand } from "@/lib/extension/service";

/**
 * The one timer API every client uses — website tabs via /api/timer (cookie
 * session) and the extension via /api/extension/{state,timer} (bearer token).
 * Same parsing, same service, same rules.
 */

const ACTIONS: (TimerCommand | "select")[] = ["start", "pause", "resume", "stop", "skip", "set_mode", "select"];

/** GET ?since=<updatedAt>&task=&project= → state, or { unchanged: true } when the caller is current. */
export async function timerGet(req: NextRequest, { db, userId }: ExtensionContext) {
  const q = req.nextUrl.searchParams;
  const hint = readHint({ taskId: q.get("task"), projectId: q.get("project") });
  const since = q.get("since");
  const now = Date.now();
  if (since) {
    const state = await peekState(db, userId, since, now, hint);
    if (!state) return json(req, { unchanged: true, serverNow: Date.now(), updatedAt: since });
    return json(req, { ...state, serverNow: Date.now() });
  }
  const state = await getExtensionState(db, userId, now, hint);
  return json(req, { ...state, serverNow: Date.now() });
}

/**
 * POST { action, mode?, durationSec?, taskId?, expectSessionId?, resetCycle?, known? }
 * → the new state. A refused intent answers 409 { error, state } with the current state.
 */
export async function timerPost(req: NextRequest, { db, userId }: ExtensionContext) {
  const body = await readBody(req);
  const action = String(body.action ?? "") as TimerCommand | "select";
  if (!ACTIONS.includes(action)) return json(req, { error: `action must be one of ${ACTIONS.join(", ")}` }, 400);
  const hint = readHint(body.known);
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);

  if (action === "select") {
    const state = await runTaskCommand(db, userId, { action: "select", taskId: str(body.taskId) }, hint);
    return json(req, { ...state, serverNow: Date.now() });
  }
  const state = await runTimerCommand(db, userId, action, {
    mode: typeof body.mode === "string" ? body.mode : undefined,
    durationSec: typeof body.durationSec === "number" ? body.durationSec : undefined,
    taskId: "taskId" in body ? str(body.taskId) : undefined,
    expectSessionId: "expectSessionId" in body ? str(body.expectSessionId) : undefined,
    resetCycle: body.resetCycle === true,
    hint,
  });
  return json(req, { ...state, serverNow: Date.now() });
}
