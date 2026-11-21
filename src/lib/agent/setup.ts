// Copy-paste snippets shown in Settings → Agents & MCP. Pure so they can be
// unit-tested; `origin` is the deployment the user is looking at.
//
// With a token (hosted app) the agent gets the CLOUD guide: connect only,
// install nothing. Without one (local install) it gets the self-host guide,
// told the app is already installed and running.

export interface AgentSetup {
  docUrl: string;
  mcpUrl: string;
  /** One sentence to paste into any agent chat. */
  oneLiner: string;
  /** Claude Code CLI. */
  claudeCode: string;
  /** mcpServers JSON (Cursor, Claude Code .mcp.json, most clients that speak Streamable HTTP). */
  json: string;
}

export function buildAgentSetup(originRaw: string, token: string | null): AgentSetup {
  const origin = originRaw.replace(/\/+$/, "");
  const mcpUrl = `${origin}/api/mcp`;
  const docUrl = token ? `${origin}/for-agents/cloud.md` : `${origin}/for-agents.md`;
  const server: Record<string, unknown> = { type: "http", url: mcpUrl };
  if (token) server.headers = { Authorization: `Bearer ${token}` };
  return {
    docUrl,
    mcpUrl,
    oneLiner: token
      ? `Read ${docUrl} and connect the FocusSpace MCP server for me (hosted — don't install anything): URL ${mcpUrl}, token ${token}.`
      : `Read ${docUrl} and connect the FocusSpace MCP server for me — it's already installed and running, skip the install: URL ${mcpUrl} (local, no token needed).`,
    claudeCode: token
      ? `claude mcp add --transport http focusspace ${mcpUrl} --header "Authorization: Bearer ${token}"`
      : `claude mcp add --transport http focusspace ${mcpUrl}`,
    json: JSON.stringify({ mcpServers: { focusspace: server } }, null, 2),
  };
}
