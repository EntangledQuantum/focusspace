import { api, getConfig, paintBadge, isBreak, ApiError, knownQuery, clockOffset } from "./lib/api.js";

// Keeps the toolbar badge in sync with the server row (the single source of
// truth) without heavy polling:
// - every 30 s (the MV3 alarm minimum) the badge is repainted LOCALLY from the
//   last server state + the measured server-clock offset;
// - about once a minute a version check (`?since=`, one indexed query) fetches
//   the state only if it changed;
// - a one-shot alarm fires right when the running session is due, so the
//   server records the completion (once) even with no FocusSpace tab open.
//
// MV3 suspends this worker whenever it is idle, so nothing lives in memory:
// token, last state and clock samples are in chrome.storage, the schedule is in
// chrome.alarms (which survive suspension and browser restarts), and every
// listener is registered at the top level so a wake-up event finds it.

const TICK = "focusspace-tick";
const DUE = "focusspace-due";
const CHECK_EVERY_MS = 55_000;

async function ensureTick() {
  const existing = await chrome.alarms.get(TICK);
  if (!existing || existing.periodInMinutes !== 0.5) await chrome.alarms.create(TICK, { periodInMinutes: 0.5 });
}

/** Store a state, paint the badge from it and (re)arm the due alarm. No network. */
async function adopt(state) {
  await chrome.storage.local.set({ lastState: state, lastStateAt: Date.now() });
  await paintBadge(state);
  const endsAt = state.timer.status === "running" ? state.timer.endsAt : null;
  if (endsAt) {
    const offset = await clockOffset();
    await chrome.alarms.create(DUE, { when: Math.max(Date.now() + 1000, endsAt - offset + 500) });
  } else {
    await chrome.alarms.clear(DUE);
  }
}

async function refresh({ force = false } = {}) {
  const { token } = await getConfig();
  if (!token) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.alarms.clear(DUE);
    return;
  }
  const { lastState, lastCheckAt = 0 } = await chrome.storage.local.get(["lastState", "lastCheckAt"]);
  if (!force && lastState && Date.now() - lastCheckAt < CHECK_EVERY_MS) {
    await paintBadge(lastState); // local repaint between checks
    return;
  }
  await chrome.storage.local.set({ lastCheckAt: Date.now() });
  try {
    const params = new URLSearchParams(knownQuery(lastState).slice(1));
    if (!force && lastState?.timer?.updatedAt) params.set("since", lastState.timer.updatedAt);
    const state = await api(`/api/extension/state${params.size ? `?${params}` : ""}`);
    if (state.unchanged) {
      await paintBadge(lastState);
      return;
    }
    await adopt(state);
    if (state.justCompleted) notifyComplete(state);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await chrome.action.setBadgeText({ text: "" });
    } else if (lastState) {
      // Offline / server hiccup: keep counting down from the last known server timestamps.
      await paintBadge(lastState);
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

// Side panel: right-click the toolbar icon → "Open side panel", or Alt+Shift+F.
// Both count as a user gesture, which chrome.sidePanel.open() requires.
const PANEL_MENU = "focusspace-open-panel";
function openPanel(tab) {
  if (!chrome.sidePanel?.open || !tab?.windowId) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
}
chrome.contextMenus?.onClicked.addListener((info, tab) => { if (info.menuItemId === PANEL_MENU) openPanel(tab); });
chrome.commands?.onCommand.addListener((command, tab) => { if (command === "open-side-panel") openPanel(tab); });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create({ id: PANEL_MENU, title: "Open side panel", contexts: ["action"] }, () => void chrome.runtime.lastError);
  void ensureTick().then(() => refresh({ force: true }));
});
chrome.runtime.onStartup.addListener(() => { void ensureTick().then(() => refresh({ force: true })); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK) void refresh();
  if (alarm.name === DUE) void refresh({ force: true });
});

// A wake-up after suspension (or an extension reload that fires neither
// onInstalled nor onStartup) must still leave the tick armed.
void ensureTick();

// Popup / side panel / options → background.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "state" && msg.state?.timer) {
    // The popup just got this from the server — reuse it instead of fetching again.
    void ensureTick().then(() => adopt(msg.state));
    return false;
  }
  if (msg?.type === "refresh") {
    void ensureTick().then(() => refresh({ force: true })).then(() => sendResponse({ ok: true }));
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
    await refresh({ force: true });
    if (sender.tab?.id) setTimeout(() => chrome.tabs.remove(sender.tab.id).catch(() => {}), 1800);
  })();
  return true;
});
