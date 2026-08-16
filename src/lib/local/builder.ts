import type { FilterOp, QueryResult, QuerySpec } from "./types";
import { executeQuery } from "./execute";

export type ExecFn = (spec: QuerySpec) => Promise<QueryResult> | QueryResult;

/**
 * Chainable subset of the supabase-js query builder used by this app.
 * Resolves to `{ data, error, count }` when awaited.
 */
export class LocalQueryBuilder implements PromiseLike<QueryResult> {
  private spec: QuerySpec;
  private exec: ExecFn;

  constructor(table: string, exec: ExecFn) {
    this.spec = { table, op: "select", filters: [] };
    this.exec = exec;
  }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.spec.select = columns;
    if (opts?.count) this.spec.count = opts.count;
    if (opts?.head) this.spec.head = true;
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.spec.op = "insert";
    this.spec.values = values;
    return this;
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[], _opts?: { onConflict?: string }) {
    this.spec.op = "upsert";
    this.spec.values = values;
    if (_opts?.onConflict) this.spec.onConflict = _opts.onConflict;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.spec.op = "update";
    this.spec.values = values;
    return this;
  }

  delete() {
    this.spec.op = "delete";
    return this;
  }

  private add(f: FilterOp) {
    if (!this.spec.filters) this.spec.filters = [];
    this.spec.filters.push(f);
    return this;
  }

  eq(col: string, value: unknown) { return this.add({ kind: "eq", col, value }); }
  neq(col: string, value: unknown) { return this.add({ kind: "neq", col, value }); }
  is(col: string, value: unknown) { return this.add({ kind: "is", col, value }); }
  in(col: string, value: unknown[]) { return this.add({ kind: "in", col, value }); }
  gte(col: string, value: unknown) { return this.add({ kind: "gte", col, value }); }
  lte(col: string, value: unknown) { return this.add({ kind: "lte", col, value }); }
  gt(col: string, value: unknown) { return this.add({ kind: "gt", col, value }); }
  lt(col: string, value: unknown) { return this.add({ kind: "lt", col, value }); }
  ilike(col: string, value: string) { return this.add({ kind: "ilike", col, value }); }

  filter(col: string, op: string, value: unknown) {
    if (op === "imatch" || op === "match") return this.add({ kind: "imatch", col, value: String(value) });
    if (op === "eq") return this.add({ kind: "eq", col, value });
    return this.add({ kind: "ilike", col, value: `%${value}%` });
  }

  not(col: string, op: string, value: unknown) {
    if (op === "is") return this.add({ kind: "not_is", col, value });
    return this.add({ kind: "neq", col, value });
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.spec.order = { col, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number) { this.spec.limit = n; return this; }
  single() { this.spec.single = true; return this; }
  maybeSingle() { this.spec.maybeSingle = true; return this; }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.exec(this.spec)).then(onfulfilled, onrejected);
  }
}

export function localUser() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "local@focusspace",
    user_metadata: { display_name: "You" },
    identities: [] as { provider: string }[],
    app_metadata: {},
    aud: "local",
    created_at: new Date().toISOString(),
  };
}

export function makeLocalAuth() {
  const user = localUser();
  const session = { user, access_token: "local", refresh_token: "local" };
  return {
    async getUser() { return { data: { user }, error: null }; },
    async getSession() { return { data: { session }, error: null }; },
    async signOut() { return { error: null }; },
    async signInWithPassword() { return { data: { user, session }, error: null }; },
    async signUp() { return { data: { user, session }, error: null }; },
    async signInWithOAuth() {
      return { data: { url: null, provider: null }, error: { message: "OAuth is not used in local mode." } };
    },
    async exchangeCodeForSession() {
      return { data: { session }, error: null };
    },
    onAuthStateChange(cb: (event: string, session: unknown) => void) {
      queueMicrotask(() => cb("SIGNED_IN", session));
      return { data: { subscription: { unsubscribe() {} } } };
    },
  };
}

export function makeLocalStorage() {
  return {
    from(_bucket: string) {
      return {
        async upload() { return { data: null, error: { message: "Wallpaper upload is not available in local mode yet." } }; },
        async remove() { return { data: null, error: null }; },
        getPublicUrl(p: string) { return { data: { publicUrl: `/api/local/wallpaper/${p}` } }; },
      };
    },
  };
}

export function createLocalDb(exec: ExecFn) {
  return {
    from(table: string) { return new LocalQueryBuilder(table, exec); },
    auth: makeLocalAuth(),
    storage: makeLocalStorage(),
  };
}
