"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Search, FolderOpen, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Task, Project } from "@/types/database";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (task: Task, project: Project | null) => void;
}

export function TaskPicker({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const supabase = createClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-with-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("*, tasks!inner(*)")
        .is("archived_at", null)
        .eq("tasks.status", "todo")
        .order("sort_order");
      return data ?? [];
    },
    enabled: open,
  });

  const filtered = projects
    .map((p: any) => ({
      ...p,
      tasks: (p.tasks as Task[]).filter((t) =>
        t.title.toLowerCase().includes(query.toLowerCase())
      ),
    }))
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
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md glass rounded-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <Search size={16} style={{ color: "var(--color-on-surface-variant)" }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--color-on-surface)" }}
              />
              <button onClick={onClose} style={{ color: "var(--color-on-surface-variant)" }}>
                <X size={16} />
              </button>
            </div>

            {/* Task list */}
            <div className="overflow-y-auto max-h-96 p-2">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                  No open tasks found.
                </div>
              ) : (
                filtered.map((project: any) => (
                  <div key={project.id} className="mb-3">
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: project.color ?? "var(--color-primary)" }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-on-surface-variant)" }}>
                        {project.name}
                      </span>
                    </div>
                    {project.tasks.map((task: Task) => (
                      <button
                        key={task.id}
                        onClick={() => { onSelect(task, project); onClose(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all duration-150 group"
                        style={{ color: "var(--color-on-surface)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <div className="w-1 h-6 rounded-full"
                          style={{ background: task.priority === "urgent" ? "var(--color-error)" : task.priority === "high" ? "var(--color-primary)" : "var(--color-outline-variant)" }} />
                        <span className="flex-1 truncate">{task.title}</span>
                        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "var(--color-on-surface-variant)" }} />
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
