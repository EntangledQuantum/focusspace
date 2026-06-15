"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus, ArrowUp, Loader2, History, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ChatMessage } from "./ChatMessage";

interface ConversationMeta { id: string; title: string; updated_at: string }

// ~8 lines at 13.5px / 1.5 line-height + the textarea's vertical padding.
const INPUT_MAX_HEIGHT = 170;

const SUGGESTIONS = [
  "Add a task to read 30 pages tonight",
  "Create a project 'Launch' with 3 tasks",
  "What did I finish this week?",
  "Break my top task into 3 subtasks",
];

export function AIChatPanel({
  open,
  onClose,
  focusProjectId,
}: {
  open: boolean;
  onClose: () => void;
  focusProjectId: string | null;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ai/chat" }), []);
  const { messages, sendMessage, status, setMessages, stop } = useChat({
    transport,
    onError: (e) => toast.error(e?.message || "AI request failed"),
  });

  function send(text: string) {
    const t = text.trim();
    if (!t || status === "streaming") return;
    sendMessage({ text: t }, { body: { focusProjectId } });
  }

  // keep a live snapshot of messages for persistence (ref written in commit)
  const messagesRef = useRef<UIMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; });

  // Auto-grow the input up to ~8 lines, then let it scroll internally.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)}px`;
  }, [input]);

  function invalidateBoard() {
    for (const k of ["projects", "projects-with-tasks", "tags", "tasks", "subtasks-by-task"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }

  // Live board refresh whenever a new tool output lands.
  const toolOutputs = useMemo(() => {
    let n = 0;
    for (const m of messages) {
      for (const p of m.parts as { type: string; state?: string }[]) {
        if ((p.type === "dynamic-tool" || p.type.startsWith("tool-")) && p.state === "output-available") n++;
      }
    }
    return n;
  }, [messages]);
  const prevToolOutputs = useRef(0);
  useEffect(() => {
    if (toolOutputs > prevToolOutputs.current) invalidateBoard();
    prevToolOutputs.current = toolOutputs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolOutputs]);

  async function refreshConversations(): Promise<ConversationMeta[]> {
    try {
      const list = await fetch("/api/ai/conversations").then((r) => r.json());
      const convos = (list.conversations ?? []) as ConversationMeta[];
      setConversations(convos);
      return convos;
    } catch { return []; }
  }

  // Persist conversation after a turn finishes, then refresh the history list
  // (titles/order change once the first user message lands).
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && status === "ready" && conversationId) {
      fetch(`/api/ai/conversations/${conversationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesRef.current, title: deriveTitle(messagesRef.current) }),
      }).then(() => refreshConversations()).catch(() => {});
    }
    prevStatus.current = status;
  }, [status, conversationId]);

  // Bootstrap a conversation + history on first open (ref guard, no setState loop).
  const bootStarted = useRef(false);
  useEffect(() => {
    if (!open || bootStarted.current) return;
    bootStarted.current = true;
    (async () => {
      const convos = await refreshConversations();
      const convo = convos[0];
      if (!convo) return;
      setConversationId(convo.id);
      try {
        const hist = await fetch(`/api/ai/conversations/${convo.id}`).then((r) => r.json());
        if (hist.messages?.length) {
          setMessages(
            hist.messages.map((m: { id: string; role: string; parts: unknown }) => ({ id: m.id, role: m.role, parts: m.parts })) as UIMessage[],
          );
        }
      } catch { /* ignore */ }
    })();
  }, [open, setMessages]);

  async function newChat() {
    setHistoryOpen(false);
    try {
      const res = await fetch("/api/ai/conversations", { method: "POST" }).then((r) => r.json());
      if (res.conversation) {
        setConversationId(res.conversation.id);
        setMessages([]);
        refreshConversations();
      }
    } catch { toast.error("Couldn't start a new chat"); }
  }

  async function loadConversation(id: string) {
    setHistoryOpen(false);
    if (id === conversationId) return;
    setConversationId(id);
    setMessages([]);
    try {
      const hist = await fetch(`/api/ai/conversations/${id}`).then((r) => r.json());
      setMessages(
        (hist.messages ?? []).map((m: { id: string; role: string; parts: unknown }) => ({ id: m.id, role: m.role, parts: m.parts })) as UIMessage[],
      );
    } catch { toast.error("Couldn't open that chat"); }
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      const remaining = await refreshConversations();
      if (id === conversationId) {
        if (remaining[0]) loadConversation(remaining[0].id);
        else { setConversationId(null); setMessages([]); }
      }
    } catch { toast.error("Couldn't delete that chat"); }
  }

  async function handleConfirm(action: string, id: string) {
    try {
      await fetch("/api/ai/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      invalidateBoard();
      toast.success("Done");
    } catch { toast.error("Action failed"); }
  }

  const busy = status === "streaming" || status === "submitted";

  return (
    <div
      className="glass fixed top-0 right-0 h-dvh flex flex-col z-[70] overflow-hidden"
      style={{
        width: "min(440px, 100vw)",
        transform: open ? "translateX(0)" : "translateX(105%)",
        transition: "transform .35s var(--ease)",
        borderRadius: "24px 0 0 24px",
        boxShadow: "-24px 0 60px -24px rgba(0,0,0,0.6)",
      }}
    >
      {/* Focus AI logo — sits above the glass surface but below the chat content.
          Clear & prominent before the first message, a faint watermark while chatting. */}
      {messages.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/focus-ai.png" alt="" style={{ width: 230, height: 230, opacity: 0.28, objectFit: "contain" }} />
        </div>
      )}
      <div className="relative flex items-center" style={{ gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", zIndex: 2 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/focus-ai.png" alt="Focus AI" className="shrink-0" style={{ width: 30, height: 30, objectFit: "contain" }} />
        <div className="flex-1 min-w-0">
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 800, color: "var(--color-on-surface)" }}>Focus AI</p>
          <p style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", opacity: 0.8 }}>Dictate changes to your projects</p>
        </div>
        <button
          onClick={() => { if (!historyOpen) refreshConversations(); setHistoryOpen((v) => !v); }}
          className="icon-btn" style={{ width: 30, height: 30, color: historyOpen ? "var(--color-primary)" : undefined }} title="Chat history"
        >
          <History size={15} />
        </button>
        <button onClick={newChat} className="icon-btn" style={{ width: 30, height: 30 }} title="New chat"><Plus size={15} /></button>
        <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30 }} title="Close"><X size={16} /></button>

        {historyOpen && (
          <>
            <div className="fixed inset-0 z-[1]" onClick={() => setHistoryOpen(false)} />
            <div
              className="absolute no-scrollbar z-[2] flex flex-col"
              style={{
                top: 58, right: 12, width: 280, maxHeight: "60vh", overflowY: "auto",
                padding: 6, borderRadius: 14,
                background: "color-mix(in srgb, var(--color-surface-container-high) 96%, transparent)",
                backdropFilter: "blur(20px) saturate(140%)",
                WebkitBackdropFilter: "blur(20px) saturate(140%)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 18px 50px -18px rgba(0,0,0,0.65)",
              }}
            >
              {conversations.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", padding: "10px 8px" }}>No previous chats.</p>
              ) : (
                conversations.map((c) => {
                  const active = c.id === conversationId;
                  return (
                    <div
                      key={c.id}
                      className="group flex items-center btn-hover-surface"
                      style={{
                        gap: 8, padding: "8px 9px", borderRadius: 10, cursor: "pointer",
                        background: active ? "color-mix(in srgb, var(--color-primary) 14%, transparent)" : "transparent",
                      }}
                      onClick={() => loadConversation(c.id)}
                    >
                      <MessageSquare size={13} style={{ color: active ? "var(--color-primary)" : "var(--color-on-surface-variant)", flexShrink: 0 }} />
                      <span
                        className="min-w-0 flex-1"
                        style={{ fontSize: 12.5, color: "var(--color-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {c.title || "New chat"}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                        className="icon-btn opacity-0 group-hover:opacity-100"
                        style={{ width: 24, height: 24, flexShrink: 0, color: "var(--color-error)" }}
                        title="Delete chat"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      <div className="no-scrollbar relative flex-1 overflow-y-auto flex flex-col" style={{ gap: 12, padding: 16, zIndex: 1 }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center text-center" style={{ gap: 10, marginTop: "auto", marginBottom: "auto", padding: "8px 4px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/focus-ai.png" alt="Focus AI" style={{ width: 124, height: 124, objectFit: "contain" }} />
            <p style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 800, color: "var(--color-on-surface)", letterSpacing: "-.01em" }}>
              Focus AI
            </p>
            <p style={{ fontSize: 14, color: "var(--color-on-surface-variant)", lineHeight: 1.5, maxWidth: 320, marginBottom: 4 }}>
              Tell me what to do and I&apos;ll update your board — add tasks, break them into subtasks, set estimates, move or finish things.
            </p>
            <div className="w-full flex flex-col" style={{ gap: 8 }}>
              {SUGGESTIONS.map((s) => (
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
          messages.map((m) => <ChatMessage key={m.id} message={m} onConfirm={handleConfirm} />)
        )}
        {status === "submitted" && (
          <div className="flex items-center" style={{ gap: 8, color: "var(--color-on-surface-variant)", fontSize: 13.5 }}>
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <div className="relative" style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.06)", zIndex: 1 }}>
        <div className="flex items-end" style={{ gap: 8, padding: 8, borderRadius: 22, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); setInput(""); } }}
            rows={1}
            placeholder="Ask Focus AI…"
            className="flex-1 bg-transparent outline-none resize-none"
            style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-on-surface)", maxHeight: INPUT_MAX_HEIGHT, paddingTop: 4, paddingLeft: 4, overflowY: "auto" }}
          />
          <button
            onClick={() => { if (busy) { stop(); } else { send(input); setInput(""); } }}
            disabled={!busy && !input.trim()}
            className="grad-primary flex items-center justify-center shrink-0 disabled:opacity-40"
            style={{ width: 32, height: 32, borderRadius: 10, color: "var(--color-on-primary)" }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser?.parts.find((p: { type: string }) => p.type === "text") as { text?: string } | undefined;
  return (text?.text ?? "New chat").slice(0, 48);
}
