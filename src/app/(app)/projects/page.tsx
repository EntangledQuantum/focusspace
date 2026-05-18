"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Plus, CheckCircle2, Circle, Trash2, FolderPlus, Pencil, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Project, Task, Tag as TagType } from "@/types/database";

const PROJECT_COLORS = [
  "#ffb4a5", "#b5ccc1", "#adcae4", "#e2725b",
  "#7a96af", "#a48b86", "#394d45", "#c0b0ff",
];

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", color: "#ffb4ab" },
  high:   { label: "High",   color: "#ffb4a5" },
  med:    { label: "Med",    color: "#b5ccc1" },
  low:    { label: "Low",    color: "#a48b86" },
} as const;

export default function ProjectsPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [addingProject, setAddingProject] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks", selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", selectedProject.id)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedProject,
  });

  const { data: tags = [] } = useQuery<TagType[]>({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      return data ?? [];
    },
  });

  const addProject = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("projects")
        .insert({ name: newProjectName, color: newProjectColor, user_id: user!.id, sort_order: projects.length })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setSelectedProjectId(p.id);
      setNewProjectName("");
      setAddingProject(false);
      toast.success(`Project "${p.name}" created`);
    },
    onError: () => toast.error("Failed to create project"),
  });

  const renameProject = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("projects").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
      setEditingProjectId(null);
    },
    onError: () => toast.error("Failed to rename project"),
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("tasks").delete().eq("project_id", id);
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      if (selectedProjectId === id) setSelectedProjectId(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
      toast.success("Project deleted");
    },
    onError: () => toast.error("Failed to delete project"),
  });

  const addTask = useMutation({
    mutationFn: async () => {
      if (!selectedProject) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("tasks").insert({
        title: newTaskTitle,
        project_id: selectedProject.id,
        user_id: user!.id,
        sort_order: tasks.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", selectedProject?.id] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
      setNewTaskTitle("");
      setAddingTask(false);
    },
    onError: () => toast.error("Failed to add task"),
  });

  const toggleTask = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === "done" ? "todo" : "done";
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus, completed_at: newStatus === "done" ? new Date().toISOString() : null })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", selectedProject?.id] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", selectedProject?.id] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
    },
  });

  const todo = tasks.filter((t) => t.status === "todo");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="flex h-dvh">
      {/* Projects sidebar */}
      <div className="w-72 shrink-0 flex flex-col py-8"
        style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 mb-6">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}>
            Projects
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            Focus on what matters today.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {projects.map((project) => {
            const isActive = (selectedProject?.id ?? projects[0]?.id) === project.id;
            const isEditing = editingProjectId === project.id;
            return (
              <div key={project.id} className="group relative">
                {isEditing ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: project.color }} />
                    <input
                      autoFocus
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      className="flex-1 bg-transparent text-sm outline-none font-medium"
                      style={{ color: "var(--color-on-surface)" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editingProjectName.trim())
                          renameProject.mutate({ id: project.id, name: editingProjectName.trim() });
                        if (e.key === "Escape") setEditingProjectId(null);
                      }}
                    />
                    <button onClick={() => editingProjectName.trim() && renameProject.mutate({ id: project.id, name: editingProjectName.trim() })}
                      style={{ color: "var(--color-primary)" }}>
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditingProjectId(null)}
                      style={{ color: "var(--color-on-surface-variant)" }}>
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedProjectId(project.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all duration-150"
                    style={{
                      background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                      color: isActive ? "var(--color-on-surface)" : "var(--color-on-surface-variant)",
                      border: isActive ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
                    }}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: project.color }} />
                    <span className="flex-1 truncate font-medium">{project.name}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setEditingProjectId(project.id); setEditingProjectName(project.name); }}
                        className="p-1 rounded hover:opacity-100 transition-opacity"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        <Pencil size={11} />
                      </span>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); deleteProject.mutate(project.id); }}
                        className="p-1 rounded hover:opacity-100 transition-opacity"
                        style={{ color: "var(--color-error)" }}
                      >
                        <Trash2 size={11} />
                      </span>
                    </div>
                  </button>
                )}
              </div>
            );
          })}

          {/* Add project */}
          <AnimatePresence>
            {addingProject ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 p-3 rounded-xl"
                style={{ background: "var(--color-surface-container-high)", border: "1px solid var(--color-outline-variant)" }}
              >
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full bg-transparent text-sm outline-none mb-3"
                  style={{ color: "var(--color-on-surface)" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newProjectName.trim()) addProject.mutate();
                    if (e.key === "Escape") setAddingProject(false);
                  }}
                />
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewProjectColor(c)}
                      className="w-5 h-5 rounded-full transition-transform"
                      style={{
                        background: c,
                        transform: newProjectColor === c ? "scale(1.3)" : "scale(1)",
                        outline: newProjectColor === c ? `2px solid ${c}` : "none",
                        outlineOffset: "2px",
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => newProjectName.trim() && addProject.mutate()}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingProject(false)}
                    className="flex-1 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--color-surface-variant)", color: "var(--color-on-surface-variant)" }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              <button
                onClick={() => setAddingProject(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm mt-1 transition-all"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <Plus size={15} />
                Add Project
              </button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tasks pane */}
      <div className="flex-1 overflow-y-auto p-8">
        {selectedProject ? (
          <>
            <div className="flex items-start justify-between mb-8">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ background: selectedProject.color }} />
                  <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}>
                    {selectedProject.name}
                  </h1>
                </div>
                <p className="text-sm mt-1" style={{ color: "var(--color-on-surface-variant)" }}>
                  {todo.length} open · {done.length} done
                </p>
              </div>
            </div>

            {/* Inline add task */}
            <div className="mb-6">
              <AnimatePresence>
                {addingTask ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{ background: "var(--color-surface-container-high)", border: "1px solid var(--color-primary)" }}
                  >
                    <Circle size={18} style={{ color: "var(--color-on-surface-variant)" }} />
                    <input
                      autoFocus
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Task title…"
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: "var(--color-on-surface)" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTaskTitle.trim()) addTask.mutate();
                        if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle(""); }
                      }}
                    />
                    <button onClick={() => newTaskTitle.trim() && addTask.mutate()}
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }}>
                      Add
                    </button>
                    <button onClick={() => { setAddingTask(false); setNewTaskTitle(""); }}
                      className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                      Cancel
                    </button>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => setAddingTask(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all"
                    style={{
                      background: "color-mix(in srgb, var(--color-surface-container) 50%, transparent)",
                      color: "var(--color-on-surface-variant)",
                      border: "1px dashed var(--color-outline-variant)",
                    }}
                  >
                    <Plus size={16} />
                    Add a new task…
                  </button>
                )}
              </AnimatePresence>
            </div>

            {/* Todo tasks */}
            <div className="space-y-2">
              {todo.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask.mutate(task)}
                  onDelete={() => deleteTask.mutate(task.id)}
                />
              ))}
            </div>

            {/* Done tasks */}
            {done.length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-on-surface-variant)" }}>
                  Completed ({done.length})
                </p>
                <div className="space-y-2 opacity-50">
                  {done.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onToggle={() => toggleTask.mutate(task)}
                      onDelete={() => deleteTask.mutate(task.id)}
                      done
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <FolderPlus size={40} style={{ color: "var(--color-outline)" }} />
            <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
              Create a project to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete, done = false }: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
  done?: boolean;
}) {
  const priority = PRIORITY_CONFIG[task.priority];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl group transition-all"
      style={{
        background: "color-mix(in srgb, var(--color-surface-container) 60%, transparent)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)")}
    >
      <button onClick={onToggle} className="shrink-0 transition-all">
        {done ? (
          <CheckCircle2 size={18} style={{ color: "var(--color-secondary)" }} />
        ) : (
          <Circle size={18} style={{ color: "var(--color-on-surface-variant)" }} />
        )}
      </button>

      <span
        className="flex-1 text-sm truncate"
        style={{ color: done ? "var(--color-on-surface-variant)" : "var(--color-on-surface)", textDecoration: done ? "line-through" : "none" }}
      >
        {task.title}
      </span>

      {/* Priority dot */}
      <div className="w-2 h-2 rounded-full shrink-0 opacity-70" style={{ background: priority.color }} title={priority.label} />

      {/* Pomodoro pips */}
      {task.estimated_pomodoros > 0 && (
        <div className="flex gap-0.5">
          {Array.from({ length: task.estimated_pomodoros }).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full"
              style={{
                background: i < task.completed_pomodoros
                  ? "var(--color-primary)"
                  : "var(--color-outline-variant)",
              }} />
          ))}
        </div>
      )}

      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
        style={{ color: "var(--color-error)" }}
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  );
}
