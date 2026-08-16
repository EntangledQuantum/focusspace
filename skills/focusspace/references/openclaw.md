# FocusSpace on OpenClaw

## Workspace skill

OpenClaw loads workspace skills from `<workspace>/skills` first ([docs](https://docs.openclaw.ai/tools/skills)).

From a FocusSpace checkout, copy or symlink into the agent workspace:

```bash
mkdir -p "$OPENCLAW_WORKSPACE/skills"
cp -R skills/focusspace "$OPENCLAW_WORKSPACE/skills/focusspace"
```

Typical workspace is the OpenClaw agent workspace (often `~/.openclaw/workspace` or the path shown by `openclaw`). If you only have the default state dir:

```bash
mkdir -p ~/.openclaw/skills
cp -R skills/focusspace ~/.openclaw/skills/focusspace
```

Symlink is fine:

```bash
ln -sfn "$(pwd)/skills/focusspace" "$OPENCLAW_WORKSPACE/skills/focusspace"
```

The directory name must stay `focusspace`.

Optional: `openclaw skills install ./skills/focusspace --as focusspace` from the repo.

New sessions pick up the skill. If a session is already open, start a new one after the files land.

## Add the MCP server

OpenClaw-managed servers live under `mcp.servers` in `~/.openclaw/openclaw.json`.

HTTP (preferred when the app is running):

```json5
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
```

stdio:

```json5
{
  mcp: {
    servers: {
      focusspace: {
        command: "npx",
        args: ["tsx", "scripts/mcp-stdio.ts"],
        cwd: "/absolute/path/to/focusspace",
      },
    },
  },
}
```

If the agent runs sandboxed, allow the MCP bundle (`bundle-mcp` or `focusspace__*`) in `tools.sandbox.tools.alsoAllow` so the tools stay visible.

Apply with `openclaw gateway restart` (or the Control UI MCP page → save, then restart). `openclaw mcp doctor --probe` can confirm the server answers.

No auth header in individual local mode.

## Check

In a new OpenClaw session, reference `$focusspace` if needed, then call `get_workspace_state`. You should see the implicit local user and an idle timer.
