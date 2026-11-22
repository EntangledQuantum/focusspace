import type { NextRequest } from "next/server";
import { json, preflight, readBody, withExtension } from "@/lib/extension/http";
import { getUserSpotifyAccessToken, spotifyUserFetch } from "@/lib/spotify/server";
import { runPlaybackForUser } from "@/lib/spotify/playback";

const TYPES = ["track", "playlist", "album", "artist"] as const;
type SearchType = (typeof TYPES)[number];

interface Item {
  name?: string;
  uri?: string;
  artists?: { name: string }[];
  owner?: { display_name?: string };
  images?: { url: string; width?: number | null }[];
  album?: { images?: { url: string; width?: number | null }[] };
  tracks?: { total?: number };
  items?: { total?: number };
}

const art = (imgs?: { url: string; width?: number | null }[]) =>
  imgs?.length ? ([...imgs].reverse().find((i) => (i.width ?? 0) >= 64) ?? imgs[0]).url : null;

/** GET ?q=&type=track|playlist|album|artist → up to 10 results (Spotify's /search maximum). */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    const type = (TYPES as readonly string[]).includes(req.nextUrl.searchParams.get("type") ?? "")
      ? (req.nextUrl.searchParams.get("type") as SearchType)
      : "track";
    if (!q) return json(req, { results: [] });
    const auth = await getUserSpotifyAccessToken(db, userId);
    if ("error" in auth) return json(req, { error: auth.error }, 409);
    const res = await spotifyUserFetch(auth.token, "/search", { params: { q, type, limit: "10" } });
    if (!res.ok) return json(req, { error: `Spotify search failed (${res.status}).` }, 409);
    const items = ((res.json as Record<string, { items?: (Item | null)[] }>)?.[`${type}s`]?.items ?? []).filter(Boolean) as Item[];
    return json(req, {
      results: items.filter((i) => i.uri).map((i) => ({
        uri: i.uri!,
        name: i.name ?? "Untitled",
        type,
        subtitle: i.artists?.map((a) => a.name).join(", ") || i.owner?.display_name || "",
        artUrl: art(i.images ?? i.album?.images),
      })),
    });
  });
}

/** POST { uri, label? } → play a track / album / playlist / artist on the user's active (or best) device. */
export async function POST(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const body = await readBody(req);
    const uri = typeof body.uri === "string" && /^spotify:(track|album|playlist|artist):[A-Za-z0-9]+$/.test(body.uri) ? body.uri : null;
    if (!uri) return json(req, { error: "A spotify: uri is required." }, 400);
    const label = typeof body.label === "string" ? body.label.slice(0, 120) : undefined;
    const result = await runPlaybackForUser(db, userId, { kind: "play", uri, label });
    if (!result.ok) return json(req, { error: result.message }, 409);
    return json(req, { ok: true, message: result.message, device: result.device });
  });
}

export const OPTIONS = preflight;
