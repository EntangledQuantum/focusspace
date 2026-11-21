import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolveMcpContext } from "@/lib/mcp/auth";
import { CommandError } from "@/lib/extension/service";

/**
 * Shared plumbing for /api/extension/*: Bearer-token auth (the same personal
 * access tokens as the hosted MCP endpoint) and CORS for chrome-extension://
 * origins. Extension pages with host_permissions bypass CORS anyway; the
 * headers keep self-hosted origins granted via optional permissions working too.
 */

export interface ExtensionContext {
  db: SupabaseClient<Database>;
  userId: string;
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!origin.startsWith("chrome-extension://")) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function preflight(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(req), "Cache-Control": "no-store" } });
}

export async function withExtension(
  req: NextRequest,
  fn: (ctx: ExtensionContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const ctx = await resolveMcpContext(req.headers.get("authorization"));
  if (!ctx) return json(req, { error: "Not signed in. Log in again from the extension." }, 401);
  try {
    return await fn({ db: ctx.supabase as SupabaseClient<Database>, userId: ctx.userId });
  } catch (e) {
    if (e instanceof CommandError) return json(req, { error: e.message }, e.status);
    console.error("[extension]", e);
    return json(req, { error: "Something went wrong." }, 500);
  }
}

export async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
