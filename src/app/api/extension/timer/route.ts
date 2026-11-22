import type { NextRequest } from "next/server";
import { preflight, withExtension } from "@/lib/extension/http";
import { timerPost } from "@/lib/extension/timer-route";

/** POST { action, mode?, durationSec?, taskId?, expectSessionId?, resetCycle?, known? } → the new state. */
export async function POST(req: NextRequest) {
  return withExtension(req, (ctx) => timerPost(req, ctx));
}

export const OPTIONS = preflight;
