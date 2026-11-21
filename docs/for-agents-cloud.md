# FocusSpace — cloud (focusspace.live) guide for agents

FocusSpace is a Pomodoro timer + task board (projects → tasks → subtasks) with focus analytics and Spotify. You control the human's account through **MCP tools**: the same actions they have in the app.

**This guide = hosted.** The human's FocusSpace runs on focusspace.live and their data lives there. **Do not clone, install or run anything.** Your only job is to register a remote MCP server using the token the human gave you, then act on their behalf.

- This guide: https://focusspace.live/for-agents/cloud.md (raw fallback: https://raw.githubusercontent.com/EntangledQuantum/focusspace/master/docs/for-agents-cloud.md)
- Want to install FocusSpace locally instead? → https://focusspace.live/for-agents.md

## 1. Connect

- Endpoint: `https://focusspace.live/api/mcp` (or the URL the human gave). MCP **Streamable HTTP**, stateless, JSON responses.
- Auth on every request: `Authorization: Bearer fs_…` — the token the human generated in FocusSpace → Settings → Agents & MCP → **New token**. No token? Ask them to create one there and paste you the line it shows.
- The token is a password for their account: put it only in the MCP config. Never commit it, echo it back, or include it in summaries.

Claude Code:
```bash
claude mcp add --transport http focusspace https://focusspace.live/api/mcp --header "Authorization: Bearer fs_…"
```

JSON config — Cursor (`~/.cursor/mcp.json`), Claude Code (`.mcp.json`), Windsurf, Hermes, OpenClaw and most clients:
```json
{ "mcpServers": { "focusspace": { "type": "http", "url": "https://focusspace.live/api/mcp", "headers": { "Authorization": "Bearer fs_…" } } } }
```

Claude Desktop (stdio-only config → bridge with mcp-remote):
```json
{ "mcpServers": { "focusspace": { "command": "npx", "args": ["-y", "mcp-remote", "https://focusspace.live/api/mcp", "--header", "Authorization:${AUTH}"], "env": { "AUTH": "Bearer fs_…" } } } }
```

Verify by calling `get_workspace_state`. HTTP 401 = token wrong or revoked → ask the human for a new one. The human can revoke your access any time from the same settings page.

## Rules

1. Call `get_workspace_state` first, and again whenever you need fresh timer/task state. It is cheap.
2. Find things with `search_tasks` / `list_projects` / `list_tasks`, then act **by id**. Names also work, but an ambiguous name returns an error listing candidates — ask the human or retry with the id. Never invent ids.
3. After creating a task, ask before starting the timer. Never auto-start.
4. Estimate pomodoros from the real focus length in `get_workspace_state`: `ceil(minutes / focus)`, max 24, halves allowed.
5. Durations are **seconds**. Times are ISO UTC; `get_workspace_state` also shows the user's local clock and timezone.

## Tools

`?` = optional. `*Ref` args accept an id or a name.

**Status & settings**
- `get_workspace_state(music?)` — timer, time left (mm:ss + s), ends_at, task, subtasks, project, cycle, settings, now playing
- `get_settings()` → compact JSON · `update_settings(focusDurationSec?, shortBreakSec?, longBreakSec?, longBreakEvery?, autoStartBreaks?, autoStartPomodoros?, theme?, destructive?:allow|confirm, soundEnabled?, soundVolume?, focusEndTone?, breakEndTone?, muteDuringFocus?)`

**Timer / pomodoro**
- `start_timer(mode?:pomodoro|custom|short_break|long_break, taskRef?, projectRef?, durationSec?)` — projectRef alone = its first open task; switching task ends a running session first
- `pause_timer()` · `resume_timer()` · `skip_timer()` · `reset_timer()` (= stop; session not counted)
- `set_active_task(taskRef? | projectRef?)` — select without starting (not while a session runs)
- `reset_task_progress(taskRef)` — uncheck subtasks, pomodoros → 0

**Projects**
- `list_projects()` · `create_project(name, color?)` · `rename_project(projectRef, newName)` · `recolor_project(projectRef, color)` · `delete_project(projectRef)`

