"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Wallpaper } from "@/types/database";

export const SOLID_WALLPAPERS = [
  { id: "pitch-black",  name: "Pitch Black",   css: "#0a0a0a" },
  { id: "deep-ocean",   name: "Deep Ocean",    css: "linear-gradient(135deg, #0c1a3a 0%, #0d2b4f 50%, #0a1528 100%)" },
  { id: "forest-night", name: "Forest Night",  css: "linear-gradient(135deg, #0d1f0e 0%, #152a16 60%, #0a150b 100%)" },
  { id: "ember",        name: "Ember",         css: "linear-gradient(135deg, #1a0a05 0%, #2a1008 60%, #120604 100%)" },
  { id: "midnight",     name: "Midnight",      css: "linear-gradient(135deg, #0d0d1a 0%, #151530 60%, #080810 100%)" },
  { id: "slate",        name: "Slate",         css: "linear-gradient(135deg, #111418 0%, #1a2128 60%, #0c1014 100%)" },
];

interface Props {
  wallpaper: Wallpaper | null;
  supabaseUrl?: string;
  blur?: number;
  opacity?: number;
}

export function WallpaperRenderer({ wallpaper, supabaseUrl, blur = 60, opacity = 40 }: Props) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setLoaded(false); }, [wallpaper?.id]);

  const solid = SOLID_WALLPAPERS.find((w) => w.id === wallpaper?.storage_path);

  if (!wallpaper || solid) {
    return (
      <div
        className="fixed inset-0 z-0 pointer-events-none transition-all duration-700"
        style={{ background: solid?.css ?? "#131313" }}
      />
    );
  }

  const imageUrl = wallpaper.storage_path.startsWith("http")
    ? wallpaper.storage_path
    : `${supabaseUrl}/storage/v1/object/public/wallpapers/${wallpaper.storage_path}`;

  const blurPx = (blur / 100) * 32;
  const brightness = (opacity / 100) * 0.75;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <Image
        src={imageUrl}
        alt={wallpaper.name}
        fill
        priority
        className="object-cover"
        style={{
          filter: `blur(${blurPx.toFixed(1)}px) brightness(${brightness.toFixed(2)})`,
          transform: "scale(1.08)",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.8s ease",
        }}
        onLoad={() => setLoaded(true)}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.5) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, var(--color-background) 0%, color-mix(in srgb, var(--color-background) 50%, transparent) 35%, transparent 65%)",
        }}
      />
    </div>
  );
}
