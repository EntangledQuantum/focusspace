![Focus Space](./src/app/icon.png)

# FocusSpace

### Now Deployed to Vercel !

<a href="https://focusspace-three.vercel.app/focus" target="_blank" style="text-decoration:none;">
  <div align="center">

|  |  |
|:---:|---|
| <img src="./src/app/icon.png" width="70" style="border-radius:16px;" /> | <div align="left"> <h3>Focus Space</h3> <p>A modern productivity and focus app built to help you get things done with clarity and flow.</p> <p><code>https://focusspace-three.vercel.app/focus</code></p> </div> |

  </div>
</a>

A modern Pomodoro + productivity tracker. Pick one task, run the timer, review the data. Built to keep you accountable — not entertained.

## ⚠️ Required after pulling this update

New migrations must be applied once (in order) in **Supabase Dashboard → SQL Editor**:

```
supabase/migrations/0006_subtasks_and_spotify_takeover.sql   (if not applied yet)
supabase/migrations/0007_glass_controls.sql                  (if not applied yet)
supabase/migrations/0008_effects.sql
```

`0008` adds `active_effect` / `effect_settings` for the live-effects system. The app runs without it, but choosing/customising an effect won't persist until it's applied.

## Backgrounds vs. effects

A **background** is what you focus over — a CSS-mesh preset (Aurora / Dusk / Mist / Noir) or your own uploaded photo. A **live effect** (Aurora glow, Rainfall, Snowfall, Starfield, Fireflies) is layered *on top* of any background and is optional (default: none). Each effect has its own Intensity / Speed / (Density) sliders. Both live under **Settings → Appearance / Live Effect**; photo blur/brightness controls only appear when an uploaded photo is the active background.

## Latest Updates

### Spotify browser + fixes round

- **Big music picker** — "Choose music" now opens a TaskPicker-style modal: browse your recently played, top artists/songs, playlists and library when idle, or search the whole catalog with **All / Songs / Albums / Artists / Playlists / Library** filter tabs.
- **Search fixed** — Spotify's `/search` rejects `limit` > 10 with a 400 (per their OpenAPI spec); track/album/artist search works again. Browse uses `user-top-read` / `user-read-recently-played` scopes — **reconnect Spotify once** (Settings → Music) to grant them; sections hide gracefully until then.
- **Volume slider fixed** — the in-browser player's volume is now set locally via the SDK only; the Connect-reported volume no longer fights and resets the slider every 5 s.
- **Glass blur actually works** — Chromium ignores `backdrop-filter` under transformed ancestors; the dock/mini-bar were centered with `translateX(-50%)`. They're now flex-centered with the slide animation on the card itself, so the Blur slider visibly frosts cards.
- **Bottom gradient removed** — the dark/light scrim at the bottom of every wallpaper is gone.
- **Dock subtasks** — always expanded (scrolls in place); the collapse toggle that warped the music column is removed.

### Design-polish round

- **Whole app on the new design** — Projects, Analytics, Settings and the task picker now use the prototype layout: centered 880px pages, stacked glass project cards with icon tiles, session dots, expandable subtasks and the Run pill; Analytics got stat cards, gradient day bars and a by-project breakdown; Settings got the icon-tile sections, hairline rows and gradient switches.
- **One-door auth** — login/signup pages are gone. The landing CTA opens a single modal: Google/Spotify sign in *or* create the account automatically, and email+password does both too (new email → account is created on the spot).
- **Landing polish** — dimmer aurora, badge removed, single CTA, real app logo and a more opaque nav bar; feature cards now have live micro-animations (equalizer waves on the music card, looping ring, rising chart bars, drifting wallpaper blob).
- **Fixes** — dock corner buttons (fullscreen · pop-out · focus mode) no longer overlap the music column; wallpaper preset swatches are 16:9.

### Landing page + living wallpapers

- **New homepage** — `/` is now a public landing page: animated aurora background that follows your cursor and bursts on click, a live demo timer ring, rotating headline, and a compact feature grid. Signed-in users skip straight to `/focus`.
- **Login & signup redesigned** — no more boxed card: full-bleed forms over the living background with frosted inputs, a brand panel on desktop, gradient CTAs. All auth logic (email, Google, Spotify OAuth) unchanged.
- **Animated wallpapers** — five new code-generated presets in Settings → Appearance: **Aurora Flow, Rainfall, Snowfall, Starfield, Fireflies**. Pure canvas, no images, theme-aware, paused in hidden tabs, respects reduced-motion. They sit alongside the mesh presets and your uploaded photos.

### Pink/Purple glass redesign (June 2026)

- **New theme** — pink primary + purple accent across the whole app, dark *and* light. The old terracotta/sage palette is gone.
- **Solo focus timer** — the center of the Focus screen now holds only the gradient ring, the task name, and the transport controls.
- **Bottom dock** — subtasks, the session timeline + Mark done, and the Spotify player live in a wide three-column glass dock. A **Focus mode** button slides it away (a slim music mini-bar stays if Spotify is connected); `Esc` brings it back.
- **Horizontal top nav** — the old sidebar is now a floating glass pill with theme toggle and quick glass controls.
- **Mesh wallpapers** — the solid presets were replaced with CSS-mesh wallpapers (Aurora, Dusk, Mist, Noir) that adapt to the theme; the heavy bottom-to-top gradient overlay is gone.
- **Live glass sliders** — Tint + Blur sliders (TopNav popover and Settings → Glass) let you dial the frosted feel of every card; persisted per user.
- **Run from Projects** — every task row has a **Run** pill: switches the active task, starts a pomodoro (cleanly closing any running session), and jumps to Focus.
- **Instant tabs** — all tab data (projects, tasks, analytics, task picker) is prefetched into the query cache at app start, so switching tabs renders instantly and revalidates in the background.

