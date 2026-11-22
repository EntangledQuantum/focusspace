import { api, getConfig, clearSession, paintBadge, MODE_LABEL, isBreak, known, knownQuery, clockOffset, serverTime, timerRemaining } from "./lib/api.js";
import { predictTimer, shouldApplyPoll, overlayPending, predictMusic, acceptMusic } from "./lib/optimistic.js";

// Shared by the popup and the side panel (same element ids).
//
// The server row is the single source of truth. The countdown is rendered from
// its SERVER timestamps + the measured server-clock offset, so it matches every
// website tab to the second whatever this machine's clock says. While visible,
// a one-query version check (`?since=`) runs every 2 s; a full refresh every
// 30 s picks up task edits made elsewhere.
//
// Every click updates the UI immediately (optimistic), sends one intent whose
// response is the new state, and is replaced by the server's current state (with
// a toast) if refused, or rolled back if the network fails — commands are never
// queued offline (replaying a "pause" minutes later would pause at the wrong time).
// Each area (timer, task, each subtask, music) is locked separately while its
// own request is in flight — the UI as a whole never freezes.

// Static, trusted SVG markup only (lucide-style). Everything user-provided goes through textContent.
const svg = (body, fill = false) =>
  `<svg viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  play: svg('<polygon points="7 4 20 12 7 20 7 4"/>', true),
  pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', true),
  stop: svg('<rect x="5" y="5" width="14" height="14" rx="2"/>', true),
  skip: svg('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>'),
  prev: svg('<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>', true),
  next: svg('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>', true),
  music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
};

const $ = (id) => document.getElementById(id);
const RING = 2 * Math.PI * 52;
const POLL_MS = 2000; // version check (one indexed query) while visible
const FULL_EVERY_MS = 30_000; // full state, for task edits made elsewhere
const MUSIC_POLL_MS = 4000;
const MUSIC_HOLD_MS = 3000; // Spotify's /me/player can lag a command by ~0.3–2 s

let cfg = null;
/** What is on screen (server state + optimistic changes). */
let state = null;
/** Last state confirmed by the server. */
let serverState = null;
const inflight = { timer: false, task: false };
const pendingSubs = new Map(); // subtaskId → desired done, while its request is in flight
let pendingDone; // { taskId, done } while a task-done request is in flight
let lastAckAt = 0;
let lastFullAt = 0;
let polling = false;
let music = null;
let musicHold = null;
let musicBusy = false;
let dueRefreshQueued = false;
let timers = [];

// ---------- helpers ----------

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const tail = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h ? `${h}:${tail}` : tail;
}
const fmtMin = (sec) => `${Math.round(sec / 60)}m`;

let toastTimer = 0;
function toast(message, kind = "info") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast ${kind === "error" ? "error" : ""}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}

function setOffline(message) {
  const el = $("net-banner");
  el.hidden = !message;
  if (message) el.textContent = message;
}

/** 401 → the storage listener swaps to the login view; network → banner; anything else → toast (unless quiet). */
function handleError(e, { quiet = false } = {}) {
  if (e?.status === 401) return;
  if (e?.offline) {
    setOffline(`${e.message} Showing the last known state — retrying.`);
    if (!quiet) toast(e.message, "error");
    return;
  }
  if (!quiet) toast(e?.message || String(e), "error");
}

function iconButton(icon, title, onClick, extra = "", disabled = false) {
  const b = document.createElement("button");
  b.className = `icon-btn ${extra}`;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = ICONS[icon];
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function textButton(label, onClick, primary = false, disabled = false) {
  const b = document.createElement("button");
  b.className = `btn ${primary ? "primary" : ""}`;
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function openSite(path) {
  chrome.tabs.create({ url: `${cfg.apiBase}${path}` });
  window.close();
}

function show(view) {
  for (const id of ["view-login", "view-main", "view-picker"]) $(id).hidden = id !== view;
  $("account-btn").hidden = view === "view-login";
  $("account-menu").hidden = true;
}

// ---------- state ----------

function display(next) {
  state = next;
  dueRefreshQueued = false;
  render();
  stateListeners.forEach((cb) => cb(state));
}

const stateListeners = new Set();
/** For the side panel: called with every state shown. */
export function onState(cb) {
  stateListeners.add(cb);
  return () => stateListeners.delete(cb);
}
export const currentState = () => serverState;

/** A server-confirmed state: show it (with still-pending clicks re-applied), cache it, hand it to the badge. */
export function applyServer(next, { taskOnly = false } = {}) {
  serverState = next;
  const base = taskOnly && state ? { ...state, task: next.task, project: next.project } : next;
  display(overlayPending(base, { subtasks: pendingSubs, taskDone: pendingDone }));
  setOffline(null);
  void chrome.storage.local.set({ lastState: next, lastStateAt: Date.now() });
  void paintBadge(next);
  // The background reschedules its alarms from this — no extra request.
  chrome.runtime.sendMessage({ type: "state", state: next }).catch(() => {});
  if (next.justCompleted) toast(isBreak(next.timer.mode) ? "Break's over." : "Session complete — nice focus.");
}

export async function refreshState({ full = false } = {}) {
  if (polling) return;
  polling = true;
  const pollStartedAt = Date.now();
  try {
    const shown = serverState ?? state;
    const params = new URLSearchParams(knownQuery(shown).slice(1));
    if (!full && shown?.timer?.updatedAt && pollStartedAt - lastFullAt < FULL_EVERY_MS) params.set("since", shown.timer.updatedAt);
    else lastFullAt = pollStartedAt;
    const next = await api(`/api/extension/state${params.size ? `?${params}` : ""}`);
    setOffline(null);
    if (next.unchanged) return;
    const inFlight = inflight.timer || inflight.task || pendingSubs.size > 0 || pendingDone !== undefined;
    if (shouldApplyPoll({
      inFlight, pollStartedAt, lastAckAt,
      currentUpdatedAt: serverState?.timer?.updatedAt, incomingUpdatedAt: next.timer?.updatedAt,
    })) applyServer(next);
  } catch (e) {
    handleError(e, { quiet: true });
  } finally {
    polling = false;
  }
}

async function refreshMusic() {
  try {
    const next = await api("/api/extension/music");
    if (acceptMusic(next, musicHold)) {
      music = next;
      musicHold = null;
      renderMusic();
    }
  } catch (e) {
    handleError(e, { quiet: true });
  }
}

// ---------- commands ----------

async function timerCmd(action, mode) {
  if (inflight.timer || !state) return;
  const predicted = predictTimer(state, action, mode, serverTime());
  if (!predicted) return; // e.g. "pause" on a timer that is no longer running
  const before = state;
  const seen = serverState ?? before;
  inflight.timer = true;
  display(predicted);
  try {
    const next = await api("/api/extension/timer", {
      method: "POST",
      body: {
        action,
        ...(mode ? { mode } : {}),
        // Refused by the server if another device started a different session meanwhile.
        ...(action !== "start" ? { expectSessionId: seen.timer.sessionId ?? null } : {}),
        known: known(seen),
      },
    });
    inflight.timer = false;
    lastAckAt = Date.now();
    applyServer(next);
  } catch (e) {
    inflight.timer = false;
    lastAckAt = Date.now();
    if (e?.state) {
      applyServer(e.state); // refused: show what the server actually has
      toast(e.message, "error");
    } else {
      display(before);
      handleError(e);
      void refreshState({ full: true });
    }
  }
}

async function taskRequest(body, { taskOnly }) {
  const next = await api("/api/extension/tasks", { method: "POST", body });
  lastAckAt = Date.now();
  // A timer click may be in flight: only take the task part so its optimistic timer state survives.
  applyServer(next, { taskOnly: taskOnly || inflight.timer });
}

async function toggleSubtask(st) {
  if (pendingSubs.has(st.id) || !state?.task) return;
  const desired = !st.done;
  pendingSubs.set(st.id, desired);
  display(overlayPending(state, { subtasks: pendingSubs, taskDone: pendingDone }));
  try {
    // `done` is the desired value, so a retry can never double-toggle.
    const req = taskRequest({ action: "toggle_subtask", subtaskId: st.id, done: desired, known: known(state) }, { taskOnly: true });
    await req.finally(() => { pendingSubs.delete(st.id); render(); });
  } catch (e) {
    const task = state?.task;
    if (task) display({ ...state, task: { ...task, subtasks: task.subtasks.map((s) => (s.id === st.id ? { ...s, done: !desired } : s)) } });
    handleError(e);
  }
}

async function toggleDone() {
  const task = state?.task;
  if (!task || pendingDone !== undefined || inflight.task) return;
  const desired = !task.done;
  pendingDone = { taskId: task.id, done: desired };
  display(overlayPending(state, { subtasks: pendingSubs, taskDone: pendingDone }));
  try {
    await taskRequest({ action: "toggle_done", taskId: task.id, done: desired, known: known(state) }, { taskOnly: true })
      .finally(() => { pendingDone = undefined; render(); });
  } catch (e) {
    if (state?.task?.id === task.id) display({ ...state, task: { ...state.task, done: !desired } });
    handleError(e);
  }
}

async function selectTask(pick) {
  show("view-main");
  if (inflight.task || !state) return;
  const before = state;
  inflight.task = true;
  // Show the picked task straight away; its subtasks fill in with the response.
  const project = pick && picker?.projects.find((p) => p.id === pick.projectId);
  display({
    ...state,
    task: pick ? { id: pick.id, title: pick.title, done: false, estimatedPomodoros: pick.estimatedPomodoros, completedPomodoros: pick.completedPomodoros, subtasks: [] } : null,
    project: project ? { id: project.id, name: project.name, color: project.color } : null,
  });
  try {
    await taskRequest(
      { action: "select", taskId: pick?.id ?? null, known: { taskId: pick?.id ?? null, projectId: pick?.projectId ?? null } },
      { taskOnly: false },
    ).finally(() => { inflight.task = false; render(); });
  } catch (e) {
    display(before);
    handleError(e);
  }
}

async function musicCmd(kind) {
  if (!music?.connected || musicBusy) return;
  const action = kind === "toggle" ? (music.isPlaying ? "pause" : "play") : kind;
  const before = music;
  const predicted = predictMusic(music, action);
  if (!predicted) return;
  musicBusy = true;
  music = predicted;
  musicHold = {
    until: Date.now() + MUSIC_HOLD_MS,
    isPlaying: predicted.isPlaying,
    ...(action === "next" || action === "previous" ? { fromTrack: before.track?.name ?? null } : {}),
  };
  renderMusic();
  try {
    await api("/api/extension/music", { method: "POST", body: { action } });
    // Spotify shows the change after a short lag; reconcile then (the hold ignores stale reads meanwhile).
    setTimeout(refreshMusic, 900);
    setTimeout(refreshMusic, 2200);
  } catch (e) {
    musicHold = null;
    music = before;
    handleError(e);
  } finally {
    musicBusy = false;
    renderMusic();
  }
}

// ---------- rendering ----------

function render() {
  if (!state) return;
  renderTimer();
  renderTask();
}

function renderClock() {
  if (!state) return;
  const t = state.timer;
  const active = t.status === "running" || t.status === "paused";
  let secs;
  if (active) secs = timerRemaining(state);
  else if (t.status === "completed") secs = 0;
  else secs = state.next.start.durationSec;
  $("time").textContent = fmtClock(secs);

  const progress = active ? 1 - secs / Math.max(1, t.plannedDurationSec) : t.status === "completed" ? 1 : 0;
  $("ring-bar").style.strokeDashoffset = String(RING * (1 - Math.min(1, Math.max(0, progress))));

  // Countdown hit zero: the site (if open) or the server records it — fetch the result shortly after.
  if (t.status === "running" && secs <= 0 && !dueRefreshQueued && !inflight.timer) {
    dueRefreshQueued = true;
    setTimeout(refreshState, 3500);
  }
}

function renderTimer() {
  const t = state.timer;
  const busy = inflight.timer;
  const pill = $("mode-pill");
  const shownMode = t.status === "idle" ? state.next.start.mode : t.mode;
  pill.textContent = MODE_LABEL[shownMode] ?? shownMode;
  pill.classList.toggle("break", isBreak(shownMode));

  const label = {
    idle: "Ready",
    running: isBreak(t.mode) ? "On a break" : "Focusing",
    paused: "Paused",
    completed: isBreak(t.mode) ? "Break over" : "Session complete",
  }[t.status];
  $("status-label").textContent = label ?? "";

  const c = $("timer-controls");
  c.replaceChildren();
  if (t.status === "running" || t.status === "paused") {
    const running = t.status === "running";
    c.append(
      iconButton("stop", "Stop & reset", () => timerCmd("stop"), "", busy),
      iconButton(running ? "pause" : "play", running ? "Pause" : "Resume", () => timerCmd(running ? "pause" : "resume"), "big", busy),
      iconButton("skip", isBreak(t.mode) ? "Skip break" : "Skip session", () => timerCmd("skip"), "", busy),
    );
  } else if (state.next.breakOption) {
    const br = state.next.breakOption;
    c.append(
      textButton(`Start ${MODE_LABEL[br.mode].toLowerCase()} · ${fmtMin(br.durationSec)}`, () => timerCmd("start", br.mode), true, busy),
      textButton("Skip to focus", () => timerCmd("start", "pomodoro"), false, busy),
    );
  } else {
    const s = state.next.start;
    const what = s.mode === "custom" ? "custom" : "focus";
    c.append(textButton(`Start ${what} · ${fmtMin(s.durationSec)}`, () => timerCmd("start", s.mode), true, busy));
  }
  renderClock();
}

function renderTask() {
  const { task, project, timer } = state;
  const chip = $("project-chip");
  if (project) {
    chip.hidden = false;
    chip.textContent = project.name;
    chip.style.color = project.color;
    chip.style.background = `color-mix(in srgb, ${project.color} 16%, transparent)`;
  } else {
    chip.hidden = true;
  }

  const locked = timer.status === "running" || timer.status === "paused";
  const change = $("change-task");
  change.textContent = task ? "Change" : "Choose task";
  change.disabled = locked || inflight.task;
  change.title = locked ? "Stop the timer to switch tasks" : "";

  $("task-empty").hidden = !!task;
  $("task-row").hidden = !task;
  const pomos = $("pomos");
  const list = $("subtasks");
  pomos.replaceChildren();
  list.replaceChildren();
  if (!task) return;

  $("task-row").classList.toggle("done", task.done);
  $("task-title").textContent = task.title;
  const done = $("task-done");
  done.checked = task.done;
  done.disabled = pendingDone !== undefined || inflight.task;
  done.title = task.done ? "Mark as not done" : "Mark task complete";

  const total = Math.min(12, Math.ceil(task.estimatedPomodoros));
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("span");
    dot.className = `pomo ${i < task.completedPomodoros ? "on" : ""}`;
    pomos.append(dot);
  }
  const count = document.createElement("span");
  count.className = "muted small";
  count.style.marginLeft = "4px";
  count.textContent = `${task.completedPomodoros}/${task.estimatedPomodoros} pomodoros`;
  pomos.append(count);

  for (const st of task.subtasks) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    label.className = st.done ? "done" : "";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = st.done;
    box.disabled = pendingSubs.has(st.id);
    box.addEventListener("change", () => toggleSubtask(st));
    const span = document.createElement("span");
    span.textContent = st.title;
    label.append(box, span);
    li.append(label);
    list.append(li);
  }
}

function renderMusic() {
  const title = $("music-title");
  const sub = $("music-sub");
  const art = $("music-art");
  const controls = $("music-controls");
  const toggle = $("music-toggle");

  if (!music) return;
  if (!music.connected) {
    art.hidden = true;
    $("music-art-empty").hidden = false;
    title.textContent = "Spotify not connected";
    sub.textContent = "Connect it in FocusSpace → Settings → Music";
    sub.style.cursor = "pointer";
    sub.onclick = () => openSite("/settings");
    controls.hidden = true;
    return;
  }
  sub.style.cursor = "";
  sub.onclick = null;
  controls.hidden = false;
  const track = music.track;
  if (track?.artUrl) {
    art.src = track.artUrl;
    art.hidden = false;
    $("music-art-empty").hidden = true;
  } else {
    art.hidden = true;
    $("music-art-empty").hidden = false;
  }
  title.textContent = track ? track.name : "Nothing playing";
  sub.textContent = music.pending
    ? (music.pending === "next" ? "Skipping…" : "Going back…")
    : track
      ? [track.artists, music.device].filter(Boolean).join(" · ")
      : music.message || (music.device ? `Paused on ${music.device}` : "Press play to resume Spotify");
  toggle.innerHTML = ICONS[music.isPlaying ? "pause" : "play"];
  toggle.title = music.isPlaying ? "Pause" : "Play";
  for (const b of controls.querySelectorAll("button")) b.disabled = musicBusy || (!track && b !== toggle);
}

// ---------- account ----------

function renderAccount(account) {
  const btn = $("account-btn");
  btn.replaceChildren();
  const name = account?.name || "You";
  if (account?.avatarUrl) {
    const img = document.createElement("img");
    img.src = account.avatarUrl;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => { btn.textContent = name.slice(0, 1).toUpperCase(); };
    btn.append(img);
  } else {
    btn.textContent = name.slice(0, 1).toUpperCase();
  }
  $("menu-name").textContent = name;
  $("menu-email").textContent = account?.email || "";
}

async function logout() {
  try { await api("/api/extension/token", { method: "DELETE" }); } catch { /* token may already be gone */ }
  await clearSession();
  await chrome.action.setBadgeText({ text: "" });
  chrome.runtime.sendMessage({ type: "refresh" }).catch(() => {});
  await boot();
}

// ---------- picker ----------

let picker = null;

async function openPicker() {
  show("view-picker");
  const list = $("picker-list");
  list.replaceChildren(Object.assign(document.createElement("li"), { className: "muted", textContent: "Loading…" }));
  try {
    picker = await api("/api/extension/tasks");
    const sel = $("picker-project");
    sel.replaceChildren(new Option("All projects", ""));
    for (const p of picker.projects) sel.append(new Option(p.name, p.id));
    sel.value = state?.project?.id && picker.projects.some((p) => p.id === state.project.id) ? state.project.id : "";
    renderPicker();
  } catch (e) {
    list.replaceChildren(Object.assign(document.createElement("li"), { className: "muted", textContent: e?.message || "Couldn't load tasks." }));
    handleError(e, { quiet: true });
  }
}

function renderPicker() {
  if (!picker) return;
  const projectId = $("picker-project").value;
  const colors = new Map(picker.projects.map((p) => [p.id, p.color]));
  const tasks = picker.tasks.filter((t) => !projectId || t.projectId === projectId);
  const list = $("picker-list");
  list.replaceChildren();
  if (!tasks.length) {
    list.append(Object.assign(document.createElement("li"), { className: "muted", textContent: "No open tasks here." }));
  }
  for (const t of tasks) {
    const b = document.createElement("button");
    if (t.id === state?.task?.id) b.className = "current";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = colors.get(t.projectId) || "var(--muted)";
    const title = document.createElement("span");
    title.className = "truncate";
    title.textContent = t.title;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${t.completedPomodoros}/${t.estimatedPomodoros}`;
    b.append(dot, title, count);
    b.addEventListener("click", () => selectTask(t));
    const li = document.createElement("li");
    li.append(b);
    list.append(li);
  }
  if (state?.task) {
    const none = textButton("Clear current task", () => selectTask(null));
    none.classList.add("wide");
    none.style.marginTop = "6px";
    const li = document.createElement("li");
    li.append(none);
    list.append(li);
  }
}

