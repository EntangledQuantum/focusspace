import { NextResponse, type NextRequest } from "next/server";
import { isLocalMode } from "@/lib/mode";
import { executeQuery } from "@/lib/local/execute";
import type { QuerySpec } from "@/lib/local/types";

export async function POST(req: NextRequest) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: "Local query API is only available in local mode." }, { status: 404 });
  }
  const spec = (await req.json()) as QuerySpec;
  if (!spec?.table || !spec?.op) {
    return NextResponse.json({ error: "Invalid query spec." }, { status: 400 });
  }
  const result = executeQuery(spec);
  return NextResponse.json(result);
}
