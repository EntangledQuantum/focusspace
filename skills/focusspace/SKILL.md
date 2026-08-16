---
name: focusspace
description: Install and operate FocusSpace (Pomodoro timer, task board, analytics) over MCP. Use when the user mentions FocusSpace, focusspace.live/for-agents, Pomodoro, local setup, timer, or agent productivity. Supported today: Hermes and OpenClaw. Individual self-host only (local SQLite, no login). Register MCP at http://127.0.0.1:3000/api/mcp or stdio `npx tsx scripts/mcp-stdio.ts`. Always call get_workspace_state first; never auto-start the timer after creating a task.
license: MIT
compatibility: Requires Node 20+ or Docker. Hermes or OpenClaw. Individual local SQLite setup only.
metadata:
  author: EntangledQuantum
  version: "1.0.0"
  hermes:
    tags: [focusspace, pomodoro, mcp, productivity, timer]
    category: productivity
  openclaw:
    emoji: "🍅"
    homepage: https://focusspace.live/for-agents
    requires:
      anyBins: [node, docker]
---

# FocusSpace

FocusSpace is a Pomodoro + task board. Agents can do everything a human can on the local app: board CRUD, timer control, music (Spotify), settings, and analytics — all over MCP.

**Supported agents today:** Hermes and OpenClaw. iOS and Android apps are planned.

**Setup mode today:** individual self-host only. Local SQLite at `~/.focusspace/focusspace.db`, no login, one implicit user. Per-user auth for this mode is coming later.

Do **not** offer or mention a hosted/Supabase setup. Do **not** ask “local vs cloud”. This skill is local-only.

Humans paste this line to start you:

```
read this and setup focusspace for me https://focusspace.live/for-agents
```

The machine-readable twin of that page is https://focusspace.live/for-agents.md.

## When to use

- User wants FocusSpace installed, started, or connected as an MCP server
- User wants tasks, projects, a Pomodoro timer, or focus analytics
- User pasted the `/for-agents` setup line

## Procedure

Do not interview the user with a long questionnaire. Detect the host, pick a default, and proceed. Talk only when blocked (missing git/Node/Docker, port 3000 taken, clone failed).

### 1. Detect the agent

| Signal | Agent |
|---|---|
| `hermes` on PATH, `~/.hermes/`, or `HERMES_HOME` | Hermes |
| `openclaw` on PATH, `~/.openclaw/`, or `OPENCLAW_STATE_DIR` | OpenClaw |

If both exist, treat the process you are as the agent (Hermes if this skill was loaded from `~/.hermes/skills`, OpenClaw if from a workspace `skills/` or `~/.openclaw`). If neither is clear, install the app first, then register MCP for whichever CLI is present.

Agent-specific drop-in steps: [references/hermes.md](references/hermes.md) and [references/openclaw.md](references/openclaw.md).

### 2. Create the data directory

```bash
mkdir -p ~/.focusspace
```

The SQLite file is `~/.focusspace/focusspace.db`. The app also creates it on first boot; still ensure the directory exists.

On Windows (PowerShell): `New-Item -ItemType Directory -Force -Path "$HOME\.focusspace"`.

### 3. Get the source

Repo: https://github.com/EntangledQuantum/focusspace

- If the user already has a checkout, use it.
- Otherwise clone it (default folder `focusspace` in the current working directory, unless they named another path).

### 4. Pick how to run (do not ask)

- **npm** if `node` is 20 or newer.
- **Docker** otherwise (Docker Engine + Compose plugin).

npm path: [references/install-local.md](references/install-local.md)

Docker path: [references/install-docker.md](references/install-docker.md)

You may run the helper from a checkout:

```bash
node skills/focusspace/scripts/setup-local.mjs
```

It creates `~/.focusspace` and writes `.env.local` with local mode if that file is missing.

Required env (npm or Docker — same individual local mode):

```
FOCUSSPACE_MODE=local
NEXT_PUBLIC_FOCUSSPACE_MODE=local
```

### 5. Start the app

- npm: `npm run dev` (or `npm start` after `npm run build`) → http://127.0.0.1:3000
- Docker: `docker compose up --build` → same URL

Open the site and click **Open FocusSpace**. No account, no login.

### 6. Register MCP

Prefer HTTP if the app is already up:

- **HTTP:** `http://127.0.0.1:3000/api/mcp`
- **stdio:** from the repo root, `npx tsx scripts/mcp-stdio.ts`

Wire that into Hermes (`~/.hermes/config.yaml`) or OpenClaw (`~/.openclaw/openclaw.json`). See the agent references.

### 7. Smoke test, then operate

Call `get_workspace_state` before any other FocusSpace tool. You should see the implicit local user, an empty or starter board, and an idle timer.

Then follow **Operating rules** below. Tool details: [references/mcp-tools.md](references/mcp-tools.md).

## Operating rules

1. **Always call `get_workspace_state` first** in a session (and again after anything that might have changed the board or timer).
2. **Never auto-start the timer.** After creating a task, *ask* whether the user wants to start it. Wait for a yes.
3. **Auto-decompose large tasks.** If the user describes a large piece of work and gives no subtasks, split it into concrete subtasks yourself.
4. You can do everything a human can: board CRUD, timer control, music (Spotify), settings, and rich analytics over MCP.
5. Destructive deletes go through `confirm_action` when the tool asks for confirmation.
6. Individual local mode only. One implicit user. No login. Do not mention or offer Supabase.

## Pitfalls

- Port 3000 already bound → use that instance if it is FocusSpace; otherwise stop the other process or pick another port and update the MCP URL.
- Connecting MCP before the app is listening → HTTP registration will fail. Start the app first, or use stdio.
- Starting the timer because “they probably want to focus now” → never. Ask.
- Asking “local or Supabase?” → never. This skill is local-only.

## Verification

- `~/.focusspace` exists
- App serves http://127.0.0.1:3000
- MCP `get_workspace_state` returns without error
- Creating a task does **not** start the timer until the user says so
