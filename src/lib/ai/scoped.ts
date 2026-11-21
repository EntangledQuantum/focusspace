import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

// Tables keyed by the owner in a column other than user_id, or not at all.
const OWNER_COLUMN: Record<string, string | null> = {
  profiles: "id",
  task_tags: null, // no owner column — always reached through an owned task/tag id
};

/**
 * Wrap a Supabase-like client so every read/update/delete is filtered to
 * `userId` and every insert/upsert is stamped with it.
 *
 * The in-app chat runs under RLS, so this is belt-and-braces there. The hosted
 * MCP endpoint, however, authenticates a personal token and then uses the
 * service-role client (RLS bypassed) — without this wrapper a fuzzy name
 * lookup or a raw id could reach another user's rows.
 */
export function scopeToUser<T extends DB>(db: T, userId: string): T {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const qb = target.from(table as never) as unknown as Record<string, (...a: unknown[]) => { eq: (c: string, v: unknown) => unknown }>;
        const col = table in OWNER_COLUMN ? OWNER_COLUMN[table] : "user_id";
        if (!col) return qb;
        const stamp = (v: unknown) =>
          Array.isArray(v) ? v.map((r) => ({ ...r, [col]: userId })) : { ...(v as object), [col]: userId };
        return {
          select: (...a: unknown[]) => qb.select(...a).eq(col, userId),
          update: (...a: unknown[]) => qb.update(...a).eq(col, userId),
          delete: (...a: unknown[]) => qb.delete(...a).eq(col, userId),
          insert: (v: unknown, ...a: unknown[]) => qb.insert(stamp(v), ...a),
          upsert: (v: unknown, ...a: unknown[]) => qb.upsert(stamp(v), ...a),
        };
      };
    },
  }) as T;
}
