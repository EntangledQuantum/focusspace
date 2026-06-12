"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Wallpaper } from "@/types/database";

/** CSS-mesh background presets. `id` is stored in wallpaper.storage_path. */
export const MESH_WALLPAPERS = [
  { id: "wp-aurora", name: "Aurora" },   // pink → purple → indigo (default)
  { id: "wp-dusk",   name: "Dusk" },     // warm pink / coral / violet
  { id: "wp-mist",   name: "Mist" },     // cool blue / lilac / teal
  { id: "wp-noir",   name: "Noir" },     // near-black, minimal
] as const;

/** Old solid/gradient preset ids → fall back to the default mesh. */
export const LEGACY_WALLPAPER_IDS = new Set([
  "pitch-black", "deep-ocean", "forest-night", "ember", "midnight", "slate",
]);

/** Animated presets used to be backgrounds; they're now live effects. Map the
 *  old ids onto a sensible mesh base so existing rows still render a background. */
const LEGACY_ANIM_BASE: Record<string, string> = {
  "wp-anim-aurora": "wp-noir",
  "wp-anim-rain": "wp-mist",
  "wp-anim-snow": "wp-mist",
  "wp-anim-stars": "wp-noir",
  "wp-anim-fireflies": "wp-dusk",
};

export function isBuiltinWallpaperId(id: string) {
  return (
    MESH_WALLPAPERS.some((w) => w.id === id) ||
    LEGACY_WALLPAPER_IDS.has(id) ||
    id in LEGACY_ANIM_BASE
  );
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
  const legacyAnimBase = LEGACY_ANIM_BASE[path];

  // ── Preset (CSS-mesh) background ────────────────────────────────────────
  if (!wallpaper || preset || isLegacy || legacyAnimBase) {
    const cls = preset?.id ?? legacyAnimBase ?? "wp-aurora";
    return (
      <div className={`fixed inset-0 z-0 pointer-events-none transition-colors duration-700 ${cls}`} />
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
    </div>
  );
}
