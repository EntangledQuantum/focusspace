import { api, clearSession, getConfig, normalizeBase, DEFAULT_API_BASE } from "./lib/api.js";

const $ = (id) => document.getElementById(id);

function status(id, text, kind = "") {
  const el = $(id);
  el.textContent = text;
  el.className = `status small ${kind}`;
}

/** focusspace.live and localhost ship with host access; any other server needs the user's OK. */
async function ensureHostAccess(origin) {
  const pattern = `${origin}/*`;
  if (await chrome.permissions.contains({ origins: [pattern] })) return true;
  return chrome.permissions.request({ origins: [pattern] });
}

async function render() {
  const { apiBase, token, account } = await getConfig();
  $("api-base").value = apiBase;
  $("logout").hidden = !token;
  $("login").hidden = !!token;
  $("account-line").textContent = token
    ? `Signed in${account ? ` as ${account.name}${account.email ? ` (${account.email})` : ""}` : ""} on ${new URL(apiBase).host}.`
    : `Not signed in. Server: ${new URL(apiBase).host}.`;
}

async function saveBase(raw) {
  const origin = normalizeBase(raw);
  if (!origin) return status("server-status", "Enter a full URL like https://focusspace.live", "error");
  if (!(await ensureHostAccess(origin))) return status("server-status", "Permission to reach that server was declined.", "error");
  const { apiBase } = await getConfig();
  if (origin !== apiBase) await clearSession();
  await chrome.storage.local.set({ apiBase: origin });
  status("server-status", `Saved. Using ${origin}.`, "ok");
  await render();
}

$("server-form").addEventListener("submit", (e) => { e.preventDefault(); void saveBase($("api-base").value); });
$("reset-base").addEventListener("click", () => saveBase(DEFAULT_API_BASE));

$("token-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("token").value.trim();
  if (!token) return;
  const { apiBase } = await getConfig();
  if (!(await ensureHostAccess(apiBase))) return status("token-status", "Permission to reach the server was declined.", "error");
  await chrome.storage.local.set({ token });
  try {
    const account = await api("/api/extension/me");
    await chrome.storage.local.set({ account });
    $("token").value = "";
    status("token-status", `Connected as ${account.name}.`, "ok");
    chrome.runtime.sendMessage({ type: "refresh" }).catch(() => {});
  } catch (err) {
    await clearSession();
    status("token-status", err?.message || "That token didn't work.", "error");
  }
  await render();
});

$("login").addEventListener("click", async () => {
  const { apiBase } = await getConfig();
  chrome.tabs.create({ url: `${apiBase}/extension/connect?ext=${chrome.runtime.id}` });
});

$("logout").addEventListener("click", async () => {
  try { await api("/api/extension/token", { method: "DELETE" }); } catch { /* already revoked */ }
  await clearSession();
  await chrome.action.setBadgeText({ text: "" });
  await render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("token" in changes || "account" in changes || "apiBase" in changes)) void render();
});

void render();
