import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { hashToken } from "@/lib/mcp/auth";

// Fake service-role client: one valid token belonging to user "u1".
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        update: () => q,
        delete: () => q,
        eq(col: string, val: unknown) { filters[col] = val; return q; },
        maybeSingle: async () => ({
          data: table === "mcp_tokens" && filters.token_hash === hashToken("fs_good") ? { id: "tok1", user_id: "u1" } : null,
          error: null,
        }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: null, error: null })),
      };
      return q;
    },
  }),
}));

const EXT_ORIGIN = "chrome-extension://geafjhcohahpagdejhgfgefeoifnkijk";
const env = { ...process.env };

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`https://focusspace.live${path}`, init);
}

describe("extension API auth", () => {
  beforeAll(() => {
    delete process.env.FOCUSSPACE_MODE;
    delete process.env.NEXT_PUBLIC_FOCUSSPACE_MODE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  });
  afterAll(() => { process.env = env; });

  it("rejects missing and unknown bearer tokens with CORS headers for the extension", async () => {
    const { withExtension } = await import("@/lib/extension/http");
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const none = await withExtension(req("/api/extension/state", { headers: { origin: EXT_ORIGIN } }), handler);
    expect(none.status).toBe(401);
    expect(none.headers.get("access-control-allow-origin")).toBe(EXT_ORIGIN);

    const bad = await withExtension(req("/api/extension/state", { headers: { authorization: "Bearer fs_nope" } }), handler);
    expect(bad.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("resolves a valid token to its owner", async () => {
    const { withExtension } = await import("@/lib/extension/http");
    let seen = "";
    const res = await withExtension(
      req("/api/extension/state", { headers: { authorization: "Bearer fs_good" } }),
      async ({ userId }) => { seen = userId; return NextResponse.json({ ok: true }); },
    );
    expect(res.status).toBe(200);
    expect(seen).toBe("u1");
  });

  it("maps command errors to their status instead of a 500", async () => {
    const { withExtension } = await import("@/lib/extension/http");
    const { CommandError } = await import("@/lib/extension/service");
    const res = await withExtension(
      req("/api/extension/timer", { headers: { authorization: "Bearer fs_good" } }),
      async () => { throw new CommandError("Timer is not running."); },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Timer is not running." });
  });

  it("only mints tokens for same-origin requests from the site", async () => {
    const { POST } = await import("@/app/api/extension/token/route");
    const cross = await POST(req("/api/extension/token", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(cross.status).toBe(403);
    const fromExtension = await POST(req("/api/extension/token", { method: "POST", headers: { origin: EXT_ORIGIN } }));
    expect(fromExtension.status).toBe(403);
    expect(cross.headers.get("access-control-allow-origin")).toBeNull();
  });
});
