import { NextResponse, type NextRequest } from "next/server";
import { handleMcpMessage, type JsonRpcRequest } from "@/lib/mcp/handle";
import { resolveMcpContext } from "@/lib/mcp/auth";

export const maxDuration = 60;

async function handle(req: NextRequest) {
  const ctx = await resolveMcpContext(req.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. In cloud mode pass Authorization: Bearer <mcp token>." } },
      { status: 401 },
    );
  }

  const body = (await req.json()) as JsonRpcRequest | JsonRpcRequest[];
  if (Array.isArray(body)) {
    const out = [];
    for (const msg of body) {
      const res = await handleMcpMessage(msg, ctx);
      if (res) out.push(res);
    }
    return NextResponse.json(out);
  }
  const res = await handleMcpMessage(body, ctx);
  if (!res) return new NextResponse(null, { status: 202 });
  return NextResponse.json(res);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET() {
  return NextResponse.json({
    name: "focusspace",
    version: "0.1.0",
    protocol: "mcp",
    transport: "streamable-http",
    hint: "POST JSON-RPC to this URL. Local mode needs no token. Cloud mode needs a Bearer token from Settings → Agents.",
  });
}
