# FocusSpace

A modern Pomodoro + productivity tracker. Pick one task, run the timer, review the data. Built to keep you accountable — not entertained.

## Features

- **Dual-mode timer** — Pomodoro (fixed blocks) or Custom Target (set your own duration)
- **Single-task focus** — you can only track one thing at a time, by design
- **Projects + Tasks + Tags** — full CRUD, priority levels, pomodoro-pip indicators
- **Analytics** — KPIs, weekly bar chart, tag donut, GitHub-style heatmap, per-project filters
- **Atmospheres** — built-in wallpapers + user-uploaded wallpapers via Supabase Storage
- **Notifications** — browser notifications + Web Audio tones, with DND mode during focus sessions
- **Auth** — Email/password + Google OAuth via Supabase Auth
- **Theme** — Dark / Light / System

## Architecture

```
Next.js 15 (App Router)
  ├── (auth)/         — login, signup, OAuth callback
  ├── (app)/          — protected: focus, projects, analytics, settings
  └── api/            — upload-wallpaper helper

Supabase
  ├── Auth            — email + Google OAuth, signup trigger seeds profile/settings
  ├── Postgres        — profiles, projects, tasks, tags, focus_sessions, wallpapers
  └── Storage         — wallpapers bucket (public read, owner-write)

Client state: Zustand (timer store + UI store)
Server state: TanStack Query
Animations:   Framer Motion
Charts:       Recharts
```

## Quick Start (Local Dev)

**Requirements:** Node 20+, npm

```bash
# 1. Install dependencies
cd focusspace
npm install

# 2. Set up environment variables
node scripts/setup-env.mjs
# Enter Supabase URL, anon key, service role key, site URL (http://localhost:3000)

# 3. Apply database migrations in order via Supabase Dashboard SQL Editor:
#    supabase/migrations/0001_init.sql
#    supabase/migrations/0002_views_and_trigger.sql
#    supabase/migrations/0003_storage.sql

# 4. Start dev server
npm run dev
# Open http://localhost:3000
```

## Environment Variables

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL (or `http://localhost:3000` for dev) |

Copy `.env.local.example` to `.env.local` and fill in values.

## Deploy — Vercel

```bash
npm i -g vercel
vercel link
node scripts/export-supabase-env.mjs   # → vercel-env.txt
# Paste vercel-env.txt values into Vercel Dashboard → Project → Settings → Environment Variables
vercel --prod
```

**OAuth redirect URLs to add in Supabase Auth → URL Configuration:**
```
https://<your-project>.vercel.app/auth/callback
https://*.vercel.app/auth/callback
```

Also add to Google Cloud Console → OAuth → Authorized redirect URIs.

## Deploy — Docker (Self-Host)

```bash
# Build (NEXT_PUBLIC_ vars baked in at build time)
docker compose build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Run (runtime secrets from .env.local)
docker compose up -d
```

**OAuth redirect URL:**
```
https://your-domain.com/auth/callback
```

## Database Migrations

Run these in order via Supabase Dashboard SQL Editor or `supabase db push`:

| File | Purpose |
|---|---|
| `0001_init.sql` | Tables + RLS + indexes |
| `0002_views_and_trigger.sql` | Analytics views + new-user bootstrap trigger |
| `0003_storage.sql` | Wallpapers storage bucket + Storage RLS |

## Keyboard Shortcuts (Focus screen)

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `R` | Reset timer |
| `S` | Skip session |

## Tech Stack

Next.js 15 · TypeScript · Tailwind v4 · Framer Motion · Zustand · TanStack Query · Supabase · Recharts · Sonner · date-fns · @dnd-kit
