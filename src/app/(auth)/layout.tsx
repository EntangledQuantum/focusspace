import Link from "next/link";
import { AnimatedBackdrop } from "@/components/effects/AnimatedBackdrop";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-dvh overflow-y-auto overflow-x-hidden">
      {/* Living background shared by login + signup */}
      <div className="wp-noir fixed inset-0 z-0">
        <AnimatedBackdrop variant="aurora" className="absolute inset-0" />
        <div className="wallpaper-scrim" />
      </div>

      {/* Brand — back to the landing page */}
      <Link
        href="/"
        className="fixed z-50 flex items-center"
        style={{ top: 22, left: 24, gap: 10 }}
      >
        <div
          className="grad-primary shrink-0"
          style={{
            width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
            boxShadow: "0 4px 16px color-mix(in srgb, var(--color-primary) 45%, transparent)",
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.95)" }} />
        </div>
        <span
          style={{
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16,
            letterSpacing: "-.01em", color: "var(--color-on-surface)",
          }}
        >
          FocusSpace
        </span>
      </Link>

      <div className="relative z-10 min-h-dvh">{children}</div>
    </div>
  );
}
