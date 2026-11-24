"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A task's description: clamped to `lines` (with "…"), full text on hover via
 * the tooltip, and click-to-expand when it actually overflows. Line breaks the
 * user typed are kept.
 */
export function TaskNotes({
  text,
  lines = 3,
  align = "left",
  style,
}: {
  text: string;
  lines?: number;
  align?: "left" | "center";
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Measure whether the clamped text is cut off (re-measured on resize).
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, lines, expanded]);

  const toggle = (e: React.SyntheticEvent) => {
    if (!overflows && !expanded) return; // short notes: let the click reach the row
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <span style={{ display: "block", textAlign: align, ...style }}>
      <span
        ref={ref}
        title={text}
        onClick={toggle}
        onDoubleClick={(e) => e.stopPropagation()}
        role={overflows || expanded ? "button" : undefined}
        tabIndex={overflows || expanded ? 0 : undefined}
        aria-expanded={overflows || expanded ? expanded : undefined}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } }}
        style={{
          margin: 0,
          fontSize: 12.5,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          color: "var(--color-on-surface-variant)",
          cursor: overflows || expanded ? "pointer" : "default",
          ...(expanded
            ? { display: "block" }
            : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }),
        }}
      >
        {text}
      </span>
      {(overflows || expanded) && (
        // A span, not a <button>: this often renders inside a clickable row that is itself a button.
        <span
          role="button"
          tabIndex={0}
          onClick={toggle}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } }}
          style={{ display: "inline-block", fontSize: 11.5, fontWeight: 600, color: "var(--color-primary)", marginTop: 2, cursor: "pointer" }}
        >
          {expanded ? "Show less" : "Show more"}
        </span>
      )}
    </span>
  );
}
