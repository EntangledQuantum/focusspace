# Handoff: Focus page redesign (pink/purple glass)

## Overview
A full visual + UX redesign of **FocusSpace** (Next.js 15 / React 19 / Tailwind v4 / Supabase). The headline change is the **Focus screen**: today everything (task, subtasks, mark-done, timer ring, controls, session timeline, and the Spotify panel) is crammed into one ~420px center card. The redesign breaks that apart:

- **A solo timer.** The vertical center holds *only* the ring, the active task name, and the transport controls. Nothing else.
- **A slide-away bottom dock.** Subtasks, the session timeline + "Mark done", and the music player live in a wide glass dock pinned to the bottom — laid out in **three horizontal columns** so they breathe instead of stacking. A **Focus-mode** button slides the dock away for a distraction-free timer; when it does, a slim **music mini-bar** stays on screen (only if Spotify is connected).
- **Horizontal nav.** The vertical `SideNav` becomes a compact floating top bar to reclaim horizontal space and feel less distracting.
- **Pink primary + purple accent** across the whole app, in dark **and** light themes.
- **New CSS-mesh wallpapers** replacing the old solid/gradient presets, with the **unnecessary bottom-to-top gradient overlay removed**.
- **Live "glass" controls** — two sliders (Tint + Blur) that let the user dial the frosted/opacity feel of every card over their wallpaper.

## About the design files
The files in `prototype/` are a **design reference built in HTML + React-via-Babel** — they show the intended look, layout, spacing, colors, and interactions. **They are not meant to be copied into the app verbatim.** Your job is to **recreate these designs inside the existing Next.js codebase**, reusing its real patterns: the `useTimer` hook, the Supabase queries, `@tanstack/react-query`, the Material-style tokens in `globals.css`, `framer-motion`, `lucide-react`, and `sonner`. All the timer/break/auto-start logic in `focus/page.tsx` must be **preserved** — only the *layout* and *styling* change.

