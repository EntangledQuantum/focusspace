import { api, getConfig, clearSession, liveRemaining, paintBadge, MODE_LABEL, isBreak } from "./lib/api.js";

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
const POLL_MS = 5000;

let cfg = null;
let state = null;
let receivedAt = 0;
let music = null;
let busy = false;
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

function iconButton(icon, title, onClick, extra = "") {
  const b = document.createElement("button");
  b.className = `icon-btn ${extra}`;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = ICONS[icon];
  b.disabled = busy;
  b.addEventListener("click", onClick);
  return b;
}

function textButton(label, onClick, primary = false) {
  const b = document.createElement("button");
  b.className = `btn ${primary ? "primary" : ""}`;
  b.textContent = label;
  b.disabled = busy;
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

const tellBackground = () => chrome.runtime.sendMessage({ type: "refresh" }).catch(() => {});

// ---------- data ----------

function applyState(next) {
  state = next;
  receivedAt = Date.now();
  dueRefreshQueued = false;
  chrome.storage.local.set({ lastState: state, lastStateAt: receivedAt });
  void paintBadge(state, receivedAt);
  if (state.justCompleted) toast(isBreak(state.timer.mode) ? "Break's over." : "Session complete — nice focus.");
  render();
}

async function guarded(fn) {
  try {
    return await fn();
  } catch (e) {
    // A 401 already cleared the token; the storage listener below swaps to the login view.
    if (e?.status !== 401) toast(e?.message || String(e), "error");
    return undefined;
  }
}

async function refreshState() {
  await guarded(async () => applyState(await api("/api/extension/state")));
}

async function refreshMusic() {
  await guarded(async () => {
    music = await api("/api/extension/music");
    renderMusic();
  });
}

async function command(path, body) {
  if (busy) return;
  busy = true;
  render();
  await guarded(async () => {
    applyState(await api(path, { method: "POST", body }));
    tellBackground();
  });
  busy = false;
  render();
}

const timerCmd = (action, mode) => command("/api/extension/timer", mode ? { action, mode } : { action });

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
  if (active) secs = liveRemaining(state, receivedAt);
  else if (t.status === "completed") secs = 0;
  else secs = state.next.start.durationSec;
  $("time").textContent = fmtClock(secs);

  const progress = active ? 1 - secs / Math.max(1, t.plannedDurationSec) : t.status === "completed" ? 1 : 0;
  $("ring-bar").style.strokeDashoffset = String(RING * (1 - Math.min(1, Math.max(0, progress))));

  // Countdown hit zero: the site (if open) or the server records it — fetch the result shortly after.
  if (t.status === "running" && secs <= 0 && !dueRefreshQueued) {
    dueRefreshQueued = true;
    setTimeout(refreshState, 3500);
  }
}

function renderTimer() {
  const t = state.timer;
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
      iconButton("stop", "Stop & reset", () => timerCmd("stop")),
      iconButton(running ? "pause" : "play", running ? "Pause" : "Resume", () => timerCmd(running ? "pause" : "resume"), "big"),
      iconButton("skip", isBreak(t.mode) ? "Skip break" : "Skip session", () => timerCmd("skip")),
    );
  } else if (state.next.breakOption) {
    const br = state.next.breakOption;
    c.append(
      textButton(`Start ${MODE_LABEL[br.mode].toLowerCase()} · ${fmtMin(br.durationSec)}`, () => timerCmd("start", br.mode), true),
      textButton("Skip to focus", () => timerCmd("start", "pomodoro")),
    );
  } else {
    const s = state.next.start;
    const what = s.mode === "custom" ? "custom" : "focus";
    c.append(textButton(`Start ${what} · ${fmtMin(s.durationSec)}`, () => timerCmd("start", s.mode), true));
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
  change.disabled = locked || busy;
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
  done.disabled = busy;
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
    box.disabled = busy;
    box.addEventListener("change", () => command("/api/extension/tasks", { action: "toggle_subtask", subtaskId: st.id }));
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
  sub.textContent = track
    ? [track.artists, music.device].filter(Boolean).join(" · ")
    : music.message || (music.device ? `Paused on ${music.device}` : "Press play to resume Spotify");
  toggle.innerHTML = ICONS[music.isPlaying ? "pause" : "play"];
  toggle.title = music.isPlaying ? "Pause" : "Play";
  for (const b of controls.querySelectorAll("button")) b.disabled = busy || (!track && b !== toggle);
}

async function musicCmd(kind) {
  if (!music?.connected) return;
  const action = kind === "toggle" ? (music.isPlaying ? "pause" : "play") : kind;
  if (kind === "toggle") {
    music = { ...music, isPlaying: !music.isPlaying };
    renderMusic();
  }
  const ok = await guarded(async () => {
    music = await api("/api/extension/music", { method: "POST", body: { action } });
    return true;
  });
  if (!ok) await refreshMusic(); // command failed (e.g. no device) → undo the optimistic flip
  renderMusic();
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
  tellBackground();
  await boot();
}

// ---------- picker ----------

let picker = null;

async function openPicker() {
  show("view-picker");
  const list = $("picker-list");
  list.replaceChildren(Object.assign(document.createElement("li"), { className: "muted", textContent: "Loading…" }));
  await guarded(async () => {
    picker = await api("/api/extension/tasks");
    const sel = $("picker-project");
    sel.replaceChildren(new Option("All projects", ""));
    for (const p of picker.projects) sel.append(new Option(p.name, p.id));
    sel.value = state?.project?.id && picker.projects.some((p) => p.id === state.project.id) ? state.project.id : "";
    renderPicker();
  });
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
    b.addEventListener("click", () => selectTask(t.id));
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

async function selectTask(taskId) {
  show("view-main");
  await command("/api/extension/tasks", { action: "select", taskId });
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
    state = null;
    show("view-login");
    return;
  }

  show("view-main");
  renderAccount(cfg.account);
  const { lastState, lastStateAt } = await chrome.storage.local.get(["lastState", "lastStateAt"]);
  if (lastState && Date.now() - lastStateAt < 120_000) {
    state = lastState;
    receivedAt = lastStateAt;
    render();
  }

  await Promise.all([refreshState(), refreshMusic()]);
  if (!cfg.account) {
    try {
      const account = await api("/api/extension/me");
      await chrome.storage.local.set({ account });
      renderAccount(account);
    } catch { /* header keeps the initial */ }
  }
  timers.push(setInterval(() => { void refreshState(); void refreshMusic(); }, POLL_MS));
  timers.push(setInterval(renderClock, 500));
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

  $("task-done").addEventListener("change", () => {
    if (state?.task) void command("/api/extension/tasks", { action: "toggle_done", taskId: state.task.id });
  });
  $("change-task").addEventListener("click", openPicker);
  $("picker-back").addEventListener("click", () => show("view-main"));
  $("picker-project").addEventListener("change", renderPicker);

  for (const b of document.querySelectorAll("[data-music]")) b.addEventListener("click", () => musicCmd(b.dataset.music));

  // Signed in/out from elsewhere (connect page, options page).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ("token" in changes || "apiBase" in changes)) void boot();
  });
}

wire();
void boot();
