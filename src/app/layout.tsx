import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FocusSpace — Deep Work Timer",
  description: "A focused Pomodoro & productivity tracker to get shit done.",
};

// Injected raw (not via the imported CSS file) so the build's CSS minifier
// (Lightning CSS) can't strip the unprefixed `backdrop-filter` — it collapses
// it to only `-webkit-backdrop-filter`, which the newest Chromium ignores.
// See globals.css `.glass`.
const GLASS_BACKDROP_CSS = `
.glass{-webkit-backdrop-filter:blur(var(--glass-blur)) saturate(140%);backdrop-filter:blur(var(--glass-blur)) saturate(140%)}
.glass-soft{-webkit-backdrop-filter:blur(calc(var(--glass-blur) * 0.7)) saturate(130%);backdrop-filter:blur(calc(var(--glass-blur) * 0.7)) saturate(130%)}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakartaSans.variable} dark`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: GLASS_BACKDROP_CSS }} />
      </head>
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  );
}
