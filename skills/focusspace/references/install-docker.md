# FocusSpace — local Docker install

Use this path when Node.js 20+ is not available, or when the user already prefers containers.

This is the same individual self-host as npm: SQLite, no login, one implicit user. There is no cloud/Supabase compose profile in this skill.

## Requirements

- Docker Engine with the Compose plugin (`docker compose version`)
- git (to clone, unless a checkout already exists)

## Steps

### 1. Data directory (host)

```bash
mkdir -p ~/.focusspace
```

Compose also keeps a named volume at `/data` inside the container. The host directory is for the npm path and for agents that expect `~/.focusspace` to exist.

### 2. Checkout

```bash
git clone https://github.com/EntangledQuantum/focusspace.git
cd focusspace
```

### 3. Start the local profile

The default `docker-compose.yml` is local mode (SQLite).

```bash
docker compose up --build -d
```

What it sets:

- `FOCUSSPACE_MODE=local`
- `NEXT_PUBLIC_FOCUSSPACE_MODE=local`
- `FOCUSSPACE_DATA_DIR=/data`
- named volume `focusspace-data` mounted at `/data`

Build args for `NEXT_PUBLIC_SUPABASE_*` are placeholders only. Do not ask the user for real keys.

Open http://127.0.0.1:3000 and click **Open FocusSpace**.

### 4. MCP

HTTP (app must be up): `http://127.0.0.1:3000/api/mcp`

stdio from a container is awkward; prefer HTTP. If you have Node on the host and a checkout, you can still run `npx tsx scripts/mcp-stdio.ts` against the same `~/.focusspace` data dir — but only if `FOCUSSPACE_DATA_DIR` points at the same files the container uses. For Docker-first setups, use HTTP.

Register the server in Hermes or OpenClaw ([hermes.md](hermes.md), [openclaw.md](openclaw.md)) and call `get_workspace_state`.

## Useful commands

```bash
docker compose logs -f focusspace
docker compose down
```

Data survives `down` in the `focusspace-data` volume. Wipe it only if the user asks to reset.
