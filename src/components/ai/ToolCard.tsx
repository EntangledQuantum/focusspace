"use client";

import { useState } from "react";
import {
  FolderKanban, ListChecks, CheckCheck, FolderPlus, Pencil, Palette, Trash2,
  Plus, CheckCircle2, ListPlus, Tag, Sparkles, Loader2, AlertTriangle, type LucideIcon,
} from "lucide-react";
import { toolMetaFor } from "@/lib/ai/toolMeta";

const ICONS: Record<string, LucideIcon> = {
  FolderKanban, ListChecks, CheckCheck, FolderPlus, Pencil, Palette, Trash2,
  Plus, CheckCircle2, ListPlus, Tag, Sparkles,
};

export type ToolState = "running" | "done" | "error";

interface ConfirmOutput { __confirm: true; action: string; id: string; summary: string }
function isConfirm(o: unknown): o is ConfirmOutput {
  return !!o && typeof o === "object" && (o as { __confirm?: boolean }).__confirm === true;
}

export function ToolCard({
  name, state, output, errorText, onConfirm,
}: {
  name: string;
  state: ToolState;
  output?: unknown;
  errorText?: string;
  onConfirm: (action: string, id: string) => Promise<void>;
}) {
  const meta = toolMetaFor(name);
  const Icon = ICONS[meta.icon] ?? Sparkles;
  const [confirming, setConfirming] = useState(false);
  const [resolved, setResolved] = useState<null | "confirmed" | "cancelled">(null);

  const confirmReq = isConfirm(output) ? output : null;
  const resultText = typeof output === "string" ? output : confirmReq ? confirmReq.summary : "";

  const accent = meta.destructive ? "var(--color-error)" : "var(--color-primary)";

  return (
    <div
      className="flex flex-col"
      style={{
        gap: 8, borderRadius: 12, padding: "9px 11px", margin: "4px 0",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${state === "error" ? "color-mix(in srgb, var(--color-error) 30%, transparent)" : "rgba(255,255,255,0.07)"}`,
      }}
    >
      <div className="flex items-center" style={{ gap: 9 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 24, height: 24, borderRadius: 7, background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}
        >
          {state === "running" ? <Loader2 size={13} className="animate-spin" /> : state === "error" ? <AlertTriangle size={13} /> : <Icon size={13} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-on-surface)" }}>{meta.verb}</span>
        {state === "done" && !confirmReq && (
          <CheckCircle2 size={13} style={{ color: "var(--color-secondary)", marginLeft: "auto" }} />
        )}
      </div>

      {(resultText || errorText) && (
        <p style={{ fontSize: 11.5, lineHeight: 1.45, color: state === "error" ? "var(--color-error)" : "var(--color-on-surface-variant)", whiteSpace: "pre-wrap" }}>
          {errorText || resultText}
        </p>
      )}

      {confirmReq && resolved === null && (
        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            disabled={confirming}
            onClick={async () => { setConfirming(true); await onConfirm(confirmReq.action, confirmReq.id); setResolved("confirmed"); }}
            className="pill"
            style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 600, color: "#fff", background: "var(--color-error)", opacity: confirming ? 0.6 : 1 }}
          >
            {confirming ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Confirm
          </button>
          <button
            onClick={() => setResolved("cancelled")}
            className="pill"
            style={{ padding: "5px 12px", fontSize: 11.5, color: "var(--color-on-surface-variant)", background: "rgba(255,255,255,0.06)" }}
          >
            Cancel
          </button>
        </div>
      )}
      {confirmReq && resolved === "confirmed" && (
        <p style={{ fontSize: 11.5, color: "var(--color-secondary)" }}>Done.</p>
      )}
      {confirmReq && resolved === "cancelled" && (
        <p style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)" }}>Cancelled.</p>
      )}
    </div>
  );
}
