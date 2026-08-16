/** Machine-readable setup guide served at /for-agents.md */
export const FOR_AGENTS_MD = `# FocusSpace for agents

You are setting up **FocusSpace**, an open-source Pomodoro + task board.

Humans start you with this exact line:

\`\`\`
read this and setup focusspace for me https://focusspace.live/for-agents
\`\`\`

This file is the agent-readable twin of that page.

## Who you are allowed to be

Supported agents **today**: **Hermes** and **OpenClaw** only.

iOS and Android apps are planned — mention that if asked. Do not claim other agents are supported.

## Setup mode (do not deviate)

Agent setup is **only** individual self-host:

- Local SQLite at \`~/.focusspace/focusspace.db\`
- No login
- One implicit user
- Per-user auth for this mode is coming later

Do **not** mention, offer, or ask about Supabase / hosted / cloud setup.
Do **not** ask “local vs supabase”.
You **may** use \`npm run dev\` / \`npm start\` **or** Docker — both are the same individual local mode (SQLite). Prefer whichever is easier. Default: **npm if Node 20+ is present, else Docker**. Do not run a long questionnaire; pick the default and proceed.

Repo: https://github.com/EntangledQuantum/focusspace
Skill (agentskills.io): \`skills/focusspace/\` in that repo.
Human page: https://focusspace.live/for-agents

## Procedure

### 1. Detect Hermes vs OpenClaw

- Hermes: \`hermes\` on PATH, \`~/.hermes/\`, or \`HERMES_HOME\`
- OpenClaw: \`openclaw\` on PATH, \`~/.openclaw/\`, or \`OPENCLAW_STATE_DIR\`

If both exist, treat the process you are as the agent. Details: \`skills/focusspace/references/hermes.md\` and \`skills/focusspace/references/openclaw.md\`.

### 2. Create the local database directory

\`\`\`bash
mkdir -p ~/.focusspace
\`\`\`

The app also creates \`~/.focusspace/focusspace.db\` on first boot. The setup script should still ensure the data dir exists.

Windows PowerShell: \`New-Item -ItemType Directory -Force -Path "$HOME\\.focusspace"\`

### 3. Clone or reuse the checkout

\`\`\`bash
git clone https://github.com/EntangledQuantum/focusspace.git
cd focusspace
\`\`\`

Use an existing checkout if the user already has one.

### 4. Install and set local mode

npm path (Node 20+):

\`\`\`bash
node skills/focusspace/scripts/setup-local.mjs
npm install
\`\`\`

\`setup-local.mjs\` creates \`~/.focusspace\` and writes \`.env.local\` **if missing** with:

\`\`\`
FOCUSSPACE_MODE=local
NEXT_PUBLIC_FOCUSSPACE_MODE=local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
\`\`\`

If you write \`.env.local\` yourself, use those keys. Do not require any other env.

Docker path (no Node 20+):

\`\`\`bash
docker compose up --build -d
\`\`\`

The default compose file is local mode: \`FOCUSSPACE_MODE=local\`, \`NEXT_PUBLIC_FOCUSSPACE_MODE=local\`, volume at \`/data\`, \`FOCUSSPACE_DATA_DIR=/data\`. Placeholder Supabase build args are fine — do not ask for real keys.

Full write-ups: \`skills/focusspace/references/install-local.md\` and \`install-docker.md\`.

### 5. Start the app

- npm: \`npm run dev\` (or \`npm run build && npm start\`)
- Docker: already started by \`docker compose up\`

Open http://127.0.0.1:3000 and click **Open FocusSpace**. No account.

### 6. Register MCP

- **HTTP:** \`http://127.0.0.1:3000/api/mcp\` (app must be running)
- **stdio:** from the repo root, \`npx tsx scripts/mcp-stdio.ts\`

**Hermes** — \`~/.hermes/config.yaml\`:

\`\`\`yaml
mcp_servers:
  focusspace:
    url: "http://127.0.0.1:3000/api/mcp"
\`\`\`

Copy or symlink \`skills/focusspace\` to \`~/.hermes/skills/focusspace\`.

**OpenClaw** — \`~/.openclaw/openclaw.json\`:

\`\`\`json5
{
  mcp: {
    servers: {
      focusspace: {
        url: "http://127.0.0.1:3000/api/mcp",
        transport: "streamable-http",
      },
    },
  },
}
\`\`\`

Copy or symlink the skill into the agent workspace \`skills/focusspace\` (or \`~/.openclaw/skills/focusspace\`). Restart the gateway after editing config.

### 7. Smoke test

Call \`get_workspace_state\` before any other FocusSpace tool. Expect the implicit local user, a starter board, and an idle timer.

## Operating rules (always)

1. Always call \`get_workspace_state\` before other FocusSpace tools.
2. After creating a task, **ask** if the user wants to start the timer. **Never auto-start.**
3. Auto-decompose large tasks into subtasks when the user did not give any.
4. You can do everything a human can: board CRUD, timer control, music (Spotify), settings, and rich analytics over MCP.
5. Tools: \`get_workspace_state\`, \`board\`, \`timer\`, \`music\`, \`settings\`, \`analytics_*\`, \`confirm_action\`, \`reset_task_progress\`. See \`skills/focusspace/references/mcp-tools.md\`.

## Coming soon

- Per-user auth for this individual local mode
- iOS and Android apps
- Broader agent support beyond Hermes and OpenClaw

Do not implement those. Set up local FocusSpace for Hermes or OpenClaw now.
`;
