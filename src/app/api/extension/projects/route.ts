import type { NextRequest } from "next/server";
import { json, preflight, readBody, withExtension } from "@/lib/extension/http";
import { createProject } from "@/lib/extension/service";

/** POST { name, color? } → the new project. */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const body = await readBody(req);
    const project = await createProject(db, userId, {
      name: typeof body.name === "string" ? body.name : "",
      color: typeof body.color === "string" ? body.color : null,
    });
    return json(req, { project });
  });
}

export const OPTIONS = preflight;
