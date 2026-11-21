/**
 * Host mode. `cloud` is the default (focusspace.live / your own Supabase).
 * `local` is the individual self-host: SQLite, no login, one implicit user.
 */
export type FocusSpaceMode = "cloud" | "local";

export function getFocusSpaceMode(): FocusSpaceMode {
  const raw = (
    process.env.NEXT_PUBLIC_FOCUSSPACE_MODE ||
    process.env.FOCUSSPACE_MODE ||
    "cloud"
  ).toLowerCase();
  return raw === "local" ? "local" : "cloud";
}

export function isLocalMode(): boolean {
  return getFocusSpaceMode() === "local";
}

/** Self-host: the agent installs FocusSpace locally (no account, no token). */
export const AGENT_SETUP_LINE =
  "Read https://focusspace.live/for-agents.md and self-host FocusSpace for me on this machine.";

export const AGENT_SETUP_URL = "https://focusspace.live/for-agents";
/** Self-host guide (install locally + local MCP). */
export const AGENT_SETUP_MD_URL = "https://focusspace.live/for-agents.md";
/** Cloud guide (focusspace.live account + token; install nothing). */
export const AGENT_CLOUD_MD_URL = "https://focusspace.live/for-agents/cloud.md";

export const MAX_ESTIMATED_POMOS = 24;
export const VISIBLE_PROJECT_DOTS = 12;
