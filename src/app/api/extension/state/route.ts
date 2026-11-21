import type { NextRequest } from "next/server";
import { json, preflight, readHint, withExtension } from "@/lib/extension/http";
import { getExtensionState } from "@/lib/extension/service";

/**
 * Live timer + current task/project for the extension popup and badge.
 * `?task=&project=` (what the caller already shows) lets everything load in one round trip.
 */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const q = req.nextUrl.searchParams;
    const hint = readHint({ taskId: q.get("task"), projectId: q.get("project") });
    return json(req, await getExtensionState(db, userId, Date.now(), hint));
  });
}

export const OPTIONS = preflight;
