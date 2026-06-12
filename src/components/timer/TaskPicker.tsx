"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Search, Target, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Project, TaskWithTags } from "@/types/database";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (task: TaskWithTags, project: Project | null) => void;
}

export function TaskPicker({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const supabase = createClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-with-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("*, tasks!inner(*, task_tags(tag_id, tags(id, name, color)))")
        .is("archived_at", null)
        .eq("tasks.status", "todo")
        .order("sort_order");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((p: any) => ({
        ...p,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks: (p.tasks ?? []).map((t: any) => ({
          ...t,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tags: (t.task_tags ?? []).map((tt: any) => tt.tags).filter(Boolean),
        })) as TaskWithTags[],
      }));
    },
    // Kept warm by the app-shell prefetch so the picker opens instantly;
    // a short staleTime still revalidates after task edits elsewhere.
    staleTime: 30_000,
  });

  const filtered = projects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => ({
      ...p,
      tasks: (p.tasks as TaskWithTags[]).filter((t) =>
        t.title.toLowerCase().includes(query.toLowerCase())
      ),
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p: any) => p.tasks.length > 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(5,3,8,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 z-50 w-full -translate-x-1/2 overflow-hidden"
            style={{
              top: "12vh", maxWidth: 560,
              borderRadius: 24,
              background: "color-mix(in srgb, var(--color-surface-container) 92%, transparent)",
              backdropFilter: "blur(28px) saturate(1.4)",
              WebkitBackdropFilter: "blur(28px) saturate(1.4)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 40px 90px -24px rgba(0,0,0,0.7)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center"
              style={{ gap: 10, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Search size={17} style={{ color: "var(--color-on-surface-variant)", opacity: 0.7 }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Choose a task to focus on…"
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 15, color: "var(--color-on-surface)" }}
              />
              <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>

            {/* Task list */}
            <div className="no-scrollbar overflow-y-auto" style={{ maxHeight: "52vh", padding: 10 }}>
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                  No open tasks found.
                </div>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                filtered.map((project: any) => (
                  <div key={project.id} style={{ marginBottom: 8 }}>
                    <div className="flex items-center" style={{ gap: 7, padding: "8px 10px 6px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: project.color ?? "var(--color-primary)" }} />
                      <span
                        className="uppercase"
                        style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", color: "var(--color-on-surface-variant)", opacity: 0.8 }}
                      >
                        {project.name}
                      </span>
                    </div>
                    {project.tasks.map((task: TaskWithTags) => (
                      <button
                        key={task.id}
                        onClick={() => { onSelect(task, project); onClose(); }}
                        className="w-full flex items-center text-left transition-colors hover:bg-white/5"
                        style={{ gap: 12, padding: "11px 12px", borderRadius: 14 }}
                      >
                        <Target size={16} className="shrink-0" style={{ color: project.color ?? "var(--color-primary)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: "var(--color-on-surface)" }}>
                            {task.title}
                          </p>
                          <p className="tabular-nums" style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", opacity: 0.8, marginTop: 1 }}>
                            {task.completed_pomodoros ?? 0}/{Math.max(1, Math.ceil(task.estimated_pomodoros ?? 1))} sessions
                            {task.notes ? ` · ${task.notes.slice(0, 48)}${task.notes.length > 48 ? "…" : ""}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0" style={{ gap: 5 }}>
                          {task.tags?.slice(0, 2).map((tag) => (
                            <span
                              key={tag.id}
                              style={{
                                fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 99,
                                color: tag.color,
                                background: `color-mix(in srgb, ${tag.color} 16%, transparent)`,
                              }}
                            >
                              #{tag.name}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
