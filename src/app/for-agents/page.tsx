import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/LegalShell";
import { REPO_URL } from "@/components/layout/SiteFooter";
import { AGENT_SETUP_LINE, AGENT_SETUP_MD_URL } from "@/lib/mode";

export const metadata: Metadata = {
  title: "FocusSpace for agents",
  description:
    "Install FocusSpace for Hermes or OpenClaw. Individual local setup, MCP tools, no login.",
};

export default function ForAgentsPage() {
  return (
    <LegalShell title="FocusSpace for agents" updated="August 17, 2026">
      <p>
        FocusSpace is a Pomodoro timer, task board, and focus analytics app.
        Agents can do everything a human can — board CRUD, timer control,
        settings, and rich analytics — over MCP.
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

      <h2>Supported agents</h2>
      <p>
        <strong>Today: Hermes and OpenClaw only.</strong> iOS and Android apps
        are planned. Other agents are not supported yet.
      </p>

      <h2>Local-only setup</h2>
      <p>
        Agent setup is individual self-host: a SQLite file at{" "}
        <code>~/.focusspace/focusspace.db</code>, no login, one implicit user.
        Per-user auth for this mode is coming later.
      </p>
      <p>
        Run the app with <code>npm run dev</code> / <code>npm start</code> or
        with Docker — both are the same local SQLite mode. Prefer npm when
        Node 20+ is installed; otherwise use Docker. There is nothing to
        configure beyond local mode.
      </p>
      <ol>
        <li>Create <code>~/.focusspace</code> (the app also creates the database on first boot).</li>
        <li>Clone <a href={REPO_URL} target="_blank" rel="noreferrer">EntangledQuantum/focusspace</a> or reuse an existing checkout.</li>
        <li>
          Set <code>FOCUSSPACE_MODE=local</code> and{" "}
          <code>NEXT_PUBLIC_FOCUSSPACE_MODE=local</code> in <code>.env.local</code>.
        </li>
        <li>Start the app and open http://127.0.0.1:3000 — click <strong>Open FocusSpace</strong>.</li>
        <li>
          Register MCP: HTTP <code>http://127.0.0.1:3000/api/mcp</code> or stdio{" "}
          <code>npx tsx scripts/mcp-stdio.ts</code>.
        </li>
        <li>Call <code>get_workspace_state</code> before any other tool.</li>
      </ol>

      <h2>How agents should behave</h2>
      <ul>
        <li>Always call <code>get_workspace_state</code> first.</li>
        <li>After creating a task, <strong>ask</strong> if you want the timer started. Never auto-start.</li>
        <li>Auto-decompose large tasks into subtasks when you did not give any.</li>
        <li>
          Tools: <code>get_workspace_state</code>, <code>board</code>,{" "}
          <code>timer</code>, <code>settings</code>, <code>analytics_*</code>,{" "}
          <code>confirm_action</code>, <code>reset_task_progress</code>.
        </li>
      </ul>

      <h2>Coming soon</h2>
      <ul>
        <li>Per-user auth for this local mode</li>
        <li>iOS and Android apps</li>
        <li>Support for more agents</li>
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
