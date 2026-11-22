import type { NextRequest } from "next/server";
import { json, preflight, withExtension } from "@/lib/extension/http";
import { isLocalMode } from "@/lib/mode";
import { LOCAL_DISPLAY_NAME, LOCAL_USER_EMAIL } from "@/lib/local/ids";

/** Account shown in the extension header: name, email, avatar (+ the site theme). */
export async function GET(req: NextRequest) {
  return withExtension(req, async ({ db, userId }) => {
    const [{ data: profile }, { data: settings }] = await Promise.all([
      db.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle(),
      db.from("user_settings").select("theme").eq("user_id", userId).maybeSingle(),
    ]);
    let email: string | null = null;
    let meta: Record<string, unknown> = {};
    if (isLocalMode()) {
      email = LOCAL_USER_EMAIL;
    } else {
      const { data } = await db.auth.admin.getUserById(userId);
      email = data.user?.email ?? null;
      meta = data.user?.user_metadata ?? {};
    }
    const pick = (...vals: unknown[]) => vals.find((v): v is string => typeof v === "string" && v.length > 0);
    return json(req, {
      id: userId,
      email,
      name: pick(profile?.display_name, meta.full_name, meta.name, email?.split("@")[0], isLocalMode() ? LOCAL_DISPLAY_NAME : null) ?? "FocusSpace user",
      avatarUrl: pick(profile?.avatar_url, meta.avatar_url, meta.picture) ?? null,
      /** "light" | "dark" | "system" — the extension follows the site's theme setting. */
      theme: settings?.theme ?? "system",
    });
  });
}

export const OPTIONS = preflight;
