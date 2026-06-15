import Link from "next/link";
import Image from "next/image";
import appIcon from "@/app/icon.png";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteFooter, GithubMark, REPO_URL } from "@/components/layout/SiteFooter";

export function OpenSourceCard() {
  return (
    <div
      className="glass relative overflow-hidden"
      style={{ borderRadius: 18, padding: 20, margin: "24px 0" }}
    >
      <div className="flex flex-col sm:flex-row items-center" style={{ gap: 16 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 52, height: 52, borderRadius: 14, background: "color-mix(in srgb, var(--color-primary) 14%, transparent)", color: "var(--color-on-surface)" }}
        >
          <GithubMark size={26} />
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color: "var(--color-on-surface)" }}>
            FocusSpace is fully open source
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-on-surface-variant)", marginTop: 4 }}>
            Every line of code — including exactly how your data is stored and handled — is public.
            Read it, audit it, self-host it, or contribute on GitHub.
          </p>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="pill grad-primary hover-lift shrink-0"
          style={{ padding: "10px 16px", fontSize: 13.5, fontWeight: 700, color: "var(--color-on-primary)" }}
        >
          View on GitHub <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-dvh overflow-y-auto overflow-x-hidden">
      {/* Subtle modern backdrop */}
      <div className="wp-aurora fixed inset-0 z-0" style={{ opacity: 0.45 }} />

      <div className="relative z-10 min-h-dvh flex flex-col">
        {/* Header */}
        <header className="flex justify-center w-full" style={{ padding: "16px 18px" }}>
          <div className="flex items-center w-full" style={{ maxWidth: 980, gap: 12 }}>
            <Link href="/" className="flex items-center" style={{ gap: 10 }}>
              <Image src={appIcon} alt="FocusSpace" width={30} height={30} className="rounded-[9px]" />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15.5, color: "var(--color-on-surface)" }}>
                FocusSpace
              </span>
            </Link>
            <div className="flex-1" />
            <Link
              href="/"
              className="pill hover-lift"
              style={{
                padding: "8px 15px", fontSize: 13, color: "var(--color-on-surface)",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <ArrowLeft size={14} /> Home
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 mx-auto w-full" style={{ maxWidth: 820, padding: "32px 20px 56px" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px, 5vw, 42px)", fontWeight: 800, letterSpacing: "-.02em", color: "var(--color-on-surface)" }}>
            {title}
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-on-surface-variant)", opacity: 0.75, marginTop: 8 }}>
            Last updated {updated}
          </p>

          <OpenSourceCard />

          <div className="legal-prose">{children}</div>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
