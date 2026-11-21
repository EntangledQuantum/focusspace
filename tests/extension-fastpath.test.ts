import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashToken, lookupToken } from "@/lib/mcp/auth";

// Work scheduled with next/server `after()` runs once the response is sent —
// off the critical path — so collect it here instead of counting it.
const deferred: (() => unknown)[] = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => { deferred.push(fn); },
}));
const flushAfter = async () => { while (deferred.length) await deferred.shift()!(); };

/**
 * Latency guard rails for the extension API: every awaited query is a
 * Vercel → Supabase round trip, so these pin how many sequential round trips
 * each hot path takes, and that commands return exactly what a fresh read would.
 */
describe("extension command fast paths (local SQLite, instrumented)", () => {
  let dir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  let userId: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-fast-"));
    process.env.FOCUSSPACE_MODE = "local";
    const { resetSqliteForTests } = await import("@/lib/local/db");
    resetSqliteForTests(path.join(dir, "focusspace.db"));
    const { createLocalDb } = await import("@/lib/local/builder");
    const { executeQuery } = await import("@/lib/local/execute");
    raw = createLocalDb(executeQuery);
    userId = (await import("@/lib/local/ids")).LOCAL_USER_ID;
  });

  afterEach(async () => {
    const { closeSqlite } = await import("@/lib/local/db");
    closeSqlite();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows file lock */ }
  });

  async function seed() {
    const { data: projects } = await raw.from("projects").select("id");
    const { data: task } = await raw.from("tasks")
      .insert({ user_id: userId, project_id: projects[0].id, title: "Deep work", estimated_pomodoros: 2 }).select("id").single();
    await raw.from("subtasks").insert([
      { user_id: userId, task_id: task.id, title: "one", sort_order: 0 },
      { user_id: userId, task_id: task.id, title: "two", sort_order: 1 },
    ]);
    const svc = await import("@/lib/extension/service");
    const state = await svc.runTaskCommand(raw, userId, { action: "select", taskId: task.id });
    return { svc, state, hint: { taskId: task.id, projectId: projects[0].id } };
  }

  async function measured<T>(fn: (db: unknown) => Promise<T>) {
    const { instrumentDb } = await import("@/lib/extension/timing");
    const { db, stats } = instrumentDb(raw);
    const out = await fn(db);
    return { out, roundTrips: stats.roundTrips };
  }

  it("GET state with the popup's hint is one round trip; commands are two", async () => {
    const { svc, hint } = await seed();
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const get = await measured((db: any) => svc.getExtensionState(db, userId, now, hint));
    expect(get.roundTrips).toBe(1);
    expect(get.out.task?.subtasks).toHaveLength(2);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const start = await measured((db: any) => svc.runTimerCommand(db, userId, "start", { hint }, now));
    expect(start.roundTrips).toBe(2); // read round + (session insert ∥ timer write)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pause = await measured((db: any) => svc.runTimerCommand(db, userId, "pause", { hint }, now + 60_000));
    expect(pause.roundTrips).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resume = await measured((db: any) => svc.runTimerCommand(db, userId, "resume", { hint }, now + 90_000));
    expect(resume.roundTrips).toBe(2);

    // Without a hint (or a wrong one) it still works, just one round more.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cold = await measured((db: any) => svc.getExtensionState(db, userId, now + 91_000));
    expect(cold.roundTrips).toBe(2);
    expect(cold.out.task?.id).toBe(hint.taskId);
  });

  it("a command's returned state equals a fresh read (nothing is re-read)", async () => {
    const { svc, hint } = await seed();
    const now = Date.now();
    for (const action of ["start", "pause", "resume", "stop"] as const) {
      const at = now + ["start", "pause", "resume", "stop"].indexOf(action) * 30_000;
      const returned = await svc.runTimerCommand(raw, userId, action, { hint }, at);
      const fresh = await svc.getExtensionState(raw, userId, at, hint);
      expect(returned).toEqual(fresh);
    }
  });

  it("toggling a subtask with its desired value is one round trip and idempotent", async () => {
    const { svc, state, hint } = await seed();
    const sub = state.task!.subtasks[0];
    const cmd = { action: "toggle_subtask" as const, subtaskId: sub.id, done: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = await measured((db: any) => svc.runTaskCommand(db, userId, cmd, hint));
    expect(first.roundTrips).toBe(1);
    expect(first.out.task!.subtasks[0].done).toBe(true);
    // The deferred nudge re-stamps timer_state so open site tabs refetch; the returned stamp matches it.
    await flushAfter();
    const { readTimerState } = await import("@/lib/timer/persist");
    const stored = await readTimerState(raw, userId);
    expect(stored?.updatedAt).toBe(first.out.timer.updatedAt);
    expect(stored?.source).toBe("mcp");
    // A retry of the same click does not flip it back.
    const again = await svc.runTaskCommand(raw, userId, cmd, hint);
    expect(again.task!.subtasks[0].done).toBe(true);
  });
});

describe("token lookup cost", () => {
  function admin(row: Record<string, unknown> | null) {
    const calls: string[] = [];
    const db = {
      from(table: string) {
        const q = {
          select: () => q,
          update: () => { calls.push(`update ${table}`); return q; },
          eq: () => q,
          maybeSingle: async () => {
            calls.push(`read ${table}`);
            if (table === "mcp_tokens") return { data: row };
            return { data: { ai_destructive: "confirm" } };
          },
          then: (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: null, error: null })),
        };
        return q;
      },
    };
    return { db, calls };
  }

  it("is a single read for the extension and skips last_used_at when it was recent", async () => {
    const { db, calls } = admin({ token_hash: hashToken("fs_x"), user_id: "u1", id: "t1", last_used_at: new Date().toISOString() });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = await lookupToken(db as any, "fs_x", { withSettings: false });
    expect(ctx?.userId).toBe("u1");
    expect(calls).toEqual(["read mcp_tokens"]);
  });

  it("stamps last_used_at (off the critical path) when stale, and reads settings for MCP", async () => {
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    const { db, calls } = admin({ token_hash: hashToken("fs_x"), user_id: "u1", id: "t1", last_used_at: stale });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = await lookupToken(db as any, "fs_x");
    expect(calls).not.toContain("update mcp_tokens"); // not awaited on the request
    await flushAfter();
    expect(calls).toContain("update mcp_tokens");
    expect(calls).toContain("read user_settings");
    expect(ctx?.destructive).toBe("confirm");
  });
});
