import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolveMcpContext } from "@/lib/mcp/auth";
import { createClient } from "@/lib/supabase/server";
import { CommandError, type StateHint } from "@/lib/extension/service";
import { instrumentDb, serverTiming } from "@/lib/extension/timing";

/**
 * Shared plumbing for /api/extension/*: Bearer-token auth (the same personal
 * access tokens as the hosted MCP endpoint) and CORS for chrome-extension://
 * origins. Extension pages with host_permissions bypass CORS anyway; the
 * headers keep self-hosted origins granted via optional permissions working too.
 * Every response carries a Server-Timing header (auth / db round trips / total).
 */

export interface ExtensionContext {
  db: SupabaseClient<Database>;
  userId: string;
  /** Add a named entry (e.g. spotify) to this response's Server-Timing header. */
  mark: (name: string, ms: number) => void;
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!origin.startsWith("chrome-extension://")) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Expose-Headers": "Server-Timing",
    "Timing-Allow-Origin": origin,
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

/**
 * The website's own session (cookies → RLS-scoped client). Lets site tabs use
 * the same server command path as the extension, so they can never diverge.
 */
async function cookieAuth(): Promise<{ supabase: SupabaseClient<Database>; userId: string } | null> {
  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

export async function withExtension(
  req: NextRequest,
  fn: (ctx: ExtensionContext) => Promise<NextResponse>,
  opts: { allowCookie?: boolean } = {},
): Promise<NextResponse> {
  const t0 = performance.now();
  const header = req.headers.get("authorization");
  const auth = header || !opts.allowCookie
    ? await resolveMcpContext(header, { withSettings: false })
    : await cookieAuth();
  const authMs = performance.now() - t0;
  if (!auth) return json(req, { error: "Not signed in. Log in again from the extension." }, 401);

  const { db, stats } = instrumentDb(auth.supabase as SupabaseClient<Database>);
  const marks: string[] = [];
  const mark = (name: string, ms: number) => { marks.push(`${name};dur=${ms.toFixed(1)}`); };
  let res: NextResponse;
  try {
    res = await fn({ db, userId: auth.userId, mark });
  } catch (e) {
    if (e instanceof CommandError) {
      res = json(req, { error: e.message, ...(e.state ? { state: e.state } : {}) }, e.status);
    } else {
      console.error("[extension]", e);
      res = json(req, { error: "Something went wrong." }, 500);
    }
  }
  res.headers.set("Server-Timing", [serverTiming({ authMs, totalMs: performance.now() - t0, stats }), ...marks].join(", "));
  return res;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's "what I'm showing" hint ({ taskId, projectId }); anything malformed is ignored. */
export function readHint(raw: unknown): StateHint {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);
  return { taskId: id(o.taskId), projectId: id(o.projectId) };
}

export async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
