import type { NextRequest } from "next/server";
import { json, preflight, readBody, readHint, withExtension } from "@/lib/extension/http";
import { runTimerCommand, type TimerAction } from "@/lib/extension/service";

const ACTIONS: TimerAction[] = ["start", "pause", "resume", "stop", "skip"];

/** POST { action: start|pause|resume|stop|skip, mode?, known? } → the new state (built in memory, no re-read). */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const body = await readBody(req);
    const action = String(body.action ?? "") as TimerAction;
    if (!ACTIONS.includes(action)) return json(req, { error: `action must be one of ${ACTIONS.join(", ")}` }, 400);
    const state = await runTimerCommand(db, userId, action, {
      mode: typeof body.mode === "string" ? body.mode : undefined,
      hint: readHint(body.known),
    });
    return json(req, state);
  });
}

export const OPTIONS = preflight;
