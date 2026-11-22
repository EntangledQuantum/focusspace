// Side panel extras on top of popup.js (which drives the shared timer / task /
// music markup): tabs, projects & tasks, Focus AI chat and Spotify search.
// Everything goes through the token-authed, user-scoped extension API.
import { api, known } from "./lib/api.js";
import { currentState, onState, refreshState, refreshMusic, applyServer } from "./popup.js";
import { initChat } from "./chat.js";

const $ = (id) => document.getElementById(id);

let toastTimer = 0;
function toast(message, kind = "info") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast ${kind === "error" ? "error" : ""}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}

// ---------- signed-in shell + tabs ----------

const syncShell = () => { $("panel-app").hidden = !$("view-login").hidden; };
new MutationObserver(syncShell).observe($("view-login"), { attributes: true, attributeFilter: ["hidden"] });
syncShell();

let activeTab = "timer";
function showTab(name) {
  activeTab = name;
  for (const b of document.querySelectorAll(".tab-btn")) b.classList.toggle("active", b.dataset.tab === name);
  for (const pane of document.querySelectorAll(".tab-pane")) pane.hidden = pane.id !== `tab-${name}`;
  try { localStorage.setItem("fs-panel-tab", name); } catch { /* storage blocked */ }
  if (name === "projects") void loadProjects();
  if (name === "chat") void initChat({ onTimer: () => { void refreshState({ full: true }); if (activeTab === "projects") void loadProjects(); } });
  if (name === "music") $("music-q").focus();
}
for (const b of document.querySelectorAll(".tab-btn")) b.addEventListener("click", () => showTab(b.dataset.tab));
try {
  const saved = localStorage.getItem("fs-panel-tab");
  if (saved && $(`tab-${saved}`)) showTab(saved);
} catch { /* storage blocked */ }

// Follow the user's FocusSpace theme (light / dark / system).
async function applyTheme() {
  try {
    const { account } = await chrome.storage.local.get("account");
    const theme = account?.theme;
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  } catch { /* default: follow the system */ }
}
void applyTheme();
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && "account" in c) void applyTheme(); });

// ---------- projects & tasks ----------

let data = { projects: [], tasks: [] };
const collapsed = new Set();
let loadingProjects = false;

async function loadProjects() {
  if (loadingProjects) return;
  loadingProjects = true;
  try {
    data = await api("/api/extension/tasks");
    renderProjects();
  } catch (e) {
    $("projects-list").replaceChildren(Object.assign(document.createElement("div"), { className: "muted small", textContent: e?.message || "Couldn't load projects." }));
  } finally {
    loadingProjects = false;
  }
}

function el(tag, props = {}, ...children) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c !== null && c !== undefined));
  return n;
}

function renderProjects() {
  const list = $("projects-list");
  list.replaceChildren();
  const current = currentState();
  const groups = [...data.projects, { id: null, name: "No project", color: "var(--muted)" }];
  for (const p of groups) {
    const tasks = data.tasks.filter((t) => (t.projectId ?? null) === p.id);
    if (p.id === null && !tasks.length) continue;
    const card = el("div", { className: "card project" });
    const head = el("button", { className: "project-head", type: "button" },
      el("span", { className: "dot", style: `background:${p.color}` }),
      el("span", { className: "project-name truncate", textContent: p.name }),
      el("span", { className: "muted small", textContent: String(tasks.length) }),
      el("span", { className: "chev", textContent: collapsed.has(p.id) ? "▸" : "▾" }));
    head.addEventListener("click", () => {
      if (collapsed.has(p.id)) collapsed.delete(p.id); else collapsed.add(p.id);
      renderProjects();
    });
    card.append(head);
    if (!collapsed.has(p.id)) {
      const ul = el("ul", { className: "project-tasks" });
      for (const t of tasks) {
        const isCurrent = current?.task?.id === t.id;
        const box = el("input", { type: "checkbox", title: "Mark done" });
        box.addEventListener("change", () => void markDone(t, box));
        const focusBtn = el("button", { className: `link small focus-btn ${isCurrent ? "current" : ""}`, type: "button", textContent: isCurrent ? "Focusing" : "Focus" });
        focusBtn.dataset.taskId = t.id;
        focusBtn.addEventListener("click", () => void focusOn(t));
        ul.append(el("li", { className: "project-task" },
          box,
          el("span", { className: "task-name", textContent: t.title }),
          el("span", { className: "muted small", textContent: `${t.completedPomodoros}/${t.estimatedPomodoros}` }),
          focusBtn));
      }
      if (!tasks.length) ul.append(el("li", { className: "muted small", textContent: "No open tasks." }));
      card.append(ul, addTaskForm(p.id));
    }
    list.append(card);
  }
  if (!list.childNodes.length) list.append(el("div", { className: "muted small", textContent: "No projects yet — add one above." }));
}

