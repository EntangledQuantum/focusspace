#!/usr/bin/env npx tsx
/**
 * stdio MCP transport for Hermes / OpenClaw on the same machine.
 * Speaks JSON-RPC lines on stdin/stdout. Uses local SQLite when
 * FOCUSSPACE_MODE=local (the default for this script).
 */
process.env.FOCUSSPACE_MODE = process.env.FOCUSSPACE_MODE || "local";
process.env.NEXT_PUBLIC_FOCUSSPACE_MODE = process.env.NEXT_PUBLIC_FOCUSSPACE_MODE || "local";

import readline from "node:readline";
import { handleMcpMessage, type JsonRpcRequest } from "../src/lib/mcp/handle";
import { createLocalDb } from "../src/lib/local/builder";
import { executeQuery } from "../src/lib/local/execute";
import { LOCAL_USER_ID } from "../src/lib/local/ids";
import type { Database } from "../src/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabase = createLocalDb(executeQuery) as unknown as SupabaseClient<Database>;

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function write(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed: JsonRpcRequest;
  try {
    parsed = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  const res = await handleMcpMessage(parsed, { supabase, userId: LOCAL_USER_ID, destructive: "allow" });
  if (res) write(res);
});
