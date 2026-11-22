import type { NextRequest } from "next/server";
import { json, preflight, readBody, withExtension } from "@/lib/extension/http";
import { getMusicState, runMusicCommand, type MusicAction, type MusicState } from "@/lib/extension/music";

const ACTIONS: MusicAction[] = ["play", "pause", "next", "previous"];

/**
 * Spotify's own player (/me/player) is the single source of truth for music —
 * every client (site tabs, popup, side panel) reads it through here. A short
 * per-user cache keeps N polling clients from multiplying Spotify calls, and a
 * content version lets them poll cheaply (`?since=` → { unchanged: true }).
 * Commands clear the cache so the next read is fresh.
 */
const CACHE_MS = 2500;
const cache = new Map<string, { at: number; state: MusicState; version: string }>();

function versionOf(s: MusicState): string {
  const t = s.track;
  return [s.connected ? 1 : 0, s.isPlaying ? 1 : 0, s.device ?? "", t?.name ?? "", t?.artists ?? "", s.message ?? ""].join("|");
}

async function readMusic(db: Parameters<typeof getMusicState>[0], userId: string) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const state = await getMusicState(db, userId);
  const entry = { at: Date.now(), state, version: versionOf(state) };
  if (cache.size > 1000) cache.clear();
  cache.set(userId, entry);
  return entry;
}

/** What Spotify is playing right now (+ `version`; `?since=<version>` → { unchanged: true }). */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId, mark }) => {
    const t = performance.now();
    const { state, version } = await readMusic(db, userId);
    mark("spotify_state", performance.now() - t);
    if (req.nextUrl.searchParams.get("since") === version) return json(req, { unchanged: true, version });
    return json(req, { ...state, version });
  }, { allowCookie: true });
}

/**
 * POST { action: play|pause|next|previous } → { ok: true, action } as soon as
 * Spotify accepts the command, or 409 { error } (e.g. no active device).
 * Spotify only reflects a command in /me/player after a short lag, so instead
 * of sleeping and re-reading here, clients keep their optimistic state and
 * reconcile with a GET a moment later.
 */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId, mark }) => {
    const body = await readBody(req);
    const action = String(body.action ?? "") as MusicAction;
    if (!ACTIONS.includes(action)) return json(req, { error: `action must be one of ${ACTIONS.join(", ")}` }, 400);
    const t = performance.now();
    const error = await runMusicCommand(db, userId, action);
    mark("spotify_cmd", performance.now() - t);
    cache.delete(userId);
    if (error) return json(req, { error }, 409);
    return json(req, { ok: true, action });
  }, { allowCookie: true });
}

export const OPTIONS = preflight;
