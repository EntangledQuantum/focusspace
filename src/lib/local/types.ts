export type FilterOp =
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "neq"; col: string; value: unknown }
  | { kind: "is"; col: string; value: unknown }
  | { kind: "in"; col: string; value: unknown[] }
  | { kind: "gte"; col: string; value: unknown }
  | { kind: "lte"; col: string; value: unknown }
  | { kind: "gt"; col: string; value: unknown }
  | { kind: "lt"; col: string; value: unknown }
  | { kind: "ilike"; col: string; value: string }
  | { kind: "imatch"; col: string; value: string }
  | { kind: "not_is"; col: string; value: unknown };

export interface OrderBy {
  col: string;
  ascending: boolean;
}

export interface EmbedSpec {
  table: string;
  alias: string;
  fk?: string;
  inner: boolean;
  columns: string[];
  embeds: EmbedSpec[];
}

export interface QuerySpec {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  select?: string;
  filters?: FilterOp[];
  order?: OrderBy;
  limit?: number;
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  single?: boolean;
  maybeSingle?: boolean;
  head?: boolean;
  count?: "exact" | null;
}

export interface QueryResult {
  data: unknown;
  error: { message: string } | null;
  count: number | null;
}
