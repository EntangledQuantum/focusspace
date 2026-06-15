"use client";

import type { UIMessage } from "ai";
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
