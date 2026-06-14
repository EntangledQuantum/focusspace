"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus, ArrowUp, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ChatMessage } from "./ChatMessage";

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

  // Persist conversation after a turn finishes.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && status === "ready" && conversationId) {
      fetch(`/api/ai/conversations/${conversationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesRef.current, title: deriveTitle(messagesRef.current) }),
      }).catch(() => {});
    }
    prevStatus.current = status;
  }, [status, conversationId]);

  // Bootstrap a conversation + history on first open (ref guard, no setState loop).
  const bootStarted = useRef(false);
  useEffect(() => {
    if (!open || bootStarted.current) return;
    bootStarted.current = true;
    (async () => {
      try {
        const list = await fetch("/api/ai/conversations").then((r) => r.json());
        const convo = list.conversations?.[0];
        if (!convo) return;
        setConversationId(convo.id);
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
    try {
      const res = await fetch("/api/ai/conversations", { method: "POST" }).then((r) => r.json());
      if (res.conversation) { setConversationId(res.conversation.id); setMessages([]); }
    } catch { toast.error("Couldn't start a new chat"); }
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
      className="fixed top-0 right-0 h-dvh flex flex-col z-[70]"
      style={{
        width: "min(420px, 100vw)",
        transform: open ? "translateX(0)" : "translateX(105%)",
        transition: "transform .35s var(--ease)",
        background: "color-mix(in srgb, var(--color-surface-container) 94%, transparent)",
        backdropFilter: "blur(28px) saturate(140%)",
        WebkitBackdropFilter: "blur(28px) saturate(140%)",
        borderLeft: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "-24px 0 60px -24px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex items-center" style={{ gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="grad-primary flex items-center justify-center shrink-0" style={{ width: 28, height: 28, borderRadius: 9 }}>
          <Sparkles size={15} style={{ color: "var(--color-on-primary)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 800, color: "var(--color-on-surface)" }}>Assistant</p>
          <p style={{ fontSize: 11, color: "var(--color-on-surface-variant)", opacity: 0.8 }}>Dictate changes to your projects</p>
        </div>
        <button onClick={newChat} className="icon-btn" style={{ width: 30, height: 30 }} title="New chat"><Plus size={15} /></button>
        <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30 }} title="Close"><X size={16} /></button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto flex flex-col" style={{ gap: 12, padding: 16 }}>
        {messages.length === 0 ? (
          <div className="flex flex-col" style={{ gap: 10, marginTop: 8 }}>
            <p style={{ fontSize: 13, color: "var(--color-on-surface-variant)", lineHeight: 1.5 }}>
              Tell me what to do and I&apos;ll update your board — add tasks, break them into subtasks, set estimates, move or finish things.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-left btn-hover-surface"
                style={{ padding: "8px 11px", borderRadius: 11, fontSize: 12.5, color: "var(--color-on-surface)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} onConfirm={handleConfirm} />)
        )}
        {status === "submitted" && (
          <div className="flex items-center" style={{ gap: 8, color: "var(--color-on-surface-variant)", fontSize: 12.5 }}>
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-end" style={{ gap: 8, padding: 8, borderRadius: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); setInput(""); } }}
            rows={1}
            placeholder="Ask the assistant…"
            className="flex-1 bg-transparent outline-none resize-none"
            style={{ fontSize: 13.5, color: "var(--color-on-surface)", maxHeight: 120, paddingTop: 4, paddingLeft: 4 }}
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
