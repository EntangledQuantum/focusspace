# FocusSpace for Chrome

A small Manifest V3 extension: your FocusSpace timer, current task and Spotify
playback in the toolbar, synced both ways with the website. Plain HTML/CSS/JS,
so there is no build step.

## Install (load unpacked)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this `extension/` folder.
3. Pin **FocusSpace** from the puzzle-piece menu.

The manifest has a fixed `key`, so the unpacked extension always gets the ID
`geafjhcohahpagdejhgfgefeoifnkijk`. The site recognises that ID on the connect page.

## Log in

Click the toolbar icon, then **Log in with FocusSpace**. A tab opens on
`https://focusspace.live/extension/connect`:

- If you are already signed in on the site, click **Connect extension**. The tab
  closes and the popup shows your account.
- If not, sign in there first (email, Google or Spotify). You come back to the
  same page.

Behind the scenes the site mints a personal access token named **Chrome
extension** (the same kind as MCP tokens) and passes it to the extension with
`chrome.runtime.sendMessage`, which `externally_connectable` allows. You can see
or revoke it under **Settings → Agents & MCP**. **Log out** in the popup's
account menu also revokes it.

If the site can't reach the extension (for example a self-hosted domain that
isn't in `externally_connectable`), the connect page shows the token instead.
Paste it under **Options → Paste a token**.

## What it does

- **Timer:** shows mode (focus, short or long break, custom), a live countdown
  and the status. You can start, pause, resume, stop and skip. After a focus
  session it offers the matching break, or **Skip to focus**.
- **Task:** shows the current project, the task, its pomodoro progress and its
  subtasks. You can tick subtasks, mark the task done (when the timer is idle
  it moves on to the next to-do, as the site does), and **Change** to another
  project or task. Switching tasks is disabled while a session runs.
- **Music:** shows the Spotify track, artist and album art, with
  previous/play-pause/next. If Spotify has no active device, play wakes your
  first available device, or explains what to do.
- **Badge:** the minutes left while a session runs. It is pink for focus,
  purple for a break and grey when paused. When a session ends while no
  FocusSpace tab is open, you get a notification.

## How sync works

- The site and the extension share the `timer_state` row (migration `0010`).
  The extension's commands write it with `source = 'mcp'` (the same path as MCP
  and Ask AI). Any open FocusSpace tab applies it within about 1.2 s
  (`useTimerSync`), so the ring, the task and the music-follows-focus behaviour
  update there too. Changes made on the site are written with `source = 'ui'`
  and appear in the popup on its next poll.
- Commands are compare-and-set on `timer_state.updated_at`. If the site changed
  the timer at the same moment, the extension gets "Timer changed elsewhere —
  try again" instead of overwriting it.
- **Recording sessions:** a session that ends while a focus page is open is
  recorded by the site as before. If no focus page is open, the extension API
  records it when it next reads the state, about 4 s after the end (a
  background alarm fires then). Both sides only count a pomodoro when they move
  `focus_sessions.ended_at` from NULL, so a session is never counted twice.
  Stopping or skipping within 10 s deletes the session, as on the site.
- **Polling:** the popup polls about every 5 s while open. The background
  service worker makes one request a minute, plus one when a session is due.

## Options / development

Right-click the icon → **Options**:

- **Server:** default `https://focusspace.live`. For development, use
  `http://localhost:3000` (`npm run dev` in the repo root). `focusspace.live`
  and `localhost` / `127.0.0.1` on any port ship with host access. For any
  other server, Chrome asks for permission when you save. Changing the server
  signs you out.
- **Paste a token:** the manual fallback described above.

In local self-host mode (`FOCUSSPACE_MODE=local`) no login is needed. The
connect page hands over a placeholder token and the API serves the single local
user.

### API (all `Authorization: Bearer <token>`)

| Method & path | Purpose |
| --- | --- |
| `GET /api/extension/state` | timer, task + subtasks, project, next start/break suggestion |
| `POST /api/extension/timer` `{action: start\|pause\|resume\|stop\|skip, mode?}` | timer commands, returns state |
| `GET /api/extension/tasks` | projects + open tasks for the picker |
| `POST /api/extension/tasks` `{action: select\|toggle_done\|toggle_subtask, …}` | task commands, returns state |
| `GET/POST /api/extension/music` `{action: play\|pause\|next\|previous}` | Spotify state / transport |
| `GET /api/extension/me` | name, email, avatar |
| `POST /api/extension/token` | (site session cookie, same-origin only) mint a token |
| `DELETE /api/extension/token` | revoke the calling token |

Server code: `src/lib/extension/*`, with the pure timer rules in
`src/lib/timer/commands.ts`. Tests: `tests/extension-*.test.ts`.

### Files

`manifest.json`, `background.js` (badge, alarms, token hand-off),
`popup.html/js`, `options.html/js`, `styles.css`, `lib/api.js` (shared fetch,
config and badge), `icons/` (resized from `src/app/icon.png`).

### Publishing to the Chrome Web Store

The store assigns its own key and ID. Remove `key` from the manifest before
uploading, then add the store ID to `NEXT_PUBLIC_EXTENSION_IDS` (comma-separated)
on the site so the connect page recognises it. Unknown IDs still work, but they
show a warning.
