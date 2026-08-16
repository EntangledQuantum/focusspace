import { getSqlite } from "./db";
import { newId } from "./ids";
import type { EmbedSpec, FilterOp, QueryResult, QuerySpec } from "./types";

const BOOL_COLS = new Set([
  "dnd_during_focus", "browser_notifs_enabled", "auto_start_breaks", "auto_start_pomodoros",
  "spotify_auto_start", "spotify_takeover", "ai_enabled", "ai_use_own_key", "ai_has_own_key",
  "projects_show_all", "done", "completed", "is_builtin",
]);

const JSON_COLS = new Set(["effect_settings", "projects_visible_ids", "parts"]);

const TABLES = new Set([
  "profiles", "user_settings", "projects", "tags", "tasks", "task_tags", "subtasks",
  "focus_sessions", "wallpapers", "ai_credentials", "ai_usage", "ai_conversations",
  "ai_messages", "timer_state", "mcp_tokens", "v_daily_focus", "v_tag_focus",
]);

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

function coerceOut(table: string, row: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (BOOL_COLS.has(k)) out[k] = v === 1 || v === true;
    if (JSON_COLS.has(k) && typeof v === "string") {
      try { out[k] = JSON.parse(v); } catch { /* leave */ }
    }
  }
  if (table === "user_settings" && typeof out.projects_visible_ids === "string") {
    try { out.projects_visible_ids = JSON.parse(out.projects_visible_ids as string); } catch { out.projects_visible_ids = []; }
  }
  return out;
}

