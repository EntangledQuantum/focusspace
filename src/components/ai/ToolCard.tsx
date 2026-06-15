"use client";

import { useState } from "react";
import {
  FolderKanban, ListChecks, CheckCheck, FolderPlus, Pencil, Palette, Trash2,
  Plus, CheckCircle2, ListPlus, Tag, Sparkles, Loader2, AlertTriangle,
  Search, FileText, ChevronRight, type LucideIcon,
} from "lucide-react";
import { toolMetaFor } from "@/lib/ai/toolMeta";

const ICONS: Record<string, LucideIcon> = {
  FolderKanban, ListChecks, CheckCheck, FolderPlus, Pencil, Palette, Trash2,
  Plus, CheckCircle2, ListPlus, Tag, Sparkles, Search, FileText,
};

export type ToolState = "running" | "done" | "error";

interface ConfirmOutput { __confirm: true; action: string; id: string; summary: string }
function isConfirm(o: unknown): o is ConfirmOutput {
  return !!o && typeof o === "object" && (o as { __confirm?: boolean }).__confirm === true;
}

const pluralize = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

// A short, user-facing summary of what the tool did, derived from its text
// output. Read tools → "Read 3 tasks"; write tools → their one-line result.
function summarize(verb: string, noun: string | undefined, detail: string): string {
  if (!detail) return verb;
  const items = detail.split("\n").filter((l) => /^\s*-\s/.test(l)).length;
  if (noun && items > 0) return `${verb.split(" ")[0]} ${pluralize(items, noun)}`;
  // Single-line results (writes/confirmations): show the result itself.
  const firstLine = detail.split("\n")[0].trim();
  return firstLine || verb;
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
  const [expanded, setExpanded] = useState(false);

  const confirmReq = isConfirm(output) ? output : null;
  const resultText = typeof output === "string" ? output : confirmReq ? confirmReq.summary : "";

  const isErr = state === "error";

  // The summary shown collapsed; full detail revealed on expand. Multi-line or
  // long outputs are worth collapsing; short single lines aren't.
  const detail = errorText || resultText;
  const summary = errorText
    ? "Error"
    : confirmReq
      ? confirmReq.summary
      : summarize(meta.verb, meta.noun, resultText);
  const canExpand = !confirmReq && !!detail && (detail.includes("\n") || detail.length > 60) && detail.trim() !== summary.trim();

  return (
    // Tool cards are deliberately NOT driven by the user's glass tint/blur — they
    // stay a fixed frosted pink (our brand) at full blur so they always read as
    // "the assistant did something". Inline backdrop-filter bypasses Lightning CSS.
    <div
      className="flex flex-col"
      style={{
        gap: 6, borderRadius: 14, padding: "9px 12px", margin: "4px 0",
        background: isErr
          ? "color-mix(in srgb, var(--color-error) 40%, transparent)"
          : "color-mix(in srgb, var(--color-primary) 50%, transparent)",
        backdropFilter: "blur(30px) saturate(150%)",
        WebkitBackdropFilter: "blur(30px) saturate(150%)",
        border: `1px solid ${isErr ? "color-mix(in srgb, var(--color-error) 50%, transparent)" : "color-mix(in srgb, var(--color-primary) 65%, transparent)"}`,
        boxShadow: "0 10px 28px -14px rgba(0,0,0,0.55)",
      }}
    >
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        className="flex items-center w-full text-left"
        style={{ gap: 9, cursor: canExpand ? "pointer" : "default" }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 25, height: 25, borderRadius: 8, background: "rgba(255,255,255,0.22)", color: "var(--color-on-surface)" }}
        >
          {state === "running" ? <Loader2 size={13} className="animate-spin" /> : isErr ? <AlertTriangle size={13} /> : <Icon size={13} />}
        </div>
        <span
          className="min-w-0 flex-1"
          style={{
            fontSize: 13, fontWeight: 700,
            color: "var(--color-on-surface)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {state === "running" ? meta.verb + "…" : summary}
        </span>
        {state === "done" && !confirmReq && !canExpand && (
          <CheckCircle2 size={14} style={{ color: "var(--color-on-surface)" }} />
        )}
        {canExpand && (
          <ChevronRight
            size={15}
            style={{ color: "var(--color-on-surface)", opacity: 0.8, transition: "transform .2s", transform: expanded ? "rotate(90deg)" : "none" }}
          />
        )}
      </button>

      {canExpand && expanded && (
        <p
          style={{
            fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
            color: "var(--color-on-surface)", opacity: 0.92,
            paddingLeft: 34, borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: 6,
          }}
        >
          {detail}
        </p>
      )}

      {confirmReq && resolved === null && (
        <div className="flex items-center" style={{ gap: 8, paddingLeft: 33 }}>
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
        <p style={{ fontSize: 11.5, color: "var(--color-secondary)", paddingLeft: 33 }}>Done.</p>
      )}
      {confirmReq && resolved === "cancelled" && (
        <p style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", paddingLeft: 33 }}>Cancelled.</p>
      )}
    </div>
  );
}
