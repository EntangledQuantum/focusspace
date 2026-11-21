"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAIPanel } from "@/lib/stores/ai";

// The chat panel (AI SDK, markdown, tool cards) is only downloaded — and only
// fetches anything — after the user first opens it.
const AIChatPanel = dynamic(() => import("./AIChatPanel").then((m) => m.AIChatPanel), {
  ssr: false,
  loading: () => (
    <div className="glass fixed top-0 right-0 h-dvh z-[70] flex items-center justify-center" style={{ width: "min(440px, 100vw)", borderRadius: "24px 0 0 24px" }}>
      <span className="animate-pulse" style={{ fontSize: 13, color: "var(--color-on-surface-variant)" }}>Opening Focus AI…</span>
    </div>
  ),
});

const AI_BUILD_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "true";

/**
 * One Focus AI entry point for every app tab: a floating button that opens
 * the global chat panel. Mounted once in the app shell.
 *
 * Placement: bottom-right, clear of the centered Spotify mini bar. On /focus
 * the dock spans the bottom on narrower screens, so the button sits above it
 * until the viewport is wide enough (≥1040px) for the corner to be free.
 */
export function AILauncher({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const open = useAIPanel((s) => s.open);
  const openPanel = useAIPanel((s) => s.openPanel);
  const close = useAIPanel((s) => s.close);
  const mounted = useAIPanel((s) => s.opened);

  // Close if AI gets switched off while open.
  useEffect(() => { if (!enabled && open) close(); }, [enabled, open, close]);

  if (!AI_BUILD_ENABLED || !enabled) return null;

  const onFocus = pathname === "/focus";
  const position = onFocus
    ? "right-4 bottom-[236px] min-[1040px]:right-6 min-[1040px]:bottom-6"
    : "right-4 bottom-[88px] sm:right-6 sm:bottom-6";

  return (
    <>
      {!open && (
        <button
          onClick={() => openPanel()}
          className={`ai-fab fixed z-[60] flex items-center justify-center hover-lift ${position}`}
          title="Focus AI"
          aria-label="Open Focus AI"
          style={{
            width: 52, height: 52, borderRadius: 18,
            background: "color-mix(in srgb, var(--color-surface-container-high) 70%, transparent)",
            backdropFilter: "blur(20px) saturate(140%)",
            WebkitBackdropFilter: "blur(20px) saturate(140%)",
            border: "1px solid color-mix(in srgb, var(--color-primary) 45%, transparent)",
            boxShadow: "0 10px 30px -10px color-mix(in srgb, var(--color-primary) 70%, transparent), 0 4px 18px rgba(0,0,0,0.35)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/focus-ai.png" alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
        </button>
      )}
      {mounted && <AIChatPanel open={open} onClose={close} />}
    </>
  );
}
