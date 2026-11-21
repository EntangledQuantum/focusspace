import type { NextRequest } from "next/server";
import { json, preflight, readBody, withExtension } from "@/lib/extension/http";
import { getMusicState, runMusicCommand, type MusicAction } from "@/lib/extension/music";

const ACTIONS: MusicAction[] = ["play", "pause", "next", "previous"];

/** What Spotify is playing right now. */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => json(req, await getMusicState(db, userId)));
}

/** POST { action: play|pause|next|previous } → fresh music state, or 409 { error } (e.g. no active device). */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const body = await readBody(req);
    const action = String(body.action ?? "") as MusicAction;
    if (!ACTIONS.includes(action)) return json(req, { error: `action must be one of ${ACTIONS.join(", ")}` }, 400);
    const error = await runMusicCommand(db, userId, action);
    if (error) return json(req, { error }, 409);
    // Spotify applies commands asynchronously; give it a beat so the returned state reflects the change.
    await new Promise((r) => setTimeout(r, 350));
    return json(req, await getMusicState(db, userId));
  });
}

export const OPTIONS = preflight;
