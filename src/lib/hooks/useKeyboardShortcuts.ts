"use client";

import { useEffect } from "react";

interface Shortcuts {
  onPlayPause: () => void;
  onReset: () => void;
  onSkip: () => void;
}

export function useKeyboardShortcuts({ onPlayPause, onReset, onSkip }: Shortcuts) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't fire when typing in inputs
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) return;

      if (e.code === "Space") { e.preventDefault(); onPlayPause(); }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); onReset(); }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); onSkip(); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPlayPause, onReset, onSkip]);
}
