"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { spotifyJson } from "@/lib/spotify/api";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Music, ListMusic, Disc3, User, Library, Sparkles } from "lucide-react";
import type { PlayableContext } from "@/lib/context/SpotifyContext";

type Tab = "all" | "track" | "album" | "artist" | "playlist" | "library";

interface Row extends PlayableContext {
  imageUrl?: string;
  subtitle?: string;
}

interface Section {
  key: string;
  label: string;
  rows: Row[];
}

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "all",      label: "All",       icon: Sparkles },
  { id: "track",    label: "Songs",     icon: Music },
  { id: "album",    label: "Albums",    icon: Disc3 },
  { id: "artist",   label: "Artists",   icon: User },
  { id: "playlist", label: "Playlists", icon: ListMusic },
  { id: "library",  label: "Library",   icon: Library },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
const img = (images: any[] | undefined) => images?.[images.length > 2 ? 1 : 0]?.url ?? images?.[0]?.url;
const artistNames = (arr: any[] | undefined) => (arr ?? []).map((a) => a.name).join(", ");

function trackRow(t: any): Row {
  return { uri: t.uri, name: t.name, type: "track", imageUrl: img(t.album?.images), subtitle: artistNames(t.artists) };
}
function albumRow(a: any): Row {
  return { uri: a.uri, name: a.name, type: "album", imageUrl: img(a.images), subtitle: artistNames(a.artists) };
}
function artistRow(a: any): Row {
  return { uri: a.uri, name: a.name, type: "artist", imageUrl: img(a.images), subtitle: a.genres?.[0] ?? "Artist" };
}
function playlistRow(p: any): Row {
  return { uri: p.uri, name: p.name, type: "playlist", imageUrl: img(p.images), subtitle: `${p.tracks?.total ?? 0} tracks` };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Big Spotify browser + unified search, opened from "Choose music".
 * Empty query → recommended/browse content; typing searches the catalog.
 * Search limit is capped at 10 per type — Spotify's /search rejects more (400).
 */
export function MusicPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (ctx: PlayableContext) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");

  // debounce the search query
  useEffect(() => {
    const id = setTimeout(() => setQuery(raw.trim()), 350);
    return () => clearTimeout(id);
  }, [raw]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Browse data (recommendations) — loaded once while the modal is open ──
  const { data: browse } = useQuery({
    queryKey: ["spotify-browse"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const [playlists, recent, topArtists, topTracks, saved] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spotifyJson<{ items: any[] }>("/me/playlists", { params: { limit: "50" } }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spotifyJson<{ items: any[] }>("/me/player/recently-played", { params: { limit: "50" } }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spotifyJson<{ items: any[] }>("/me/top/artists", { params: { limit: "20" } }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spotifyJson<{ items: any[] }>("/me/top/tracks", { params: { limit: "20" } }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spotifyJson<{ items: any[] }>("/me/tracks", { params: { limit: "50" } }),
      ]);
      const playlistRows = (playlists?.items ?? []).filter(Boolean).map(playlistRow);
      const recentTracks = (recent?.items ?? []).map((i) => i.track).filter(Boolean);
      // dedupe recently-played by track id
      const seen = new Set<string>();
      const recentRows: Row[] = [];
      for (const t of recentTracks) {
        if (t.id && !seen.has(t.id)) { seen.add(t.id); recentRows.push(trackRow(t)); }
      }
      const topArtistRows = (topArtists?.items ?? []).filter(Boolean).map(artistRow);
      const topTrackRows = (topTracks?.items ?? []).filter(Boolean).map(trackRow);
      const savedRows = (saved?.items ?? []).map((i) => i.track).filter(Boolean).map(trackRow);
      // albums derived from top + saved tracks, deduped
      const albumSeen = new Set<string>();
      const albumRows: Row[] = [];
      for (const t of [...(topTracks?.items ?? []), ...(saved?.items ?? []).map((i: { track: unknown }) => i.track)]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const al = (t as any)?.album;
        if (al?.id && !albumSeen.has(al.id)) { albumSeen.add(al.id); albumRows.push(albumRow(al)); }
      }
      return { playlistRows, recentRows, topArtistRows, topTrackRows, savedRows, albumRows };
    },
  });

  // ── Search results ──────────────────────────────────────────────────────
  const searchType = tab === "all" ? "album,artist,playlist,track" : tab === "library" ? "track" : tab;
  const { data: searchData, isFetching: searching, error: searchErr } = useQuery({
    queryKey: ["spotify-search", searchType, query],
    enabled: open && query.length > 0 && tab !== "library",
    staleTime: 30_000,
    queryFn: async () => {
      // Spotify caps /search limit at 10 per type — more returns 400.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await spotifyJson<any>("/search", { params: { q: query, type: searchType, limit: "10" } });
      if (!data) throw new Error("search-failed");
      return data;
    },
  });

  const sections: Section[] = useMemo(() => {
    const out: Section[] = [];
    const q = query.toLowerCase();

    // ── With a query ──
    if (query && tab !== "library") {
      if (!searchData) return out;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = searchData as any;
      if (tab === "all" || tab === "track") {
        const rows = (d.tracks?.items ?? []).filter(Boolean).map(trackRow);
        if (rows.length) out.push({ key: "tracks", label: "Songs", rows });
      }
      if (tab === "all" || tab === "artist") {
        const rows = (d.artists?.items ?? []).filter(Boolean).map(artistRow);
        if (rows.length) out.push({ key: "artists", label: "Artists", rows });
      }
      if (tab === "all" || tab === "album") {
        const rows = (d.albums?.items ?? []).filter(Boolean).map(albumRow);
        if (rows.length) out.push({ key: "albums", label: "Albums", rows });
      }
      if (tab === "all" || tab === "playlist") {
        const rows = (d.playlists?.items ?? []).filter(Boolean).map(playlistRow);
        if (rows.length) out.push({ key: "playlists", label: "Playlists", rows });
      }
      return out;
    }

    // ── Library tab (client-side filter on saved + playlists) ──
    if (tab === "library") {
      const saved = (browse?.savedRows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
      const pls = (browse?.playlistRows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
      if (saved.length) out.push({ key: "saved", label: "Saved songs", rows: saved });
      if (pls.length) out.push({ key: "pls", label: "Your playlists", rows: pls });
      return out;
    }

    // ── Empty query → browse / recommendations per tab ──
    if (!browse) return out;
    if (tab === "all") {
      if (browse.recentRows.length) out.push({ key: "recent", label: "Jump back in", rows: browse.recentRows.slice(0, 8) });
      if (browse.playlistRows.length) out.push({ key: "pls", label: "Your playlists", rows: browse.playlistRows.slice(0, 8) });
      if (browse.topArtistRows.length) out.push({ key: "art", label: "Your top artists", rows: browse.topArtistRows.slice(0, 8) });
    } else if (tab === "track") {
      if (browse.recentRows.length) out.push({ key: "recent", label: "Recently played", rows: browse.recentRows });
      if (browse.topTrackRows.length) out.push({ key: "top", label: "Your top songs", rows: browse.topTrackRows });
    } else if (tab === "album") {
      if (browse.albumRows.length) out.push({ key: "albums", label: "From your library", rows: browse.albumRows });
    } else if (tab === "artist") {
      if (browse.topArtistRows.length) out.push({ key: "art", label: "Your top artists", rows: browse.topArtistRows });
    } else if (tab === "playlist") {
      if (browse.playlistRows.length) out.push({ key: "pls", label: "Your playlists", rows: browse.playlistRows });
    }
    return out;
  }, [query, tab, searchData, browse]);

  const showSearchingHint = query && tab !== "library" && searching && sections.length === 0;
  const showError = query && tab !== "library" && !!searchErr;
  const showEmpty = !showSearchingHint && !showError && sections.length === 0;

  // Portal to <body>: the dock is inside a transformed ancestor, which would
  // otherwise hijack this fixed-position modal's containing block.
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90]"
            style={{ background: "rgba(5,3,8,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 z-[91] w-full -translate-x-1/2 overflow-hidden flex flex-col"
            style={{
              top: "9vh", maxWidth: 620, maxHeight: "78vh",
              borderRadius: 24,
              background: "color-mix(in srgb, var(--color-surface-container) 94%, transparent)",
              backdropFilter: "blur(28px) saturate(140%)",
              WebkitBackdropFilter: "blur(28px) saturate(140%)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 40px 90px -24px rgba(0,0,0,0.7)",
            }}
          >
            {/* Search bar */}
            <div className="flex items-center" style={{ gap: 10, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <Search size={17} style={{ color: "var(--color-on-surface-variant)", opacity: 0.7 }} />
              <input
                autoFocus
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="Search songs, albums, artists, playlists…"
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 15, color: "var(--color-on-surface)" }}
              />
              <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center flex-wrap" style={{ gap: 6, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {TABS.map((t) => {
                const on = tab === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="pill"
                    style={{
                      padding: "6px 12px", fontSize: 12,
                      color: on ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                      background: on ? "color-mix(in srgb, var(--color-primary) 14%, transparent)" : "rgba(255,255,255,0.04)",
                      border: on ? "1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)" : "1px solid transparent",
                    }}
                  >
                    <Icon size={13} /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* Results */}
            <div className="no-scrollbar overflow-y-auto" style={{ padding: 10, flex: 1 }}>
              {showSearchingHint ? (
                <div className="py-12 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>Searching…</div>
              ) : showError ? (
                <div className="py-12 text-center text-sm" style={{ color: "var(--color-error)" }}>
                  Search failed — reconnect Spotify in Settings if this persists.
                </div>
              ) : showEmpty ? (
                <div className="py-12 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                  {query ? "No results." : "Nothing here yet — try searching."}
                </div>
              ) : (
                sections.map((section) => (
                  <div key={section.key} style={{ marginBottom: 10 }}>
                    <p className="uppercase" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: "var(--color-on-surface-variant)", opacity: 0.8, padding: "8px 10px 6px" }}>
                      {section.label}
                    </p>
                    {section.rows.map((row, i) => (
                      <button
                        key={`${section.key}-${row.uri}-${i}`}
                        onClick={() => { onSelect(row); onClose(); }}
                        className="w-full flex items-center text-left transition-colors hover:bg-white/5"
                        style={{ gap: 12, padding: "9px 10px", borderRadius: 12 }}
                      >
                        {row.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.imageUrl}
                            alt={row.name}
                            className="shrink-0 object-cover"
                            style={{ width: 42, height: 42, borderRadius: row.type === "artist" ? "50%" : 9 }}
                          />
                        ) : (
                          <div
                            className="shrink-0 flex items-center justify-center"
                            style={{ width: 42, height: 42, borderRadius: row.type === "artist" ? "50%" : 9, background: "var(--color-surface-container-highest)" }}
                          >
                            <Music size={16} style={{ color: "var(--color-on-surface-variant)" }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: "var(--color-on-surface)" }}>{row.name}</p>
                          {row.subtitle && (
                            <p className="truncate" style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.8, marginTop: 1 }}>
                              {row.subtitle}
                            </p>
                          )}
                        </div>
                        <span
                          className="shrink-0 uppercase"
                          style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: "var(--color-on-surface-variant)", opacity: 0.5 }}
                        >
                          {row.type}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
