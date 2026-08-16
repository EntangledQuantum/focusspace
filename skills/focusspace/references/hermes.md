# FocusSpace on Hermes

## Drop in the skill

Hermes loads skills from `~/.hermes/skills/` ([docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)).

From a FocusSpace checkout:

```bash
mkdir -p ~/.hermes/skills
cp -R skills/focusspace ~/.hermes/skills/focusspace
```

Or symlink so updates follow the repo:

```bash
mkdir -p ~/.hermes/skills
ln -sfn "$(pwd)/skills/focusspace" ~/.hermes/skills/focusspace
```

PowerShell (copy):

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.hermes\skills" | Out-Null
Copy-Item -Recurse -Force skills\focusspace "$HOME\.hermes\skills\focusspace"
```

The folder name must stay `focusspace` (matches `name:` in `SKILL.md`).

You can also point Hermes at this repo’s `skills/` via `skills.external_dirs` in `~/.hermes/config.yaml`.

Reload skills if Hermes is already running (`/focusspace` or restart the session).

## Add the MCP server

Edit `~/.hermes/config.yaml`. Prefer HTTP once the app is up.

```yaml
mcp_servers:
  focusspace:
    url: "http://127.0.0.1:3000/api/mcp"
```

stdio alternative (app does not need to be the MCP transport, but the checkout must exist and Node must run `tsx`):

```yaml
mcp_servers:
  focusspace:
    command: "npx"
    args: ["tsx", "scripts/mcp-stdio.ts"]
    cwd: "/absolute/path/to/focusspace"
```

On Windows set `cwd` to the checkout (e.g. `C:\\Users\\you\\focusspace`).

Apply with `/reload-mcp` or by restarting Hermes.

HTTP is accepted on loopback without TLS. No bearer token in individual local mode.

## Check

```text
hermes chat
```

Then: load `/focusspace` if needed, call `get_workspace_state` (Hermes may prefix it `mcp_focusspace_get_workspace_state`). You should get the implicit local workspace.
