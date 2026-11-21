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

## Update 2026-11-21 — AI overhaul (global panel, model discovery, hardened tools)
- **One entry point on every tab.** `src/components/ai/AILauncher.tsx` (mounted once in `Providers.tsx`) renders a floating Focus AI button bottom-right (raised on mobile above the Spotify mini bar, and on `/focus` above the dock below 1040px). The panel is `next/dynamic`-loaded only after first open (`useAIPanel` zustand store in `src/lib/stores/ai.ts`: `open`, `opened`, `projectId`). Projects' "Ask AI" opens the same panel; the Projects page publishes `projectId` when narrowed to one project. Chat requests send `{ page, focusProjectId }` → system prompt says which tab is open. Esc closes.
- **Fresh chat on open.** Nothing loads on open; re-opening within 10 min continues the in-memory chat. History view (header clock icon) with skeleton loading, per-chat loading state, delete with inline confirm, New chat. Chats are created on the first PUT `/api/ai/conversations/[id]` (client-minted UUID, upsert) — GET no longer bootstraps empty chats (legacy "New chat" rows are hidden). PUT stamps increasing `created_at` so message order survives reloads (batch inserts shared `now()`). Inline error bar with Retry.
- **Models.** `src/lib/ai/models.ts` (pure: URL normalise/`checkBaseUrl` SSRF guard, `parseModelList` for OpenAI/Gemini/OpenRouter/Groq/Anthropic/Ollama/OpenCode shapes, `parseLiteLLMInfo` for `/model_group/info` + `/model/info`, `mergeModels`, `filterModels`), `discovery.ts` (server fetch; `globalModelOptions()` cached 10 min). `GET/POST/PUT /api/ai/models`: GET = current mode's list + selection (own key → live discovery; shared → `AI_ALLOWED_MODELS`, enriched when the gateway is LiteLLM; `AI_ALLOWED_MODELS=*` opts into discovery), POST = discover for typed creds (settings form), PUT = persist (`ai_credentials.model` for own key, `user_settings.ai_model` for shared — allow-list enforced). `ModelPicker.tsx` (searchable, keyboard, manual id for own keys) is used in the chat header and `src/components/settings/AISettings.tsx` (the old AISection moved here; provider presets, Load models, LiteLLM detection). Credentials can be re-saved without re-typing the key. Models that only speak non-chat-completions APIs are filtered.
- **Errors.** `src/lib/ai/errors.ts#friendlyAiError` maps provider/LiteLLM errors (auth, budget/quota, no tool support, context, unknown model, rate limit, network) — used by `toUIMessageStreamResponse({ onError })` and validate.
- **LiteLLM.** Shared-gateway requests to proxy-like hosts carry a hashed `user` (end-user spend tracking). README documents endpoints, `*`, virtual keys; config uses `anthropic/*` wildcard.
- **Tools (shared by chat + MCP, still `makeTaskTools`).** All queries go through `scopeToUser()` (`src/lib/ai/scoped.ts`) — required because hosted MCP uses the service-role client (RLS bypassed; before this, fuzzy lookups could touch other users' rows). `resolve.ts` resolvers: exact > single substring > *ambiguous error listing ids* (no more silently picking the newest match). Failures throw `ToolError` (AI SDK tool-error / MCP `isError`). One delete implementation (`confirm.ts#performDelete`, ownership-checked) for direct, `/api/ai/confirm` and MCP `confirm_action`; `confirm_action` is MCP-only (`surface: "mcp"`), so the in-app model can't self-confirm. Timer: start ends any open session first and resets the pomodoro cycle on task change; skip/stop(reset) close the session like the UI; `set_active_task`/`start_timer` accept `projectRef` (first open task) and refuse switching mid-session. New `reorder_tasks`, `reorder_subtasks`; subtasks addressable by id. `update_settings` covers sounds (`SOUND_PRESETS` ids). MCP validates args with zod (defaults applied), publishes input-side JSON schemas (`io:"input"`) and tool annotations.
- **Timer sync.** `pullTimerState()` exported from `useTimerSync.ts`; the panel calls it after timer tools so the clock follows on any tab; the Focus page now reloads the active task when the store's `currentTaskId` changes (AI/MCP select).
- **No migration needed** for this pass. Tests: `tests/ai-models.test.ts`, `tests/ai-tools.test.ts`.

## Update 2026-06-15 — AI works; UX/efficiency pass landed (branch `claude/loving-lovelace-kl5bq2`)
AI is functional in production. Fixed a batch of suboptimal behaviours:
- **Usage meter stuck at 0** → root cause: the openai-compatible provider only emits token usage on streamed responses when `includeUsage: true` is passed to `createOpenAICompatible`. Added it to all three builders in `gateway.ts`, so `streamText`'s `onFinish.totalUsage` now populates and `recordUsage` writes real numbers.
- **Agent dumped ALL tasks** to find one → added `search_tasks` (Postgres case-insensitive regex via PostgREST `imatch`, falls back to substring; returns title+id only) and `get_task` (full detail incl. subtasks/tags by id). System prompt now steers: search → get_task → edit, reserving `list_tasks` for "show everything" requests.
- **Ugly tool cards** → `ToolCard.tsx` now shows a one-line summary ("Read 3 tasks" / the write result) collapsed by default, with a chevron to expand the full output. Errors collapse too.
- **No chat history** → `AIChatPanel.tsx` header gained a History dropdown (list/load/delete conversations); list refreshes after each turn.
- **Input box fixed-height w/ inner scrollbar** → textarea auto-grows to ~8 lines (`INPUT_MAX_HEIGHT`) then scrolls; rounder corners on input + panel.

## ⚠️ EARLIER STATUS (superseded by the update above): AI feature does NOT work yet (needs debugging)
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
