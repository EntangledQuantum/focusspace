import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/LegalShell";
import { REPO_URL } from "@/components/layout/SiteFooter";
import { AGENT_CLOUD_MD_URL, AGENT_SETUP_LINE, AGENT_SETUP_MD_URL } from "@/lib/mode";

export const metadata: Metadata = {
  title: "FocusSpace for agents",
  description:
    "Connect Claude, ChatGPT, Cursor, Hermes, OpenClaw or any MCP agent to FocusSpace — use your focusspace.live account with a token, or have the agent self-host it on your machine.",
};

export default function ForAgentsPage() {
  return (
    <LegalShell title="FocusSpace for agents" updated="November 21, 2026">
      <p>
        FocusSpace is a Pomodoro timer, task board, and focus analytics app.
        Any agent that speaks MCP works — Claude (Code and Desktop), ChatGPT,
        Cursor, Windsurf, Hermes, OpenClaw and more. Agents can do everything you can — projects, tasks, subtasks, the
        timer and pomodoros, live status (what&apos;s running, time left),
        settings, analytics and Spotify — over MCP. There are two ways to set
        it up. Pick one:
      </p>

      <h2>1. Use your focusspace.live account (nothing to install)</h2>
      <p>
        Your FocusSpace stays hosted on focusspace.live. The agent doesn&apos;t
        install anything — it just connects to your account with a personal
        token and acts on your behalf.
      </p>
      <ol>
        <li>Sign in, open <strong>Settings → Agents &amp; MCP</strong> and press <strong>New token</strong>.</li>
        <li>Copy the one-liner it shows (the token is shown only once) and paste it into your agent. It looks like:</li>
      </ol>
      <pre>
        <code>Read https://focusspace.live/for-agents/cloud.md and connect the FocusSpace MCP server for me (hosted — don&apos;t install anything): URL https://focusspace.live/api/mcp, token fs_…</code>
      </pre>
      <p>
        Endpoint <code>https://focusspace.live/api/mcp</code> (MCP Streamable HTTP),
        header <code>Authorization: Bearer fs_…</code>. Revoke a token any time
        from the same settings page and that agent loses access immediately.
        Agent guide: <a href={AGENT_CLOUD_MD_URL}>/for-agents/cloud.md</a>.
      </p>

      <h2>2. Self-host on your own machine</h2>
      <p>
        The agent installs FocusSpace locally — a SQLite file at{" "}
        <code>~/.focusspace/focusspace.db</code>, one user, no login, no account
        on focusspace.live. The local install comes with its own MCP server, so
        the agent then connects to it directly; no token is needed because it
        only runs on your machine. Paste this into your agent:
      </p>
      <pre>
        <code>{AGENT_SETUP_LINE}</code>
      </pre>
      <p>Or do it yourself:</p>
      <ol>
        <li>Clone <a href={REPO_URL} target="_blank" rel="noreferrer">EntangledQuantum/focusspace</a> (or reuse a checkout).</li>
        <li>
          Run <code>node skills/focusspace/scripts/setup-local.mjs</code> (writes{" "}
          <code>.env.local</code> with <code>FOCUSSPACE_MODE=local</code>), then{" "}
          <code>npm install &amp;&amp; npm run dev</code> — or <code>docker compose up --build -d</code>.
        </li>
        <li>Open http://127.0.0.1:3000.</li>
        <li>
          Register MCP: HTTP <code>http://127.0.0.1:3000/api/mcp</code> or stdio{" "}
          <code>npm run mcp</code>.
        </li>
      </ol>
      <p>
        Agent guide: <a href={AGENT_SETUP_MD_URL}>/for-agents.md</a>. Ready-made
        skill for Hermes and OpenClaw: <code>skills/focusspace/</code> in the repo.
      </p>

      <h2>What agents can do</h2>
      <ul>
        <li>Read live status: timer mode, running/paused, time left, current task, subtasks and project.</li>
        <li>Start, pause, resume, skip and stop pomodoros, breaks and custom sessions.</li>
        <li>Create, edit, complete, reorder and delete projects, tasks and subtasks.</li>
        <li>Change settings, read analytics, control Spotify.</li>
        <li>Agents call <code>get_workspace_state</code> first and ask before starting the timer.</li>
      </ul>

      <h2>Links</h2>
      <ul>
        <li><a href={AGENT_CLOUD_MD_URL}>Agent guide — hosted account</a> (<code>/for-agents/cloud.md</code>)</li>
        <li><a href={AGENT_SETUP_MD_URL}>Agent guide — self-host</a> (<code>/for-agents.md</code>)</li>
        <li>
          <a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a>
        </li>
      </ul>
    </LegalShell>
  );
}
