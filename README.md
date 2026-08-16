<p align="center">
  <img src="./src/app/icon.png" width="96" style="border-radius:22px;" alt="FocusSpace" />
</p>

<h1 align="center">FocusSpace</h1>

<p align="center">
  <strong>One task. One timer. Your music, your data, and a space that disappears around your work.</strong>
</p>

<p align="center">
  🌐 <a href="https://focusspace.live/"><strong>focusspace.live</strong></a>
  ·
  🤖 <a href="https://focusspace.live/for-agents">For agents</a>
</p>

---

## What is FocusSpace?

**FocusSpace** is a modern Pomodoro + productivity tracker built around a single idea: do one thing at a
time. You pick a task, run the timer, and review the data — without the clutter, gamification, or feeds
that most "productivity" apps bury you in.

It pairs a distraction-free focus screen with full project/task management, Spotify playback, rich
analytics, living wallpapers, and an optional **Focus AI** assistant. Agents (Hermes, OpenClaw) can drive
the same board, timer, music, settings, and analytics over **MCP**. It's **fully open source** — self-host it
locally with SQLite, or deploy the hosted/Supabase stack.

---

## 📸 Screenshots


### 🏠 Home

<img width="2154" height="1357" alt="image" src="https://github.com/user-attachments/assets/92c10fe7-e96e-4fc3-a030-31dcea22c6d3" />

<img width="2154" height="1357" alt="image" src="https://github.com/user-attachments/assets/33a46880-7623-4fac-99b4-2bbf0e48cb55" />


The public landing page: an animated aurora that drifts with your cursor and bursts on click, a live demo
timer ring, a rotating headline, the feature grid, and the Focus AI banner.

### Focus Area
<img width="2157" height="1358" alt="image" src="https://github.com/user-attachments/assets/3e106933-57fb-4869-9952-621dc07cb659" />

The focus screen — one task, one timer.

### 🗂️ Projects
> _Screenshot placeholder — add `docs/screenshots/projects.png`_

Stacked glass project cards with tasks, subtasks, tags, priority and pomodoro estimates — plus a one-tap
**Run** pill that switches the active task and jumps straight into a focus session.

---

## ✨ Features

- **🎯 Distraction-free focus screen** — a solo gradient timer ring, the active task, and transport
  controls. Nothing else competes for your attention.
- **⏱️ Dual-mode timer** — classic Pomodoro blocks or a Custom Target duration, with smart breaks,
  auto-start, and a per-task session timeline.
- **🗂️ Projects, tasks, subtasks & tags** — full CRUD with notes, priorities, pomodoro estimates, and
  collapsible subtask checklists. Pick which projects to show, or show them all.
- **🤖 Ask AI** *(optional)* — open **Ask AI** on the Projects tab and dictate changes in plain language:
  add or edit projects and tasks, search the board, and read your focus stats. Actions render as live
  cards and update the board instantly.
