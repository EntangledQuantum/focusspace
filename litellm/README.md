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
AI_API_KEY        = <LITELLM_MASTER_KEY>
AI_DEFAULT_MODEL  = gemini-2.5-flash
AI_ALLOWED_MODELS = gemini-2.5-flash,gemini-2.5-pro,claude-sonnet,gpt-4o,gpt-4o-mini
```
Redeploy. The model picker in Settings → AI now lists all of them.