**Tasks**
- `list_tasks(projectRef?, status?:todo|done|all, limit?)` · `search_tasks(query, status?, limit?)` · `get_task(taskRef)` (notes, tags, subtasks with ids) · `recent_completed_tasks(limit?)`
- `create_task(title, projectRef?, notes?, priority?:low|med|high|urgent, estimatedPomodoros?, tags?, subtasks?)`
- `update_task(taskRef, title?, notes?, priority?, estimatedPomodoros?, moveToProjectRef?, setTags?)` · `set_task_status(taskRef, status:todo|done)`
- `reorder_tasks(projectRef, orderedTaskRefs)` · `delete_task(taskRef)`

**Subtasks & tags**
- `add_subtasks(taskRef, titles)` · `update_subtask(taskRef, subtaskRef, done?, newTitle?)` · `reorder_subtasks(taskRef, orderedSubtaskRefs)` · `delete_subtask(taskRef, subtaskRef)`
- `create_tag(name, color?)` · `delete_tag(tagName)`

**Analytics**
- `focus_stats()` · `analytics_overview()` · `analytics_by_project(range?:7d|30d|all)` · `analytics_by_tag()` · `analytics_heatmap(days?)` · `analytics_sessions(limit?, projectRef?)` · `analytics_compare(window?:7d|30d)`

**Music (Spotify — the human connects it in Settings → Music)**
- `now_playing()` · `search_music(query, type?, limit?)` · `play_music(uri? | query?)` · `pause_music()` · `resume_music()` · `next_track()` · `previous_track()` · `set_volume(percent)` · `set_shuffle(on)`

**Confirmation**
- `confirm_action(action, id)` — only after the human confirmed a deferred delete (see "Results & errors")

## Workflows

- **"What's running / how long is left?"** → `get_workspace_state` → read the `timer:` line.
- **"Start a 25-min focus on X"** → `search_tasks(query:"X")` → `start_timer(taskRef:<id>, durationSec:1500)` (omit durationSec to use their focus length).
- **"Take a break"** → `start_timer(mode:"short_break")`. **"Pause" / "stop"** → `pause_timer` / `reset_timer`.
- **"Add a task to Work and break it down"** → `create_task(title, projectRef:"Work", estimatedPomodoros, subtasks:[…])` → ask "Start the timer?"
- **"Tick off the outline subtask"** → `get_task(taskRef)` → `update_subtask(taskRef, subtaskRef:<subtask id>, done:true)`.
- **"Finish this task"** → `set_task_status(taskRef, "done")`.
- **"How did I do this week?"** → `analytics_overview` / `analytics_compare(window:"7d")`.

Example `get_workspace_state` output:
```
timer: running · pomodoro · 18:42 left (1122s of 1500s) · ends_at 2026-11-21T10:42:10.000Z (11:42 Europe/Berlin)
task: Write report (id: 6f0c…) · todo · pomos 1/3 · subtasks 2/5
next subtasks: Outline (id: 91ab…); Draft intro (id: 77de…)
project: Work (id: 2b4e…)
cycle: 1/4 pomos toward long break
settings: focus 25m · short 5m · long 15m every 4 · auto-start breaks off, pomos off
music: playing · Weightless — Marconi Union
tz: Europe/Berlin · deletes: confirm
```

## Results & errors

- Results are terse text: one fact per line, ids inline as `(id: <uuid>)`. Chain calls with those ids.
- Failures come back as a tool error (`isError: true`) with one readable line, e.g. `No task matching "x"`, `"write" matches several tasks — …`, `Timer is not running.`, `A session is already in progress.`, `Invalid arguments — title: …`. Fix the call or ask the human; don't repeat it unchanged.
- **Deletes:** if the human enabled confirmation, a delete returns `{"__confirm":true,"action":…,"id":…,"summary":…}` and nothing is deleted yet. Ask the human with the summary; only on "yes" call `confirm_action(action, id)`.
- HTTP 401 = bad/revoked token. JSON-RPC `-32602` = unknown tool.
