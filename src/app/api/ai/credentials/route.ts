import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/ai/crypto";
import { loadOwnCredentials } from "@/lib/ai/gateway";
import { checkBaseUrl } from "@/lib/ai/models";
import { isLocalMode } from "@/lib/mode";

// Stores a user's own API key ENCRYPTED at rest; the client never receives it
// back. Status is mirrored to user_settings.ai_has_own_key for the UI.
// Leaving apiKey blank keeps the stored key (e.g. to change only the model or URL).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { baseUrl, apiKey, model } = await req.json().catch(() => ({}));
  const check = checkBaseUrl(baseUrl || "", { allowPrivate: isLocalMode() });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const existing = apiKey ? null : await loadOwnCredentials(supabase);
  const key: string | undefined = apiKey || existing?.apiKey;
  if (!key) return NextResponse.json({ error: "An API key is required." }, { status: 400 });

  const { error: credErr } = await supabase.from("ai_credentials").upsert({
    user_id: user.id,
    base_url: check.url,
    model: typeof model === "string" && model.trim() ? model.trim() : null,
    api_key_cipher: encryptSecret(key),
    created_at: new Date().toISOString(),
  });
  if (credErr) return NextResponse.json({ error: credErr.message }, { status: 400 });

  await supabase.from("user_settings").update({ ai_has_own_key: true, ai_use_own_key: true }).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("ai_credentials").delete().eq("user_id", user.id);
  await supabase.from("user_settings").update({ ai_has_own_key: false, ai_use_own_key: false }).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
