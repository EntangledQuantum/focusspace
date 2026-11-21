// Shared by the popup, options page and background service worker.

export const DEFAULT_API_BASE = "https://focusspace.live";

/** Normalise a user-entered server URL to its origin ("https://host[:port]"), or null if invalid. */
export function normalizeBase(input) {
  try {
    const url = new URL(String(input).trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function getConfig() {
  const { apiBase, token, account } = await chrome.storage.local.get(["apiBase", "token", "account"]);
  return { apiBase: normalizeBase(apiBase) || DEFAULT_API_BASE, token: token || null, account: account || null };
}

export async function clearSession() {
  await chrome.storage.local.remove(["token", "account", "lastState", "lastStateAt"]);
}

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

/** Authenticated JSON request to the FocusSpace extension API. A 401 signs the extension out. */
export async function api(path, { method = "GET", body } = {}) {
  const { apiBase, token } = await getConfig();
  if (!token) throw new ApiError("Not signed in.", 401);
  let res;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Can't reach ${new URL(apiBase).host}. Check your connection.`);
  }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (res.status === 401) {
    await clearSession();
    throw new ApiError("Your session ended. Log in again.", 401);
  }
  if (!isJson) throw new ApiError(`Unexpected response from ${new URL(apiBase).host} — is the server URL right?`, res.status);
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status);
  return data;
}

/** Remaining whole seconds of a state snapshot, counting down locally since it was received. */
export function liveRemaining(state, receivedAt, now = Date.now()) {
  const t = state?.timer;
  if (!t) return 0;
  if (t.status !== "running") return t.remainingSec;
  return Math.max(0, Math.ceil(t.remainingSec - (now - receivedAt) / 1000));
}

export const MODE_LABEL = {
  pomodoro: "Focus",
  custom: "Custom",
  short_break: "Short break",
  long_break: "Long break",
};

export const isBreak = (mode) => mode === "short_break" || mode === "long_break";

/** Toolbar badge: minutes left while a session runs (grey when paused, purple on breaks). */
export async function paintBadge(state, receivedAt) {
  const t = state?.timer;
  let text = "";
  let color = "#ff5fa2";
  if (t && (t.status === "running" || t.status === "paused")) {
    const mins = Math.ceil(liveRemaining(state, receivedAt) / 60);
    text = `${Math.max(mins, t.status === "running" ? 1 : 0)}m`;
    color = t.status === "paused" ? "#6b5f70" : isBreak(t.mode) ? "#b06bf6" : "#ff5fa2";
  } else if (t && t.status === "completed") {
    text = "✓";
    color = "#b06bf6";
  }
  await chrome.action.setBadgeText({ text });
  if (text) await chrome.action.setBadgeBackgroundColor({ color });
  if (text && chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#ffffff" });
}
