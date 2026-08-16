import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

function createCloudClient() {
  // Fall back to placeholders when the env vars aren't set so static
  // prerendering at build time doesn't crash (e.g. Vercel preview builds
  // without env configured). Real values are inlined when configured.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
  );
}

export function createClient() {
  if (process.env.NEXT_PUBLIC_FOCUSSPACE_MODE === "local") {
    // Lazy import so the cloud bundle never pulls sqlite / local query code.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createLocalDb } = require("@/lib/local/builder") as typeof import("@/lib/local/builder");
    return createLocalDb(async (spec) => {
      const res = await fetch("/api/local/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      });
      return res.json();
    }) as unknown as ReturnType<typeof createCloudClient>;
  }
  return createCloudClient();
}
