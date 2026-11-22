// Shared by the popup, side panel, options page and background service worker.
import { addSample, remainingAt, sampleOffset } from "./clock.js";

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

// ---------- server clock ----------
// Timer timestamps are server epoch ms. Every response carries `serverNow`;
// the offset (server − local) is estimated NTP-style and shared through
// chrome.storage so the popup, side panel and badge all count the same.

let clock = { samples: [], offset: 0, loaded: false };

async function loadClock() {
  if (clock.loaded) return clock;
  try {
    const { clockSamples } = await chrome.storage.local.get("clockSamples");
    if (Array.isArray(clockSamples) && clockSamples.length) {
      clock = { ...addSample(clockSamples.slice(0, -1), clockSamples.at(-1), Date.now()), loaded: true };
      return clock;
    }
  } catch { /* storage unavailable: start fresh */ }
  clock.loaded = true;
  return clock;
}

function noteClock(serverNow, t0, t1) {
  if (typeof serverNow !== "number") return;
  const r = addSample(clock.samples, sampleOffset(serverNow, t0, t1));
  clock = { ...r, loaded: true };
  chrome.storage.local.set({ clockSamples: r.samples }).catch(() => {});
}

/** server clock − local clock, ms. */
export async function clockOffset() {
  return (await loadClock()).offset;
}

/** Current server time as best this context knows it (sync; call clockOffset() once first). */
export const serverTime = () => Date.now() + clock.offset;

/** Remaining whole seconds of a state's timer right now (server clock). */
export function timerRemaining(state) {
  return remainingAt(state?.timer, serverTime());
}

export class ApiError extends Error {
  constructor(message, status = 0, { offline = false } = {}) {
    super(message);
    this.status = status;
    /** Network failure or timeout (no answer from the server at all). */
    this.offline = offline;
  }
}

export const REQUEST_TIMEOUT_MS = 8000;

async function once(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Authenticated JSON request to the FocusSpace extension API. A 401 signs the
 * extension out. Every request times out after 8 s; reads (GET) are retried
 * once on a network error or timeout, commands are not (the caller decides).
 */
export async function api(path, { method = "GET", body, retry = method === "GET" } = {}) {
  const { apiBase, token } = await getConfig(); // ~1 ms; always the current token
  if (!token) throw new ApiError("Not signed in.", 401);
  const host = new URL(apiBase).host;
  const init = {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  await loadClock();
  let res;
  let t0 = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      t0 = Date.now();
      res = await once(`${apiBase}${path}`, init);
      break;
    } catch (e) {
      if (retry && attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      const timedOut = e?.name === "AbortError";
      throw new ApiError(
        timedOut ? `${host} is taking too long to answer.` : `Can't reach ${host}. Check your connection.`,
        0,
        { offline: true },
      );
    }
  }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : {};
  noteClock(data?.serverNow, t0, Date.now());
  if (res.status === 401) {
    // Only sign out if the rejected token is still the stored one (not one replaced meanwhile).
    const { token: current } = await chrome.storage.local.get("token");
    if (current === token) await clearSession();
    throw new ApiError("Your session ended. Log in again.", 401);
  }
  if (!isJson) throw new ApiError(`Unexpected response from ${host} — is the server URL right?`, res.status);
  if (!res.ok) {
    const err = new ApiError(data.error || `Request failed (${res.status}).`, res.status);
    // A refused timer intent carries the authoritative state to show instead.
    if (data.state?.timer) err.state = data.state;
    throw err;
  }
  return data;
}

/** Query string carrying what the caller already shows, so the server loads it all in one round trip. */
export function knownQuery(state) {
  const p = new URLSearchParams();
  if (state?.task?.id) p.set("task", state.task.id);
  if (state?.project?.id) p.set("project", state.project.id);
  const q = p.toString();
  return q ? `?${q}` : "";
}

export const known = (state) => ({ taskId: state?.task?.id ?? null, projectId: state?.project?.id ?? null });


export const MODE_LABEL = {
  pomodoro: "Focus",
  custom: "Custom",
  short_break: "Short break",
  long_break: "Long break",
};

export const isBreak = (mode) => mode === "short_break" || mode === "long_break";

/** Toolbar badge: minutes left while a session runs (grey when paused, purple on breaks). */
export async function paintBadge(state) {
  await loadClock();
  const t = state?.timer;
  let text = "";
  let color = "#ff5fa2";
  if (t && (t.status === "running" || t.status === "paused")) {
    const mins = Math.ceil(timerRemaining(state) / 60);
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