- **🔌 MCP / agents** — Hermes and OpenClaw can run the same surface over MCP (board, timer, music, settings,
  analytics). Individual local setup, no login. See [For agents](https://focusspace.live/for-agents).
- **🎵 Spotify built in** — Web Playback SDK player with search, playlists, your library, volume/shuffle,
  external-device takeover, and a pop-out mini player.
- **📊 Analytics & streaks** — focus-time KPIs, a last-7-days bar chart, per-tag and per-project
  breakdowns, a GitHub-style heatmap, and streak tracking.
- **🌌 Living wallpapers & effects** — CSS-mesh presets (Aurora / Dusk / Mist / Noir) or your own photo,
  with optional animated effects (Aurora glow, Rainfall, Snowfall, Starfield, Fireflies).
- **🪟 Live glass controls** — Tint + Blur sliders frost every card over your wallpaper, in real time.
- **🔔 Notifications & tones** — browser notifications and Web Audio completion tones, with Do-Not-Disturb
  during focus sessions.
- **🔐 Your data, yours** — local SQLite for self-host, or row-level security on a hosted Supabase.
- **🎨 Dark / Light / System themes**.

---

## 📸 More screenshots

### 📊 Analytics
<img width="2317" height="1358" alt="Screenshot from 2026-08-10 14-24-30" src="https://github.com/user-attachments/assets/7add6108-4a57-4d19-97d9-f29aa8abce35" />


Focus-time stat cards, a last-7-days gradient bar chart, by-project and by-tag breakdowns, and a
contribution-style heatmap of your deep-work history.

### 🤖 Focus AI chat
<img width="2317" height="1358" alt="Screenshot from 2026-08-10 14-24-15" src="https://github.com/user-attachments/assets/949be07b-36c0-42e5-a9f2-a1e3946b59f6" />


The Focus AI panel — branded glass that matches your tint/blur, with action cards for every task it
creates or edits, saved conversation history, and the Focus AI watermark behind the chat.

---

## Tech stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Framer Motion · Zustand · TanStack Query ·
SQLite (`better-sqlite3`) for individual local mode · Supabase (Postgres + Auth + Storage) for hosted ·
Vercel AI SDK · MCP SDK · Spotify Web Playback SDK · lucide-react · Sonner · date-fns

---

## Quick start — local (default for self-host)

Individual self-host: **SQLite**, no login, one implicit user. Data lives in `~/.focusspace/focusspace.db`.

**Requirements:** Node 20+, npm

```bash
git clone https://github.com/EntangledQuantum/focusspace.git
cd focusspace
npm install

# .env.local — local mode only (no cloud keys)
cat > .env.local <<'EOF'
FOCUSSPACE_MODE=local
NEXT_PUBLIC_FOCUSSPACE_MODE=local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
EOF

npm run dev
# Open http://localhost:3000 and click Open FocusSpace
```

Or run the helper (creates `~/.focusspace` and writes `.env.local` if missing):

```bash
node skills/focusspace/scripts/setup-local.mjs
npm install
npm run dev
```

### Docker — same local mode

```bash
docker compose up --build
# Open http://localhost:3000 and click Open FocusSpace
```

Compose sets `FOCUSSPACE_MODE=local`, `NEXT_PUBLIC_FOCUSSPACE_MODE=local`, and mounts a SQLite volume
at `/data` (`FOCUSSPACE_DATA_DIR=/data`). No real Supabase keys required.

---

## Hosted / your own Supabase

> For humans deploying a **focusspace.live-style** instance (shared Postgres + Auth + Storage).
> Agents setting up FocusSpace for one person should use **local mode** above — not this section.

**Requirements:** Node 20+, a [Supabase](https://supabase.com) project.

```bash
cd focusspace
npm install
node scripts/setup-env.mjs
# Enter Supabase URL, anon key, service role key, site URL (http://localhost:3000)

# Apply migrations 0001–0010 in order via Supabase Dashboard → SQL Editor
#    supabase/migrations/0001_init.sql … 0010_timer_mcp.sql

npm run dev
```

### Core environment variables

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL (or `http://localhost:3000` for dev) |

Leave `FOCUSSPACE_MODE` unset (or `cloud`) for this path.

### Focus AI environment variables (optional)

The assistant speaks the OpenAI-compatible protocol — point it at a
[LiteLLM proxy](https://docs.litellm.ai/docs/) or any compatible endpoint. The feature stays hidden and the
build succeeds with all of these unset. Users may also add **their own** key + model in Settings (encrypted
at rest, never returned to the browser).

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_AI_ENABLED` | `true` to enable Focus AI globally (client-visible flag) |
| `AI_BASE_URL` | OpenAI-compatible base URL (e.g. your LiteLLM proxy `/v1`) |
| `AI_API_KEY` | Global gateway API key |
| `AI_DEFAULT_MODEL` | Default model id (e.g. `gemini-2.5-flash`, `gpt-4o-mini`) |
| `AI_ALLOWED_MODELS` | Comma-separated model allow-list for the picker |
| `AI_FREE_MONTHLY_TOKENS` | Monthly token cap for global-key users (default `150000`) |
| `AI_MAX_STEPS` | Max tool-calling steps per turn (default `8`) |
| `AI_ENCRYPTION_KEY` | Secret used to encrypt users' own API keys at rest |

### Database migrations

Run in order via Supabase Dashboard SQL Editor (or `supabase db push`):

| File | Purpose |
|---|---|
| `0001_init.sql` | Tables + RLS + indexes |
| `0002_views_and_trigger.sql` | Analytics views + new-user bootstrap trigger |
| `0003_storage.sql` | Wallpapers storage bucket + Storage RLS |
| `0004_security_and_performance_fixes.sql` | RLS / performance hardening |
| `0005_wallpaper_settings.sql` | Wallpaper blur/brightness settings |
| `0006_subtasks_and_spotify_takeover.sql` | Subtasks table + Spotify takeover setting |
| `0007_glass_controls.sql` | Glass tint/blur slider settings |
| `0008_effects.sql` | Live-effect selection + per-effect settings |
| `0009_ai_and_project_view.sql` | Focus AI (credentials/usage/chat) + synced Projects view preference |
| `0010_timer_mcp.sql` | Live timer snapshot + hosted MCP tokens |

### Deploy — Vercel

```bash
npm i -g vercel
vercel link
node scripts/export-supabase-env.mjs   # → vercel-env.txt
# Paste values into Vercel → Project → Settings → Environment Variables
vercel --prod
```

Add these OAuth redirect URLs in Supabase Auth → URL Configuration (and Google Cloud Console):

```
https://focusspace.live/auth/callback
https://<your-project>.vercel.app/auth/callback
```

### Deploy — Docker (hosted)

Pass real Supabase build args instead of the local placeholders:

```bash
docker compose build \
  --build-arg NEXT_PUBLIC_FOCUSSPACE_MODE=cloud \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Set `FOCUSSPACE_MODE=cloud` (and the same `NEXT_PUBLIC_*` values) at runtime. Apply migrations 0001–0010
on the Supabase project first.

---

## Agent one-liner

Paste this to Hermes or OpenClaw (supported agents today):

```
read this and setup focusspace for me https://focusspace.live/for-agents
```

Machine-readable twin: https://focusspace.live/for-agents.md  
Skill: [`skills/focusspace/`](./skills/focusspace/)

---

## Keyboard shortcuts (Focus screen)

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `R` | Reset timer |
| `S` | Skip session |

---

## Contributing

Found a bug or have an idea? **Open an issue** on
[GitHub](https://github.com/EntangledQuantum/focusspace/issues), or email
**shahzadtechworld@gmail.com**.

---

## 📄 Legal

FocusSpace is open source and your data stays yours — we never read or reuse it.

- [Privacy Policy](https://focusspace.live/privacy)
- [Terms of Service](https://focusspace.live/terms)
- [For agents](https://focusspace.live/for-agents)
