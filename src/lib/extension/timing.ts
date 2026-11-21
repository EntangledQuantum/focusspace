/**
 * Per-request DB instrumentation for /api/extension/*.
 *
 * Wraps a supabase-js (or local SQLite shim) client so every awaited query is
 * counted, and "round trips" — queries that start while no other query is in
 * flight, i.e. the sequential network hops that actually cost latency — are
 * tallied separately. The totals go out as a `Server-Timing` header, visible
 * in DevTools → Network → Timing for any extension request.
 *
 * FOCUSSPACE_DEV_DB_LATENCY_MS (ignored in production) adds that many ms to
 * every query so local SQLite can stand in for Vercel → Supabase latency when
 * measuring.
 */

export interface DbStats {
  queries: number;
  roundTrips: number;
  dbMs: number;
}

const devLatencyMs = (): number => {
  if (process.env.NODE_ENV === "production") return 0;
  const n = Number(process.env.FOCUSSPACE_DEV_DB_LATENCY_MS ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function instrumentDb<T extends object>(db: T): { db: T; stats: DbStats } {
  const stats: DbStats = { queries: 0, roundTrips: 0, dbMs: 0 };
  const delay = devLatencyMs();
  let inFlight = 0;
  let busySince = 0;

  const begin = () => {
    stats.queries++;
    if (inFlight === 0) {
      stats.roundTrips++;
      busySince = performance.now();
    }
    inFlight++;
  };
  const end = () => {
    inFlight--;
    if (inFlight === 0) stats.dbMs += performance.now() - busySince;
  };

  // Chained builder methods return builders; awaiting one (its `then`) runs the query.
  const wrap = (builder: object): object =>
    new Proxy(builder, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (prop === "then" && typeof value === "function") {
          return (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
            begin();
            const run = async () => {
              if (delay) await new Promise((r) => setTimeout(r, delay));
              return await (target as PromiseLike<unknown>);
            };
            return run().finally(end).then(onOk, onErr);
          };
        }
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args);
          return out && typeof out === "object" && "then" in out ? wrap(out) : out;
        };
      },
    });

  const proxied = new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "from" && typeof value === "function") {
        return (...args: unknown[]) => wrap((value as (...a: unknown[]) => object).apply(target, args));
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db: proxied as T, stats };
}

export function serverTiming(parts: { authMs: number; totalMs: number; stats: DbStats }): string {
  const { authMs, totalMs, stats } = parts;
  return [
    `auth;dur=${authMs.toFixed(1)}`,
    `db;dur=${stats.dbMs.toFixed(1)};desc="${stats.queries} queries, ${stats.roundTrips} round trips"`,
    `total;dur=${totalMs.toFixed(1)}`,
  ].join(", ");
}
