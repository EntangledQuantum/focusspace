import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAgentSetup } from "@/lib/agent/setup";
import { FOR_AGENTS_MD } from "@/lib/agent/for-agents.md";
import { formatStatus, mmss, timerLine } from "@/lib/ai/status";
import { bearerFrom, hashToken, lookupToken } from "@/lib/mcp/auth";
import { handleMcpMessage, listToolDefs } from "@/lib/mcp/handle";
import { makeTaskTools } from "@/lib/ai/tools";
import type { ExtensionState } from "@/lib/extension/service";

describe("agent setup snippets", () => {
  it("builds the one-liner, Claude Code command and JSON from the origin + token", () => {
    const s = buildAgentSetup("https://focusspace.live/", "fs_abc123");
    expect(s.oneLiner).toBe(
      "Read https://focusspace.live/for-agents.md and set up the FocusSpace MCP server for me with URL https://focusspace.live/api/mcp and token fs_abc123.",
    );
    expect(s.claudeCode).toBe('claude mcp add --transport http focusspace https://focusspace.live/api/mcp --header "Authorization: Bearer fs_abc123"');
    expect(JSON.parse(s.json)).toEqual({
      mcpServers: { focusspace: { type: "http", url: "https://focusspace.live/api/mcp", headers: { Authorization: "Bearer fs_abc123" } } },
    });
  });

  it("omits auth for a local install", () => {
    const s = buildAgentSetup("http://127.0.0.1:3000", null);
    expect(s.oneLiner).toMatch(/URL http:\/\/127\.0\.0\.1:3000\/api\/mcp \(local install, no token needed\)\.$/);
    expect(s.claudeCode).not.toMatch(/Authorization/);
    expect(JSON.parse(s.json).mcpServers.focusspace.headers).toBeUndefined();
  });
});

describe("agent guide", () => {
  it("docs/for-agents.md matches the served guide (run scripts/gen-agent-docs.ts)", () => {
    const file = readFileSync(path.join(__dirname, "..", "docs", "for-agents.md"), "utf8");
    expect(file).toBe(FOR_AGENTS_MD);
  });

  it("documents every MCP tool", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fake = { from: () => ({}) } as any;
    const names = listToolDefs(makeTaskTools(fake, "u", { destructive: "allow", surface: "mcp" })).map((d) => d.name);
    const missing = names.filter((n) => !FOR_AGENTS_MD.includes(`\`${n}(`));
    expect(missing).toEqual([]);
  });
});

const baseState = (over: Partial<ExtensionState> = {}): ExtensionState => ({
  serverNow: Date.parse("2026-11-21T10:23:28.000Z"),
  justCompleted: false,
  timer: { mode: "pomodoro", status: "running", plannedDurationSec: 1500, remainingSec: 1122, pomodoroCount: 1, source: "mcp", updatedAt: null },
  task: {
    id: "t1", title: "Write report", done: false, estimatedPomodoros: 3, completedPomodoros: 1,
    subtasks: [{ id: "s1", title: "Outline", done: true }, { id: "s2", title: "Draft", done: false }],
  },
  project: { id: "p1", name: "Work", color: "#fff" },
  next: { start: { mode: "pomodoro", durationSec: 1500 }, breakOption: null },
  ...over,
});

describe("status rendering", () => {
  it("formats durations as m:ss / h:mm:ss", () => {
    expect(mmss(0)).toBe("0:00");
    expect(mmss(1122)).toBe("18:42");
    expect(mmss(3725)).toBe("1:02:05");
  });

  it("shows time left, ends_at (UTC + local clock) and ids for a running session", () => {
    const out = formatStatus(baseState(), { timezone: "Europe/Berlin", music: "playing · Song — Artist", destructive: "confirm" });
    expect(out.split("\n")).toEqual([
      "timer: running · pomodoro · 18:42 left (1122s of 1500s) · ends_at 2026-11-21T10:42:10.000Z (11:42 Europe/Berlin)",
      "task: Write report (id: t1) · todo · pomos 1/3 · subtasks 1/2",
      "next subtasks: Draft (id: s2)",
      "project: Work (id: p1)",
      "cycle: 1/4 pomos toward long break",
      "music: playing · Song — Artist",
      "tz: Europe/Berlin · deletes: confirm",
    ]);
  });

  it("describes paused, idle and finished timers and suggests the break", () => {
    expect(timerLine(baseState({ timer: { ...baseState().timer, status: "paused", remainingSec: 600 } }))).toBe(
      "timer: paused · pomodoro · 10:00 left (600s of 1500s)",
    );
    expect(timerLine(baseState({ timer: { ...baseState().timer, status: "idle", mode: "custom" }, next: { start: { mode: "custom", durationSec: 2700 }, breakOption: null } }))).toBe(
      "timer: idle · mode custom · next start custom 45:00",
    );
    const finished = baseState({
      timer: { ...baseState().timer, status: "completed", remainingSec: 0 },
      task: { ...baseState().task!, completedPomodoros: 4 },
      next: { start: { mode: "pomodoro", durationSec: 1500 }, breakOption: { mode: "long_break", durationSec: 900 } },
    });
    const lines = formatStatus(finished).split("\n");
    expect(lines[0]).toBe("timer: finished · pomodoro just ended");
    expect(lines).toContain("cycle: 0/4 pomos toward long break · suggested next: long break 15:00");
  });

  it("says when no task is selected and Spotify isn't connected", () => {
    const out = formatStatus(baseState({ task: null, project: null }), { music: null });
    expect(out).toMatch(/^task: none selected/m);
    expect(out).toMatch(/^music: spotify not connected$/m);
  });
});

describe("token auth", () => {
  it("parses bearer headers case-insensitively", () => {
    expect(bearerFrom("Bearer fs_x")).toBe("fs_x");
    expect(bearerFrom("bearer   fs_x ")).toBe("fs_x");
    expect(bearerFrom("Basic abc")).toBeNull();
    expect(bearerFrom("Bearer")).toBeNull();
    expect(bearerFrom(null)).toBeNull();
  });

  // Fake service-role client holding one token row.
  function admin(rows: { token_hash: string; user_id: string; id: string }[], destructive = "confirm") {
    const touched: string[] = [];
    const db = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const q = {
          select: () => q,
          update: () => { touched.push(table); return q; },
          eq: (c: string, v: unknown) => { filters[c] = v; return q; },
          maybeSingle: async () => {
            if (table === "mcp_tokens") return { data: rows.find((r) => r.token_hash === filters.token_hash) ?? null };
            if (table === "user_settings") return { data: { ai_destructive: destructive } };
            return { data: null };
          },
          then: (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: null, error: null })),
        };
        return q;
      },
    };
    return { db, touched };
  }

  it("resolves a valid token to its user and records last use", async () => {
    const { db, touched } = admin([{ token_hash: hashToken("fs_good"), user_id: "u42", id: "tok1" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = await lookupToken(db as any, "fs_good");
    expect(ctx).toMatchObject({ userId: "u42", destructive: "confirm" });
    expect(touched).toContain("mcp_tokens");
  });

  it("rejects unknown or revoked tokens", async () => {
    const { db } = admin([{ token_hash: hashToken("fs_good"), user_id: "u42", id: "tok1" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await lookupToken(db as any, "fs_revoked")).toBeNull();
  });
});

describe("MCP initialize", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = { supabase: {} as any, userId: "u", destructive: "allow" as const };
  it("echoes a supported protocol version and falls back otherwise", async () => {
    const a = await handleMcpMessage({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, ctx);
    expect((a?.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
    const b = await handleMcpMessage({ id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, ctx);
    expect((b?.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
  });
});
