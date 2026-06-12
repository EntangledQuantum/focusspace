"use client";

import { AnimatedBackdrop } from "@/components/effects/AnimatedBackdrop";
import { getEffect, effectSettingsFor, type EffectSettings } from "@/lib/effects";

interface Props {
  effectId: string | null | undefined;
  settings: Record<string, Partial<EffectSettings>> | null | undefined;
}

/**
 * Renders the active live effect ON TOP of the wallpaper background.
 * Sits between the background (z-0) and the app content (z-10).
 */
export function EffectLayer({ effectId, settings }: Props) {
  const effect = getEffect(effectId);
  if (!effect) return null;

  const s = effectSettingsFor(effect.id, settings);

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
      <AnimatedBackdrop
        variant={effect.variant}
        intensity={s.intensity}
        speed={s.speed}
        density={s.density}
        className="absolute inset-0"
      />
    </div>
  );
}
