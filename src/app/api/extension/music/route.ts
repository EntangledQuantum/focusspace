import type { NextRequest } from "next/server";
import { json, preflight, readBody, withExtension } from "@/lib/extension/http";
import { getMusicState, runMusicCommand, type MusicAction } from "@/lib/extension/music";

const ACTIONS: MusicAction[] = ["play", "pause", "next", "previous"];

/** What Spotify is playing right now. */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId, mark }) => {
    const t = performance.now();
    const state = await getMusicState(db, userId);
    mark("spotify_state", performance.now() - t);
    return json(req, state);
  });
}

/**
 * POST { action: play|pause|next|previous } → { ok: true, action } as soon as
 * Spotify accepts the command, or 409 { error } (e.g. no active device).
 * Spotify only reflects a command in /me/player after a short lag, so instead
 * of sleeping and re-reading here (≈ +550 ms per click), the popup keeps its
 * optimistic state and reconciles with a GET a moment later.
 */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId, mark }) => {
    const body = await readBody(req);
    const action = String(body.action ?? "") as MusicAction;
    if (!ACTIONS.includes(action)) return json(req, { error: `action must be one of ${ACTIONS.join(", ")}` }, 400);
    const t = performance.now();
    const error = await runMusicCommand(db, userId, action);
    mark("spotify_cmd", performance.now() - t);
    if (error) return json(req, { error }, 409);
    return json(req, { ok: true, action });
  });
}

export const OPTIONS = preflight;
