"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Opens a Document Picture-in-Picture window for the FocusSpace mini player.
 * Returns the live PiP window so consumers can render into it via createPortal.
 * Falls back gracefully (returns null) on browsers without the API.
 */
export function useMiniPlayer() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

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
    themeStyle.textContent = `:root { ${tokens.join(" ")} }`;
    pip.document.head.appendChild(themeStyle);

    // Match dark class on root
    if (document.documentElement.classList.contains("dark")) {
      pip.document.documentElement.classList.add("dark");
    }
  }, []);

  const open = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dpi = (window as any).documentPictureInPicture;
    if (!dpi) return false;
    try {
      const pip: Window = await dpi.requestWindow({ width: 320, height: 540 });
      cloneStyles(pip);
      pip.document.body.style.margin = "0";
      pip.document.body.style.background = "var(--color-background, #0f0e0d)";
      pip.document.body.style.color = "var(--color-on-surface, #fff)";
      pip.document.body.style.fontFamily = "var(--font-sans, system-ui)";
      pip.document.body.style.overflow = "hidden";
      pip.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(pip);
      return true;
    } catch {
      return false;
    }
  }, [cloneStyles]);

  const close = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  useEffect(() => {
    return () => { pipWindow?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pipWindow, open, close, isSupported: typeof window !== "undefined" && "documentPictureInPicture" in window };
}
