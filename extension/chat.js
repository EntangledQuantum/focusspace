// Focus AI in the side panel — the same assistant, persistence and rules as
// the website: POST /api/ai/chat (bearer token; the server scopes everything to
// the token's user, saves the conversation itself and tracks run_state), the
// AI SDK UI-message stream rendered without a framework.
import { api, getConfig, ApiError } from "./lib/api.js";
import { renderMarkdown, escapeHtml } from "./lib/markdown.js";

const $ = (id) => document.getElementById(id);

const TOOL_VERBS = {
  list_projects: "Read projects", list_tasks: "Read tasks", search_tasks: "Search tasks", get_task: "Read task",
  recent_completed_tasks: "Read recent", focus_stats: "Read focus stats", create_project: "Create project",
  rename_project: "Rename project", recolor_project: "Recolor project", delete_project: "Delete project",
  create_task: "Create task", update_task: "Update task", set_task_status: "Set status", reorder_tasks: "Reorder tasks",
  delete_task: "Delete task", add_subtasks: "Add subtasks", update_subtask: "Update subtask", delete_subtask: "Delete subtask",
  create_tag: "Create tag", delete_tag: "Delete tag", get_workspace_state: "Read workspace", reset_task_progress: "Reset task",
  get_settings: "Read settings", update_settings: "Update settings", start_timer: "Start timer", pause_timer: "Pause timer",
  resume_timer: "Resume timer", skip_timer: "Skip session", reset_timer: "Stop timer", set_active_task: "Select task",
  confirm_action: "Confirm delete", now_playing: "Now playing", search_music: "Search music", play_music: "Play music",
  pause_music: "Pause music", resume_music: "Resume music", next_track: "Next track", previous_track: "Previous track",
};
const verbFor = (name) => TOOL_VERBS[name] ?? name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const uuid = () => crypto.randomUUID();
let chatId = uuid();
let messages = []; // UIMessage[] — { id, role, parts }
let running = false;
let abortCtrl = null;
let onTimerTool = () => {};
let ready = false;

/** Same rule as the website's pendingActivity: show "Thinking…" only in silent gaps. */
export function pendingActivity(msgs, status) {
  if (status === "submitted") return "Thinking…";
  if (status !== "streaming") return null;
  const last = msgs.at(-1);
  if (!last || last.role !== "assistant") return "Thinking…";
  const tail = last.parts.filter((p) => p.type !== "step-start").at(-1);
  if (!tail) return "Thinking…";
  if ((tail.type === "text" || tail.type === "reasoning") && tail.state === "streaming") return null;
  if (tail.type.startsWith("tool-") && (tail.state === "input-streaming" || tail.state === "input-available")) return null;
  return "Thinking…";
}

/**
 * Fold one UI-message-stream chunk into the assistant message's parts
 * (exported for tests). Unknown chunk types are ignored.
 */
export function applyChunk(msg, chunk) {
  const parts = msg.parts;
  const byId = (type, id) => parts.find((p) => p.type === type && p._id === id);
  const tool = (id) => parts.find((p) => p.toolCallId === id);
  switch (chunk.type) {
    case "start": if (chunk.messageId) msg.id = chunk.messageId; break;
    case "start-step": parts.push({ type: "step-start" }); break;
    case "text-start": parts.push({ type: "text", text: "", state: "streaming", _id: chunk.id }); break;
    case "text-delta": { const p = byId("text", chunk.id); if (p) p.text += chunk.delta ?? ""; break; }
    case "text-end": { const p = byId("text", chunk.id); if (p) p.state = "done"; break; }
    case "reasoning-start": parts.push({ type: "reasoning", text: "", state: "streaming", _id: chunk.id }); break;
    case "reasoning-delta": { const p = byId("reasoning", chunk.id); if (p) p.text += chunk.delta ?? ""; break; }
    case "reasoning-end": { const p = byId("reasoning", chunk.id); if (p) p.state = "done"; break; }
    case "tool-input-start":
      parts.push({ type: `tool-${chunk.toolName}`, toolCallId: chunk.toolCallId, state: "input-streaming" });
      break;
    case "tool-input-available": {
      const p = tool(chunk.toolCallId);
      if (p) Object.assign(p, { state: "input-available", input: chunk.input });
      else parts.push({ type: `tool-${chunk.toolName}`, toolCallId: chunk.toolCallId, state: "input-available", input: chunk.input });
      break;
    }
    case "tool-output-available": { const p = tool(chunk.toolCallId); if (p) Object.assign(p, { state: "output-available", output: chunk.output }); break; }
    case "tool-output-error":
    case "tool-input-error": { const p = tool(chunk.toolCallId); if (p) Object.assign(p, { state: "output-error", errorText: chunk.errorText }); break; }
    default: break;
  }
  return msg;
}

