"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTimer } from "@/lib/hooks/useTimer";
import { useTimerStore } from "@/lib/stores/timer";
import {
  Plus, CheckCircle2, Circle, Trash2, FolderPlus, Pencil, Check, X, Tag,
  ChevronDown, Play, Target,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Project, Subtask, Task, Tag as TagType, TaskWithTags, UserSettings } from "@/types/database";
import { PomodoroRating } from "@/components/timer/PomodoroRating";

const PROJECT_COLORS = [
  "#ff5fa2", "#b06bf6", "#5fb0ff", "#46c98b",
  "#f2a341", "#ff8fbe", "#8fb6ff", "#c89bff",
];

const TAG_COLORS = [
  "#ff5fa2", "#b06bf6", "#5fb0ff", "#46c98b",
  "#f2a341", "#ff8fbe", "#8fb6ff", "#c89bff",
];

function randomTagColor() {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

const HAIRLINE = "1px solid rgba(255,255,255,0.06)";

/* ─── One-tap Run pill ─────────────────────────────────────────── */
function RunButton({ taskId, onRun }: { taskId: string; onRun: () => void }) {
  const currentTaskId = useTimerStore((s) => s.currentTaskId);
  const status = useTimerStore((s) => s.status);
  const live = currentTaskId === taskId && (status === "running" || status === "paused");

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onRun(); }}
      title="Switch to this task & start the timer"
      className={`pill hover-lift shrink-0 ${live ? "grad-primary" : ""}`}
      style={{
        padding: "8px 15px", fontSize: 13,
        color: live ? "var(--color-on-primary)" : "var(--color-primary)",
        background: live ? undefined : "color-mix(in srgb, var(--color-primary) 13%, transparent)",
        border: live ? "1px solid transparent" : "1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)",
        boxShadow: live ? "0 6px 20px -6px color-mix(in srgb, var(--color-primary) 60%, transparent)" : "none",
      }}
    >
      {live ? (
        <>
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor" }} />
          Running
        </>
      ) : (
        <>
          <Play size={13} /> Run
        </>
      )}
    </button>
  );
}

