import type { NextRequest } from "next/server";
import { preflight, withExtension } from "@/lib/extension/http";
import { timerGet } from "@/lib/extension/timer-route";

/**
 * Live timer + current task/project for the extension popup, side panel and badge.
 * `?task=&project=` (what the caller already shows) lets everything load in one round trip;
 * `?since=<updatedAt>` makes it a one-query version check ({ unchanged: true }).
 */
export async function GET(req: NextRequest) {
  return withExtension(req, (ctx) => timerGet(req, ctx));
}

export const OPTIONS = preflight;