function coerceIn(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    if (BOOL_COLS.has(k)) out[k] = v === true || v === 1 ? 1 : 0;
    else if (JSON_COLS.has(k) && v !== null && typeof v === "object") out[k] = JSON.stringify(v);
    else if (k === "projects_visible_ids" && Array.isArray(v)) out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

function parseSelect(select: string | undefined): { columns: string[]; embeds: EmbedSpec[] } {
  if (!select || select === "*") return { columns: ["*"], embeds: [] };
  const embeds: EmbedSpec[] = [];
  const columns: string[] = [];
  let i = 0;
  const s = select.trim();

  function skipWs() { while (i < s.length && /\s/.test(s[i])) i++; }

  function parseName(): string {
    skipWs();
    const start = i;
    while (i < s.length && /[a-zA-Z0-9_*]/.test(s[i])) i++;
    return s.slice(start, i);
  }

  function parseEmbedBody(table: string, alias: string, inner: boolean, fk?: string): EmbedSpec {
    skipWs();
    if (s[i] === "(") i++;
    const innerParsed = parseList();
    skipWs();
    if (s[i] === ")") i++;
    return { table, alias, fk, inner, columns: innerParsed.columns, embeds: innerParsed.embeds };
  }

  function parseList(): { columns: string[]; embeds: EmbedSpec[] } {
    const cols: string[] = [];
    const em: EmbedSpec[] = [];
    while (i < s.length) {
      skipWs();
      if (s[i] === ")" || i >= s.length) break;
      let name = parseName();
      skipWs();
      let alias = name;
      let inner = false;
      let fk: string | undefined;
      if (s[i] === "!") {
        i++;
        const hint = parseName();
        if (hint === "inner") inner = true;
        else fk = hint;
      }
      skipWs();
      if (s[i] === ":") {
        i++;
        skipWs();
        const rest = parseName();
        if (rest) {
          alias = name;
          name = rest;
        }
      }
      skipWs();
      if (s[i] === "(") {
        em.push(parseEmbedBody(name, alias || name, inner, fk));
      } else {
        cols.push(name || "*");
      }
      skipWs();
      if (s[i] === ",") { i++; continue; }
      break;
    }
    return { columns: cols.length ? cols : ["*"], embeds: em };
  }

  const parsed = parseList();
  return parsed;
}

function filterSql(filters: FilterOp[]): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const f of filters) {
    const col = quoteIdent(f.col);
    switch (f.kind) {
      case "eq": parts.push(`${col} = ?`); params.push(f.value); break;
      case "neq": parts.push(`${col} != ?`); params.push(f.value); break;
      case "is":
        if (f.value === null) parts.push(`${col} IS NULL`);
        else { parts.push(`${col} = ?`); params.push(f.value); }
        break;
      case "not_is":
        if (f.value === null) parts.push(`${col} IS NOT NULL`);
        else { parts.push(`${col} != ?`); params.push(f.value); }
        break;
      case "in": {
        const vals = f.value;
        if (!vals.length) { parts.push("0"); break; }
        parts.push(`${col} IN (${vals.map(() => "?").join(",")})`);
        params.push(...vals);
        break;
      }
      case "gte": parts.push(`${col} >= ?`); params.push(f.value); break;
      case "lte": parts.push(`${col} <= ?`); params.push(f.value); break;
      case "gt": parts.push(`${col} > ?`); params.push(f.value); break;
      case "lt": parts.push(`${col} < ?`); params.push(f.value); break;
      case "ilike": parts.push(`${col} LIKE ? COLLATE NOCASE`); params.push(f.value); break;
      case "imatch":
        parts.push(`${col} LIKE ? COLLATE NOCASE`);
        params.push(`%${String(f.value).replace(/%/g, "")}%`);
        break;
    }
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

function fkGuess(parent: string, child: string, hint?: string): { from: string; toTable: string; toCol: string } | null {
  if (hint) return { from: "id", toTable: child, toCol: hint };
  const map: Record<string, Record<string, [string, string]>> = {
    tasks: { task_tags: ["id", "task_id"], subtasks: ["id", "task_id"], focus_sessions: ["id", "task_id"] },
    projects: { tasks: ["id", "project_id"], focus_sessions: ["id", "project_id"] },
    tags: { task_tags: ["id", "tag_id"] },
    task_tags: { tags: ["tag_id", "id"], tasks: ["task_id", "id"] },
    ai_conversations: { ai_messages: ["id", "conversation_id"] },
    focus_sessions: { tasks: ["task_id", "id"], projects: ["project_id", "id"] },
  };
  const hit = map[parent]?.[child];
  if (hit) return { from: hit[0], toTable: child, toCol: hit[1] };
  // generic: child.table_id → parent.id  or parent.child_id → child.id
  if (child.endsWith("s")) {
    const singular = child.endsWith("ies") ? child.slice(0, -3) + "y" : child.slice(0, -1);
    return { from: `${singular}_id`, toTable: child, toCol: "id" };
  }
  return { from: `${child}_id`, toTable: child, toCol: "id" };
}

function attachEmbeds(parentTable: string, rows: Record<string, unknown>[], embeds: EmbedSpec[]) {
  const db = getSqlite();
  for (const em of embeds) {
    const rel = fkGuess(parentTable, em.table, em.fk);
    if (!rel || !rows.length) {
      for (const r of rows) r[em.alias] = em.inner ? [] : [];
      continue;
    }
    // Two shapes: parent.id → child.fk  OR  parent.fk → child.id
    const parentHasFk = rel.from !== "id" && rel.from in (rows[0] ?? {});
    if (parentHasFk) {
      const ids = [...new Set(rows.map((r) => r[rel.from]).filter(Boolean))];
      if (!ids.length) {
        for (const r of rows) r[em.alias] = null;
        continue;
      }
      const ph = ids.map(() => "?").join(",");
      const kids = db.prepare(`SELECT * FROM ${quoteIdent(em.table)} WHERE ${quoteIdent(rel.toCol)} IN (${ph})`).all(...ids) as Record<string, unknown>[];
      const mapped = kids.map((k) => coerceOut(em.table, k)!);
      if (em.embeds.length) attachEmbeds(em.table, mapped, em.embeds);
      const by = new Map<unknown, Record<string, unknown>>();
      for (const k of mapped) by.set(k[rel.toCol], k);
      for (const r of rows) r[em.alias] = by.get(r[rel.from]) ?? null;
    } else {
      const ids = rows.map((r) => r[rel.from]).filter(Boolean);
      if (!ids.length) {
        for (const r of rows) r[em.alias] = [];
        continue;
      }
      const ph = ids.map(() => "?").join(",");
      const kids = db.prepare(`SELECT * FROM ${quoteIdent(em.table)} WHERE ${quoteIdent(rel.toCol)} IN (${ph})`).all(...ids) as Record<string, unknown>[];
      const mapped = kids.map((k) => coerceOut(em.table, k)!);
      if (em.embeds.length) attachEmbeds(em.table, mapped, em.embeds);
      const grouped = new Map<unknown, Record<string, unknown>[]>();
      for (const k of mapped) {
        const key = k[rel.toCol];
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(k);
      }
      const kept: Record<string, unknown>[] = [];
      for (const r of rows) {
        const list = grouped.get(r[rel.from]) ?? [];
        r[em.alias] = list;
        if (!em.inner || list.length) kept.push(r);
      }
      if (em.inner) {
        rows.length = 0;
        rows.push(...kept);
      }
    }
  }
}

export function executeQuery(spec: QuerySpec): QueryResult {
  try {
    if (!TABLES.has(spec.table)) return { data: null, error: { message: `Unknown table ${spec.table}` }, count: null };
    const db = getSqlite();
    const { sql: whereSql, params } = filterSql(spec.filters ?? []);

    if (spec.op === "select") {
      const parsed = parseSelect(spec.select);
      let sql = `SELECT * FROM ${quoteIdent(spec.table)}${whereSql}`;
      if (spec.order) sql += ` ORDER BY ${quoteIdent(spec.order.col)} ${spec.order.ascending ? "ASC" : "DESC"}`;
      if (spec.limit) sql += ` LIMIT ${Number(spec.limit)}`;
      const raw = db.prepare(sql).all(...params) as Record<string, unknown>[];
      const rows = raw.map((r) => coerceOut(spec.table, r)!);
      if (parsed.embeds.length) attachEmbeds(spec.table, rows, parsed.embeds);
      let count: number | null = null;
      if (spec.count === "exact") {
        const c = db.prepare(`SELECT COUNT(*) as n FROM ${quoteIdent(spec.table)}${whereSql}`).get(...params) as { n: number };
        count = c.n;
      }
      if (spec.head) return { data: null, error: null, count };
      if (spec.single) {
        if (!rows[0]) return { data: null, error: { message: "No rows" }, count };
        return { data: rows[0], error: null, count };
      }
      if (spec.maybeSingle) return { data: rows[0] ?? null, error: null, count };
      return { data: rows, error: null, count };
    }

    if (spec.op === "insert" || spec.op === "upsert") {
      const list = Array.isArray(spec.values) ? spec.values : spec.values ? [spec.values] : [];
      if (!list.length) return { data: null, error: { message: "Nothing to insert" }, count: null };
      const inserted: Record<string, unknown>[] = [];
      const insertOne = db.transaction((rows: Record<string, unknown>[]) => {
        for (const row of rows) {
          const coerced = coerceIn(row);
          if (!coerced.id && spec.table !== "task_tags" && spec.table !== "user_settings" && spec.table !== "ai_credentials" && spec.table !== "ai_usage" && spec.table !== "timer_state") {
            coerced.id = newId();
          }
          const keys = Object.keys(coerced);
          const or = spec.op === "upsert" ? " OR REPLACE" : "";
          const sql = `INSERT${or} INTO ${quoteIdent(spec.table)} (${keys.map(quoteIdent).join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
          db.prepare(sql).run(...keys.map((k) => coerced[k]));
          inserted.push(coerced);
        }
      });
      insertOne(list);
      const out = inserted.map((r) => coerceOut(spec.table, r)!);
      if (spec.single || spec.maybeSingle) return { data: out[0] ?? null, error: null, count: out.length };
      return { data: out, error: null, count: out.length };
    }

    if (spec.op === "update") {
      const values = coerceIn((spec.values && !Array.isArray(spec.values) ? spec.values : {}) as Record<string, unknown>);
      const keys = Object.keys(values);
      if (!keys.length) return { data: null, error: null, count: 0 };
      const sql = `UPDATE ${quoteIdent(spec.table)} SET ${keys.map((k) => `${quoteIdent(k)} = ?`).join(", ")}${whereSql}`;
      const info = db.prepare(sql).run(...keys.map((k) => values[k]), ...params);
      if (spec.single || spec.maybeSingle) {
        const sel = executeQuery({ ...spec, op: "select", single: spec.single, maybeSingle: spec.maybeSingle });
        return sel;
      }
      return { data: null, error: null, count: info.changes };
    }

    if (spec.op === "delete") {
      const sql = `DELETE FROM ${quoteIdent(spec.table)}${whereSql}`;
      const info = db.prepare(sql).run(...params);
      return { data: null, error: null, count: info.changes };
    }

    return { data: null, error: { message: "Unknown op" }, count: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, count: null };
  }
}

export { parseSelect };
