"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Wallpaper } from "@/types/database";

/** CSS-mesh presets. `id` is stored in wallpaper.storage_path just like the old
 *  solid ids, so no DB migration is required — only the option list changed. */
export const MESH_WALLPAPERS = [
  { id: "wp-aurora", name: "Aurora" },   // pink → purple → indigo (default)
  { id: "wp-dusk",   name: "Dusk" },     // warm pink / coral / violet
  { id: "wp-mist",   name: "Mist" },     // cool blue / lilac / teal
  { id: "wp-noir",   name: "Noir" },     // near-black, minimal
] as const;

/** Old solid/gradient preset ids — rows that still point at one of these
 *  fall back to the default mesh. */
export const LEGACY_WALLPAPER_IDS = new Set([
  "pitch-black", "deep-ocean", "forest-night", "ember", "midnight", "slate",
]);

export function isBuiltinWallpaperId(id: string) {
  return MESH_WALLPAPERS.some((w) => w.id === id) || LEGACY_WALLPAPER_IDS.has(id);
}

interface Props {
  wallpaper: Wallpaper | null;
  supabaseUrl?: string;
  /** 0–100 from the photo "Blur" slider */
  blur?: number;
  /** 0–100 from the photo "Brightness" slider */
  opacity?: number;
}

export function WallpaperRenderer({ wallpaper, supabaseUrl, blur = 60, opacity = 50 }: Props) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [wallpaper?.id]);

  const path = wallpaper?.storage_path ?? "";
  const preset = MESH_WALLPAPERS.find((w) => w.id === path);
  const isLegacy = LEGACY_WALLPAPER_IDS.has(path);

  // ── Preset (CSS-mesh) wallpaper ─────────────────────────────────────────
  if (!wallpaper || preset || isLegacy) {
    return (
      <div className={`fixed inset-0 z-0 pointer-events-none transition-colors duration-700 ${preset?.id ?? "wp-aurora"}`}>
        <div className="wallpaper-scrim" />
      </div>
    );
  }

  // ── Uploaded photo wallpaper ────────────────────────────────────────────
  const imageUrl = path.startsWith("http")
    ? path
    : `${supabaseUrl}/storage/v1/object/public/wallpapers/${path}`;

  const blurPx = (blur / 100) * 32;
  const brightness = 0.35 + (opacity / 100) * 0.55;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <Image
        src={imageUrl}
        alt={wallpaper.name}
        fill priority quality={90} sizes="100vw"
        className="object-cover"
        style={{
          filter: `blur(${blurPx.toFixed(1)}px) brightness(${brightness.toFixed(2)})`,
          transform: "scale(1.08)",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.8s ease",
        }}
        onLoad={() => setLoaded(true)}
      />
      {/* single gentle bottom scrim — no radial vignette, no tall top gradient */}
      <div className="wallpaper-scrim" />
    </div>
  );
}