Two files in `dropins/` **are** close to production-ready and can be adapted directly (they're plain CSS / a simple component): the globals.css additions and the new `WallpaperRenderer.tsx`.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final. Recreate pixel-closely using the codebase's existing libraries. Exact values are in **Design Tokens** below; the prototype is the source of truth for layout.

---

## Files you'll touch (in `EntangledQuantum/focusspace`)

| Area | Repo file | Change |
|---|---|---|
| Tokens, glass, wallpapers | `src/app/globals.css` | Merge `dropins/globals.additions.css` |
| Wallpaper render | `src/components/layout/WallpaperRenderer.tsx` | Replace with `dropins/WallpaperRenderer.tsx` |
| Wallpaper picker | `src/components/settings/WallpaperEditModal.tsx` + Settings | Point at `MESH_WALLPAPERS`; relabel blur/opacity → Blur/Tint |
| Navigation | `src/components/layout/SideNav.tsx` → **new** `TopNav.tsx` | Vertical → horizontal top bar |
| App shell | `src/app/(app)/layout.tsx` | Use `TopNav`; drop the left sidebar padding |
| **Focus screen** | `src/app/(app)/focus/page.tsx` | Split into solo timer + **new** `FocusDock` |
| Focus dock | **new** `src/components/timer/FocusDock.tsx` | Subtasks / timeline / music columns + focus-mode |
| Music | `src/components/spotify/SpotifyPanel.tsx` | Keep "hide when not connected"; restyle to fit a dock column |
| Glass sliders | `user_settings` + `src/components/layout/Providers.tsx` | Persist `glass_tint`/`glass_blur`; apply as CSS vars |
| Projects | `src/app/(app)/projects/page.tsx` | Keep the existing **Run** action; restyle to the new pill |

---

## Migration, step by step

### 1) Design tokens, glass, wallpapers  → `dropins/globals.additions.css`
Merge that file into `src/app/globals.css`:
- Swap the `--color-primary*` group to **pink** and `--color-secondary*` to **purple** (dark + `.light`). Because these are the same Tailwind v4 `@theme` token names you already use, every `var(--color-primary)` reference across the app re-themes automatically — no per-component edits.
- Add `--glass-tint` (0–1) and `--glass-blur` (px), and rewrite `.glass` to read them (see step 5).
- Add the `wp-*` wallpaper classes and the single `.wallpaper-scrim`.

### 2) Wallpapers  → `dropins/WallpaperRenderer.tsx`
- Replace the file. `SOLID_WALLPAPERS` becomes `MESH_WALLPAPERS` (`wp-aurora` default, `wp-dusk`, `wp-mist`, `wp-noir`, `wp-photo`). Presets render via `className`, so the `.light` variants follow the theme for free.
- **Remove the two overlay divs** from the old renderer — the radial vignette and the tall `linear-gradient(to top, var(--color-background) …)`. That tall gradient is the *"unnecessary gradient from below"* to delete. Keep only `.wallpaper-scrim` (a gentle bottom-only fade for dock legibility).
- **No DB migration needed:** the new ids live in `wallpaper.storage_path` exactly like the old solid ids. Update the option list wherever the picker reads `SOLID_WALLPAPERS` (Settings + `WallpaperEditModal`) to import `MESH_WALLPAPERS` instead. Existing rows pointing at removed ids (`pitch-black`, `deep-ocean`, …) should fall back to `wp-aurora` — add a one-line map or a `COALESCE`-style default in the picker.

### 3) Navigation: `SideNav` → `TopNav` (horizontal)
Create `src/components/timer/TopNav.tsx` (or `layout/`). Behavior to mirror from the prototype (`prototype/components.jsx` → `TopNav`):
- A **centered floating glass pill** at the top, `position: fixed; z-index: 60`, `max-width: 880px`, `padding: 8px`, `border-radius: 999px`.
- Left: logo + "FocusSpace" wordmark (`font-display`, weight 800).
- Center: the nav items as pills — **Focus · Projects · Analytics · Settings** — icon + label, active pill tinted `color-mix(primary 14%)` with a `primary` text color and a hairline border. Keep the running-session pulse dot on Focus from the old `SideNav`.
- Right: **theme toggle** (Sun/Moon) and the **glass controls** popover (Tint/Blur sliders — step 5).
- On the Focus route, **fade the whole nav out when Focus mode is on** (`opacity 0; translateY(-12px)`), matching the dock.
- Update `src/app/(app)/layout.tsx`: render `<TopNav/>`; remove the `md:pl-[240px]`-style sidebar offset; pages now get top padding (`~104px`) instead of a left gutter. Keep the existing `displayName` prop wiring and the sign-out handler (move sign-out into Settings or a small avatar menu on the right of the bar).

### 4) Focus screen  → solo timer + `FocusDock`
Reference: `prototype/focus.jsx`. **Keep 100% of the logic** in `focus/page.tsx` (`useTimer`, settings query, `handleSessionComplete`, auto-start breaks/pomodoros, `handlePlayPause/Skip/Reset`, `handleFinishTask`, subtasks query, keyboard shortcuts). Only re-arrange what renders.

**Center column (the "solo timer") — remove everything else from here:**
1. Mode pills (`Pomodoro` / `Custom`) — small, above the ring.
2. `TimerRing` — keep your component; restyle the arc to a **pink→purple gradient stroke** (`<linearGradient>` from `--color-primary` to `--color-secondary`) with a soft drop-shadow; ring ≈ 252px, time ≈ 60px `font-display`.
3. **Active task name only** — project chip (optional) + the title as a button that opens the `TaskPicker`. The break badge appears here when a break is running.
4. `TimerControls` — reset / play-pause / skip. The play button becomes a pink→purple gradient circle.

> Move **subtasks, the "Mark done" button, the `PomodoroTimeline`, and `SpotifyPanel`** OUT of the center card and into the dock. The center should be vertically centered with generous breathing room (no surrounding card box).

**`FocusDock.tsx` (new):** a fixed, bottom-centered glass bar, `max-width: 880px`, three columns separated by hairline dividers:
- **Subtasks** (collapsible): header `Subtasks d/n` + a thin progress bar + chevron; checkable list (reuse `toggleSubtask`). Collapsing frees the space.
- **Session timeline**: render `PomodoroTimeline` as a row of dots (done = gradient fill, current = pulsing), plus the **Mark done** pill (`handleFinishTask`).
- **Music**: render `SpotifyPanel` styled to fit. **It must stay hidden entirely when Spotify isn't connected** (the panel already returns the connect prompt / null — keep that). When *not* connected, the dock is a **two-column** grid (subtasks + timeline).

**Focus mode:** a `focusMode` boolean (local state or `ui` store).
- Full dock: `translateY(0)`; entering focus mode → `translateY(160%); opacity 0`.
- A **mini music bar** (album art + title + play/pause) + a "Show dock" button slides UP into place when `focusMode` is true — **only if Spotify is connected**; otherwise focus mode shows just the timer + a small "Show dock" affordance. `Esc` exits focus mode.
- The Focus-mode toggle is the shrink/expand icon in the dock's corner.

### 5) Glass Tint + Blur sliders (the "glassy tinted feel")
Two values, **0–1 tint** and **0–48px blur**, applied as CSS variables on `<html>`:
```ts
// in Providers.tsx (or a small client effect that reads settings)
useEffect(() => {
  const r = document.documentElement;
  r.style.setProperty("--glass-tint", String(settings?.glass_tint ?? 0.5));
  r.style.setProperty("--glass-blur", `${settings?.glass_blur ?? 22}px`);
}, [settings?.glass_tint, settings?.glass_blur]);
```
- Persist with two new `user_settings` columns: `glass_tint float8 default 0.5`, `glass_blur int default 22` (SQL migration in `supabase/`). Write through your existing settings mutation.
- Surface the sliders in **two places** (both update the same setting): a small **popover in `TopNav`** for quick access, and a **"Glass tint" group in Settings → Appearance** (see `prototype/settings.jsx`). Style the range thumbs pink (tint) / purple (blur) — see `.rng` in `prototype/styles.css`.
- Because `.glass` now reads these vars, every card reacts live.

### 6) Projects — keep the Run action
The per-task **Run** button already exists in `projects/page.tsx` (switch active task → reset/start the pomodoro, even if one is running). **Keep that behavior**; just restyle it to the new pill: idle = `color-mix(primary 13%)` text-primary; running = pink→purple gradient with a pulse dot and "Running" label. Reference `prototype/projects.jsx` → `RunButton`.

---

## Interactions & behavior
- **Timer**: rAF/interval countdown; `Space` toggles play/pause; ring stroke animates `stroke-dashoffset` (~0.6s ease). All existing completion/auto-start logic unchanged.
- **Focus mode**: dock `transform`/`opacity` transition ≈ 0.5s `cubic-bezier(.22,1,.36,1)`; nav fades with it; mini-bar persists when connected; `Esc` exits.
- **Subtasks**: collapse/expand height; checkbox toggles persist via Supabase.
- **Tint/Blur**: live CSS-var updates; debounce the Supabase write (~300ms).
- **Theme**: toggles `.light`/`.dark` on `<html>`; wallpaper + glass + tokens all follow.
- **Spotify**: not-connected → music column/mini-bar **absent**; connected → player shown.
- **Entrance anim caveat**: animate entrances with `transform` only (or keep a visible base state) — don't gate `opacity:0` behind an intro animation, or print/PDF/reduced-motion can hide content.

## State management
- Existing: `useTimerStore`, `useUiStore` (add `focusMode` here if you want it global), settings via react-query, subtasks/tasks queries.
- New: `glass_tint`, `glass_blur` on `user_settings`; `focusMode` boolean; `TaskPicker` open boolean (already exists).

## Design Tokens
**Color**
- Primary (pink): `#ff5fa2` dark · `#e11d74` light — on-primary `#2b0014` / `#ffffff`
- Accent (purple): `#b06bf6` dark · `#7c3aed` light — on `#1c0533` / `#ffffff`
- Gradient (ring, play, progress, active dots): `linear-gradient(135deg, #ff5fa2, #b06bf6)`
- Surfaces/text: keep your existing `--color-surface*` / `--color-on-surface*`.
- Tag colors used in the prototype: design `#ff5fa2`, code `#b06bf6`, writing `#5fb0ff`, research `#46c98b`, admin `#f2a341`.

**Glass**: `background: color-mix(in srgb, var(--color-surface-container) calc(var(--glass-tint)*100%), transparent)`, `backdrop-filter: blur(var(--glass-blur)) saturate(1.4)`, border `rgba(255,255,255,.08)`, shadow `0 24px 60px -18px rgba(0,0,0,.55)`. Defaults: tint `0.5`, blur `22px`.

**Type**: display `Plus Jakarta Sans` (600–800), UI `Inter` (400–700) — unchanged. Timer ≈ 60px/600; page titles 30px/800; section titles 15–17px/700; body 13–14px.

**Radii**: pill `999px`; cards `22px`; controls/dock `22px`; chips/buttons `10–16px`.

**Spacing**: nav bar `max-w 880`; dock `max-w 880`, `padding 16–18`, column `gap 18`; center stack `gap 20`.

**Motion**: ease `cubic-bezier(.22,1,.36,1)`; dock/nav `~0.5s`; ring `~0.6s`; hovers `~0.18s`.

## Assets
No raster assets required — wallpapers are pure CSS, icons are `lucide-react` (the prototype hand-rolls equivalents; use lucide in the app). The `wp-photo` preset is a striped placeholder for a user-uploaded image.

## Files (in this bundle)
- `prototype/FocusSpace.html` — open in a browser to see the full interactive design (all four screens, themes, focus mode, tint/blur).
- `prototype/focus.jsx` — Focus screen + dock (primary reference for step 4).
- `prototype/components.jsx` — `TopNav`, `TaskPicker` (step 3).
- `prototype/settings.jsx` — Settings incl. wallpaper picker + tint/blur sliders (steps 2, 5).
- `prototype/projects.jsx` — Projects + `RunButton` (step 6).
- `prototype/analytics.jsx`, `prototype/store.jsx`, `prototype/icons.jsx`, `prototype/styles.css`, `prototype/app.jsx` — supporting reference.
- `dropins/globals.additions.css`, `dropins/WallpaperRenderer.tsx` — adapt directly.

> Tip: open this folder in **Claude Code** from inside your repo and say *"implement design_handoff_focus_redesign/README.md against the real components, preserving all timer logic."*
