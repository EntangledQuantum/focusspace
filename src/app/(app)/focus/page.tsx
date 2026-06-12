"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTimer } from "@/lib/hooks/useTimer";
import { useTimerStore } from "@/lib/stores/timer";
import { useUiStore } from "@/lib/stores/ui";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { TimerRing } from "@/components/timer/TimerRing";
import { TimerControls } from "@/components/timer/TimerControls";
import { TaskPicker } from "@/components/timer/TaskPicker";
import { FocusDock } from "@/components/timer/FocusDock";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Project, Subtask, TaskWithTags } from "@/types/database";

export default function FocusPage() {
  const supabase = createClient();
  const qc = useQueryClient();

  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskWithTags | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [customMinutes, setCustomMinutes] = useState(45);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Prevents duplicate auto-start on settings load when timer was already completed
  const autoStartHandled = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isFs = () => !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    const handler = () => setIsFullscreen(isFs());
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = document as any;
      const el = document.documentElement as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      }
    } catch {
      // fullscreen blocked by browser policy — silently ignore
    }
  }

  const { data: settings } = useQuery<import("@/types/database").UserSettings | null>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return (data as import("@/types/database").UserSettings | null) ?? null;
    },
  });

  // Always-fresh ref — avoids stale closures inside timer callbacks
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const timer = useTimer();
  const { requestPermission, notifyCompletion } = useNotifications(settings ?? null);

  const pomoDurationSec = settings?.focus_duration_sec ?? 25 * 60;
  const longBreakEvery = settings?.long_break_every ?? 4;

  const isBreak = timer.mode === "short_break" || timer.mode === "long_break";

  // Subtasks for the active task — checkable right from the dock
  const { data: subtasks = [] } = useQuery<Subtask[]>({
    queryKey: ["subtasks", activeTask?.id],
    enabled: !!activeTask,
    queryFn: async () => {
      const { data } = await supabase
        .from("subtasks")
        .select("*")
        .eq("task_id", activeTask!.id)
        .order("sort_order");
      return (data ?? []) as Subtask[];
    },
  });

  // Esc exits focus mode
  const { focusMode, setFocusMode } = useUiStore();
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFocusMode(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, setFocusMode]);

  async function toggleSubtask(st: Subtask) {
    await supabase.from("subtasks").update({ done: !st.done }).eq("id", st.id);
    qc.invalidateQueries({ queryKey: ["subtasks", activeTask?.id] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  // On mount: restore task/project that were active when the browser was closed
  useEffect(() => {
    const { currentTaskId, currentProjectId } = useTimerStore.getState();
    if (!currentTaskId) return;
    (async () => {
      const { data: task } = await supabase
        .from("tasks")
        .select("*, task_tags(tag_id, tags(id, name, color))")
        .eq("id", currentTaskId)
        .maybeSingle();
      if (task) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = task as any;
        setActiveTask({
          ...t,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tags: (t.task_tags ?? []).map((tt: any) => tt.tags).filter(Boolean),
        } as TaskWithTags);
      }
      if (currentProjectId) {
        const { data: project } = await supabase
          .from("projects").select("*").eq("id", currentProjectId).maybeSingle();
        if (project) setActiveProject(project as Project);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On settings load: if timer was completed when browser closed and auto_start_breaks
  // is enabled, kick off the break that never fired (settings weren't loaded at the time).
  useEffect(() => {
    if (!settings || autoStartHandled.current) return;
    autoStartHandled.current = true;
    const state = useTimerStore.getState();
    if (
      state.status === "completed" &&
      state.mode !== "short_break" &&
      state.mode !== "long_break" &&
      settings.auto_start_breaks
    ) {
      const isLong = state.pomodoroCount % (settings.long_break_every ?? 4) === 0;
      const nextMode = isLong ? "long_break" : "short_break";
      const nextDur = isLong
        ? (settings.long_break_sec ?? 15 * 60)
        : (settings.short_break_sec ?? 5 * 60);
      setTimeout(() => {
        timer.startSession({ mode: nextMode, durationSec: nextDur });
      }, 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const handleSessionComplete = useCallback(async () => {
    await timer.completeSession();
    const label = isBreak ? "Break complete — back to work!" : "Session complete! Great focus.";
    notifyCompletion(label, activeTask?.title ?? "");
    toast.success(label);

    // Immediately update local task completed count so timeline reflects it
    if (!isBreak && activeTask) {
      setActiveTask((prev) =>
        prev ? { ...prev, completed_pomodoros: (prev.completed_pomodoros ?? 0) + 1 } : prev
      );
    }

    // Use ref so we always read the latest settings even if query hadn't resolved at tick time
    const s = settingsRef.current;
    if (!isBreak && s?.auto_start_breaks) {
      const lbe = s.long_break_every ?? 4;
      // Cycle position is task-relative when a task is active (matches the
      // timeline); otherwise use the global session count from the store.
      const completedInCycle = activeTask
        ? (activeTask.completed_pomodoros ?? 0) + 1
        : useTimerStore.getState().pomodoroCount;
      const isLong = completedInCycle % lbe === 0;
      const nextMode = isLong ? "long_break" : "short_break";
      const nextDur = isLong ? (s.long_break_sec ?? 15 * 60) : (s.short_break_sec ?? 5 * 60);
      setTimeout(() => {
        timer.startSession({ mode: nextMode, durationSec: nextDur });
      }, 600);
    } else if (isBreak && s?.auto_start_pomodoros && activeTask) {
      // After a break, auto-start the next pomodoro if the task still has work left
      const estimated = activeTask.estimated_pomodoros ?? 1;
      const completed = activeTask.completed_pomodoros ?? 0;
      if (completed < Math.ceil(estimated)) {
        const totalSessions = Math.ceil(estimated);
        const isHalfLast = estimated % 1 === 0.5;
        const isLastSession = completed === totalSessions - 1;
        const dur = isLastSession && isHalfLast
          ? Math.round(pomoDurationSec / 2)
          : pomoDurationSec;
        setTimeout(() => {
          timer.startSession({
            mode: "pomodoro",
            durationSec: dur,
            taskId: activeTask.id,
            projectId: activeProject?.id,
          });
        }, 600);
      }
    }
  }, [timer, isBreak, activeTask, activeProject, notifyCompletion, pomoDurationSec]);

  useEffect(() => {
    timer.setOnComplete(handleSessionComplete);
  }, [timer.setOnComplete, handleSessionComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePlayPause() {
    if (timer.status === "idle" || timer.status === "completed") {
      // If a break just completed, clicking play starts the next focus session — not another break
      const effectiveMode = isBreak ? "pomodoro" : timer.mode;

      let dur: number;
      if (effectiveMode === "custom") {
        dur = customMinutes * 60;
      } else {
        // Detect if this is the last half-session for a fractional task estimate
        const estimated = activeTask?.estimated_pomodoros ?? 1;
        const completed = activeTask?.completed_pomodoros ?? 0;
        const totalSessions = Math.ceil(estimated);
        const isHalfLast = estimated % 1 === 0.5;
        const isLastSession = completed === totalSessions - 1;
        dur = isLastSession && isHalfLast ? Math.round(pomoDurationSec / 2) : pomoDurationSec;
      }

      timer.startSession({
        mode: effectiveMode,
        durationSec: dur,
        taskId: activeTask?.id,
        projectId: activeProject?.id,
      });
      requestPermission();
    } else if (timer.status === "running") {
      timer.pause();
    } else if (timer.status === "paused") {
      timer.resume();
    }
  }

  async function handleSkip() {
    await timer.skipSession();
    toast("Session skipped");
  }

  async function handleReset() {
    await timer.resetSession();
  }

  async function handleFinishTask() {
    if (!activeTask) return;
    await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", activeTask.id);
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });

    const { data: candidatesData } = await supabase
      .from("tasks")
      .select("*, task_tags(tag_id, tags(id, name, color))")
      .eq("status", "todo")
      .neq("id", activeTask.id)
      .order("sort_order")
      .limit(20);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = (candidatesData ?? []) as any[];

    const next =
      candidates.find((t) => t.project_id === activeTask.project_id) ??
      candidates[0] ??
      null;

    if (next) {
      let nextProject: Project | null = null;
      if (next.project_id) {
        const { data: p } = await supabase
          .from("projects").select("*").eq("id", next.project_id).single();
        nextProject = p ?? null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = next as any;
      setActiveTask({
        ...n,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tags: (n.task_tags ?? []).map((tt: any) => tt.tags).filter(Boolean),
      } as TaskWithTags);
      setActiveProject(nextProject);
      toast.success(`Done! Now: ${next.title}`);
    } else {
      setActiveTask(null);
      setActiveProject(null);
      toast.success("Task complete! No more tasks.");
    }
  }

  function selectTask(task: TaskWithTags, project: Project | null) {
    setActiveTask(task);
    setActiveProject(project);
    if (timer.status === "idle" || timer.status === "completed") {
      toast.success(`Ready: ${task.title}`);
    }
  }

  useKeyboardShortcuts({ onPlayPause: handlePlayPause, onReset: handleReset, onSkip: handleSkip });

  const locked = timer.status === "running" || timer.status === "paused";

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center"
      style={{ padding: "88px 20px 234px" }}
    >
      {/* Solo centered timer — ring, task name, controls. Nothing else. */}
      <div className="fade-up flex flex-col items-center" style={{ gap: 20 }}>
        {/* Mode pills */}
        <div className="glass-soft flex rounded-full" style={{ gap: 3, padding: 4 }}>
          {(["pomodoro", "custom"] as const).map((m) => {
            const on = timer.mode === m || (isBreak && m === "pomodoro");
            return (
              <button
                key={m}
                disabled={locked}
                onClick={() => {
                  if (!locked) {
                    timer.setMode(m, m === "custom" ? customMinutes * 60 : pomoDurationSec);
                  }
                }}
                className="pill"
                style={{
                  padding: "6px 16px", fontSize: 12.5,
                  opacity: locked ? 0.5 : 1, cursor: locked ? "default" : "pointer",
                  color: on ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                  background: on ? "color-mix(in srgb, var(--color-primary) 15%, transparent)" : "transparent",
                }}
              >
                {m === "pomodoro" ? "Pomodoro" : "Custom"}
              </button>
            );
          })}
        </div>

        {/* Timer ring */}
        <TimerRing
          progress={timer.progress}
          displayTime={timer.displayTime}
          status={timer.status}
        />

        {/* Task name — the only thing beside the timer */}
        <div className="flex flex-col items-center text-center" style={{ gap: 10 }}>
          {activeProject && (
            <span
              className="pill uppercase"
              style={{
                padding: "4px 12px", fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
                color: activeProject.color,
                background: `color-mix(in srgb, ${activeProject.color} 14%, transparent)`,
                border: `1px solid color-mix(in srgb, ${activeProject.color} 26%, transparent)`,
              }}
            >
              {activeProject.name}
            </span>
          )}

          <button
            onClick={() => setTaskPickerOpen(true)}
            className="hover-lift flex items-center"
            style={{ gap: 10, padding: "4px 8px", borderRadius: 12 }}
          >
            <span
              className="break-words"
              style={{
                fontFamily: "var(--font-display)", fontSize: 23, fontWeight: 700,
                letterSpacing: "-.01em", maxWidth: 440,
                color: activeTask ? "var(--color-on-surface)" : "var(--color-on-surface-variant)",
              }}
            >
              {activeTask ? activeTask.title : "Choose a task to focus on"}
            </span>
            <Pencil size={15} className="shrink-0" style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }} />
          </button>

          {activeTask && activeTask.tags && activeTask.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {activeTask.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium leading-none"
                  style={{
                    background: `color-mix(in srgb, ${tag.color} 18%, transparent)`,
                    color: tag.color,
                    border: `1px solid color-mix(in srgb, ${tag.color} 28%, transparent)`,
                  }}
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Break badge */}
          {isBreak && (timer.status === "running" || timer.status === "paused") && (
            <span className="pill chip-accent" style={{ padding: "4px 14px", fontSize: 12 }}>
              <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--color-secondary)" }} />
              {timer.mode === "long_break" ? "Long break" : "Short break"}
            </span>
          )}

          {/* Custom duration input */}
          {timer.mode === "custom" && (timer.status === "idle" || timer.status === "completed") && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={240}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 text-center rounded-xl px-2 py-1 text-sm outline-none"
                style={{
                  background: "var(--color-surface-container-high)",
                  color: "var(--color-on-surface)",
                  border: "1px solid var(--color-outline-variant)",
                }}
              />
              <span className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>min</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <TimerControls
          status={timer.status}
          onPlayPause={handlePlayPause}
          onReset={handleReset}
          onSkip={handleSkip}
          disabled={false}
        />
      </div>

      {/* Bottom dock: subtasks · session timeline · music */}
      <FocusDock
        activeTask={activeTask}
        subtasks={subtasks}
        onToggleSubtask={toggleSubtask}
        onFinishTask={handleFinishTask}
        estimated={activeTask?.estimated_pomodoros ?? 1}
        completed={activeTask?.completed_pomodoros ?? 0}
        progress={timer.progress}
        timerStatus={timer.status}
        timerMode={timer.mode}
        longBreakEvery={longBreakEvery}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      <TaskPicker
        open={taskPickerOpen}
        onClose={() => setTaskPickerOpen(false)}
        onSelect={selectTask}
      />
    </div>
  );
}