### Previous round

- **Subtasks + descriptions** — tasks now support a description and a subtask checklist. Add/edit them on the Projects page; check subtasks off from the task row or right on the Focus card, with live progress bars.
- **Spotify rewritten** — all Web API calls go through one client that auto-refreshes the access token (playback, search, next/prev no longer silently die after an hour). Next/Previous now route to the correct device, so they work in the pop-out mini player too.
- **"Take over playback" setting** — choose whether starting a focus session pulls playback from an already-playing device (phone/desktop) into the app, or leaves it alone (Settings → Music).
- **Working music search** — track/album/artist search uses fresh tokens and shows real error messages instead of failing silently.
- **Timer fixes** — starting a new task now resets the pomodoro cycle, so the timeline and break scheduling are correct per task. Break cadence is task-relative. Completion is recorded even when the pop-out timer finishes the session.
- **Big performance fix** — the running timer re-rendered the whole page at 60 fps; it now ticks once per second-change. Spotify polling was also cut down. The app no longer crawls during sessions.
- **Full-resolution wallpapers** — uploads keep their native resolution (up to 4K) instead of being downscaled to 1080p, and render at high quality.
- **Mini player (pop-out)** — content now adapts when you resize the Document-PiP window; controls actually work.

## Features

- **Dual-mode timer** — Pomodoro (fixed blocks) or Custom Target (set your own duration)
- **Single-task focus** — you can only track one thing at a time, by design
- **Projects + Tasks + Tags** — full CRUD, priority levels, pomodoro-pip indicators
- **Subtasks & descriptions** — break tasks down, track progress from Projects or the Focus card
- **Spotify** — Web Playback SDK player with search, playlists, volume/shuffle, external-device takeover, and a pop-out mini player (Chrome 116+)
- **Analytics** — KPIs, weekly bar chart, tag donut, GitHub-style heatmap, per-project filters
- **Atmospheres** — built-in wallpapers + user-uploaded wallpapers via Supabase Storage (full resolution)
- **Notifications** — browser notifications + Web Audio tones, with DND mode during focus sessions
- **Auth** — Email/password + Google OAuth via Supabase Auth
- **Theme** — Dark / Light / System

## Architecture

```
Next.js 16 (App Router)
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
## Screenshots 
### Main Page
<img width="2560" height="1348" alt="image" src="https://github.com/user-attachments/assets/9f245541-ee85-425d-a214-8d6e325bb7bc" />

### Project Tab
<img width="2558" height="1349" alt="image" src="https://github.com/user-attachments/assets/6f30cd59-a572-4cb2-8605-68ddbf46d111" />

### Analytics
<img width="2560" height="1348" alt="image" src="https://github.com/user-attachments/assets/74654b31-0adf-4f2e-ab16-7de768687ac1" />

### Project Selection in Main Menu
<img width="1221" height="717" alt="image" src="https://github.com/user-attachments/assets/f19fdb74-0e71-4821-89e3-f41feb704264" />

### Settings 
<img width="2560" height="1349" alt="image" src="https://github.com/user-attachments/assets/23f16e8f-e563-4e56-9127-1ec78b9c9b79" />

### Wallpaper Upload
<img width="1070" height="792" alt="image" src="https://github.com/user-attachments/assets/41fe0a9a-0dc3-421e-b1ed-88b1fa154c24" />

### Login
<img width="1048" height="795" alt="image" src="https://github.com/user-attachments/assets/cfd4ca12-4e88-413d-b0ee-225bf6a4869d" />



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
#    supabase/migrations/0004_security_and_performance_fixes.sql
#    supabase/migrations/0005_wallpaper_settings.sql
#    supabase/migrations/0006_subtasks_and_spotify_takeover.sql
#    supabase/migrations/0007_glass_controls.sql
#    supabase/migrations/0008_effects.sql

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
| `0004_security_and_performance_fixes.sql` | RLS/perf hardening |
| `0005_wallpaper_settings.sql` | Wallpaper blur/brightness settings |
| `0006_subtasks_and_spotify_takeover.sql` | Subtasks table + Spotify takeover setting |
| `0007_glass_controls.sql` | Glass tint/blur slider settings |
| `0008_effects.sql` | Live-effect selection + per-effect settings |

## Keyboard Shortcuts (Focus screen)

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `R` | Reset timer |
| `S` | Skip session |

## Tech Stack

Next.js 16 (Turbopack, Cache Components) · TypeScript · Tailwind v4 · Framer Motion · Zustand · TanStack Query · Supabase · Spotify Web Playback SDK · Recharts · Sonner · date-fns · @dnd-kit