function addTaskForm(projectId) {
  const details = el("details", { className: "add-task" });
  const title = el("input", { placeholder: "Task title", maxLength: 200, required: true });
  const est = el("input", { type: "number", min: "0.5", max: "24", step: "0.5", value: "1", title: "Estimated pomodoros" });
  const subs = el("textarea", { rows: 2, placeholder: "Subtasks (optional, one per line)" });
  const save = el("button", { className: "btn primary small", type: "submit", textContent: "Add task" });
  const form = el("form", { className: "add-task-form" }, title, el("label", { className: "muted small est" }, "Pomodoros ", est), subs, save);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    save.disabled = true;
    try {
      const { task } = await api("/api/extension/tasks", {
        method: "POST",
        body: {
          action: "create", title: title.value, projectId,
          estimatedPomodoros: Number(est.value) || 1,
          subtasks: subs.value.split("\n").map((s) => s.trim()).filter(Boolean),
        },
      });
      data.tasks.push(task);
      renderProjects();
      toast(`Added “${task.title}”.`);
    } catch (err) {
      toast(err?.message || "Couldn't add the task.", "error");
      save.disabled = false;
    }
  });
  details.append(el("summary", { className: "link small", textContent: "+ Add task" }), form);
  return details;
}

async function markDone(t, box) {
  box.disabled = true;
  const before = data.tasks;
  data.tasks = data.tasks.filter((x) => x.id !== t.id); // optimistic
  renderProjects();
  try {
    const state = await api("/api/extension/tasks", { method: "POST", body: { action: "toggle_done", taskId: t.id, done: true, known: known(currentState()) } });
    applyServer(state, { taskOnly: true });
    toast(`Done: ${t.title}`);
  } catch (e) {
    data.tasks = before;
    renderProjects();
    toast(e?.message || "Couldn't update the task.", "error");
  }
}

async function focusOn(t) {
  try {
    const state = await api("/api/extension/tasks", { method: "POST", body: { action: "select", taskId: t.id, known: { taskId: t.id, projectId: t.projectId } } });
    applyServer(state);
    renderProjects();
    showTab("timer");
  } catch (e) {
    toast(e?.message || "Couldn't select the task.", "error");
  }
}

$("new-project").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("new-project-name").value.trim();
  if (!name) return;
  try {
    const { project } = await api("/api/extension/projects", { method: "POST", body: { name, color: $("new-project-color").value } });
    data.projects.push(project);
    $("new-project-name").value = "";
    renderProjects();
  } catch (err) {
    toast(err?.message || "Couldn't add the project.", "error");
  }
});

// Polls must never rebuild the list (that would wipe a half-typed "add task"
// form): when the timer's task changes, just relabel the Focus buttons.
let shownTaskId;
onState((st) => {
  const id = st?.task?.id ?? null;
  if (id === shownTaskId) return;
  shownTaskId = id;
  for (const b of document.querySelectorAll(".focus-btn")) {
    const isCurrent = b.dataset.taskId === id;
    b.classList.toggle("current", isCurrent);
    b.textContent = isCurrent ? "Focusing" : "Focus";
  }
});

// ---------- music search ----------

$("music-search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("music-q").value.trim();
  const type = $("music-type").value;
  const list = $("music-results");
  if (!q) return;
  list.replaceChildren(el("li", { className: "muted small", textContent: "Searching…" }));
  try {
    const { results } = await api(`/api/extension/music/search?q=${encodeURIComponent(q)}&type=${type}`);
    list.replaceChildren();
    if (!results.length) list.append(el("li", { className: "muted small", textContent: "Nothing found." }));
    for (const r of results) {
      const img = r.artUrl ? el("img", { className: "art small-art", src: r.artUrl, alt: "" }) : el("div", { className: "art small-art art-empty" });
      const btn = el("button", { className: "result", type: "button" },
        img,
        el("span", { className: "result-meta" },
          el("span", { className: "truncate result-name", textContent: r.name }),
          el("span", { className: "muted small truncate", textContent: r.subtitle })),
        el("span", { className: "play-hint", textContent: "▶" }));
      btn.addEventListener("click", () => void playUri(r, btn));
      list.append(el("li", {}, btn));
    }
  } catch (err) {
    list.replaceChildren(el("li", { className: "muted small", textContent: err?.message || "Search failed." }));
  }
});

async function playUri(r, btn) {
  btn.disabled = true;
  try {
    const res = await api("/api/extension/music/search", { method: "POST", body: { uri: r.uri, label: r.name } });
    toast(res.message || `Playing ${r.name}`);
    setTimeout(() => void refreshMusic(), 900);
    setTimeout(() => void refreshMusic(), 2200);
  } catch (e) {
    toast(e?.message || "Couldn't play that.", "error");
  } finally {
    btn.disabled = false;
  }
}
