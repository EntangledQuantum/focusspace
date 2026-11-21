import { cacheLife } from "next/cache";

/**
 * GET /extension/download → 302 to the newest Chrome extension zip on GitHub
 * Releases (tags `extension-v*`, pre-releases included). Lets the landing page
 * and README link to "the latest beta" without hard-coding a version.
 * Falls back to the releases list if GitHub can't be reached.
 */
const REPO = "EntangledQuantum/focusspace";
const RELEASES_PAGE = `https://github.com/${REPO}/releases?q=extension-v&expanded=true`;

export async function GET() {
  const latest = await latestExtensionZip();
  return new Response(null, {
    status: 302,
    headers: { Location: latest?.url ?? RELEASES_PAGE, "Cache-Control": "public, max-age=300" },
  });
}

async function latestExtensionZip(): Promise<{ tag: string; url: string } | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "focusspace-site" },
    });
    if (!res.ok) return null;
    const releases = (await res.json()) as {
      tag_name: string;
      draft: boolean;
      assets: { name: string; browser_download_url: string }[];
    }[];
    for (const r of releases) {
      if (r.draft || !r.tag_name.startsWith("extension-v")) continue;
      const zip = r.assets.find((a) => a.name.endsWith(".zip"));
      if (zip) return { tag: r.tag_name, url: zip.browser_download_url };
    }
    return null;
  } catch {
    return null;
  }
}
