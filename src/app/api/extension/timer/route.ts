import type { NextRequest } from "next/server";
import { json, preflight, readBody, withExtension } from "@/lib/extension/http";
import { getExtensionState, runTimerCommand, type TimerAction } from "@/lib/extension/service";

const ACTIONS: TimerAction[] = ["start", "pause", "resume", "stop", "skip"];

/** POST { action: start|pause|resume|stop|skip, mode? } → fresh state. */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const body = await readBody(req);
    const action = String(body.action ?? "") as TimerAction;
    if (!ACTIONS.includes(action)) return json(req, { error: `action must be one of ${ACTIONS.join(", ")}` }, 400);
    await runTimerCommand(db, userId, action, { mode: typeof body.mode === "string" ? body.mode : undefined });
    return json(req, await getExtensionState(db, userId));
  });
}

export const OPTIONS = preflight;
