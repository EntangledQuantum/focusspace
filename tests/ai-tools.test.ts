import { describe, expect, it } from "vitest";
import { pickMatch } from "@/lib/ai/resolve";
import { scopeToUser } from "@/lib/ai/scoped";
import { validateToolArgs, listToolDefs, handleMcpMessage } from "@/lib/mcp/handle";
import { makeTaskTools } from "@/lib/ai/tools";

type Task = { title: string; status: string };
const t = (title: string, status = "todo"): Task => ({ title, status });

describe("pickMatch (name → row resolution)", () => {
  const rows = [t("Write report"), t("Write report draft"), t("Read book")];

  it("prefers an exact, case-insensitive title", () => {
    expect(pickMatch(rows, "write REPORT", (r) => r.title)).toEqual({ match: rows[0] });
  });

  it("accepts a single substring match", () => {
    expect(pickMatch(rows, "book", (r) => r.title)).toEqual({ match: rows[2] });
  });

  it("reports ambiguity instead of guessing between substring matches", () => {
    expect(pickMatch(rows, "write", (r) => r.title)).toEqual({ ambiguous: [rows[0], rows[1]] });
  });

  it("breaks ties between duplicates with the preference (open over done)", () => {
    const dupes = [t("Gym", "done"), t("Gym", "todo")];
    expect(pickMatch(dupes, "gym", (r) => r.title, (r) => r.status === "todo")).toEqual({ match: dupes[1] });
    expect(pickMatch([t("Gym"), t("Gym")], "gym", (r) => r.title, (r) => r.status === "todo")).toHaveProperty("ambiguous");
  });

  it("returns none for blank refs or no rows", () => {
    expect(pickMatch(rows, "   ", (r) => r.title)).toEqual({ none: true });
    expect(pickMatch([], "x", (r: Task) => r.title)).toEqual({ none: true });
    expect(pickMatch(rows, "zzz", (r) => r.title)).toEqual({ none: true });
  });

  it("ignores a leading # (tags)", () => {
    expect(pickMatch([{ name: "deep" }], "#deep", (r) => r.name)).toEqual({ match: { name: "deep" } });
  });
});

describe("scopeToUser", () => {
  // Records the chain of calls a query makes.
  function recorder() {
    const calls: unknown[][] = [];
    const chain = new Proxy({}, {
      get: (_t, prop: string) => (...args: unknown[]) => { calls.push([prop, ...args]); return chain; },
    });
    return { db: { from: (table: string) => { calls.push(["from", table]); return chain; } }, calls };
  }

  it("filters reads, updates and deletes by owner and stamps inserts", () => {
    const { db, calls } = recorder();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = scopeToUser(db as any, "u1");
    s.from("tasks").select("*");
    s.from("tasks").update({ title: "x" });
    s.from("projects").delete();
    s.from("subtasks").insert([{ title: "a" }, { title: "b" }]);
    s.from("profiles").select("timezone");
    expect(calls).toEqual([
      ["from", "tasks"], ["select", "*"], ["eq", "user_id", "u1"],
      ["from", "tasks"], ["update", { title: "x" }], ["eq", "user_id", "u1"],
      ["from", "projects"], ["delete"], ["eq", "user_id", "u1"],
      ["from", "subtasks"], ["insert", [{ title: "a", user_id: "u1" }, { title: "b", user_id: "u1" }]],
      ["from", "profiles"], ["select", "timezone"], ["eq", "id", "u1"],
    ]);
  });

  it("overrides a user_id smuggled into an insert", () => {
    const { db, calls } = recorder();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scopeToUser(db as any, "u1").from("tags").insert({ name: "x", user_id: "someone-else" });
    expect(calls).toContainEqual(["insert", { name: "x", user_id: "u1" }]);
  });
});

// Minimal chainable fake: every query resolves to an empty result.
const fakeDb = {
  from() {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "neq", "is", "in", "gte", "ilike", "filter", "not", "order", "limit"]) {
      q[m] = () => q;
    }
    q.single = () => Promise.resolve({ data: null, error: null });
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.then = (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: [], error: null }));
    return q;
  },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { supabase: fakeDb as any, userId: "u", destructive: "allow" as const };

describe("tool argument validation", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = makeTaskTools(fakeDb as any, "u", { destructive: "allow", surface: "mcp" });
  const schema = (name: string) => (tools[name] as { inputSchema: unknown }).inputSchema;

  it("applies defaults and rejects bad input with readable messages", () => {
    expect(validateToolArgs(schema("list_tasks"), {})).toEqual({ ok: true, value: { status: "todo", limit: 25 } });
    const bad = validateToolArgs(schema("create_task"), { title: "", estimatedPomodoros: 99 });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.message).toMatch(/title/);
    expect(!bad.ok && bad.message).toMatch(/estimatedPomodoros/);
    expect(validateToolArgs(schema("recolor_project"), { projectRef: "p", color: "pink" }).ok).toBe(false);
    expect(validateToolArgs(schema("set_active_task"), {}).ok).toBe(false);
    expect(validateToolArgs(schema("confirm_action"), { action: "delete_task", id: "not-a-uuid" }).ok).toBe(false);
  });

  it("publishes input-side JSON schemas (defaults are optional) with annotations", () => {
    const def = listToolDefs(tools).find((d) => d.name === "list_tasks")!;
    expect(def.inputSchema.required).toBeUndefined();
    const del = listToolDefs(tools).find((d) => d.name === "delete_task")!;
    expect(del.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(listToolDefs(tools).find((d) => d.name === "search_tasks")!.annotations.readOnlyHint).toBe(true);
  });

  it("only exposes confirm_action to MCP clients, never to the in-app chat", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = makeTaskTools(fakeDb as any, "u", { destructive: "confirm", surface: "chat" });
    expect(Object.keys(chat)).not.toContain("confirm_action");
    expect(Object.keys(tools)).toContain("confirm_action");
  });

  it("returns MCP isError for invalid arguments and unknown names", async () => {
    const res = await handleMcpMessage({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "create_task", arguments: { title: "" } } }, ctx);
    expect(res?.result).toMatchObject({ isError: true });
    const unknown = await handleMcpMessage({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "nope" } }, ctx);
    expect(unknown?.error?.code).toBe(-32602);
  });

  it("surfaces tool failures as isError (missing task)", async () => {
    const res = await handleMcpMessage({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "delete_task", arguments: { taskRef: "ghost" } } }, ctx);
    expect(res?.result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('No task matching "ghost"') }] });
  });
});
