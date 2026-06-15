import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(supabase: SupabaseClient<Database>, userId: string) {
  const period = currentPeriod();
  const { data } = await supabase
    .from("ai_usage")
    .select("tokens_in, tokens_out, request_count")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();
  return {
    period,
    used: (data?.tokens_in ?? 0) + (data?.tokens_out ?? 0),
    requestCount: data?.request_count ?? 0,
  };
}

/** Read-modify-write increment (fine for v1's low per-user concurrency). */
export async function recordUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
  tokensIn: number,
  tokensOut: number,
) {
  const period = currentPeriod();
  const { data } = await supabase
    .from("ai_usage")
    .select("tokens_in, tokens_out, request_count")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();
  await supabase.from("ai_usage").upsert({
    user_id: userId,
    period,
    tokens_in: (data?.tokens_in ?? 0) + Math.max(0, tokensIn),
    tokens_out: (data?.tokens_out ?? 0) + Math.max(0, tokensOut),
    request_count: (data?.request_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });
}
