# FocusSpace LiteLLM proxy

One OpenAI-compatible gateway in front of Gemini + Claude + ChatGPT, so the
app's **shared** AI key can offer all of them. The FocusSpace app never imports
LiteLLM — it just calls this proxy's `/v1` endpoint (OpenAI protocol).

> If you only have a Gemini key and only want Gemini, you don't need this —
> point `AI_BASE_URL` straight at `https://generativelanguage.googleapis.com/v1beta/openai`.
> Deploy this proxy when you want multiple providers behind one key.

## How it fits together
```
FocusSpace (Vercel)  ──OpenAI protocol──▶  LiteLLM proxy  ──▶  Gemini / Anthropic / OpenAI
   AI_BASE_URL = https://<your-proxy>/v1
   AI_API_KEY  = <LITELLM_MASTER_KEY>
   AI_ALLOWED_MODELS = gemini-2.5-flash,gemini-2.5-pro,claude-sonnet,gpt-4o,gpt-4o-mini
```
It must run as a **persistent server** (not Vercel functions) — Railway, Render,
Fly.io, or any Docker host.

## Proxy environment variables
| Variable | Required | Purpose |
|---|---|---|
| `LITELLM_MASTER_KEY` | yes | Auth for the proxy → becomes the app's `AI_API_KEY` |
| `GEMINI_API_KEY` | for Gemini | Google AI Studio key |
| `ANTHROPIC_API_KEY` | for Claude | Anthropic key |
| `OPENAI_API_KEY` | for ChatGPT | OpenAI key |

Add only the providers you have keys for; comment the rest out in `config.yaml`.

## Deploy (Docker)
```bash
cd litellm
docker build -t focusspace-litellm .
docker run -p 4000:4000 \
  -e LITELLM_MASTER_KEY=sk-... \
  -e GEMINI_API_KEY=AIza... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e OPENAI_API_KEY=sk-... \
  focusspace-litellm
# OpenAI-compatible base is now http://localhost:4000/v1
```
Railway/Render/Fly: deploy this folder as a Docker service, set the same env
vars; they inject `$PORT` automatically.

## Point the app at it
In Vercel set:
```
AI_BASE_URL       = https://<your-proxy-domain>/v1
AI_API_KEY        = <LITELLM_MASTER_KEY or a virtual key>
AI_DEFAULT_MODEL  = gemini-2.5-flash
AI_ALLOWED_MODELS = gemini-2.5-flash,gemini-2.5-pro,anthropic/claude-sonnet-4-5,gpt-4o-mini
```
Redeploy. The model pickers (Settings → Focus AI and the chat header) list the
allow-list.

## What FocusSpace uses from LiteLLM
| Endpoint | Used for |
|---|---|
| `POST /v1/chat/completions` | every chat turn (OpenAI protocol, streamed, with tools) |
| `GET /v1/models` | model discovery when `AI_ALLOWED_MODELS=*`, and for users who paste a LiteLLM URL + virtual key as their own key |
| `GET /model_group/info` | enriches model ids with provider, max input tokens and `supports_function_calling` (models that can't call tools are flagged in the picker) |

- **Allow-list:** `AI_ALLOWED_MODELS` is the allow-list for the shared key. Set it
  to `*` to offer every model the key can list (LiteLLM key `models`
  restrictions then decide). Wildcard routes (`anthropic/*`) aren't listed as
  pickable ids — add concrete ids to the allow-list.
- **Per-user spend:** requests through the shared gateway carry the OpenAI `user`
  field (a hash of the FocusSpace user id), so LiteLLM's end-user spend tracking /
  customer budgets work. Budget errors are shown to the user as "budget or quota
  used up".
- **Virtual keys:** you can hand people a LiteLLM virtual key (`/key/generate`
  with `models` + `max_budget`); in Settings → Focus AI → *Use my own API key*
  they paste the proxy URL and that key, and the picker shows exactly the models
  the key may use.
