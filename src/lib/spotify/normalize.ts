/**
 * Normalisers for Spotify Web API objects whose shape changed in the
 * February 2026 Web API update (Development Mode apps; existing apps were
 * migrated 2026-03-09).
 *
 * Playlist objects renamed `tracks` → `items` (`tracks.total` → `items.total`,
 * `tracks.items[].track` → `items.items[].item`). The old `tracks` field is
 * documented as deprecated and is missing for migrated apps, which is why the
 * picker used to fall back to `0 tracks` for every playlist. For playlists the
 * user neither owns nor collaborates on, Spotify may omit `items` entirely, so
 * a count is not always available.
 */

interface CountRef {
  total?: unknown;
}

/** Playlist as returned by /me/playlists or /search, in either API shape. */
export interface PlaylistLike {
  items?: CountRef | unknown[] | null;
  tracks?: CountRef | null;
  owner?: { display_name?: string | null } | null;
}

function totalOf(ref: unknown): number | null {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return null;
  const total = (ref as CountRef).total;
  return typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : null;
}

/**
 * Number of items in a playlist, or `null` when the API didn't provide one.
 * Prefers the current `items.total`, falls back to the legacy `tracks.total`.
 * Never invents a number: callers should hide the count when this is null.
 */
export function playlistItemCount(p: PlaylistLike | null | undefined): number | null {
  if (!p) return null;
  return totalOf(p.items) ?? totalOf(p.tracks);
}

/** Subtitle for a playlist row: the real count when known, else the owner. */
export function playlistSubtitle(p: PlaylistLike | null | undefined): string | undefined {
  const count = playlistItemCount(p);
  if (count !== null) return `${count} ${count === 1 ? "track" : "tracks"}`;
  const owner = p?.owner?.display_name;
  return owner ? `By ${owner}` : undefined;
}
