# FocusSpace — Handoff (AI assistant feature)

> Durable handoff for a fresh agent. Read this first. The repo is re-cloned per
> session, so this file (committed on branch `claude/ai-task-agent`) is the
> source of truth.

## Repo / branch state
- GitHub repo: **EntangledQuantum/focusspace**. Local dir: `/home/user/focusspace`.
- **master** (`HEAD = 677d920`) has all prior work merged: Spotify rewrite, pink/purple glass redesign, live effects, the glass `backdrop-filter` fix, landing page, etc.
- **`claude/ai-task-agent`** (off master, NOT merged) = the AI assistant feature + LiteLLM proxy scaffold + Projects "show all / pick projects" toggle. This is the active branch.
- Per project rules: develop on the feature branch; push with `git push -u origin claude/ai-task-agent`; do NOT push to master without explicit ask. End commit messages with the session URL line.

## Tech stack & conventions
- Next.js **16** (App Router, Turbopack, **Lightning CSS** minifier), React 19, TypeScript, Tailwind v4 (`@theme` in `src/app/globals.css`), framer-motion, lucide-react, sonner, zustand (UI), **@tanstack/react-query** (server state).
- Supabase via `@supabase/ssr`. **RLS** scopes every table to `(select auth.uid()) = user_id`. Server routes build a cookie-bound client via `createClient()` from `src/lib/supabase/server.ts` (it `await`s `cookies()`), then `supabase.auth.getUser()`.
- **AI SDK v6** (`ai@^6`, `@ai-sdk/react@^3`, `@ai-sdk/openai-compatible@^2`). v6 specifics already used: `tool({ inputSchema })`, `streamText`, `await convertToModelMessages(messages)` (it's async in v6!), `result.toUIMessageStreamResponse()`, `stopWhen: stepCountIs(n)`, `onFinish({ totalUsage })` → `totalUsage.inputTokens/outputTokens`. Client: `useChat` + `DefaultChatTransport` from `ai`; `sendMessage({text}, {body:{...}})` passes per-call body; messages are UIMessages with `.parts` (`type:"text"` or `type:"tool-<name>"`/`"dynamic-tool"` with `state` ∈ input-streaming|input-available|output-available|output-error).

## ⚠️ CURRENT STATUS: AI feature does NOT work yet (needs debugging)
User confirmed: migration `0009` applied, env vars added on Vercel, but **AI is not working** — details TBD. Nothing was diagnosed yet. First thing to do next session: get the failing request details.

**Debug checklist (ask user / inspect on the `claude/ai-task-agent` Vercel preview):**
1. Does the **"Ask AI"** button even show on Projects? It's gated on `process.env.NEXT_PUBLIC_AI_ENABLED === "true"` **AND** the per-user `ai_enabled` toggle (Settings → AI → Enable AI). `NEXT_PUBLIC_*` is **build-time** — if it was added without a redeploy, the button stays hidden.
2. `GET /api/ai/status` response (Settings → AI). Returns `{ globallyEnabled, gatewayConfigured, models, enabled, hasOwnKey, usage, ... }`. If `gatewayConfigured:false` → `AI_BASE_URL`/`AI_API_KEY` not seen by the server.
3. `POST /api/ai/chat` response — status + body. 401 = not authed; 403 = AI disabled / not enabled; 402 = budget hit; 503 = gateway not configured; 500 = provider/tool error. The UI surfaces errors via `onError` toast (sonner).
4. Confirm env on Vercel (runtime): `AI_BASE_URL`, `AI_API_KEY`, `AI_DEFAULT_MODEL`, `AI_ALLOWED_MODELS`, `AI_FREE_MONTHLY_TOKENS`, `AI_MAX_STEPS`, `AI_ENCRYPTION_KEY`, and build-time `NEXT_PUBLIC_AI_ENABLED`.
5. Likely suspects to check in code if requests 500: the openai-compatible provider call shape for Gemini (`provider.chatModel(modelId)`), the streamed `toUIMessageStreamResponse()` on Vercel Node runtime (`maxDuration=60` set), and whether `convertToModelMessages` is awaited (it is). Gemini 2.5 models are **reasoning models** — they spend output tokens "thinking"; tiny token caps yield empty content (already handled in validate route w/ 256).

## Env / gateway config (what the user set)
Gemini **direct** via Google's OpenAI-compatible endpoint (LiteLLM not deployed):
```
NEXT_PUBLIC_AI_ENABLED = true            # build-time → must redeploy after adding
AI_BASE_URL            = https://generativelanguage.googleapis.com/v1beta/openai   # no trailing slash
AI_API_KEY             = <Gemini key, starts AIzaSyDhx0...>   # also in gitignored .env.local
AI_DEFAULT_MODEL       = gemini-2.5-flash
AI_ALLOWED_MODELS      = gemini-2.5-flash,gemini-2.5-pro,gemini-2.0-flash,gemini-2.5-flash-lite
AI_FREE_MONTHLY_TOKENS = 150000
AI_MAX_STEPS           = 8
AI_ENCRYPTION_KEY      = 158511edf4b803859e33d090b4e484f1032fbf46f1be454253e8f00d59586dab
```
Verified live (curl): the Gemini key + endpoint work, including **function/tool calling**. So the provider side is good; the bug is likely in app wiring/env/runtime.
- Multi-provider (gemini+claude+gpt on one shared key) requires deploying the **LiteLLM proxy** under `litellm/` (config.yaml/Dockerfile/README) and pointing `AI_BASE_URL` at `https://<proxy>/v1`, `AI_API_KEY` = its master key. Needs Anthropic/OpenAI keys (user only has Gemini). Per-user "own key" path already works without the proxy.

## AI feature — files & responsibilities
**DB migration:** `supabase/migrations/0009_ai_and_project_view.sql`
- `user_settings` new cols: `ai_enabled bool`, `ai_model text`, `ai_use_own_key bool`, `ai_has_own_key bool`, `ai_destructive text('allow'|'confirm')`, `projects_show_all bool default true`, `projects_visible_ids text[]`.
- New tables (all RLS owner-only): `ai_credentials` (server-only secrets: `base_url`, `model`, `api_key_cipher`), `ai_usage` (`user_id`,`period`,`tokens_in/out`,`request_count`), `ai_conversations`, `ai_messages` (`parts jsonb`).
- Types mirrored in `src/types/database.ts`.

**Server lib (`src/lib/ai/`):**
- `config.ts` — `AI_GLOBALLY_ENABLED`, `aiServerConfig()` (baseURL/apiKey/defaultModel/allowedModels/freeMonthlyTokens/maxSteps), `globalGatewayConfigured()`.
- `crypto.ts` — AES-256-GCM `encryptSecret/decryptSecret` (key = sha256 of `AI_ENCRYPTION_KEY`).
- `gateway.ts` — `resolveModel(supabase, settings)` → own-key (decrypt cred) else global env; returns `{model, modelId, isOwnKey}` via `createOpenAICompatible(...).chatModel(id)`. `modelFromCreds()` for validate.
- `usage.ts` — `currentPeriod()`, `getUsage()`, `recordUsage()` (read-modify-write upsert).
- `system-prompt.ts` — `buildSystemPrompt()` (today's date in user tz, projects+counts, tags, destructive rules). Uses `Promise.all`.
- `tools.ts` — `makeTaskTools(supabase, userId, {destructive})` → AI SDK `ToolSet`. Read: `list_projects`, `list_tasks`, `recent_completed_tasks`. Projects: create/rename/recolor/delete. Tasks: create/update/set_status/delete. Subtasks: add/update/delete. Tags: create/delete. Name-or-id resolvers (`resolveProject/resolveTask`); deletes route through `deferOrRun` → if `confirm` mode returns `{__confirm,action,id,summary}` instead of acting.
- `confirm.ts` — `executeConfirmedAction(supabase, action, id)` for the deferred deletes (re-implements delete bodies; **/simplify flagged this as duplication of tools.ts delete logic — candidate to dedup**).
- `toolMeta.ts` — client-safe tool-name → {verb, icon, destructive} for cards.

**API routes (`src/app/api/ai/`):**
- `chat/route.ts` — POST, `maxDuration=60`. Auth → load settings → budget check (global-key only) → `resolveModel` → `buildSystemPrompt` → `makeTaskTools` → `streamText({... stopWhen: stepCountIs(maxSteps), onFinish: recordUsage})` → `toUIMessageStreamResponse()`. **Persistence is client-driven** (not here).
- `status/route.ts` — GET; the single source for client (flags, models, usage, hasOwnKey). NOTE: settings page also reads `["settings"]`; some overlap (/simplify altitude flag: AISection could derive more from settings).
- `validate/route.ts` — POST; tiny `generateText` (maxOutputTokens 256) to test creds → `{ok, model, sample}`.
- `credentials/route.ts` — POST (encrypt+upsert ai_credentials, set ai_has_own_key/ai_use_own_key=true), DELETE (remove).
- `confirm/route.ts` — POST `{action,id}` → `executeConfirmedAction`.
- `conversations/route.ts` (GET list/bootstrap, POST new) + `conversations/[id]/route.ts` (GET messages, PUT replace, DELETE).

**UI (`src/components/ai/`):**
- `AIChatPanel.tsx` — right slide-in glass panel. `useChat` + `DefaultChatTransport({api:"/api/ai/chat"})`; `send()` calls `sendMessage({text},{body:{focusProjectId}})`. Bootstraps a conversation on open, persists via PUT on status streaming→ready, invalidates board react-query keys (`projects`,`projects-with-tasks`,`tags`,`tasks`,`subtasks-by-task`) when tool outputs land. Confirm cards → `/api/ai/confirm`.
- `ChatMessage.tsx` — renders `.parts`: text → `Markdown`, tool parts → `ToolCard`.
- `ToolCard.tsx` — action card (running/done/error/needs-confirmation w/ Confirm/Cancel). `isConfirm()` detects `{__confirm}`.
- `Markdown.tsx` — react-markdown + remark-gfm; styled via `.ai-md` in globals.css.

**Wiring into pages:**
- `src/app/(app)/projects/page.tsx` — top toolbar: "Show all" toggle + per-project chip selector (synced via `user_settings.projects_show_all/projects_visible_ids`, saved with `saveView()`), "Ask AI" button (gated `aiAvailable = NEXT_PUBLIC_AI_ENABLED && settings.ai_enabled`), mounts `<AIChatPanel>`. Renders `visibleProjects` (gated by selection).
- `src/app/(app)/settings/page.tsx` — `AISection` component (fetch `/api/ai/status`): enable toggle, model picker, usage meter, "confirm deletes" toggle, own-key form (base URL/key/model + Test/Save/Remove). Hidden unless `status.globallyEnabled`.
- `src/app/globals.css` — added `.ai-md` markdown styles.

## Important gotchas learned this project
- **Glass blur**: Lightning CSS strips the unprefixed `backdrop-filter` from `.glass` (keeps only `-webkit-`), which newest Chromium ignores. Fixed by injecting the rule raw via `<style dangerouslySetInnerHTML>` in `src/app/layout.tsx` (`GLASS_BACKDROP_CSS`). Do NOT move glass backdrop-filter back into globals.css. Inline React `style={{backdropFilter,WebkitBackdropFilter}}` bypasses Lightning and is fine.
- `saturate()` in backdrop-filter must be `saturate(140%)` not `saturate(1.4)` (some Chromium rejects the unitless form).
- `set-state-in-effect` and similar are an accepted lint **baseline** across this codebase (build doesn't run eslint). Don't churn on them.
- Spotify `/search` `limit` max is **10** (400 otherwise).
- `createClient()` (browser + server) has placeholder fallbacks so builds succeed without env.

## Verified vs not
- ✅ Typecheck (`npx tsc --noEmit`) clean; ✅ `npm run build` clean (20 routes incl. all `/api/ai/*`); ✅ lint only shows accepted baseline.
- ✅ Gemini key+endpoint+tool-calling verified via curl.
- ❌ NOT verified: a real end-to-end chat turn through the deployed app (the reported breakage). That's the next task.

## Migrations (apply in order in Supabase SQL editor)
0001–0008 already applied historically; **0009 applied** (per user). Files in `supabase/migrations/`.

## Latest commits on `claude/ai-task-agent`
- AI assistant feature (infra, tools, routes, UI, migration, types).
- `fix(ai): validate token headroom for reasoning models`.
- `feat(ai): add deployable LiteLLM proxy` (`litellm/`).
- this handoff doc.
