"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { AGENT_SETUP_LINE } from "@/lib/mode";

export function CopyInstallBox({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(AGENT_SETUP_LINE);
      setCopied(true);
      toast.success("Copied — paste it to Hermes or OpenClaw");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the line and copy it yourself.");
    }
  }

  return (
    <div
      className="glass w-full"
      style={{
        borderRadius: 20,
        padding: compact ? "10px 10px 10px 14px" : "12px 12px 12px 16px",
        maxWidth: 560,
      }}
    >
      <p
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--color-on-surface-variant)",
          marginBottom: 8,
        }}
      >
        Hand this to an agent
      </p>
      <div className="flex items-center" style={{ gap: 10 }}>
        <code
          className="min-w-0 flex-1"
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: compact ? 12 : 13,
            lineHeight: 1.45,
            color: "var(--color-on-surface)",
            wordBreak: "break-word",
          }}
        >
          {AGENT_SETUP_LINE}
        </code>
        <button
          type="button"
          onClick={copy}
          className="pill hover-lift shrink-0"
          aria-label="Copy agent setup line"
          style={{
            padding: "8px 12px",
            fontSize: 12.5,
            color: copied ? "var(--color-primary)" : "var(--color-on-surface)",
            background: copied
              ? "color-mix(in srgb, var(--color-primary) 14%, transparent)"
              : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
