"use client";

import { useCallback, useEffect } from "react";
import { installAudioUnlock, playSound } from "@/lib/audio/tones";
import { resolveSoundSettings, toneFor, type SoundKind, type SoundSettingsInput } from "@/lib/audio/sound-settings";

export function useNotifications(settings: (SoundSettingsInput & {
  dnd_during_focus: boolean;
  browser_notifs_enabled: boolean;
}) | null) {
  // Any interaction with the page unlocks audio, so a session that ends while
  // the tab is hidden can still play its sound.
  useEffect(() => installAudioUnlock(), []);

  const requestPermission = useCallback(async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  const notifyCompletion = useCallback(
    async (title: string, body: string, opts: { kind?: SoundKind; isDuringFocus?: boolean } = {}) => {
      const sound = resolveSoundSettings(settings);
      const dnd = settings?.dnd_during_focus ?? false;

      if (sound.enabled && (!dnd || !opts.isDuringFocus)) {
        const kind = opts.kind ?? "focus";
        void playSound(toneFor(kind, sound), { kind, volume: sound.volume }).catch(() => {});
      }

      if (
        settings?.browser_notifs_enabled &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag: "focusspace-timer",
        });
      }
    },
    [settings]
  );

  return { requestPermission, notifyCompletion };
}
