import { api, getConfig, paintBadge, isBreak, ApiError, knownQuery } from "./lib/api.js";

// Keeps the toolbar badge in sync without heavy polling: one light state
// request a minute, plus a one-shot alarm right after the running session is
// due (the server records sessions that finish while no FocusSpace tab is open).
//
// MV3 suspends this worker whenever it is idle, so nothing lives in memory:
// the token and the last state are in chrome.storage, the schedule is in
// chrome.alarms (which survive suspension and browser restarts), and every
// listener is registered at the top level so a wake-up event finds it.

const TICK = "focusspace-tick";
const DUE = "focusspace-due";

async function ensureTick() {
  const existing = await chrome.alarms.get(TICK);
  if (!existing) await chrome.alarms.create(TICK, { periodInMinutes: 1 });
}

/** Store a state, paint the badge from it and (re)arm the due alarm. No network. */
async function adopt(state, receivedAt) {
  await chrome.storage.local.set({ lastState: state, lastStateAt: receivedAt });
  await paintBadge(state, receivedAt);
  if (state.timer.status === "running") {
    await chrome.alarms.create(DUE, { when: receivedAt + state.timer.remainingSec * 1000 + 4000 });
  } else {
    await chrome.alarms.clear(DUE);
  }
}

async function refresh() {
  const { token } = await getConfig();
  if (!token) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.alarms.clear(DUE);
    return;
  }
  const { lastState, lastStateAt } = await chrome.storage.local.get(["lastState", "lastStateAt"]);
  try {
    const state = await api(`/api/extension/state${knownQuery(lastState)}`);
    await adopt(state, Date.now());
    if (state.justCompleted) notifyComplete(state);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await chrome.action.setBadgeText({ text: "" });
    } else if (lastState) {
      // Offline / server hiccup: keep counting down from the last known state; the next tick retries.
      await paintBadge(lastState, lastStateAt);
    }
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

// A wake-up after suspension (or an extension reload that fires neither
// onInstalled nor onStartup) must still leave the minute tick armed.
void ensureTick();

// Popup / options → background.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "state" && msg.state?.timer) {
    // The popup just got this from the server — reuse it instead of fetching again.
    void ensureTick().then(() => adopt(msg.state, msg.receivedAt ?? Date.now()));
    return false;
  }
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
