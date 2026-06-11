import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  // Fall back to placeholders when the env vars aren't set so static
  // prerendering at build time doesn't crash (e.g. Vercel preview builds
  // without env configured). Real values are inlined when configured.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
  );
}
