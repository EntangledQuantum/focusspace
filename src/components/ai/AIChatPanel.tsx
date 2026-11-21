"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus, ArrowUp, Loader2, History, MessageSquare, Trash2, ArrowLeft, Square, AlertTriangle, RotateCcw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { ChatMessage } from "./ChatMessage";
import { ModelPicker } from "./ModelPicker";
import { useAIModels } from "./useAIModels";
import { useAIPanel } from "@/lib/stores/ai";
import { pullTimerState } from "@/lib/hooks/useTimerSync";
import { TIMER_TOOLS } from "@/lib/ai/toolMeta";
import { deriveTitle } from "@/lib/ai/chat-store";
import { isNetworkError, pendingActivity } from "./chatActivity";

interface ConversationMeta { id: string; title: string; updated_at: string }

// ~8 lines at 13.5px / 1.5 line-height + the textarea's vertical padding.
const INPUT_MAX_HEIGHT = 170;
// Re-opening the panel within this window continues the chat in memory;
// after it (or on a fresh page load) the panel opens on a new, empty chat.
const RESUME_WINDOW_MS = 10 * 60_000;

// Query keys whose data a tool can change — refreshed when a tool finishes.
const BOARD_KEYS = ["projects", "projects-with-tasks", "tags", "tasks", "subtasks", "subtasks-by-task", "settings", "analytics", "sessions"];

const SUGGESTIONS: Record<string, string[]> = {
  "/focus": ["Start a focus session on my top task", "Pause the timer", "What's left on my current task?", "Play some lo-fi on Spotify"],
  "/projects": ["Add a task to read 30 pages tonight", "Create a project 'Launch' with 3 tasks", "Break my top task into 3 subtasks", "Move my urgent tasks to the top"],
  "/analytics": ["How much did I focus this week?", "Compare this week with last week", "Which project gets most of my time?", "What's my current streak?"],
};
const DEFAULT_SUGGESTIONS = ["Add a task to read 30 pages tonight", "What did I finish this week?", "Start a 25-minute focus session", "How much did I focus today?"];