// ---------- boot ----------

function stopLoops() {
  timers.forEach(clearInterval);
  timers = [];
}

async function boot() {
  stopLoops();
  cfg = await getConfig();
  $("login-host").textContent = new URL(cfg.apiBase).host;

  if (!cfg.token) {
    state = serverState = null;
    show("view-login");
    return;
  }

  show("view-main");
  renderAccount(cfg.account);
  // Paint the last known state instantly; the countdown is time-based, so it is right even if old.
  const { lastState, lastStateAt } = await chrome.storage.local.get(["lastState", "lastStateAt"]);
  await clockOffset();
  if (lastState && !state) {
    serverState = lastState;
    display(lastState);
  }
  void lastStateAt;

  // The countdown ticks locally from the server timestamps — it never waits on polling.
  timers.push(setInterval(renderClock, 250));
  const visible = () => document.visibilityState === "visible";
  timers.push(setInterval(() => { if (visible()) void refreshState(); }, POLL_MS));
  timers.push(setInterval(() => { if (visible()) void refreshMusic(); }, MUSIC_POLL_MS));
  await Promise.all([refreshState({ full: true }), refreshMusic()]);
  if (!cfg.account) {
    try {
      const account = await api("/api/extension/me");
      await chrome.storage.local.set({ account });
      renderAccount(account);
    } catch { /* header keeps the initial */ }
  }
}

