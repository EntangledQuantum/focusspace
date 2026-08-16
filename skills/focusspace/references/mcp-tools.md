# FocusSpace MCP tools

Register either:

- **HTTP** `http://127.0.0.1:3000/api/mcp` (app must be running)
- **stdio** `npx tsx scripts/mcp-stdio.ts` (cwd = repo root)

Local mode has no auth header. One implicit user.

## Rule: `get_workspace_state` first

Call `get_workspace_state` before any other FocusSpace tool in a session. Call it again after writes or timer changes so you do not act on stale ids.

Typical payload: implicit user, projects, open tasks, active task, timer status, and settings snapshot.

## Tool map

| Family | Tools | Use for |
|---|---|---|
| First call | `get_workspace_state` | Timer + current task + focus length. Always first. |
| Board | `list_projects`, `list_tasks`, `search_tasks`, `get_task`, `recent_completed_tasks`, `create_project`, `rename_project`, `recolor_project`, `delete_project`, `create_task`, `update_task`, `set_task_status`, `delete_task`, `add_subtasks`, `update_subtask`, `delete_subtask`, `create_tag`, `delete_tag` | Everything a human does on Projects. |
| Timer | `start_timer`, `pause_timer`, `resume_timer`, `skip_timer`, `reset_timer`, `set_active_task` | The Focus dock. Never start unless the user said yes. |
| Music | `now_playing`, `search_music`, `play_music`, `pause_music`, `resume_music`, `next_track`, `previous_track`, `set_volume`, `set_shuffle` | Same Spotify dock as the UI. Requires the user to connect Spotify in Settings. |
| Settings | `get_settings`, `update_settings` | Durations (seconds), auto-start, theme, destructive policy. |
| Analytics | `analytics_overview`, `analytics_by_project`, `analytics_by_tag`, `analytics_heatmap`, `analytics_sessions`, `analytics_compare`, `focus_stats` | Logged focus time. Never guess from estimates. |
| Confirm | `confirm_action` | Complete a delete the previous tool deferred. |
| Reset | `reset_task_progress` | Uncheck subtasks, zero completed pomodoros (dock Reset). |

Exact argument names come from the live tool descriptors — read those after connecting.

## Board

Resolve names via `get_workspace_state` or `search_tasks` / `list_*` before mutating. After `create_task`, ask “Want me to start the timer on this?” — do not call `start_timer` yourself.

If the user describes a large task and gives no breakdown, create the parent and `add_subtasks` with concrete steps.

## Timer

Same dock a human uses on the Focus screen.

- `start_timer` only after an explicit yes (or “start focusing on X”)
- Pause / resume / skip / reset when asked
- Do not `set_active_task` and immediately `start_timer` unless they asked for both

## Music

Same Spotify player a human uses in the dock. The user must connect Spotify in Settings → Music first — `get_workspace_state` says whether it is connected.

- `now_playing` to read the current track / paused state
- `search_music` then `play_music` with a returned `spotify:` uri, or pass `query` to play the first track match
- Pause / resume / next / previous / volume / shuffle when asked
- If a call returns "No active Spotify device", tell the user to open Spotify or the FocusSpace player first

## Settings

Read first (`get_workspace_state` or `get_settings`), then `update_settings` for only what they asked. Durations are in **seconds**. Do not reset unrelated preferences.

## `analytics_*`

Use for “how long did I focus”, streaks, heatmaps, per-project / per-tag breakdowns, recent sessions, and period compares. Estimates are planned pomodoros, not logged time.

## `confirm_action`

Some deletes (project, task, tag, …) return a confirmation token instead of executing. Show the summary and call `confirm_action` only after the user agrees.

## `reset_task_progress`

Resets completed-pomodoro progress on a task. Confirm if the user might have meant delete or complete instead.

## Suggested loop

1. `get_workspace_state`
2. Mutate with `board` / `settings` / `timer` / `music` as requested
3. `get_workspace_state` again if you need fresh ids
4. Ask about the timer after new tasks
5. Use `analytics_*` for any stats question
