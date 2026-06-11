import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  output: "standalone",
  images: {
    // Next 16 restricts optimizer qualities to this allowlist; the wallpaper
    // renders at 90 so uploaded backgrounds aren't crushed back down to q75.
    qualities: [75, 90, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
