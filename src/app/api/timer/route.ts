import type { NextRequest } from "next/server";
import { preflight, withExtension } from "@/lib/extension/http";
import { timerGet, timerPost } from "@/lib/extension/timer-route";

/**
 * The website's timer API (cookie session, or a bearer token). Same service as
 * the extension: the server row is the single source of truth and every
 * timestamp is the server's.
 */
export async function GET(req: NextRequest) {
  return withExtension(req, (ctx) => timerGet(req, ctx), { allowCookie: true });
}

export async function POST(req: NextRequest) {
  return withExtension(req, (ctx) => timerPost(req, ctx), { allowCookie: true });
}

export const OPTIONS = preflight;
