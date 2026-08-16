import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  if (process.env.FOCUSSPACE_MODE === "local" || process.env.NEXT_PUBLIC_FOCUSSPACE_MODE === "local") {
    const { createLocalDb } = await import("@/lib/local/builder");
    const { executeQuery } = await import("@/lib/local/execute");
    return createLocalDb(executeQuery) as unknown as ReturnType<typeof createCloudServerClient>;
  }
  return createCloudServerClient();
}

async function createCloudServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — cookies set by middleware
          }
        },
      },
    }
  );
}
