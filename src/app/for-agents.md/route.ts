import { FOR_AGENTS_MD } from "@/lib/agent/for-agents.md";

export async function GET() {
  return new Response(FOR_AGENTS_MD, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