/** Parse an SSE body ("data: {json}\n\n" … "data: [DONE]") into chunks. */
async function* sse(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const event = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try { yield JSON.parse(data); } catch { /* keep-alive / partial */ }
      }
    }
  }
}

// ---------- rendering ----------

function toolCard(p) {
  const name = p.type.slice(5);
  const el = document.createElement("details");
  el.className = `tool ${p.state === "output-error" ? "err" : p.state === "output-available" ? "ok" : "busy"}`;
  const sum = document.createElement("summary");
  const icon = p.state === "output-available" ? "✓" : p.state === "output-error" ? "!" : "";
  sum.innerHTML = `<span class="tool-state">${icon}</span>`;
  sum.append(document.createTextNode(verbFor(name)));
  el.append(sum);
  if (p.output?.__confirm) {
    el.open = true;
    el.className = "tool confirm";
    const msg = document.createElement("div");
    msg.textContent = p.output.summary || "Confirm this action?";
    const btn = document.createElement("button");
    btn.className = "btn small danger-btn";
    btn.textContent = "Confirm";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await api("/api/ai/confirm", { method: "POST", body: { action: p.output.action, id: p.output.id } });
        btn.textContent = "Done";
        onTimerTool();
      } catch (e) {
        btn.disabled = false;
        msg.textContent = e?.message || "Couldn't confirm.";
      }
    });
    el.append(msg, btn);
    return el;
  }
  const body = document.createElement("pre");
  const out = p.state === "output-error" ? p.errorText : p.output;
  body.textContent = out === undefined ? "…" : typeof out === "string" ? out : JSON.stringify(out, null, 2);
  el.append(body);
  return el;
}

function renderMessages(status) {
  const list = $("chat-log");
  if (!list) return;
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "chat-empty muted";
    empty.textContent = "Ask about your tasks, plan your day, or say “start a 25-minute focus on the report”.";
    list.append(empty);
  }
  for (const m of messages) {
    const row = document.createElement("div");
    row.className = `msg ${m.role}`;
    for (const p of m.parts) {
      if (p.type === "text" && p.text) {
        const div = document.createElement("div");
        div.className = "md";
        if (m.role === "user") div.textContent = p.text;
        else div.innerHTML = renderMarkdown(p.text); // escaped-first renderer: no raw HTML from the model
        row.append(div);
      } else if (p.type === "reasoning" && p.text) {
        const d = document.createElement("details");
        d.className = "reasoning";
        if (p.state === "streaming") d.open = true;
        const s = document.createElement("summary");
        s.textContent = p.state === "streaming" ? "Reasoning…" : "Reasoning";
        const t = document.createElement("div");
        t.className = "reasoning-text";
        t.textContent = p.text;
        d.append(s, t);
        row.append(d);
      } else if (p.type.startsWith("tool-")) {
        row.append(toolCard(p));
      }
    }
    if (row.childNodes.length) list.append(row);
  }
  const activity = pendingActivity(messages, status);
  if (activity) {
    const w = document.createElement("div");
    w.className = "msg assistant working";
    w.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    w.append(document.createTextNode(activity));
    list.append(w);
  }
  if (atBottom || running) list.scrollTop = list.scrollHeight;
}

function setRunning(on) {
  running = on;
  $("chat-send").hidden = on;
  $("chat-stop").hidden = !on;
}

function showError(text) {
  const el = $("chat-error");
  el.hidden = !text;
  el.textContent = text || "";
}

// ---------- server calls ----------

async function authedFetch(path, init = {}) {
  const { apiBase, token } = await getConfig();
  return fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
  });
}

async function send(text) {
  if (running || !text.trim()) return;
  showError(null);
  messages.push({ id: uuid(), role: "user", parts: [{ type: "text", text: text.trim() }] });
  const assistant = { id: uuid(), role: "assistant", parts: [] };
  setRunning(true);
  renderMessages("submitted");
  abortCtrl = new AbortController();
  let touchedTimer = false;
  try {
    const res = await authedFetch("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages: strip(messages), chatId, page: "extension-side-panel" }),
      signal: abortCtrl.signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(data.error || `Focus AI failed (${res.status}).`, res.status);
    }
    messages.push(assistant);
    for await (const chunk of sse(res.body)) {
      if (chunk.type === "error") { showError(chunk.errorText || "Something went wrong."); continue; }
      applyChunk(assistant, chunk);
      if (chunk.type === "tool-output-available") touchedTimer = true;
      renderMessages("streaming");
    }
  } catch (e) {
    if (e?.name !== "AbortError") showError(e?.message || "Couldn't reach Focus AI.");
  } finally {
    setRunning(false);
    abortCtrl = null;
    renderMessages("ready");
    if (touchedTimer) onTimerTool();
    // The server saved the turn; load its copy (authoritative ids/parts) once it's done.
    void reloadWhenDone(chatId);
    void loadHistory();
  }
}

