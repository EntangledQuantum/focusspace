"use client";

/* ════════════════════════════════════════════════════════════════════════
   DROP-IN ➋ — WallpaperRenderer.tsx  (replaces src/components/layout/WallpaperRenderer.tsx)

   WHAT CHANGED vs the old file
   • SOLID_WALLPAPERS → MESH_WALLPAPERS: the 5 CSS-mesh presets you approved.
     Each preset now renders as a `className` (wp-aurora, …) defined in
     globals.css, so the .light variants swap automatically with the theme.
   • Removed the radial vignette overlay AND the tall
     `linear-gradient(to top, var(--color-background) …)` overlay — that's the
     "unnecessary gradient from below" you wanted gone. A single gentle
     bottom scrim (`.wallpaper-scrim`) keeps dock text legible.
   • `tint` + `blur` now come from the user's live sliders; for an UPLOADED
     photo they drive blur/brightness, exactly like before.
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Wallpaper } from "@/types/database";

/** The new presets. `id` is stored in wallpaper.storage_path just like the old
 *  solid ids, so no DB migration is required — only the option list changes. */
export const MESH_WALLPAPERS = [
  { id: "wp-aurora", name: "Aurora" },   // pink → purple → indigo (default)
  { id: "wp-dusk",   name: "Dusk" },     // warm pink / coral / violet
  { id: "wp-mist",   name: "Mist" },     // cool blue / lilac / teal
  { id: "wp-noir",   name: "Noir" },     // near-black, minimal
  { id: "wp-photo",  name: "Your photo" },// striped placeholder slot
] as const;

interface Props {
  wallpaper: Wallpaper | null;
  supabaseUrl?: string;
  /** 0–100 from the user's "Blur" slider */
  blur?: number;
  /** 0–100 from the user's "Tint" slider (photo brightness) */
  opacity?: number;
}

export function WallpaperRenderer({ wallpaper, supabaseUrl, blur = 60, opacity = 50 }: Props) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [wallpaper?.id]);

  const preset = MESH_WALLPAPERS.find((w) => w.id === wallpaper?.storage_path);

  // ── Preset (CSS-mesh) wallpaper ───────────────────────────────────────────
  if (!wallpaper || preset) {
    return (
      <div className={`wallpaper fixed inset-0 z-0 pointer-events-none ${preset?.id ?? "wp-aurora"}`}>
        <div className="wallpaper-scrim" />
      </div>
    );
  }

  // ── Uploaded photo wallpaper ──────────────────────────────────────────────
  const imageUrl = wallpaper.storage_path.startsWith("http")
    ? wallpaper.storage_path
    : `${supabaseUrl}/storage/v1/object/public/wallpapers/${wallpaper.storage_path}`;

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
      {/* single gentle bottom scrim — NO radial vignette, NO tall top gradient */}
      <div className="wallpaper-scrim" />
    </div>
  );
}
