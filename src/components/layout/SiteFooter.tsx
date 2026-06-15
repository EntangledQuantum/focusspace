import Link from "next/link";

export const REPO_URL = "https://github.com/EntangledQuantum/focusspace";
export const ISSUES_URL = `${REPO_URL}/issues`;
export const CONTACT_EMAIL = "shahzadtechworld@gmail.com";

export function GithubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.71-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.21.7.82.58A12.01 12.01 0 0 0 24 12.29C24 5.78 18.63.5 12 .5z" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-10 w-full" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <div
        className="mx-auto w-full flex flex-col sm:flex-row items-center justify-between"
        style={{ maxWidth: 980, gap: 16, padding: "24px 20px 30px" }}
      >
        <div className="flex flex-col items-center sm:items-start" style={{ gap: 4 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: "var(--color-on-surface)" }}>
            FocusSpace
          </span>
          <span style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.75 }}>
            © 2026 · Open source · Built for deep work
          </span>
        </div>

        <nav className="flex items-center flex-wrap justify-center" style={{ gap: 18 }}>
          <Link href="/privacy" className="hover:underline" style={{ fontSize: 13, color: "var(--color-on-surface-variant)" }}>
            Privacy
          </Link>
          <Link href="/terms" className="hover:underline" style={{ fontSize: 13, color: "var(--color-on-surface-variant)" }}>
            Terms
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline" style={{ fontSize: 13, color: "var(--color-on-surface-variant)" }}>
            Contact
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="icon-btn"
            title="View source on GitHub"
            style={{ width: 34, height: 34, color: "var(--color-on-surface)" }}
          >
            <GithubMark size={18} />
          </a>
        </nav>
      </div>
    </footer>
  );
}