/** Parts the server needs (drop UI-only fields). */
function strip(msgs) {
  return msgs.map((m) => ({
    id: m.id, role: m.role,
    parts: m.parts.filter((p) => p.type !== "step-start").map(({ _id, ...p }) => { void _id; return p; }),
  }));
}

async function stop() {
  if (!running) return;
  const id = chatId;
  abortCtrl?.abort();
  try { await authedFetch(`/api/ai/conversations/${id}/cancel`, { method: "POST" }); } catch { /* best effort */ }
  // Keep what was shown (same as the website's Stop).
  try {
    await authedFetch(`/api/ai/conversations/${id}`, { method: "PUT", body: JSON.stringify({ messages: strip(messages) }) });
  } catch { /* best effort */ }
}

async function reloadWhenDone(id, tries = 0) {
  try {
    const data = await api(`/api/ai/conversations/${id}`);
    if (id !== chatId) return;
    if (data.conversation?.runState === "running" && tries < 60) {
      setTimeout(() => reloadWhenDone(id, tries + 1), 2000);
      return;
    }
    if (Array.isArray(data.messages) && data.messages.length && !running) {
      messages = data.messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts ?? [] }));
      if (data.conversation?.runState === "error" && data.conversation.runError) showError(data.conversation.runError);
      renderMessages("ready");
    }
  } catch { /* not saved yet / offline: keep what is shown */ }
}

async function loadHistory() {
  const sel = $("chat-history");
  try {
    const data = await api("/api/ai/conversations");
    sel.replaceChildren(new Option("History…", ""));
    for (const c of data.conversations ?? []) sel.append(new Option(c.title || "Untitled chat", c.id));
  } catch { /* keep the old list */ }
}

async function openConversation(id) {
  if (!id || running) return;
  chatId = id;
  messages = [];
  showError(null);
  renderMessages("submitted");
  await reloadWhenDone(id);
  if (!messages.length) renderMessages("ready");
}

function newChat() {
  if (running) return;
  chatId = uuid();
  messages = [];
  showError(null);
  $("chat-history").value = "";
  renderMessages("ready");
}

async function loadModels() {
  const sel = $("chat-model");
  try {
    const data = await api("/api/ai/models");
    const list = (data.models ?? []).map((m) => (typeof m === "string" ? { id: m } : m));
    sel.replaceChildren(...list.map((m) => new Option(m.label || m.name || m.id, m.id)));
    if (data.selected) sel.value = data.selected;
    sel.hidden = list.length < 2;
  } catch {
    sel.hidden = true;
  }
}

/** Mount once the AI tab is first shown. `onTimer` is called when a tool may have changed the timer/tasks. */
export async function initChat({ onTimer }) {
  onTimerTool = onTimer || onTimerTool;
  if (ready) return;
  ready = true;
  const gate = $("chat-gate");
  try {
    const status = await api("/api/ai/status");
    if (!status.globallyEnabled || !status.enabled) {
      gate.hidden = false;
      gate.textContent = status.globallyEnabled
        ? "Turn on Focus AI in FocusSpace → Settings → AI to chat here."
        : "Focus AI isn't enabled on this server.";
      $("chat-ui").hidden = true;
      ready = false; // re-check next time the tab opens
      return;
    }
  } catch (e) {
    gate.hidden = false;
    gate.textContent = e?.message || "Couldn't reach Focus AI.";
    $("chat-ui").hidden = true;
    ready = false;
    return;
  }
  gate.hidden = true;
  $("chat-ui").hidden = false;

  const input = $("chat-input");
  const submit = () => { const t = input.value; input.value = ""; autoGrow(); void send(t); };
  const autoGrow = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  $("chat-send").addEventListener("click", submit);
  $("chat-stop").addEventListener("click", () => void stop());
  $("chat-new").addEventListener("click", newChat);
  $("chat-history").addEventListener("change", (e) => void openConversation(e.target.value));
  $("chat-model").addEventListener("change", async (e) => {
    try { await api("/api/ai/models", { method: "PUT", body: { model: e.target.value } }); }
    catch (err) { showError(err?.message || "Couldn't switch model."); void loadModels(); }
  });
  renderMessages("ready");
  void loadHistory();
  void loadModels();
}

export { escapeHtml };
