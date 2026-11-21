"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search, Wrench, AlertTriangle, RefreshCw } from "lucide-react";
import { filterModels, formatContext, type ModelOption } from "@/lib/ai/models";

const MENU_BG: React.CSSProperties = {
  background: "color-mix(in srgb, var(--color-surface-container-high) 96%, transparent)",
  backdropFilter: "blur(20px) saturate(140%)",
  WebkitBackdropFilter: "blur(20px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 18px 50px -18px rgba(0,0,0,0.65)",
};

const MENU_MAX_H = 360;
type MenuPos = { top?: number; bottom?: number; left?: number; right?: number; maxH: number };

/**
 * Searchable model dropdown shared by Settings → AI and the chat header.
 * `allowCustom` lets own-key users use an id the provider didn't list.
 *
 * The menu is portalled to <body> with fixed positioning: glass cards create
 * their own stacking contexts (backdrop-filter), so an in-place absolute menu
 * got painted under the next card and clipped by the chat panel.
 */
export function ModelPicker({
  models, value, onChange, loading, error, allowCustom, compact, onRefresh, align = "left", disabled,
}: {
  models: ModelOption[];
  value: string | null;
  onChange: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  allowCustom?: boolean;
  compact?: boolean;
  onRefresh?: () => void;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const list = useMemo(() => filterModels(models, q).slice(0, 200), [models, q]);
  const custom = allowCustom && q.trim() && !models.some((m) => m.id === q.trim()) ? q.trim() : null;

  // Anchor the portalled menu to the trigger; open upward when there's more room above.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth, vh = window.innerHeight, gap = 6, margin = 12;
      const below = vh - r.bottom - gap - margin, above = r.top - gap - margin;
      const up = below < 220 && above > below;
      const maxH = Math.max(160, Math.min(MENU_MAX_H, up ? above : below));
      const horiz = align === "right" ? { right: Math.max(margin, vw - r.right) } : { left: Math.max(margin, r.left) };
      setPos(up ? { bottom: vh - r.top + gap, ...horiz, maxH } : { top: r.bottom + gap, ...horiz, maxH });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(id: string) {
    setOpen(false);
    setQ("");
    if (id !== value) onChange(id);
  }

  function onKey(e: React.KeyboardEvent) {
    const total = list.length + (custom ? 1 : 0);
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(total - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor < list.length && list[cursor]) choose(list[cursor].id);
      else if (custom) choose(custom);
    } else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
  }

  const current = models.find((m) => m.id === value);

  return (
    <div ref={rootRef} className="relative" style={{ minWidth: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((v) => !v); setCursor(0); }}
        className="flex items-center btn-hover-surface disabled:opacity-50"
        title={value ?? "Choose a model"}
        style={compact
          ? { gap: 5, padding: "3px 8px 3px 9px", borderRadius: 999, fontSize: 11.5, maxWidth: 190, color: "var(--color-on-surface-variant)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }
          : { gap: 8, padding: "8px 12px", borderRadius: 12, fontSize: 13, width: 260, maxWidth: "100%", color: "var(--color-on-surface)", background: "var(--color-surface-container-high)", border: "1px solid var(--color-outline-variant)" }}
      >
        <span className="min-w-0 flex-1 text-left" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current?.label ?? value ?? "Choose a model"}
        </span>
        {loading ? <Loader2 size={compact ? 11 : 13} className="animate-spin shrink-0" /> : <ChevronDown size={compact ? 11 : 14} className="shrink-0" />}
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed flex flex-col"
          style={{ ...MENU_BG, zIndex: 90, top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right, maxHeight: pos.maxH, width: compact ? 300 : 340, maxWidth: "calc(100vw - 24px)", borderRadius: 14, padding: 6 }}
        >
          <div className="flex items-center" style={{ gap: 7, padding: "6px 8px", borderRadius: 10, background: "rgba(255,255,255,0.05)", marginBottom: 4 }}>
            <Search size={13} style={{ color: "var(--color-on-surface-variant)" }} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setCursor(0); }}
              onKeyDown={onKey}
              placeholder={allowCustom ? "Search or type a model id…" : "Search models…"}
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 12.5, color: "var(--color-on-surface)" }}
            />
            {onRefresh && (
              <button type="button" onClick={onRefresh} className="icon-btn" title="Reload model list" style={{ width: 22, height: 22 }}>
                <RefreshCw size={11} className={loading ? "animate-spin" : undefined} />
              </button>
            )}
          </div>

          <div className="no-scrollbar flex flex-col" style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
            {loading && !models.length && (
              <div className="flex items-center" style={{ gap: 8, padding: "10px 8px", fontSize: 12, color: "var(--color-on-surface-variant)" }}>
                <Loader2 size={12} className="animate-spin" /> Loading models…
              </div>
            )}
            {error && (
              <div className="flex items-start" style={{ gap: 7, padding: "8px", fontSize: 11.5, lineHeight: 1.45, color: "var(--color-on-surface-variant)" }}>
                <AlertTriangle size={12} style={{ color: "var(--color-error)", flexShrink: 0, marginTop: 2 }} /> {error}
              </div>
            )}
            {list.map((m, i) => {
              const active = m.id === value;
              const ctx = formatContext(m.contextWindow);
              return (
                <button
                  key={m.id}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(m.id)}
                  className="flex items-center text-left"
                  style={{
                    gap: 8, padding: "7px 9px", borderRadius: 9,
                    background: cursor === i ? "rgba(255,255,255,0.07)" : active ? "color-mix(in srgb, var(--color-primary) 14%, transparent)" : "transparent",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p style={{ fontSize: 12.5, color: "var(--color-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.label ?? m.id}
                    </p>
                    {(m.label || m.provider || ctx) && (
                      <p style={{ fontSize: 10.5, color: "var(--color-on-surface-variant)", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[m.label ? m.id : null, m.provider, ctx].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {m.supportsTools === false && (
                    <span title="Provider says this model can't call tools — Focus AI won't be able to act" style={{ color: "var(--color-error)", opacity: 0.85 }}>
                      <Wrench size={11} />
                    </span>
                  )}
                  {active && <Check size={13} style={{ color: "var(--color-primary)", flexShrink: 0 }} />}
                </button>
              );
            })}
            {custom && (
              <button
                type="button"
                onMouseEnter={() => setCursor(list.length)}
                onClick={() => choose(custom)}
                className="text-left"
                style={{ padding: "7px 9px", borderRadius: 9, fontSize: 12.5, color: "var(--color-primary)", background: cursor === list.length ? "rgba(255,255,255,0.07)" : "transparent" }}
              >
                Use “{custom}”
              </button>
            )}
            {!loading && !list.length && !custom && !error && (
              <p style={{ padding: "10px 8px", fontSize: 12, color: "var(--color-on-surface-variant)" }}>
                {models.length ? "No models match." : allowCustom ? "No models listed — type a model id." : "No models available."}
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
