# FocusSpace for Chrome

A Manifest V3 extension: your FocusSpace timer, current task and Spotify
playback in the toolbar, plus a side panel with your projects, Focus AI and
music search. Everything is synced with the website through one server-side
timer. Plain HTML/CSS/JS, so there is no build step.

## Install from a release (beta)

1. Download `focusspace-extension-<version>.zip` from the
   [GitHub releases](https://github.com/EntangledQuantum/focusspace/releases) (tags `extension-v*`) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.
3. Click the FocusSpace icon → **Log in**.

Needs Chrome 116 or newer (side panel API).

Releases are built by `.github/workflows/extension-release.yml`: bump `version` in `manifest.json`, then push a
tag like `extension-v0.9.0-beta`, or run the workflow from the Actions tab.

## Install (load unpacked from the repo)

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

**Popup** (toolbar icon):

- **Timer:** shows mode (focus, short or long break, custom), a live countdown
  and the status. You can start, pause, resume, stop and skip. After a focus
  session it offers the matching break, or **Skip to focus**.
- **Task:** shows the current project, the task, its pomodoro progress and its
  subtasks. You can tick subtasks, mark the task done (when the timer is idle
  it moves on to the next to-do, as the site does), and **Change** to another
  project or task. Switching tasks is disabled while a session runs.
- **Music:** shows the Spotify track, artist and album art, with
  previous/play-pause/next.
- **Badge:** the minutes left while a session runs. It is pink for focus,
  purple for a break and grey when paused. When a session ends with no
  FocusSpace tab open, you get a notification.

**Side panel.** Open it with the panel button in the popup, by right-clicking
the icon → **Open side panel**, or with **Alt+Shift+F**
(`chrome://extensions/shortcuts` to change it):

- **Timer:** the same controls, large and centred, with the task and subtasks.
- **Projects:** every project with its open tasks. You can add a project, add a
  task (estimate and optional subtasks, one per line), mark tasks done, and
  **Focus** on one.
- **Focus AI:** the same assistant as the website, with streaming replies,
  reasoning, tool activity, history, **New** chat, a model picker and **Stop**.
  Conversations are saved on the server and also appear on the website.
  Destructive actions ask for confirmation when that's on in Settings.
- **Music:** search Spotify tracks, playlists, albums and artists and play them
  on your active (or best available) device. The now-playing bar stays at the
  bottom of every tab.
- Wallpapers, effects and settings stay on the website (account menu →
  **Settings**).

The popup and side panel follow your FocusSpace theme (light, dark or system).

## How sync works (one source of truth)

- **The server row is the timer.** `timer_state` is written only by the server
  (`src/lib/extension/service.ts` applying the rules in
  `src/lib/timer/commands.ts`), using the server clock. Every client sends
  *intents*: website tabs via `/api/timer` (cookie session), the extension via
  `/api/extension/*` (token), and MCP / Focus AI through the same service.
- **Same clock everywhere.** Clients render the server timestamps
  (`startedAt`, `pausedAt`, accumulated pause, `endsAt`). Each response
  carries `serverNow`; clients estimate the server-clock offset NTP-style
  (`lib/clock.js`, `src/lib/timer/clock.ts`), so a machine whose clock is
  minutes off still shows the same countdown.
- **Completion is recorded exactly once.** When a countdown reaches zero, every
  client (each tab, the popup, the badge alarm) simply asks the server. The
  first to arrive wins a compare-and-set on `timer_state`, records the session
  and counts the pomodoro; the rest read the result. This also works with no
  website tab open.
- **Auto-start** of breaks and pomodoros is decided on the server from your
  settings, and the next phase starts exactly at the old one's end. If nobody
  was around when it ended (more than 2 minutes before anyone looked), the
  timer just shows "completed" instead of chaining sessions through your
  absence.
- **Stale clicks are refused.** A pause, stop or skip aimed at a session that
  another device has already replaced gets the current state back, and the
  popup shows it with a toast.
- **Propagation:**
  - Website tabs use Supabase Realtime on their own row (migration `0016`).
    Tabs in the same browser also share each update over a BroadcastChannel,
    and a light poll is the fallback.
  - The popup and side panel do a one-query version check (`?since=`) every
    2 s while visible, plus a full refresh every 30 s.
  - The badge repaints locally every 30 s and checks the server about once a
    minute.
- **Offline:** the countdown keeps going from the last server timestamps, with
  an offline banner. Commands are not queued: they fail with a clear message
  and roll back, because replaying a "pause" minutes later would pause at the
  wrong time. Reconnecting refreshes everything.
- **Music:** Spotify's own player is the source of truth. The music route keeps
  a short per-user cache with a version, so many clients polling don't
  multiply Spotify calls. Clicks are optimistic and held for about 3 s against
  Spotify's lagging reads.
- Every click updates the UI immediately and reconciles with the server's
  answer. Requests time out after 8 s; reads retry once. Every
  `/api/extension/*` response has a `Server-Timing` header.

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
| `GET /api/extension/state[?since=&task=&project=]` | timer (server timestamps + `serverNow`), task + subtasks, project, next start/break; `{unchanged:true}` when `since` is current |
| `POST /api/extension/timer` `{action: start\|pause\|resume\|stop\|skip\|set_mode, mode?, durationSec?, expectSessionId?}` | timer intents → new state; refused intents return 409 `{error, state}` |
| `GET /api/extension/tasks` | projects + open tasks |
| `POST /api/extension/tasks` `{action: create\|select\|toggle_done\|toggle_subtask, …}` | task commands |
| `POST /api/extension/projects` `{name, color?}` | add a project |
| `GET/POST /api/extension/music` `{action: play\|pause\|next\|previous}` | Spotify state (`?since=<version>`) / transport |
| `GET /api/extension/music/search?q=&type=` · `POST {uri}` | Spotify search / play a uri |
| `/api/ai/{chat,conversations,models,status,confirm}` | Focus AI, same routes as the website (token or cookie) |
| `GET /api/extension/me` | name, email, avatar, theme |
| `POST /api/extension/token` | (site session cookie, same-origin only) mint a token |
| `DELETE /api/extension/token` | revoke the calling token |

The website uses `GET/POST /api/timer` (cookie session) with the same request
and response shapes as `/api/extension/state` and `/api/extension/timer`.

Server code: `src/lib/extension/*` and `src/lib/timer/*`. Tests:
`tests/extension-*.test.ts` and `tests/timer-sync.test.ts`.

### Files

- `manifest.json`
- `background.js`: badge, alarms, token hand-off, side-panel menu and shortcut.
- `popup.html` / `popup.js`: the timer, task and music UI, shared with the side
  panel.
- `sidepanel.html` / `sidepanel.js`: tabs, projects, music search.
- `chat.js`: Focus AI.
- `options.html` / `options.js`
- `styles.css`: dark and light themes.
- `lib/api.js`: fetch, config, server clock and badge.
- `lib/clock.js`: clock-offset maths.
- `lib/optimistic.js`: optimistic-UI rules.
- `lib/markdown.js`: safe Markdown rendering.
- `icons/`

### Publishing to the Chrome Web Store

The store assigns its own key and ID. Remove `key` from the manifest before
uploading, then add the store ID to `NEXT_PUBLIC_EXTENSION_IDS` (comma-separated)
on the site so the connect page recognises it. Unknown IDs still work, but they
show a warning.
