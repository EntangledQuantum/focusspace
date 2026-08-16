import { describe, expect, it } from "vitest";
import { handleMcpMessage } from "@/lib/mcp/handle";
import { makeTaskTools } from "@/lib/ai/tools";
import { listToolDefs } from "@/lib/mcp/handle";
import { MAX_ESTIMATED_POMOS } from "@/lib/mode";

const fakeDb = {
  from() {
    return {
      select() { return this; },
      insert() { return this; },
      update() { return this; },
      delete() { return this; },
      upsert() { return this; },
      eq() { return this; },
      neq() { return this; },
      is() { return this; },
      in() { return this; },
      gte() { return this; },
      ilike() { return this; },
      filter() { return this; },
      not() { return this; },
      order() { return this; },
      limit() { return this; },
      single() { return Promise.resolve({ data: null, error: null }); },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(fn: (v: unknown) => unknown) { return Promise.resolve(fn({ data: [], error: null })); },
    };
  },
};

describe("MCP protocol", () => {
  it("answers initialize", async () => {
    const res = await handleMcpMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { supabase: fakeDb as any, userId: "u", destructive: "allow" },
    );
    expect(res?.result).toMatchObject({
      protocolVersion: "2025-03-26",
      serverInfo: { name: "focusspace" },
    });
  });

  it("lists the shared tool catalog including workspace + analytics + timer", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = makeTaskTools(fakeDb as any, "u", { destructive: "allow" });
    const names = listToolDefs(tools).map((t) => t.name);
    for (const required of [
      "get_workspace_state", "create_task", "start_timer", "reset_task_progress",
      "analytics_overview", "analytics_heatmap", "analytics_compare", "confirm_action",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("caps pomodoro estimates at 24", () => {
    expect(MAX_ESTIMATED_POMOS).toBe(24);
  });
});
