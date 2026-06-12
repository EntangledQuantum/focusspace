"use client";

import { useCallback } from "react";
import { useMiniPlayerStore } from "@/lib/stores/miniplayer";

/**
 * Opens a Document Picture-in-Picture window for the FocusSpace mini player.
 * The window handle lives in a global store so the portal host (in app layout)
 * keeps rendering into it across route changes.
 * Falls back gracefully (open() returns false) on browsers without the API.
 */
export function useMiniPlayer() {
  const { pipWindow, setPipWindow } = useMiniPlayerStore();

  // Copy current document stylesheets into the pip window so Tailwind + tokens apply
  const cloneStyles = useCallback((pip: Window) => {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules).map((r) => r.cssText).join("");
        const style = pip.document.createElement("style");
        style.textContent = rules;
        pip.document.head.appendChild(style);
      } catch {
        // CORS-blocked stylesheet → link to the original
        if (sheet.href) {
          const link = pip.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          pip.document.head.appendChild(link);
        }
      }
    }
    // Copy CSS variables (theme tokens live on :root)
    const rootStyles = window.getComputedStyle(document.documentElement);
    const themeStyle = pip.document.createElement("style");
    const tokens: string[] = [];
    for (let i = 0; i < rootStyles.length; i++) {
      const prop = rootStyles[i];
      if (prop.startsWith("--")) tokens.push(`${prop}: ${rootStyles.getPropertyValue(prop)};`);
    }
    themeStyle.textContent = `:root { ${tokens.join(" ")} } body { margin: 0; background: var(--color-background, #0f0e0d); color: var(--color-on-surface, #fff); font-family: var(--font-sans, system-ui); overflow: hidden; }`;
    pip.document.head.appendChild(themeStyle);

    // Match dark class on root
    if (document.documentElement.classList.contains("dark")) {
      pip.document.documentElement.classList.add("dark");
    }
  }, []);

  const open = useCallback(async () => {
    if (pipWindow) {
      pipWindow.focus();
      return true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dpi = (window as any).documentPictureInPicture;
    if (!dpi) return false;
    try {
      const pip: Window = await dpi.requestWindow({ width: 300, height: 400 });
      cloneStyles(pip);
      pip.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(pip);
      return true;
    } catch {
      return false;
    }
  }, [pipWindow, setPipWindow, cloneStyles]);

  const close = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow, setPipWindow]);

  return {
    pipWindow,
    open,
    close,
    isSupported: typeof window !== "undefined" && "documentPictureInPicture" in window,
  };
}