/** Record "the user just used the chat" (kept outside render for the React compiler). */
function touch(ref: { current: number }) { ref.current = Date.now(); }
/** Event-handler clock (kept outside the component so render stays pure). */
const clock = () => Date.now();

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`);

function toUIMessages(rows: { id: string; role: string; parts: unknown }[]): UIMessage[] {
  return rows.map((m) => ({ id: m.id, role: m.role, parts: m.parts })) as UIMessage[];
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AIChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const pathname = usePathname();
  const projectId = useAIPanel((s) => s.projectId);
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState<string>(newId);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [loadingChat, setLoadingChat] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastActivity = useRef(0);

  const models = useAIModels(open);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ai/chat" }), []);
  // Set when the connection drops mid-reply: the server keeps generating and
  // saves the result, so we poll for it instead of showing a dead end.
  const [recoverFor, setRecoverFor] = useState<string | null>(null);
  const recovering = recoverFor !== null;
  const recoverRef = useRef<() => void>(() => {});
  const { messages, sendMessage, status, setMessages, stop, error, regenerate, clearError } = useChat({
    transport,
    onError: (e) => {
      if (isNetworkError(e)) recoverRef.current();
      else toast.error(e?.message || "AI request failed");
    },
  });
  const busy = status === "streaming" || status === "submitted";

  const history = useQuery<ConversationMeta[]>({
    queryKey: ["ai-conversations"],
    queryFn: async () => {
      const res = await fetch("/api/ai/conversations");
      if (!res.ok) throw new Error("Couldn't load chats");
      return (await res.json()).conversations ?? [];
    },
    enabled: view === "history",
    staleTime: 30_000,
  });

  function resetChat() {
    // New chat ≠ Stop: an in-flight reply still finishes and lands in history.
    if (busy) stop();
    setRecoverFor(null);
    clearError();
    setMessages([]);
    setChatId(newId());
    setView("chat");
    setInput("");
    seenTools.current.clear();
  }

  // Fresh chat on open (unless re-opened shortly after using it); focus input.
  useEffect(() => {
    if (!open) return;
    if (!busy && messages.length && Date.now() - lastActivity.current > RESUME_WINDOW_MS) resetChat();
    const t = setTimeout(() => taRef.current?.focus(), 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy || loadingChat || recovering) return;
    touch(lastActivity);
    setNow(clock()); // fresh baseline for the "taking a while" hint
    sendMessage({ text: t }, { body: { focusProjectId: projectId, page: pathname, chatId } });
    setInput("");
  }

  // Auto-grow the input up to ~8 lines, then let it scroll internally.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)}px`;
  }, [input]);

  // Keep the newest message in view.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && view === "chat") el.scrollTop = el.scrollHeight;
  }, [messages, view, status]);

  // When a tool finishes: refresh the board, and re-sync the live timer after
  // timer tools so the clock follows on whatever tab is open.
  const seenTools = useRef(new Set<string>());
  useEffect(() => {
    let changed = false;
    let timer = false;
    for (const m of messages) {
      for (const p of m.parts as { type: string; state?: string; toolCallId?: string; toolName?: string }[]) {
        if (!(p.type === "dynamic-tool" || p.type.startsWith("tool-")) || p.state !== "output-available" || !p.toolCallId) continue;
        if (seenTools.current.has(p.toolCallId)) continue;
        seenTools.current.add(p.toolCallId);
        changed = true;
        const name = p.type === "dynamic-tool" ? p.toolName ?? "" : p.type.slice(5);
        if (TIMER_TOOLS.has(name)) timer = true;
      }
    }
    if (changed) for (const k of BOARD_KEYS) qc.invalidateQueries({ queryKey: [k] });
    if (timer) void pullTimerState(qc);
  }, [messages, qc]);

  // The server saves every turn itself (even if we disconnect); just refresh
  // the history list when a reply finishes.
  const prevStatus = useRef(status);
  const messagesRef = useRef<UIMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; });
  useEffect(() => {
    if (prevStatus.current === "streaming" && status === "ready") {
      touch(lastActivity);
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    }
    prevStatus.current = status;
  }, [status, qc]);

  /** Stop = really stop: tell the server first (it would otherwise finish the
   *  reply in the background), then keep exactly what the user saw. */
  function stopReply() {
    const id = chatId;
    void fetch(`/api/ai/conversations/${id}/cancel`, { method: "POST" }).catch(() => {});
    stop();
    setTimeout(() => {
      const msgs = messagesRef.current;
      if (!msgs.length) return;
      void fetch(`/api/ai/conversations/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs, title: deriveTitle(msgs) }),
      }).then(() => qc.invalidateQueries({ queryKey: ["ai-conversations"] })).catch(() => {});
    }, 150);
  }

  // Poll the saved conversation until the server's run settles, then show it.
  useEffect(() => { recoverRef.current = () => setRecoverFor(chatId); });
  useEffect(() => {
    if (!recoverFor) return;
    const id = recoverFor;
    let cancelled = false;
    let wake: () => void = () => {};
    const onOnline = () => wake();
    window.addEventListener("online", onOnline);
    (async () => {
      const deadline = Date.now() + 6 * 60_000;
      while (!cancelled && Date.now() < deadline) {
        await new Promise<void>((r) => { wake = r; setTimeout(r, navigator.onLine ? 2500 : 5000); });
        if (cancelled) return;
        try {
          const res = await fetch(`/api/ai/conversations/${id}`, { cache: "no-store" });
          if (!res.ok) continue; // 404 = user turn not saved yet; 5xx = try again
          const data = await res.json();
          const state: string | null = data.conversation?.runState ?? null;
          const rows: { role: string }[] = data.messages ?? [];
          const settled = state ? state !== "running" : rows.at(-1)?.role === "assistant";
          if (!settled || cancelled) continue;
          clearError();
          setMessages(toUIMessages(data.messages ?? []));
          if (state === "error") toast.error(data.conversation?.runError || "The reply failed on the server.");
          qc.invalidateQueries({ queryKey: ["ai-conversations"] });
          break;
        } catch { /* still offline — keep waiting */ }
      }
      if (!cancelled) setRecoverFor(null);
    })();
    return () => { cancelled = true; wake(); window.removeEventListener("online", onOnline); };
  }, [recoverFor, clearError, setMessages, qc]);

  // Tick while busy so the "taking a while" hint can appear without new chunks.
  const [now, setNow] = useState(clock);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  // Remember when the message list last changed (update-during-render pattern).
  const [lastSeen, setLastSeen] = useState({ messages, at: now });
  if (lastSeen.messages !== messages) setLastSeen({ messages, at: now });
  const activity = pendingActivity(messages, status);
  const quietFor = busy ? Math.max(0, now - lastSeen.at) : 0;

  async function loadConversation(id: string) {
    if (id === chatId && messages.length) { setView("chat"); return; }
    if (busy) stop();
    setRecoverFor(null);
    clearError();
    setView("chat");
    setLoadingChat(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const loaded = toUIMessages(data.messages ?? []);
      // Old tool results shouldn't trigger board refreshes.
      seenTools.current.clear();
      for (const msg of loaded) {
        for (const p of msg.parts as { toolCallId?: string }[]) if (p.toolCallId) seenTools.current.add(p.toolCallId);
      }
      setChatId(id);
      setMessages(loaded);
      touch(lastActivity);
      if (data.conversation?.runState === "running") setRecoverFor(id);
    } catch {
      toast.error("Couldn't open that chat");
      setChatId(newId());
    } finally {
      setLoadingChat(null);
    }
  }

  async function deleteConversation(id: string) {
    setPendingDelete(null);
    qc.setQueryData<ConversationMeta[]>(["ai-conversations"], (l) => l?.filter((c) => c.id !== id));
    const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) toast.error("Couldn't delete that chat");
    qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    if (id === chatId) resetChat();
  }

  async function handleConfirm(action: string, id: string) {
    const res = await fetch("/api/ai/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.ok) {
      toast.error(data?.error || "Action failed");
      throw new Error("confirm failed");
    }
    for (const k of BOARD_KEYS) qc.invalidateQueries({ queryKey: [k] });
    toast.success(data.result || "Done");
  }

  const suggestions = SUGGESTIONS[pathname] ?? DEFAULT_SUGGESTIONS;
  const m = models.data;

  return (
    <div
      role="dialog"
      aria-label="Focus AI"
      aria-hidden={!open}
      className="glass fixed top-0 right-0 h-dvh flex flex-col z-[70] overflow-hidden"
      style={{
        width: "min(440px, 100vw)",
        transform: open ? "translateX(0)" : "translateX(105%)",
        visibility: open ? "visible" : "hidden",
        transition: open ? "transform .35s var(--ease)" : "transform .35s var(--ease), visibility 0s .35s",
        borderRadius: "24px 0 0 24px",
        boxShadow: "-24px 0 60px -24px rgba(0,0,0,0.6)",
      }}
    >
      {messages.length > 0 && view === "chat" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/focus-ai.png" alt="" style={{ width: 230, height: 230, opacity: 0.28, objectFit: "contain" }} />
        </div>
      )}

      {/* Header */}
      <div className="relative flex items-center" style={{ gap: 10, padding: "12px 14px 12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", zIndex: 3 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/focus-ai.png" alt="" className="shrink-0" style={{ width: 30, height: 30, objectFit: "contain" }} />
        <div className="flex-1 min-w-0">
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 800, color: "var(--color-on-surface)", lineHeight: 1.2 }}>Focus AI</p>
          <div style={{ marginTop: 3 }}>
            <ModelPicker
              compact
              models={m?.models ?? []}
              value={m?.selected ?? null}
              loading={models.isLoading || models.isFetching || models.select.isPending}
              error={models.error ? "Couldn't load models." : m?.error ?? null}
              allowCustom={m?.source === "own"}
              onRefresh={() => models.refetch()}
              onChange={(id) => models.select.mutate(id)}
              disabled={busy}
            />
          </div>
        </div>
        <button
          onClick={() => setView((v) => (v === "history" ? "chat" : "history"))}
          className="icon-btn" title="Previous chats" aria-pressed={view === "history"}
          style={{ width: 32, height: 32, color: view === "history" ? "var(--color-primary)" : undefined }}
        >
          <History size={15} />
        </button>
        <button onClick={resetChat} className="icon-btn" style={{ width: 32, height: 32 }} title="New chat"><Plus size={16} /></button>
        <button onClick={onClose} className="icon-btn" style={{ width: 32, height: 32 }} title="Close (Esc)"><X size={16} /></button>
      </div>

      {view === "history" ? (
        <div className="no-scrollbar relative flex-1 overflow-y-auto flex flex-col" style={{ padding: "12px 10px", zIndex: 1 }}>
          <div className="flex items-center" style={{ gap: 8, padding: "0 6px 10px" }}>
            <button onClick={() => setView("chat")} className="icon-btn" style={{ width: 28, height: 28 }} title="Back to chat"><ArrowLeft size={14} /></button>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-on-surface)" }}>Previous chats</p>
            {history.isFetching && !history.isLoading && <Loader2 size={12} className="animate-spin" style={{ color: "var(--color-on-surface-variant)" }} />}
          </div>
          {history.isLoading ? (
            <div className="flex flex-col" style={{ gap: 6 }} aria-busy="true" aria-label="Loading chats">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: 46, borderRadius: 12, background: "rgba(255,255,255,0.06)", opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : history.isError ? (
            <div className="flex flex-col items-center" style={{ gap: 8, padding: 24, color: "var(--color-on-surface-variant)", fontSize: 12.5 }}>
              Couldn&apos;t load your chats.
              <button onClick={() => history.refetch()} className="pill btn-hover-surface" style={{ padding: "5px 12px", fontSize: 12, background: "rgba(255,255,255,0.06)" }}>Retry</button>
            </div>
          ) : !history.data?.length ? (
            <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", padding: "20px 8px", textAlign: "center" }}>
              No previous chats yet. They&apos;ll show up here after your first message.
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 2 }}>
              {history.data.map((c) => {
                const active = c.id === chatId && messages.length > 0;
                const confirming = pendingDelete === c.id;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => loadConversation(c.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") loadConversation(c.id); }}
                    className="group flex items-center btn-hover-surface"
                    style={{
                      gap: 10, padding: "9px 10px", borderRadius: 12, cursor: "pointer",
                      background: active ? "color-mix(in srgb, var(--color-primary) 14%, transparent)" : "transparent",
                    }}
                  >
                    <MessageSquare size={14} style={{ color: active ? "var(--color-primary)" : "var(--color-on-surface-variant)", flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: 13, color: "var(--color-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || "Untitled chat"}</p>
                      <p style={{ fontSize: 11, color: "var(--color-on-surface-variant)", opacity: 0.8 }}>{relTime(c.updated_at)}</p>
                    </div>
                    {confirming ? (
                      <div className="flex items-center" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => deleteConversation(c.id)} className="pill" style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#fff", background: "var(--color-error)" }}>Delete</button>
                        <button onClick={() => setPendingDelete(null)} className="pill" style={{ padding: "4px 8px", fontSize: 11, color: "var(--color-on-surface-variant)", background: "rgba(255,255,255,0.06)" }}>Keep</button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingDelete(c.id); }}
                        className="icon-btn opacity-60 group-hover:opacity-100"
                        style={{ width: 26, height: 26, flexShrink: 0, color: "var(--color-error)" }}
                        title="Delete chat"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="no-scrollbar relative flex-1 overflow-y-auto flex flex-col" style={{ gap: 12, padding: 16, zIndex: 1 }}>
          {loadingChat ? (
            <div className="flex flex-col" style={{ gap: 12 }} aria-busy="true">
              <div className="flex items-center" style={{ gap: 8, color: "var(--color-on-surface-variant)", fontSize: 13 }}>
                <Loader2 size={14} className="animate-spin" /> Loading conversation…
              </div>
              {[70, 85, 55, 78].map((w, i) => (
                <div key={i} className="animate-pulse" style={{
                  alignSelf: i % 2 ? "stretch" : "flex-end", width: `${w}%`, height: i % 2 ? 54 : 34,
                  borderRadius: 14, background: "rgba(255,255,255,0.07)",
                }} />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center text-center" style={{ gap: 10, marginTop: "auto", marginBottom: "auto", padding: "8px 4px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/focus-ai.png" alt="" style={{ width: 112, height: 112, objectFit: "contain" }} />
              <p style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 800, color: "var(--color-on-surface)", letterSpacing: "-.01em" }}>
                What should we do?
              </p>
              <p style={{ fontSize: 13.5, color: "var(--color-on-surface-variant)", lineHeight: 1.5, maxWidth: 330, marginBottom: 4 }}>
                I can manage tasks and projects, run the timer, read your stats and control Spotify.
              </p>
              <div className="w-full flex flex-col" style={{ gap: 8 }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left btn-hover-surface"
                    style={{ padding: "10px 13px", borderRadius: 12, fontSize: 13.5, color: "var(--color-on-surface)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => <ChatMessage key={msg.id} message={msg} onConfirm={handleConfirm} />)
          )}
          {busy && activity && (
            <div className="flex items-center" role="status" aria-live="polite" style={{ gap: 8, color: "var(--color-on-surface-variant)", fontSize: 13.5 }}>
              <span className="ai-dots" aria-hidden><i /><i /><i /></span>
              {activity}
              {quietFor > 20_000 && <span style={{ opacity: 0.7 }}>— the model is taking a while</span>}
            </div>
          )}
          {recovering && (
            <div className="flex items-start" role="status" style={{ gap: 8, padding: "9px 11px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.45, color: "var(--color-on-surface)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <WifiOff size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--color-on-surface-variant)" }} />
              <span className="flex-1">Connection lost — the reply is still being written on the server and will appear here.</span>
              <Loader2 size={13} className="animate-spin shrink-0" style={{ marginTop: 2 }} />
            </div>
          )}
          {error && !busy && !recovering && (
            <div className="flex items-start" style={{ gap: 8, padding: "9px 11px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.45, color: "var(--color-on-surface)", background: "color-mix(in srgb, var(--color-error) 22%, transparent)", border: "1px solid color-mix(in srgb, var(--color-error) 40%, transparent)" }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--color-error)" }} />
              <span className="flex-1">{error.message || "Something went wrong."}</span>
              <button onClick={() => { clearError(); setNow(clock()); regenerate({ body: { focusProjectId: projectId, page: pathname, chatId } }); }} className="pill btn-hover-surface" style={{ padding: "3px 9px", fontSize: 11.5, background: "rgba(255,255,255,0.08)" }}>
                <RotateCcw size={11} /> Retry
              </button>
            </div>
          )}
        </div>
      )}

      <div className="relative" style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.06)", zIndex: 1 }}>
        <div className="flex items-center" style={{ gap: 8, padding: "6px 8px", borderRadius: 22, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (view === "history") setView("chat"); send(input); } }}
            rows={1}
            placeholder="Ask Focus AI…"
            aria-label="Message Focus AI"
            className="flex-1 bg-transparent outline-none resize-none block"
            style={{ fontSize: 14.5, lineHeight: 1.45, color: "var(--color-on-surface)", maxHeight: INPUT_MAX_HEIGHT, padding: "5px 6px", overflowY: "auto" }}
          />
          <button
            onClick={() => { if (busy) stopReply(); else { if (view === "history") setView("chat"); send(input); } }}
            disabled={!busy && (!input.trim() || !!loadingChat)}
            title={busy ? "Stop" : "Send"}
            className="grad-primary flex items-center justify-center shrink-0 disabled:opacity-40"
            style={{ width: 32, height: 32, borderRadius: 10, color: "var(--color-on-primary)" }}
          >
            {busy ? <Square size={12} fill="currentColor" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

