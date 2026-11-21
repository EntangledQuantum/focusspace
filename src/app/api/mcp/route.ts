import { NextResponse, type NextRequest } from "next/server";
import { handleMcpMessage, type JsonRpcRequest } from "@/lib/mcp/handle";
import { resolveMcpContext } from "@/lib/mcp/auth";

export const maxDuration = 60;

// Stateless MCP "Streamable HTTP" endpoint: every POST carries one JSON-RPC
// message (or a batch) and gets a plain JSON reply. No server-initiated SSE
// stream and no session ids, which the spec allows.

const rpcError = (code: number, message: string, status: number) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status });

export async function POST(req: NextRequest) {
  const ctx = await resolveMcpContext(req.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: send Authorization: Bearer <token> (create one in FocusSpace → Settings → Agents & MCP)." } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="focusspace"' } },
    );
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return rpcError(-32700, "Parse error: body must be JSON-RPC 2.0.", 400);
  }

  if (Array.isArray(body)) {
    const out = [];
    for (const msg of body) {
      const res = await handleMcpMessage(msg, ctx);
      if (res) out.push(res);
    }
    return out.length ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
  }
  const res = await handleMcpMessage(body, ctx);
  if (!res) return new NextResponse(null, { status: 202 });
  return NextResponse.json(res);
}

/**
 * MCP clients open a GET with Accept: text/event-stream for server pushes; we
 * have none, so the spec answer is 405. Browsers/curl get a short descriptor.
 */
export async function GET(req: NextRequest) {
  if ((req.headers.get("accept") ?? "").includes("text/event-stream")) {
    return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
  }
  return NextResponse.json({
    name: "focusspace",
    protocol: "mcp",
    transport: "streamable-http (stateless, JSON responses)",
    auth: "Authorization: Bearer <token from Settings → Agents & MCP> (not needed for a local install)",
    guide: {
      cloud: "https://focusspace.live/for-agents/cloud.md",
      self_host: "https://focusspace.live/for-agents.md",
    },
  });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
