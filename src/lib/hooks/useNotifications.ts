"use client";

import { useCallback } from "react";
import { playTone } from "@/lib/audio/tones";

export function useNotifications(settings: {
  dnd_during_focus: boolean;
  browser_notifs_enabled: boolean;
  completion_tone: string;
} | null) {
  const requestPermission = useCallback(async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  const notifyCompletion = useCallback(
    async (title: string, body: string, isDuringFocus = false) => {
      const tone = settings?.completion_tone ?? "soft-chime";
      const dnd = settings?.dnd_during_focus ?? false;

      if (!dnd || !isDuringFocus) {
        await playTone(tone).catch(() => {});
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
