import { z } from "zod";
import { makeTaskTools } from "@/lib/ai/tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type RpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: RpcId;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: RpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function ok(id: RpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function err(id: RpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function jsonSchemaOf(schema: unknown): Record<string, unknown> {
  try {
    const toJson = (z as unknown as { toJSONSchema?: (s: unknown) => Record<string, unknown> }).toJSONSchema;
    if (typeof toJson === "function") return toJson(schema);
  } catch { /* fall through */ }
  return { type: "object", additionalProperties: true };
}

export function listToolDefs(tools: ReturnType<typeof makeTaskTools>) {
  return Object.entries(tools).map(([name, t]) => {
    const rec = t as { description?: string; inputSchema?: unknown };
    return {
      name,
      description: rec.description ?? name,
      inputSchema: jsonSchemaOf(rec.inputSchema),
    };
  });
}

export async function handleMcpMessage(
  message: JsonRpcRequest,
  ctx: { supabase: SupabaseClient<Database>; userId: string; destructive: "allow" | "confirm" },
): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;
  const method = message.method ?? "";

  if (method === "notifications/initialized" || method.startsWith("notifications/")) return null;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "focusspace", version: "0.1.0" },
      instructions:
        "Call get_workspace_state first. After creating a task, ask before start_timer. Use analytics_* for any focus-time question.",
    });
  }

  if (method === "ping") return ok(id, {});

  const tools = makeTaskTools(ctx.supabase, ctx.userId, { destructive: ctx.destructive });

  if (method === "tools/list") {
    return ok(id, { tools: listToolDefs(tools) });
  }

  if (method === "tools/call") {
    const name = String(message.params?.name ?? "");
    const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
    const t = tools[name] as { execute?: (a: unknown, opts: unknown) => Promise<unknown> } | undefined;
    if (!t?.execute) return err(id, -32601, `Unknown tool: ${name}`);
    try {
      const output = await t.execute(args, { messages: [], abortSignal: undefined });
      const text = typeof output === "string" ? output : JSON.stringify(output, null, 2);
      return ok(id, { content: [{ type: "text", text }], isError: false });
    } catch (e) {
      return ok(id, {
        content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
        isError: true,
      });
    }
  }

  if (method === "resources/list") return ok(id, { resources: [] });
  if (method === "prompts/list") return ok(id, { prompts: [] });

  return err(id, -32601, `Method not found: ${method}`);
}