/* ─── Task row (prototype look) ────────────────────────────────── */
function TaskRow({
  task,
  project,
  subtasks = [],
  onToggleSubtask,
  onToggle,
  onDelete,
  onEdit,
  onRun,
  done = false,
}: {
  task: TaskWithTags;
  project: Project;
  subtasks?: Subtask[];
  onToggleSubtask?: (st: Subtask) => void;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onRun?: () => void;
  done?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const currentTaskId = useTimerStore((s) => s.currentTaskId);
  const isActive = currentTaskId === task.id && !done;
  const est = Math.max(1, Math.ceil(task.estimated_pomodoros ?? 1));
  const subsDone = subtasks.filter((s) => s.done).length;

  return (
    <div
      className="group"
      style={{
        borderRadius: 16, overflow: "hidden",
        border: isActive
          ? "1px solid color-mix(in srgb, var(--color-primary) 32%, transparent)"
          : "1px solid rgba(255,255,255,0.06)",
        background: isActive
          ? "color-mix(in srgb, var(--color-primary) 7%, transparent)"
          : "rgba(255,255,255,0.03)",
        opacity: done ? 0.55 : 1,
      }}
    >
      <div className="flex items-center" style={{ gap: 14, padding: "13px 15px" }}>
        {/* done toggle */}
        <button onClick={onToggle} className="shrink-0" title={done ? "Mark as to-do" : "Mark done"}>
          {done ? (
            <CheckCircle2 size={18} style={{ color: "var(--color-secondary)" }} />
          ) : (
            <Circle size={18} style={{ color: "var(--color-on-surface-variant)" }} />
          )}
        </button>

        {/* icon tile + title + meta */}
        <button
          onClick={() => subtasks.length && setOpen((v) => !v)}
          className="flex items-center text-left flex-1 min-w-0"
          style={{ gap: 13, cursor: subtasks.length ? "pointer" : "default" }}
        >
          <div
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 38, height: 38, borderRadius: 11,
              background: `color-mix(in srgb, ${project.color} 16%, transparent)`,
            }}
          >
            <Target size={18} style={{ color: project.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate"
              style={{
                fontSize: 14.5, fontWeight: 600,
                color: done ? "var(--color-on-surface-variant)" : "var(--color-on-surface)",
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {task.title}
            </p>
            <div className="flex items-center flex-wrap" style={{ gap: 9, marginTop: 4 }}>
              <span className="tabular-nums" style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", opacity: 0.8 }}>
                {task.completed_pomodoros ?? 0}/{est} sessions
              </span>
              {subtasks.length > 0 && (
                <span className="tabular-nums" style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", opacity: 0.8 }}>
                  · {subsDone}/{subtasks.length} subtasks
                </span>
              )}
              {task.notes && (
                <span className="truncate" style={{ fontSize: 11.5, color: "var(--color-on-surface-variant)", opacity: 0.6, maxWidth: 200 }}>
                  · {task.notes}
                </span>
              )}
              {task.tags?.map((tag) => (
                <span
                  key={tag.id}
                  style={{
                    fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                    color: tag.color,
                    background: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
                  }}
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          </div>
        </button>

        {/* session dots */}
        {!done && (
          <div className="hidden sm:flex shrink-0" style={{ gap: 4 }}>
            {Array.from({ length: Math.min(est, 6) }).map((_, i) => (
              <span
                key={i}
                className={i < (task.completed_pomodoros ?? 0) ? "grad-primary" : ""}
                style={{
                  width: 7, height: 7, borderRadius: 99,
                  background: i < (task.completed_pomodoros ?? 0) ? undefined : "rgba(255,255,255,0.13)",
                }}
              />
            ))}
          </div>
        )}

        {!done && onRun && <RunButton taskId={task.id} onRun={onRun} />}

        {subtasks.length > 0 && (
          <button className="icon-btn shrink-0" onClick={() => setOpen((v) => !v)} style={{ width: 30, height: 30 }}>
            <ChevronDown size={15} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .2s" }} />
          </button>
        )}

        {/* hover actions */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onEdit && (
            <button onClick={onEdit} title="Edit task" className="icon-btn" style={{ width: 26, height: 26 }}>
              <Pencil size={13} />
            </button>
          )}
          <button onClick={onDelete} title="Delete task" className="icon-btn" style={{ width: 26, height: 26, color: "var(--color-error)" }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* expanded subtasks */}
      {open && subtasks.length > 0 && (
        <div className="flex flex-col" style={{ padding: "2px 15px 13px 80px", gap: 1 }}>
          {subtasks.map((st) => (
            <button
              key={st.id}
              onClick={() => onToggleSubtask?.(st)}
              disabled={!onToggleSubtask}
              className="flex items-center text-left rounded-lg transition-colors hover:bg-white/5"
              style={{ gap: 10, padding: "6px 8px" }}
            >
              {st.done ? (
                <CheckCircle2 size={15} className="shrink-0" style={{ color: "var(--color-primary)" }} />
              ) : (
                <Circle size={15} className="shrink-0" style={{ color: "var(--color-on-surface-variant)" }} />
              )}
              <span
                style={{
                  fontSize: 13,
                  color: st.done ? "var(--color-on-surface-variant)" : "var(--color-on-surface)",
                  textDecoration: st.done ? "line-through" : "none",
                }}
              >
                {st.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Subtask list editor (add/edit forms) ─────────────────────── */
function SubtaskListEditor({
  subs,
  onChange,
}: {
  subs: { title: string; done: boolean }[];
  onChange: (subs: { title: string; done: boolean }[]) => void;
}) {
  const [input, setInput] = useState("");

  function addSub() {
    const title = input.trim();
    if (!title) return;
    onChange([...subs, { title, done: false }]);
    setInput("");
  }

  return (
    <div className="space-y-1">
      {subs.map((st, i) => (
        <div key={i} className="flex items-center gap-2 group/sub">
          <button
            onClick={() => onChange(subs.map((s, j) => (j === i ? { ...s, done: !s.done } : s)))}
            className="shrink-0"
          >
            {st.done ? (
              <CheckCircle2 size={13} style={{ color: "var(--color-secondary)" }} />
            ) : (
              <Circle size={13} style={{ color: "var(--color-on-surface-variant)" }} />
            )}
          </button>
          <span
            className="flex-1 text-xs truncate"
            style={{
              color: st.done ? "var(--color-on-surface-variant)" : "var(--color-on-surface)",
              textDecoration: st.done ? "line-through" : "none",
            }}
          >
            {st.title}
          </span>
          <button
            onClick={() => onChange(subs.filter((_, j) => j !== i))}
            className="opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0"
            style={{ color: "var(--color-error)" }}
            title="Remove subtask"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Plus size={13} style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add subtask… (Enter)"
          className="flex-1 bg-transparent text-xs outline-none py-0.5"
          style={{ color: "var(--color-on-surface)" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              addSub();
            }
          }}
        />
      </div>
    </div>
  );
}

/* ─── Inline task form (used for add + edit) ───────────────────── */
interface TaskFormState {
  title: string;
  desc: string;
  pomos: number;
  subs: { title: string; done: boolean }[];
  chips: TagType[];
}

function TaskForm({
  state,
  setState,
  tags,
  settings,
  submitLabel,
  onSubmit,
  onCancel,
  onCreateTag,
}: {
  state: TaskFormState;
  setState: (s: TaskFormState) => void;
  tags: TagType[];
  settings: UserSettings | null | undefined;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  onCreateTag: (name: string) => Promise<TagType | null>;
}) {
  const [tagQuery, setTagQuery] = useState("");
  const [showSugs, setShowSugs] = useState(false);
  const sugRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (sugRef.current && !sugRef.current.contains(e.target as Node) && inputRef.current !== e.target) {
        setShowSugs(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const suggestions = tags.filter(
    (t) => t.name.startsWith(tagQuery) && !state.chips.find((c) => c.id === t.id),
  );
  const canCreate =
    tagQuery.length > 0 &&
    !tags.find((t) => t.name === tagQuery) &&
    !state.chips.find((t) => t.name === tagQuery);

  function handleTitleChange(val: string) {
    const match = val.match(/#(\w*)$/);
    if (match) {
      setTagQuery(match[1].toLowerCase());
      setShowSugs(true);
    } else {
      setShowSugs(false);
      setTagQuery("");
    }
    setState({ ...state, title: val });
  }

  function selectSuggestion(tag: TagType) {
    setShowSugs(false);
    setTagQuery("");
    setState({
      ...state,
      title: state.title.replace(/#\w*$/, "").trimEnd(),
      chips: state.chips.find((c) => c.id === tag.id) ? state.chips : [...state.chips, tag],
    });
  }

  async function createAndSelect() {
    if (!tagQuery) return;
    const existing = tags.find((t) => t.name === tagQuery);
    if (existing) { selectSuggestion(existing); return; }
    const created = await onCreateTag(tagQuery);
    if (created) selectSuggestion(created);
  }

  return (
    <div
      className="rounded-2xl flex flex-col"
      style={{
        gap: 10, padding: "13px 15px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)",
      }}
    >
      <div className="relative">
        <div className="flex items-center gap-3">
          <Circle size={18} style={{ color: "var(--color-on-surface-variant)" }} />
          <input
            ref={inputRef}
            autoFocus
            value={state.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Task title… or type #tag"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-on-surface)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !showSugs && state.title.trim()) onSubmit();
              if (e.key === "Escape") {
                if (showSugs) setShowSugs(false);
                else onCancel();
              }
            }}
          />
        </div>

        <AnimatePresence>
          {showSugs && (suggestions.length > 0 || canCreate) && (
            <motion.div
              ref={sugRef}
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
              {suggestions.map((tag) => (
                <button
                  key={tag.id}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(tag); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5"
                  style={{ color: "var(--color-on-surface)" }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tag.color }} />
                  #{tag.name}
                </button>
              ))}
              {canCreate && (
                <button
                  onMouseDown={(e) => { e.preventDefault(); createAndSelect(); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5"
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

      {state.chips.length > 0 && (
        <div className="flex items-center gap-1.5 pl-7 flex-wrap">
          {state.chips.map((tag) => (
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
              <button onClick={() => setState({ ...state, chips: state.chips.filter((t) => t.id !== tag.id) })}>
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pl-7">
        <textarea
          value={state.desc}
          onChange={(e) => setState({ ...state, desc: e.target.value })}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-transparent text-xs outline-none resize-none rounded-lg px-2 py-1.5"
          style={{ color: "var(--color-on-surface)", border: HAIRLINE }}
        />
      </div>

      <div className="pl-7">
        <SubtaskListEditor subs={state.subs} onChange={(subs) => setState({ ...state, subs })} />
      </div>

      <div className="flex items-center justify-between pl-7">
        <PomodoroRating
          value={state.pomos}
          onChange={(pomos) => setState({ ...state, pomos })}
          pomoDurationSec={settings?.focus_duration_sec ?? 25 * 60}
          shortBreakSec={settings?.short_break_sec ?? 5 * 60}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => state.title.trim() && onSubmit()}
            className="pill grad-primary text-xs px-4 py-1.5 font-semibold transition-all btn-hover-primary"
            style={{ color: "var(--color-on-primary)" }}
          >
            {submitLabel}
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
    </div>
  );
}

const EMPTY_FORM: TaskFormState = { title: "", desc: "", pomos: 1, subs: [], chips: [] };

/* ─── Project card ─────────────────────────────────────────────── */
function ProjectCard({
  project,
  tags,
  settings,
  onRun,
  onCreateTag,
}: {
  project: Project;
  tags: TagType[];
  settings: UserSettings | null | undefined;
  onRun: (task: TaskWithTags) => void;
  onCreateTag: (name: string) => Promise<TagType | null>;
}) {
  const supabase = createClient();
  const qc = useQueryClient();

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<TaskFormState>(EMPTY_FORM);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TaskFormState>(EMPTY_FORM);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [showDone, setShowDone] = useState(false);

  const { data: tasks = [] } = useQuery<TaskWithTags[]>({
    queryKey: ["tasks", project.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, task_tags(tag_id, tags(id, name, color))")
        .eq("project_id", project.id)
        .order("sort_order");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((t: any) => ({
        ...t,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tags: (t.task_tags ?? []).map((tt: any) => tt.tags).filter(Boolean),
      })) as TaskWithTags[];
    },
  });

  const taskIds = tasks.map((t) => t.id);
  const { data: subtasksByTask = {} } = useQuery<Record<string, Subtask[]>>({
    queryKey: ["subtasks-by-task", project.id, taskIds.join(",")],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("subtasks")
        .select("*")
        .in("task_id", taskIds)
        .order("sort_order");
      const grouped: Record<string, Subtask[]> = {};
      for (const st of (data ?? []) as Subtask[]) {
        (grouped[st.task_id] ??= []).push(st);
      }
      return grouped;
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["tasks", project.id] });
    qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
    qc.invalidateQueries({ queryKey: ["subtasks-by-task"] });
    qc.invalidateQueries({ queryKey: ["subtasks"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
  }

  /** Resolve inline #tags + chips into tag ids, creating new tags as needed. */
  async function resolveTags(form: TaskFormState, userId: string) {
    const hashTagNames = (form.title.match(/#(\w+)/g) ?? []).map((m) => m.slice(1).toLowerCase());
    const cleanTitle = form.title.replace(/#\w+/g, "").trim() || form.title.trim();
    const chipIds = new Set(form.chips.map((t) => t.id));
    const resolved: string[] = [...chipIds];
    for (const name of hashTagNames) {
      const existing = tags.find((t) => t.name === name);
      if (existing) {
        if (!chipIds.has(existing.id)) resolved.push(existing.id);
      } else {
        const { data: created } = await supabase
          .from("tags")
          .insert({ user_id: userId, name, color: randomTagColor() })
          .select("id")
          .single();
        if (created) resolved.push(created.id);
      }
    }
    return { cleanTitle, tagIds: resolved };
  }

  const addTask = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { cleanTitle, tagIds } = await resolveTags(addForm, user!.id);

      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          title: cleanTitle,
          notes: addForm.desc.trim() || null,
          project_id: project.id,
          user_id: user!.id,
          sort_order: tasks.length,
          estimated_pomodoros: addForm.pomos,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (addForm.subs.length > 0) {
        await supabase.from("subtasks").insert(
          addForm.subs.map((st, i) => ({
            task_id: task.id, user_id: user!.id, title: st.title, done: st.done, sort_order: i,
          }))
        );
      }
      if (tagIds.length > 0) {
        await supabase.from("task_tags").insert(tagIds.map((tagId) => ({ task_id: task.id, tag_id: tagId })));
      }
    },
    onSuccess: () => {
      invalidate();
      setAddForm(EMPTY_FORM);
      setAdding(false);
    },
    onError: () => toast.error("Failed to add task"),
  });

  const updateTask = useMutation({
    mutationFn: async () => {
      if (!editingTaskId) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { cleanTitle, tagIds } = await resolveTags(editForm, user!.id);

      const { error } = await supabase
        .from("tasks")
        .update({ title: cleanTitle, notes: editForm.desc.trim() || null, estimated_pomodoros: editForm.pomos })
        .eq("id", editingTaskId);
      if (error) throw error;

      await supabase.from("subtasks").delete().eq("task_id", editingTaskId);
      if (editForm.subs.length > 0) {
        await supabase.from("subtasks").insert(
          editForm.subs.map((st, i) => ({
            task_id: editingTaskId, user_id: user!.id, title: st.title, done: st.done, sort_order: i,
          }))
        );
      }

      await supabase.from("task_tags").delete().eq("task_id", editingTaskId);
      if (tagIds.length > 0) {
        await supabase.from("task_tags").insert(tagIds.map((tagId) => ({ task_id: editingTaskId, tag_id: tagId })));
      }
    },
    onSuccess: () => {
      invalidate();
      setEditingTaskId(null);
      setEditForm(EMPTY_FORM);
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
    onSuccess: invalidate,
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const toggleSubtask = useMutation({
    mutationFn: async (st: Subtask) => {
      const { error } = await supabase.from("subtasks").update({ done: !st.done }).eq("id", st.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subtasks-by-task"] });
      qc.invalidateQueries({ queryKey: ["subtasks"] });
    },
  });

  const renameProject = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("projects").update({ name }).eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
      setRenaming(false);
    },
    onError: () => toast.error("Failed to rename project"),
  });

  const deleteProject = useMutation({
    mutationFn: async () => {
      await supabase.from("tasks").delete().eq("project_id", project.id);
      const { error } = await supabase.from("projects").delete().eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
      toast.success("Project deleted");
    },
    onError: () => toast.error("Failed to delete project"),
  });

  function startEditing(task: TaskWithTags) {
    setEditingTaskId(task.id);
    setEditForm({
      title: task.title,
      desc: task.notes ?? "",
      pomos: task.estimated_pomodoros ?? 1,
      subs: (subtasksByTask[task.id] ?? []).map((st) => ({ title: st.title, done: st.done })),
      chips: task.tags ?? [],
    });
  }

  const todo = tasks.filter((t) => t.status === "todo");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="glass group/card" style={{ borderRadius: 22, padding: 18 }}>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 11, marginBottom: 14 }}>
        <span
          className="shrink-0"
          style={{ width: 11, height: 11, borderRadius: 99, background: project.color, boxShadow: `0 0 12px ${project.color}` }}
        />
        {renaming ? (
          <>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="bg-transparent outline-none flex-1"
              style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: "var(--color-on-surface)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim()) renameProject.mutate(renameValue.trim());
                if (e.key === "Escape") setRenaming(false);
              }}
            />
            <button onClick={() => renameValue.trim() && renameProject.mutate(renameValue.trim())} style={{ color: "var(--color-primary)" }}>
              <Check size={15} />
            </button>
            <button onClick={() => setRenaming(false)} style={{ color: "var(--color-on-surface-variant)" }}>
              <X size={15} />
            </button>
          </>
        ) : (
          <>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: "var(--color-on-surface)" }}>
              {project.name}
            </h2>
            <span className="tabular-nums" style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.7 }}>
              {todo.length} {todo.length === 1 ? "task" : "tasks"}
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
              <button
                onClick={() => { setRenaming(true); setRenameValue(project.name); }}
                className="icon-btn" style={{ width: 28, height: 28 }} title="Rename project"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => deleteProject.mutate()}
                className="icon-btn" style={{ width: 28, height: 28, color: "var(--color-error)" }} title="Delete project"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tasks */}
      <div className="flex flex-col" style={{ gap: 9 }}>
        {todo.map((task) =>
          editingTaskId === task.id ? (
            <TaskForm
              key={task.id}
              state={editForm}
              setState={setEditForm}
              tags={tags}
              settings={settings}
              submitLabel="Save"
              onSubmit={() => updateTask.mutate()}
              onCancel={() => { setEditingTaskId(null); setEditForm(EMPTY_FORM); }}
              onCreateTag={onCreateTag}
            />
          ) : (
            <TaskRow
              key={task.id}
              task={task}
              project={project}
              subtasks={subtasksByTask[task.id] ?? []}
              onToggleSubtask={(st) => toggleSubtask.mutate(st)}
              onToggle={() => toggleTask.mutate(task)}
              onDelete={() => deleteTask.mutate(task.id)}
              onEdit={() => startEditing(task)}
              onRun={() => onRun(task)}
            />
          ),
        )}

        {/* Add task */}
        {adding ? (
          <TaskForm
            state={addForm}
            setState={setAddForm}
            tags={tags}
            settings={settings}
            submitLabel="Add"
            onSubmit={() => addTask.mutate()}
            onCancel={() => { setAdding(false); setAddForm(EMPTY_FORM); }}
            onCreateTag={onCreateTag}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center rounded-2xl transition-all btn-hover-surface"
            style={{
              gap: 12, padding: "11px 15px", fontSize: 13,
              color: "var(--color-on-surface-variant)",
              border: "1px dashed rgba(255,255,255,0.14)",
              background: "transparent",
            }}
          >
            <Plus size={15} />
            Add a task…
          </button>
        )}

        {/* Completed */}
        {done.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <button
              onClick={() => setShowDone((v) => !v)}
              className="flex items-center"
              style={{ gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-on-surface-variant)", opacity: 0.7, padding: "4px 2px" }}
            >
              Completed ({done.length})
              <ChevronDown size={12} style={{ transform: showDone ? "none" : "rotate(-90deg)", transition: "transform .2s" }} />
            </button>
            {showDone && (
              <div className="flex flex-col" style={{ gap: 9, marginTop: 8 }}>
                {done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    project={project}
                    subtasks={subtasksByTask[task.id] ?? []}
                    onToggle={() => toggleTask.mutate(task)}
                    onDelete={() => deleteTask.mutate(task.id)}
                    done
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────── */
export default function ProjectsPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const router = useRouter();
  const timer = useTimer();

  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [deleteTagConfirm, setDeleteTagConfirm] = useState<TagType | null>(null);

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
      setNewProjectName("");
      setAddingProject(false);
      toast.success(`Project "${p.name}" created`);
    },
    onError: () => toast.error("Failed to create project"),
  });

  const deleteTag = useMutation({
    mutationFn: async (tag: TagType) => {
      await supabase.from("task_tags").delete().eq("tag_id", tag.id);
      const { error } = await supabase.from("tags").delete().eq("id", tag.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      setDeleteTagConfirm(null);
      toast.success("Tag deleted");
    },
    onError: () => toast.error("Failed to delete tag"),
  });

  async function createTag(name: string): Promise<TagType | null> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: created, error } = await supabase
      .from("tags")
      .insert({ user_id: user!.id, name: name.toLowerCase(), color: randomTagColor() })
      .select()
      .single();
    if (error) { toast.error("Failed to create tag"); return null; }
    qc.invalidateQueries({ queryKey: ["tags"] });
    return created as TagType;
  }

  // One-tap Run: switch the active task and start a pomodoro, even if a
  // session is already running (the old one is closed out cleanly first).
  async function runTask(task: TaskWithTags) {
    if (timer.status === "running" || timer.status === "paused") {
      await timer.resetSession();
    }
    await timer.startSession({
      mode: "pomodoro",
      durationSec: settings?.focus_duration_sec ?? 25 * 60,
      taskId: task.id,
      projectId: task.project_id,
    });
    router.push("/focus");
  }

  const totalOpenHint = projects.length > 0
    ? `Open tasks across ${projects.length} ${projects.length === 1 ? "project" : "projects"} · hit `
    : "Create a project to get started · hit ";

  return (
    <div className="min-h-dvh flex justify-center" style={{ padding: "104px 20px 60px" }}>
      <div className="fade-up w-full" style={{ maxWidth: 880 }}>
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap" style={{ gap: 16, marginBottom: 22 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", color: "var(--color-on-surface)" }}>
              Projects
            </h1>
            <p style={{ fontSize: 14, color: "var(--color-on-surface-variant)", marginTop: 4 }}>
              {totalOpenHint}
              <strong style={{ color: "var(--color-primary)" }}>Run</strong> to jump straight into focus.
            </p>
          </div>
          <button
            onClick={() => setAddingProject(true)}
            className="pill glass-soft hover-lift"
            style={{ padding: "10px 16px", fontSize: 13.5, color: "var(--color-on-surface)" }}
          >
            <Plus size={16} /> New project
          </button>
        </div>

        {/* Tag strip */}
        {(tags.length > 0 || deleteTagConfirm) && (
          <div style={{ marginBottom: 18 }}>
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
                  <button onClick={() => setDeleteTagConfirm(null)} className="shrink-0" style={{ color: "var(--color-on-surface-variant)" }}>
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
            </div>
          </div>
        )}

        {/* New project form */}
        <AnimatePresence>
          {addingProject && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              style={{ marginBottom: 18 }}
            >
              <div className="glass" style={{ borderRadius: 22, padding: 18 }}>
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full bg-transparent outline-none mb-4"
                  style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: "var(--color-on-surface)" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newProjectName.trim()) addProject.mutate();
                    if (e.key === "Escape") setAddingProject(false);
                  }}
                />
                <div className="flex items-center justify-between flex-wrap" style={{ gap: 12 }}>
                  <div className="flex gap-1.5 flex-wrap">
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
                      className="pill grad-primary text-xs px-4 py-1.5 font-semibold btn-hover-primary"
                      style={{ color: "var(--color-on-primary)" }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setAddingProject(false)}
                      className="text-xs btn-hover-ghost px-3 py-1.5 rounded-lg"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Project cards */}
        {projects.length === 0 && !addingProject ? (
          <div className="flex flex-col items-center justify-center gap-4" style={{ padding: "80px 0" }}>
            <FolderPlus size={40} style={{ color: "var(--color-outline)" }} />
            <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
              Create a project to get started.
            </p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 18 }}>
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                tags={tags}
                settings={settings}
                onRun={runTask}
                onCreateTag={createTag}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