function wire() {
  for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = ICONS[el.dataset.icon];

  $("login-btn").addEventListener("click", async () => {
    const { apiBase } = await getConfig();
    chrome.tabs.create({ url: `${apiBase}/extension/connect?ext=${chrome.runtime.id}` });
    window.close();
  });
  $("login-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

  $("account-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("account-menu").hidden = !$("account-menu").hidden;
  });
  document.addEventListener("click", (e) => {
    if (!$("account-menu").contains(e.target)) $("account-menu").hidden = true;
  });
  for (const b of document.querySelectorAll("[data-open]")) b.addEventListener("click", () => openSite(b.dataset.open));
  $("menu-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("menu-logout").addEventListener("click", logout);

  $("task-done").addEventListener("change", toggleDone);
  $("change-task").addEventListener("click", openPicker);
  $("picker-back").addEventListener("click", () => show("view-main"));
  $("picker-project").addEventListener("change", renderPicker);

  for (const b of document.querySelectorAll("[data-music]")) b.addEventListener("click", () => musicCmd(b.dataset.music));

  window.addEventListener("online", () => { void refreshState(); void refreshMusic(); });
  window.addEventListener("offline", () => setOffline("You're offline. Showing the last known state."));

  // Signed in/out from elsewhere (connect page, options page).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ("token" in changes || "apiBase" in changes)) {
      state = serverState = null;
      void boot();
    }
  });
}

wire();
void boot();
