// Copy-paste snippets shown in Settings → Agents & MCP. Pure so they can be
// unit-tested; `origin` is the deployment the user is looking at.

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
  const docUrl = `${origin}/for-agents.md`;
  const mcpUrl = `${origin}/api/mcp`;
  const server: Record<string, unknown> = { type: "http", url: mcpUrl };
  if (token) server.headers = { Authorization: `Bearer ${token}` };
  return {
    docUrl,
    mcpUrl,
    oneLiner: token
      ? `Read ${docUrl} and set up the FocusSpace MCP server for me with URL ${mcpUrl} and token ${token}.`
      : `Read ${docUrl} and set up the FocusSpace MCP server for me with URL ${mcpUrl} (local install, no token needed).`,
    claudeCode: token
      ? `claude mcp add --transport http focusspace ${mcpUrl} --header "Authorization: Bearer ${token}"`
      : `claude mcp add --transport http focusspace ${mcpUrl}`,
    json: JSON.stringify({ mcpServers: { focusspace: server } }, null, 2),
  };
}
