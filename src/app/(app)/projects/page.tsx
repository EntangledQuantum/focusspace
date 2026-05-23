"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Plus, CheckCircle2, Circle, Trash2, FolderPlus, Pencil, Check, X, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Project, Task, Tag as TagType, TaskWithTags } from "@/types/database";
import { PomodoroRating, PomodoroMiniPips } from "@/components/timer/PomodoroRating";
import type { UserSettings } from "@/types/database";

const PROJECT_COLORS = [
  "#ffb4a5", "#b5ccc1", "#adcae4", "#e2725b",
  "#7a96af", "#a48b86", "#394d45", "#c0b0ff",
];

const TAG_COLORS = [
  "#ffb4a5", "#b5ccc1", "#adcae4", "#c0b0ff",
  "#80c0a0", "#e2725b", "#7a96af", "#f0c060",
];

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", color: "#ffb4ab" },
  high:   { label: "High",   color: "#ffb4a5" },
  med:    { label: "Med",    color: "#b5ccc1" },
  low:    { label: "Low",    color: "#a48b86" },
} as const;

function randomTagColor() {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

export default function ProjectsPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [addingProject, setAddingProject] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPomos, setNewTaskPomos] = useState(1);
  const [addingTask, setAddingTask] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");

  // Tag state
  const [newTaskTags, setNewTaskTags] = useState<TagType[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [showTagSugs, setShowTagSugs] = useState(false);
  const [deleteTagConfirm, setDeleteTagConfirm] = useState<TagType | null>(null);
  const [showTagInput, setShowTagInput] = useState(false);
  const [addingTagName, setAddingTagName] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tagSugRef = useRef<HTMLDivElement>(null);

  // Task edit state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPomos, setEditPomos] = useState(1);
  const [editTags, setEditTags] = useState<TagType[]>([]);
  const [editTagQuery, setEditTagQuery] = useState("");
  const [showEditTagSugs, setShowEditTagSugs] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editTagSugRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery<UserSettings | null>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return data as UserSettings | null;
    },
    staleTime: 5 * 60_000,
  });

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

  const { data: tasks = [] } = useQuery<TaskWithTags[]>({
    queryKey: ["tasks", selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*, task_tags(tag_id, tags(id, name, color))")
        .eq("project_id", selectedProject.id)
        .order("sort_order");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((t: any) => ({
        ...t,
        tags: (t.task_tags ?? []).map((tt: any) => tt.tags).filter(Boolean),
      })) as TaskWithTags[];
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

  // Suggestions: filter by current tagQuery
  const tagSuggestions = tags.filter(
    (t) =>
      t.name.startsWith(tagQuery) &&
      !newTaskTags.find((nt) => nt.id === t.id)
  );
  const canCreateTag =
    tagQuery.length > 0 &&
    !tags.find((t) => t.name === tagQuery) &&
    !newTaskTags.find((t) => t.name === tagQuery);

  const editTagSuggestions = tags.filter(
    (t) => t.name.startsWith(editTagQuery) && !editTags.find((nt) => nt.id === t.id),
  );
  const canCreateEditTag =
    editTagQuery.length > 0 &&
    !tags.find((t) => t.name === editTagQuery) &&
    !editTags.find((t) => t.name === editTagQuery);

  // Close tag suggestions on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        tagSugRef.current &&
        !tagSugRef.current.contains(e.target as Node) &&
        titleInputRef.current !== e.target
      ) {
        setShowTagSugs(false);
      }
      if (
        editTagSugRef.current &&
        !editTagSugRef.current.contains(e.target as Node) &&
        editInputRef.current !== e.target
      ) {
        setShowEditTagSugs(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function startEditingTask(task: TaskWithTags) {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditPomos(task.estimated_pomodoros ?? 1);
    setEditTags(task.tags ?? []);
    setEditTagQuery("");
    setShowEditTagSugs(false);
  }

  function cancelEditingTask() {
    setEditingTaskId(null);
    setEditTitle("");
    setEditPomos(1);
    setEditTags([]);
    setEditTagQuery("");
    setShowEditTagSugs(false);
  }

  function handleEditTitleChange(val: string) {
    setEditTitle(val);
    const match = val.match(/#(\w*)$/);
    if (match) {
      setEditTagQuery(match[1].toLowerCase());
      setShowEditTagSugs(true);
    } else {
      setShowEditTagSugs(false);
      setEditTagQuery("");
    }
  }

  function selectEditTagSuggestion(tag: TagType) {
    setEditTitle((prev) => prev.replace(/#\w*$/, "").trimEnd());
    setShowEditTagSugs(false);
    setEditTagQuery("");
    if (!editTags.find((t) => t.id === tag.id)) {
      setEditTags((prev) => [...prev, tag]);
    }
  }

  async function createAndSelectEditTag() {
    if (!editTagQuery) return;
    const { data: { user } } = await supabase.auth.getUser();
    const existing = tags.find((t) => t.name === editTagQuery);
    if (existing) {
      selectEditTagSuggestion(existing);
      return;
    }
    const { data: created } = await supabase
      .from("tags")
      .insert({ user_id: user!.id, name: editTagQuery, color: randomTagColor() })
      .select()
      .single();
    if (created) {
      qc.invalidateQueries({ queryKey: ["tags"] });
      setEditTitle((prev) => prev.replace(/#\w*$/, "").trimEnd());
      setShowEditTagSugs(false);
      setEditTagQuery("");
      setEditTags((prev) => [...prev, created as TagType]);
    }
  }

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

      // Extract inline #tags and clean title
      const hashTagNames = (newTaskTitle.match(/#(\w+)/g) ?? []).map((m) => m.slice(1).toLowerCase());
      const cleanTitle = newTaskTitle.replace(/#\w+/g, "").trim() || newTaskTitle.trim();

      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          title: cleanTitle,
          project_id: selectedProject.id,
          user_id: user!.id,
          sort_order: tasks.length,
          estimated_pomodoros: newTaskPomos,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Resolve all tags: chips already selected + inline #tags
      const chipIds = new Set(newTaskTags.map((t) => t.id));
      const resolvedTagIds: string[] = [...chipIds];

      for (const name of hashTagNames) {
        const existing = tags.find((t) => t.name === name);
        if (existing) {
          if (!chipIds.has(existing.id)) resolvedTagIds.push(existing.id);
        } else {
          const { data: created } = await supabase
            .from("tags")
            .insert({ user_id: user!.id, name, color: randomTagColor() })
            .select("id")
            .single();
          if (created) resolvedTagIds.push(created.id);
        }
      }

      if (resolvedTagIds.length > 0) {
        await supabase.from("task_tags").insert(
          resolvedTagIds.map((tagId) => ({ task_id: task.id, tag_id: tagId }))
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", selectedProject?.id] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      setNewTaskTitle("");
      setNewTaskPomos(1);
      setNewTaskTags([]);
      setAddingTask(false);
    },
    onError: () => toast.error("Failed to add task"),
  });

  const createTag = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tags")
        .insert({ user_id: user!.id, name: name.toLowerCase(), color: randomTagColor() })
        .select()
        .single();
      if (error) throw error;
      return data as TagType;
    },
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      setAddingTagName("");
      setShowTagInput(false);
      toast.success(`Tag #${tag.name} created`);
    },
    onError: () => toast.error("Failed to create tag"),
  });

  const deleteTag = useMutation({
    mutationFn: async (tag: TagType) => {
      await supabase.from("task_tags").delete().eq("tag_id", tag.id);
      const { error } = await supabase.from("tags").delete().eq("id", tag.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["tasks", selectedProject?.id] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      setDeleteTagConfirm(null);
      toast.success("Tag deleted");
    },
    onError: () => toast.error("Failed to delete tag"),
  });

  const updateTask = useMutation({
    mutationFn: async () => {
      if (!editingTaskId) return;
      const { data: { user } } = await supabase.auth.getUser();

      // Extract inline #tags from title
      const hashTagNames = (editTitle.match(/#(\w+)/g) ?? []).map((m) => m.slice(1).toLowerCase());
      const cleanTitle = editTitle.replace(/#\w+/g, "").trim() || editTitle.trim();

      const { error } = await supabase
        .from("tasks")
        .update({ title: cleanTitle, estimated_pomodoros: editPomos })
        .eq("id", editingTaskId);
      if (error) throw error;

      // Resolve tags (chips + inline)
      const chipIds = new Set(editTags.map((t) => t.id));
      const resolvedTagIds: string[] = [...chipIds];
      for (const name of hashTagNames) {
        const existing = tags.find((t) => t.name === name);
        if (existing) {
          if (!chipIds.has(existing.id)) resolvedTagIds.push(existing.id);
        } else {
          const { data: created } = await supabase
            .from("tags")
            .insert({ user_id: user!.id, name, color: randomTagColor() })
            .select("id")
            .single();
          if (created) resolvedTagIds.push(created.id);
        }
      }

      // Replace task_tags: delete existing then insert
      await supabase.from("task_tags").delete().eq("task_id", editingTaskId);
      if (resolvedTagIds.length > 0) {
        await supabase.from("task_tags").insert(
          resolvedTagIds.map((tagId) => ({ task_id: editingTaskId, tag_id: tagId })),
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", selectedProject?.id] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      cancelEditingTask();
      toast.success("Task updated");
    },
    onError: () => toast.error("Failed to update task"),
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

  function handleTitleChange(val: string) {
    setNewTaskTitle(val);
    const match = val.match(/#(\w*)$/);
    if (match) {
      setTagQuery(match[1].toLowerCase());
      setShowTagSugs(true);
    } else {
      setShowTagSugs(false);
      setTagQuery("");
    }
  }

  function selectTagSuggestion(tag: TagType) {
    setNewTaskTitle((prev) => prev.replace(/#\w*$/, "").trimEnd());
    setShowTagSugs(false);
    setTagQuery("");
    if (!newTaskTags.find((t) => t.id === tag.id)) {
      setNewTaskTags((prev) => [...prev, tag]);
    }
  }

  async function createAndSelectTag() {
    if (!tagQuery) return;
    const { data: { user } } = await supabase.auth.getUser();
    const existing = tags.find((t) => t.name === tagQuery);
    if (existing) {
      selectTagSuggestion(existing);
      return;
    }
    const { data: created } = await supabase
      .from("tags")
      .insert({ user_id: user!.id, name: tagQuery, color: randomTagColor() })
      .select()
      .single();
    if (created) {
      qc.invalidateQueries({ queryKey: ["tags"] });
      setNewTaskTitle((prev) => prev.replace(/#\w*$/, "").trimEnd());
      setShowTagSugs(false);
      setTagQuery("");
      setNewTaskTags((prev) => [...prev, created as TagType]);
    }
  }

  const todo = tasks.filter((t) => t.status === "todo");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="flex h-dvh">
      {/* Projects sidebar */}
      <div
        className="w-72 shrink-0 flex flex-col py-8"
        style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}
      >
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all duration-150 ${!isActive ? "nav-link-hover" : ""}`}
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
                        className="p-1 rounded transition-opacity"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        <Pencil size={11} />
                      </span>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); deleteProject.mutate(project.id); }}
                        className="p-1 rounded transition-opacity"
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
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all btn-hover-primary"
                    style={{ background: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingProject(false)}
                    className="flex-1 py-1.5 rounded-lg text-xs transition-all btn-hover-surface"
                    style={{ background: "var(--color-surface-variant)", color: "var(--color-on-surface-variant)" }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              <button
                onClick={() => setAddingProject(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm mt-1 transition-all nav-link-hover"
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
            {/* Project header */}
            <div className="flex items-start justify-between mb-5">
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

            {/* Tags strip */}
            <div className="mb-5">
              {/* Delete warning */}
              <AnimatePresence>
                {deleteTagConfirm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-3 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm"
                    style={{
                      background: "color-mix(in srgb, var(--color-error) 12%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--color-error) 30%, transparent)",
                      color: "var(--color-error)",
                    }}
                  >
                    <span className="flex-1 text-xs">
                      Deleting <strong>#{deleteTagConfirm.name}</strong> will remove it from all tasks and affects analytics. This cannot be undone.
                    </span>
                    <button
                      onClick={() => deleteTag.mutate(deleteTagConfirm)}
                      className="text-xs px-2.5 py-1 rounded-lg font-semibold shrink-0"
                      style={{ background: "var(--color-error)", color: "#fff" }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeleteTagConfirm(null)}
                      className="shrink-0"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-2 flex-wrap">
                <Tag size={12} style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }} />
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="group flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: `color-mix(in srgb, ${tag.color} 18%, transparent)`,
                      color: tag.color,
                      border: `1px solid color-mix(in srgb, ${tag.color} 30%, transparent)`,
                    }}
                  >
                    <span>#{tag.name}</span>
                    <button
                      onClick={() => setDeleteTagConfirm(tag)}
                      className="opacity-0 group-hover:opacity-80 transition-opacity ml-0.5"
                      style={{ color: tag.color }}
                      title="Delete tag"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}

                {/* Add tag inline */}
                {showTagInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={addingTagName}
                      onChange={(e) => setAddingTagName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      placeholder="tagname"
                      className="bg-transparent text-xs outline-none w-20 px-2 py-0.5 rounded-full"
                      style={{
                        border: "1px solid var(--color-outline-variant)",
                        color: "var(--color-on-surface)",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && addingTagName.trim()) createTag.mutate(addingTagName.trim());
                        if (e.key === "Escape") { setShowTagInput(false); setAddingTagName(""); }
                      }}
                    />
                    <button
                      onClick={() => addingTagName.trim() && createTag.mutate(addingTagName.trim())}
                      style={{ color: "var(--color-primary)" }}
                    >
                      <Check size={12} />
                    </button>
                    <button onClick={() => { setShowTagInput(false); setAddingTagName(""); }}
                      style={{ color: "var(--color-on-surface-variant)" }}>
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTagInput(true)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all"
                    style={{
                      color: "var(--color-on-surface-variant)",
                      border: "1px dashed var(--color-outline-variant)",
                    }}
                  >
                    <Plus size={10} />
                    Tag
                  </button>
                )}
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
                    className="rounded-xl px-4 py-3 flex flex-col gap-2.5"
                    style={{ background: "var(--color-surface-container-high)", border: "1px solid var(--color-primary)" }}
                  >
                    {/* Title row with tag suggestions */}
                    <div className="relative">
                      <div className="flex items-center gap-3">
                        <Circle size={18} style={{ color: "var(--color-on-surface-variant)" }} />
                        <input
                          ref={titleInputRef}
                          autoFocus
                          value={newTaskTitle}
                          onChange={(e) => handleTitleChange(e.target.value)}
                          placeholder="Task title… or type #tag"
                          className="flex-1 bg-transparent text-sm outline-none"
                          style={{ color: "var(--color-on-surface)" }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !showTagSugs && newTaskTitle.trim()) addTask.mutate();
                            if (e.key === "Escape") {
                              if (showTagSugs) { setShowTagSugs(false); }
                              else { setAddingTask(false); setNewTaskTitle(""); setNewTaskPomos(1); setNewTaskTags([]); }
                            }
                          }}
                        />
                      </div>

                      {/* Tag autocomplete dropdown */}
                      <AnimatePresence>
                        {showTagSugs && (tagSuggestions.length > 0 || canCreateTag) && (
                          <motion.div
                            ref={tagSugRef}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="absolute left-7 top-full mt-1 z-50 rounded-xl py-1 min-w-40"
                            style={{
                              background: "var(--color-surface-container-high)",
                              border: "1px solid var(--color-outline-variant)",
                              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                            }}
                          >
                            {tagSuggestions.map((tag) => (
                              <button
                                key={tag.id}
                                onMouseDown={(e) => { e.preventDefault(); selectTagSuggestion(tag); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
                                style={{ color: "var(--color-on-surface)" }}
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: tag.color }}
                                />
                                #{tag.name}
                              </button>
                            ))}
                            {canCreateTag && (
                              <button
                                onMouseDown={(e) => { e.preventDefault(); createAndSelectTag(); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
                                style={{ color: "var(--color-primary)" }}
                              >
                                <Plus size={10} />
                                Create #{tagQuery}
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Selected tag chips */}
                    {newTaskTags.length > 0 && (
                      <div className="flex items-center gap-1.5 pl-7 flex-wrap">
                        {newTaskTags.map((tag) => (
                          <div
                            key={tag.id}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              background: `color-mix(in srgb, ${tag.color} 18%, transparent)`,
                              color: tag.color,
                              border: `1px solid color-mix(in srgb, ${tag.color} 30%, transparent)`,
                            }}
                          >
                            #{tag.name}
                            <button onClick={() => setNewTaskTags((prev) => prev.filter((t) => t.id !== tag.id))}>
                              <X size={9} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pomodoro picker + actions row */}
                    <div className="flex items-center justify-between pl-7">
                      <PomodoroRating
                        value={newTaskPomos}
                        onChange={setNewTaskPomos}
                        pomoDurationSec={settings?.focus_duration_sec ?? 25 * 60}
                        shortBreakSec={settings?.short_break_sec ?? 5 * 60}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => newTaskTitle.trim() && addTask.mutate()}
                          className="text-xs px-3 py-1 rounded-full font-semibold transition-all btn-hover-primary"
                          style={{ background: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }}
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setAddingTask(false); setNewTaskTitle(""); setNewTaskPomos(1); setNewTaskTags([]); }}
                          className="text-xs transition-all btn-hover-ghost px-2 py-1 rounded-lg"
                          style={{ color: "var(--color-on-surface-variant)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => setAddingTask(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all btn-hover-surface"
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
              {todo.map((task) =>
                editingTaskId === task.id ? (
                  <TaskEditor
                    key={task.id}
                    editTitle={editTitle}
                    editPomos={editPomos}
                    editTags={editTags}
                    editTagQuery={editTagQuery}
                    showEditTagSugs={showEditTagSugs}
                    editTagSuggestions={editTagSuggestions}
                    canCreateEditTag={canCreateEditTag}
                    editInputRef={editInputRef}
                    editTagSugRef={editTagSugRef}
                    onTitleChange={handleEditTitleChange}
                    onPomosChange={setEditPomos}
                    onRemoveTag={(id) => setEditTags((prev) => prev.filter((t) => t.id !== id))}
                    onSelectTagSug={selectEditTagSuggestion}
                    onCreateAndSelectTag={createAndSelectEditTag}
                    onSave={() => editTitle.trim() && updateTask.mutate()}
                    onCancel={cancelEditingTask}
                    pomoDurationSec={settings?.focus_duration_sec ?? 25 * 60}
                    shortBreakSec={settings?.short_break_sec ?? 5 * 60}
                  />
                ) : (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask.mutate(task)}
                    onDelete={() => deleteTask.mutate(task.id)}
                    onEdit={() => startEditingTask(task)}
                  />
                ),
              )}
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

function TaskRow({
  task,
  onToggle,
  onDelete,
  onEdit,
  done = false,
}: {
  task: TaskWithTags;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
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

      <div className="flex-1 min-w-0">
        <span
          className="text-sm truncate block"
          style={{
            color: done ? "var(--color-on-surface-variant)" : "var(--color-on-surface)",
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {task.title}
        </span>
        {task.tags && task.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {task.tags.map((tag) => (
              <span
                key={tag.id}
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none"
                style={{
                  background: `color-mix(in srgb, ${tag.color} 18%, transparent)`,
                  color: tag.color,
                }}
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Priority dot */}
      <div className="w-2 h-2 rounded-full shrink-0 opacity-70" style={{ background: priority.color }} title={priority.label} />

      {/* Pomodoro pips */}
      {(task.estimated_pomodoros ?? 0) > 0 && (
        <PomodoroMiniPips
          estimated={task.estimated_pomodoros ?? 1}
          completed={task.completed_pomodoros ?? 0}
        />
      )}

      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <button
            onClick={onEdit}
            title="Edit task"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <Pencil size={13} />
          </button>
        )}
        <button
          onClick={onDelete}
          title="Delete task"
          style={{ color: "var(--color-error)" }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}

function TaskEditor({
  editTitle,
  editPomos,
  editTags,
  editTagQuery,
  showEditTagSugs,
  editTagSuggestions,
  canCreateEditTag,
  editInputRef,
  editTagSugRef,
  onTitleChange,
  onPomosChange,
  onRemoveTag,
  onSelectTagSug,
  onCreateAndSelectTag,
  onSave,
  onCancel,
  pomoDurationSec,
  shortBreakSec,
}: {
  editTitle: string;
  editPomos: number;
  editTags: TagType[];
  editTagQuery: string;
  showEditTagSugs: boolean;
  editTagSuggestions: TagType[];
  canCreateEditTag: boolean;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  editTagSugRef: React.RefObject<HTMLDivElement | null>;
  onTitleChange: (val: string) => void;
  onPomosChange: (n: number) => void;
  onRemoveTag: (id: string) => void;
  onSelectTagSug: (tag: TagType) => void;
  onCreateAndSelectTag: () => void;
  onSave: () => void;
  onCancel: () => void;
  pomoDurationSec: number;
  shortBreakSec: number;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="rounded-xl px-4 py-3 flex flex-col gap-2.5"
      style={{ background: "var(--color-surface-container-high)", border: "1px solid var(--color-primary)" }}
    >
      <div className="relative">
        <div className="flex items-center gap-3">
          <Circle size={18} style={{ color: "var(--color-on-surface-variant)" }} />
          <input
            ref={editInputRef}
            autoFocus
            value={editTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Task title… or type #tag"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-on-surface)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !showEditTagSugs && editTitle.trim()) onSave();
              if (e.key === "Escape") {
                if (showEditTagSugs) return;
                onCancel();
              }
            }}
          />
        </div>

        <AnimatePresence>
          {showEditTagSugs && (editTagSuggestions.length > 0 || canCreateEditTag) && (
            <motion.div
              ref={editTagSugRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-7 top-full mt-1 z-50 rounded-xl py-1 min-w-40"
              style={{
                background: "var(--color-surface-container-high)",
                border: "1px solid var(--color-outline-variant)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}
            >
              {editTagSuggestions.map((tag) => (
                <button
                  key={tag.id}
                  onMouseDown={(e) => { e.preventDefault(); onSelectTagSug(tag); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
                  style={{ color: "var(--color-on-surface)" }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tag.color }} />
                  #{tag.name}
                </button>
              ))}
              {canCreateEditTag && (
                <button
                  onMouseDown={(e) => { e.preventDefault(); onCreateAndSelectTag(); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
                  style={{ color: "var(--color-primary)" }}
                >
                  <Plus size={10} />
                  Create #{editTagQuery}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {editTags.length > 0 && (
        <div className="flex items-center gap-1.5 pl-7 flex-wrap">
          {editTags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                background: `color-mix(in srgb, ${tag.color} 18%, transparent)`,
                color: tag.color,
                border: `1px solid color-mix(in srgb, ${tag.color} 30%, transparent)`,
              }}
            >
              #{tag.name}
              <button onClick={() => onRemoveTag(tag.id)}>
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pl-7">
        <PomodoroRating
          value={editPomos}
          onChange={onPomosChange}
          pomoDurationSec={pomoDurationSec}
          shortBreakSec={shortBreakSec}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            className="text-xs px-3 py-1 rounded-full font-semibold transition-all btn-hover-primary"
            style={{ background: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }}
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="text-xs transition-all btn-hover-ghost px-2 py-1 rounded-lg"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}
