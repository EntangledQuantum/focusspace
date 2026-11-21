import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/LegalShell";
import { REPO_URL } from "@/components/layout/SiteFooter";
import { AGENT_SETUP_LINE, AGENT_SETUP_MD_URL } from "@/lib/mode";

export const metadata: Metadata = {
  title: "FocusSpace for agents",
  description:
    "Connect Claude, Cursor, Hermes or any MCP agent to FocusSpace: timer, tasks, projects, analytics and music over MCP.",
};

export default function ForAgentsPage() {
  return (
    <LegalShell title="FocusSpace for agents" updated="November 21, 2026">
      <p>
        FocusSpace is a Pomodoro timer, task board, and focus analytics app.
        Agents can do everything a human can — board CRUD, timer control,
        music, settings, and rich analytics — over MCP.
      </p>

      <p>If you are a human talking to an agent, paste this exact line:</p>

      <pre>
        <code>{AGENT_SETUP_LINE}</code>
      </pre>

      <p>
        Agents should fetch the machine-readable guide at{" "}
        <a href={AGENT_SETUP_MD_URL}>/for-agents.md</a>. The skill lives in the{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub repo
        </a>{" "}
        under <code>skills/focusspace/</code>.
      </p>

      <h2>Connect an agent to your FocusSpace account</h2>
      <p>
        Any MCP client works — Claude Code, Claude Desktop, Cursor, Hermes,
        OpenClaw and others. In FocusSpace open <strong>Settings → Agents &amp; MCP</strong>,
        press <strong>New token</strong> and paste the one-liner it shows into your
        agent. It looks like:
      </p>
      <pre>
        <code>Read https://focusspace.live/for-agents.md and set up the FocusSpace MCP server for me with URL https://focusspace.live/api/mcp and token fs_…</code>
      </pre>
      <p>
        The endpoint is <code>https://focusspace.live/api/mcp</code> (MCP Streamable
        HTTP) with the header <code>Authorization: Bearer fs_…</code>. Tokens can be
        revoked any time from the same settings page.
      </p>

      <h2>Or self-host locally</h2>
      <p>
        Individual self-host: a SQLite file at <code>~/.focusspace/focusspace.db</code>,
        no login, one implicit user, no token. Run with <code>npm run dev</code> /{" "}
        <code>npm start</code> (Node 20+) or Docker.
      </p>
      <ol>
        <li>Clone <a href={REPO_URL} target="_blank" rel="noreferrer">EntangledQuantum/focusspace</a> or reuse an existing checkout.</li>
        <li>
          Set <code>FOCUSSPACE_MODE=local</code> and{" "}
          <code>NEXT_PUBLIC_FOCUSSPACE_MODE=local</code> in <code>.env.local</code>.
        </li>
        <li>Start the app and open http://127.0.0.1:3000 — click <strong>Open FocusSpace</strong>.</li>
        <li>
          Register MCP: HTTP <code>http://127.0.0.1:3000/api/mcp</code> or stdio{" "}
          <code>npm run mcp</code>.
        </li>
      </ol>

      <h2>What agents can do</h2>
      <ul>
        <li>Read live status: timer mode, running/paused, time left, current task and project.</li>
        <li>Start, pause, resume, skip and stop pomodoros, breaks and custom sessions.</li>
        <li>Create, edit, complete, reorder and delete projects, tasks and subtasks.</li>
        <li>Change settings, read analytics, control Spotify.</li>
        <li>Agents call <code>get_workspace_state</code> first and ask before starting the timer.</li>
      </ul>

      <h2>Links</h2>
      <ul>
        <li>
          <a href={AGENT_SETUP_MD_URL}>Raw markdown for agents</a>{" "}
          (<code>/for-agents.md</code>)
        </li>
        <li>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </li>
      </ul>
    </LegalShell>
  );
}
