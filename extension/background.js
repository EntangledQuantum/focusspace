import { api, getConfig, paintBadge, isBreak, ApiError } from "./lib/api.js";

// Keeps the toolbar badge in sync without heavy polling: one light state
// request a minute, plus a one-shot alarm right after the running session is
// due (the server records sessions that finish while no FocusSpace tab is open).

const TICK = "focusspace-tick";
const DUE = "focusspace-due";

async function ensureTick() {
  const existing = await chrome.alarms.get(TICK);
  if (!existing) await chrome.alarms.create(TICK, { periodInMinutes: 1 });
}

async function refresh() {
  const { token } = await getConfig();
  if (!token) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.alarms.clear(DUE);
    return;
  }
  try {
    const state = await api("/api/extension/state");
    const receivedAt = Date.now();
    await chrome.storage.local.set({ lastState: state, lastStateAt: receivedAt });
    await paintBadge(state, receivedAt);
    if (state.timer.status === "running") {
      await chrome.alarms.create(DUE, { when: receivedAt + state.timer.remainingSec * 1000 + 4000 });
    } else {
      await chrome.alarms.clear(DUE);
    }
    if (state.justCompleted) notifyComplete(state);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await chrome.action.setBadgeText({ text: "" });
    // Otherwise keep the last badge; the next tick retries.
  }
}

function notifyComplete(state) {
  const wasBreak = isBreak(state.timer.mode);
  chrome.notifications.create(`focusspace-done-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: wasBreak ? "Break's over" : "Focus session complete",
    message: wasBreak
      ? "Ready for the next focus session?"
      : state.task ? `Nice work on “${state.task.title}”. Time for a break.` : "Nice work. Time for a break.",
    priority: 1,
  });
}

chrome.runtime.onInstalled.addListener(() => { void ensureTick().then(refresh); });
chrome.runtime.onStartup.addListener(() => { void ensureTick().then(refresh); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK || alarm.name === DUE) void refresh();
});

// Popup / options → background.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "refresh") {
    void ensureTick().then(refresh).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// focusspace.live/extension/connect → background: the site hands over a freshly minted token.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "focusspace:connect" || typeof msg.token !== "string") return false;
  (async () => {
    const { apiBase } = await getConfig();
    const origin = sender.origin || (sender.url ? new URL(sender.url).origin : "");
    // Only accept tokens from the server this extension is configured to talk to.
    if (origin !== apiBase) {
      sendResponse({ ok: false, error: `This extension is set to ${apiBase}. Change the server in its options.` });
      return;
    }
    await chrome.storage.local.set({ token: msg.token });
    // Verify before telling the site we're connected: a token the server
    // can't check (e.g. misconfigured host) must not look like a success.
    try {
      const account = await api("/api/extension/me");
      await chrome.storage.local.set({ account });
    } catch (e) {
      await chrome.storage.local.remove(["token", "account"]);
      sendResponse({
        ok: false,
        error: e instanceof ApiError && e.status === 401
          ? "The server rejected the new token, so the extension is not connected. If you run this server, check SUPABASE_SERVICE_ROLE_KEY."
          : `Couldn't verify the connection: ${e?.message || e}`,
      });
      return;
    }
    sendResponse({ ok: true });
    await ensureTick();
    await refresh();
    if (sender.tab?.id) setTimeout(() => chrome.tabs.remove(sender.tab.id).catch(() => {}), 1800);
  })();
  return true;
});
