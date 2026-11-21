import type { NextRequest } from "next/server";
import { json, preflight, withExtension } from "@/lib/extension/http";
import { getExtensionState } from "@/lib/extension/service";

/** Live timer + current task/project for the extension popup and badge. */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => json(req, await getExtensionState(db, userId)));
}

export const OPTIONS = preflight;
