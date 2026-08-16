# FocusSpace — local npm install

Use this path when Node.js 20+ is on the machine. Docker is the fallback: [install-docker.md](install-docker.md).

Both paths are the same individual self-host: SQLite, no login, one implicit user.

## Requirements

- Node.js 20 or newer (`node -v`)
- npm (ships with Node)
- git (to clone, unless a checkout already exists)

## Steps

### 1. Data directory

```bash
mkdir -p ~/.focusspace
```

PowerShell: `New-Item -ItemType Directory -Force -Path "$HOME\.focusspace"`

The database file is `~/.focusspace/focusspace.db`. First boot creates it if missing.

### 2. Checkout

```bash
git clone https://github.com/EntangledQuantum/focusspace.git
cd focusspace
```

Reuse an existing clone if the user already has one.

### 3. Helper (optional)

From the repo root:

```bash
node skills/focusspace/scripts/setup-local.mjs
```

This creates `~/.focusspace` and writes `.env.local` with local mode when that file does not exist.

### 4. Environment

Create `.env.local` in the repo root if the helper did not:

```
FOCUSSPACE_MODE=local
NEXT_PUBLIC_FOCUSSPACE_MODE=local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Do not prompt for cloud credentials. Local mode does not need them.

### 5. Install and start

```bash
npm install
npm run dev
```

For a production-style local process:

```bash
npm run build
npm start
```

Open http://127.0.0.1:3000 and click **Open FocusSpace**. There is no sign-in.

### 6. MCP

With the app running:

- HTTP: `http://127.0.0.1:3000/api/mcp`
- stdio (from the repo root): `npx tsx scripts/mcp-stdio.ts`

Then register the server in Hermes or OpenClaw ([hermes.md](hermes.md), [openclaw.md](openclaw.md)) and call `get_workspace_state`.

## Notes

- `FOCUSSPACE_DATA_DIR` overrides the data directory (default `~/.focusspace`).
- If port 3000 is taken, either use the existing FocusSpace process or start Next on another port and point MCP at that origin.
