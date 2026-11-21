"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { Brain, ChevronRight } from "lucide-react";
import { Markdown } from "./Markdown";
import { ToolCard, type ToolState } from "./ToolCard";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toolState(s: string): ToolState {
  if (s === "output-error") return "error";
  if (s === "output-available") return "done";
  return "running";
}

export function ChatMessage({
  message,
  onConfirm,
}: {
  message: UIMessage;
  onConfirm: (action: string, id: string) => Promise<void>;
}) {
  const isUser = message.role === "user";

  return (
    <div className="flex flex-col" style={{ gap: 5, alignItems: isUser ? "flex-end" : "stretch" }}>
      {message.parts.map((part: any, i: number) => {
        if (part.type === "text") {
          if (!part.text?.trim()) return null;
          if (isUser) {
            return (
              <div
                key={i}
                style={{
                  maxWidth: "85%", padding: "9px 13px", borderRadius: 16, borderBottomRightRadius: 5,
                  fontSize: 14.5, lineHeight: 1.5, color: "var(--color-on-primary)",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                }}
              >
                {part.text}
              </div>
            );
          }
          return <Markdown key={i}>{part.text}</Markdown>;
        }

        if (part.type === "reasoning" && !isUser) {
          if (!part.text?.trim()) return null;
          return <Reasoning key={i} text={part.text} streaming={part.state === "streaming"} />;
        }

        if (part.type === "dynamic-tool" || (typeof part.type === "string" && part.type.startsWith("tool-"))) {
          const name = part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
          return (
            <ToolCard
              key={i}
              name={name}
              state={toolState(part.state)}
              output={part.output}
              errorText={part.errorText}
              onConfirm={onConfirm}
            />
          );
        }

        return null;
      })}
    </div>
  );
}

/**
 * The model's streamed "thinking". Live (last few lines, dimmed) while it
 * streams so the user sees the agent is working; collapsed once done.
 */
function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const tail = text.trim().split("\n").slice(-3).join("\n");
  return (
    <div style={{ borderRadius: 12, padding: "7px 10px", background: "rgba(var(--ink), 0.04)", border: "1px solid rgba(var(--ink), 0.07)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center w-full text-left"
        style={{ gap: 6, fontSize: 12, color: "var(--color-on-surface-variant)" }}
        aria-expanded={open}
      >
        <Brain size={12} className={streaming ? "animate-pulse" : undefined} />
        <span style={{ fontWeight: 600 }}>{streaming ? "Thinking…" : "Thought process"}</span>
        <ChevronRight size={12} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      </button>
      {(open || streaming) && (
        <p
          style={{
            marginTop: 5, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "var(--color-on-surface-variant)", opacity: 0.75,
            ...(open ? { maxHeight: 260, overflowY: "auto" } : { maxHeight: 56, overflow: "hidden" }),
          }}
        >
          {open ? text.trim() : tail}
        </p>
      )}
    </div>
  );
}
