"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTimer } from "@/lib/hooks/useTimer";
import { useTimerStore } from "@/lib/stores/timer";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { TimerRing } from "@/components/timer/TimerRing";
import { TimerControls } from "@/components/timer/TimerControls";
import { TaskPicker } from "@/components/timer/TaskPicker";
import { PomodoroTimeline } from "@/components/timer/PomodoroTimeline";
import { motion } from "framer-motion";
import { Pencil, Maximize2, Minimize2, Check } from "lucide-react";
import { SpotifyPanel } from "@/components/spotify/SpotifyPanel";
import { toast } from "sonner";
import type { Task, Project } from "@/types/database";

export default function FocusPage() {
  const supabase = createClient();
  const qc = useQueryClient();

  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
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
  const shortBreakSec = settings?.short_break_sec ?? 5 * 60;
  const longBreakSec = settings?.long_break_sec ?? 15 * 60;
  const longBreakEvery = settings?.long_break_every ?? 4;

  const isBreak = timer.mode === "short_break" || timer.mode === "long_break";

  // On mount: restore task/project that were active when the browser was closed
  useEffect(() => {
    const { currentTaskId, currentProjectId } = useTimerStore.getState();
    if (!currentTaskId) return;
    (async () => {
      const { data: task } = await supabase
        .from("tasks").select("*").eq("id", currentTaskId).maybeSingle();
      if (task) setActiveTask(task as Task);
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

  timer.onCompleteRef.current = useCallback(async () => {
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
      // Read fresh count from store — completeSession() increments it synchronously
      const freshCount = useTimerStore.getState().pomodoroCount;
      const lbe = s.long_break_every ?? 4;
      const isLong = freshCount % lbe === 0;
      const nextMode = isLong ? "long_break" : "short_break";
      const nextDur = isLong ? (s.long_break_sec ?? 15 * 60) : (s.short_break_sec ?? 5 * 60);
      setTimeout(() => {
        timer.startSession({ mode: nextMode, durationSec: nextDur });
      }, 600);
    }
  }, [timer, isBreak, activeTask, notifyCompletion]);

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

    const { data: candidates } = await supabase
      .from("tasks")
      .select("*")
      .eq("status", "todo")
      .neq("id", activeTask.id)
      .order("sort_order")
      .limit(20);

    const next =
      candidates?.find((t) => t.project_id === activeTask.project_id) ??
      candidates?.[0] ??
      null;

    if (next) {
      let nextProject: Project | null = null;
      if (next.project_id) {
        const { data: p } = await supabase
          .from("projects").select("*").eq("id", next.project_id).single();
        nextProject = p ?? null;
      }
      setActiveTask(next as Task);
      setActiveProject(nextProject);
      toast.success(`Done! Now: ${next.title}`);
    } else {
      setActiveTask(null);
      setActiveProject(null);
      toast.success("Task complete! No more tasks.");
    }
  }

  function selectTask(task: Task, project: Project | null) {
    setActiveTask(task);
    setActiveProject(project);
    if (timer.status === "idle" || timer.status === "completed") {
      toast.success(`Ready: ${task.title}`);
    }
  }

  useKeyboardShortcuts({ onPlayPause: handlePlayPause, onReset: handleReset, onSkip: handleSkip });

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-dvh relative">
      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
        style={{ color: "var(--color-on-surface-variant)", background: "rgba(255,255,255,0.04)" }}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>

      {/* Mode toggle */}
      <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
        {(["pomodoro", "custom"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              if (timer.status === "idle" || timer.status === "completed") {
                timer.setMode(m, m === "custom" ? customMinutes * 60 : pomoDurationSec);
              }
            }}
            className="px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200"
            style={{
              background: timer.mode === m ? "rgba(255,255,255,0.08)" : "transparent",
              color: timer.mode === m ? "var(--color-primary)" : "var(--color-on-surface-variant)",
              border: timer.mode === m ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
            }}
          >
            {m === "pomodoro" ? "Pomodoro" : "Custom Target"}
          </button>
        ))}
      </div>

      {/* Main glass card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="glass rounded-[2rem] p-10 flex flex-col items-center gap-8 relative overflow-hidden w-full max-w-[420px]"
      >
        {/* Subtle inner ring */}
        <div
          className="absolute inset-0 rounded-[2rem] pointer-events-none"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
        />

        {/* Task context */}
        <div className="flex flex-col items-center gap-3 text-center">
          {activeProject && (
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
              style={{
                background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                color: "var(--color-primary)",
                border: "1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)",
              }}
            >
              {activeProject.name}
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTaskPickerOpen(true)}
              className="flex items-center gap-2 max-w-[260px] group"
            >
              {activeTask ? (
                <h2
                  className="text-xl font-semibold leading-snug text-center"
                  style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}
                >
                  {activeTask.title}
                </h2>
              ) : (
                <span className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                  Choose a task to focus on…
                </span>
              )}
              <Pencil
                size={13}
                className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
                style={{ color: "var(--color-on-surface-variant)" }}
              />
            </button>
            {activeTask && (
              <button
                onClick={handleFinishTask}
                title="Mark done & load next task"
                className="w-6 h-6 flex items-center justify-center rounded-full transition-all active:scale-90 shrink-0"
                style={{
                  background: "color-mix(in srgb, var(--color-secondary) 18%, transparent)",
                  color: "var(--color-secondary)",
                  border: "1px solid color-mix(in srgb, var(--color-secondary) 30%, transparent)",
                }}
              >
                <Check size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* Custom duration input */}
          {timer.mode === "custom" && (timer.status === "idle" || timer.status === "completed") && (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={1}
                max={240}
                value={customMinutes}
                onChange={(e) =>
                  setCustomMinutes(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-16 text-center rounded-xl px-2 py-1 text-sm outline-none"
                style={{
                  background: "var(--color-surface-container-high)",
                  color: "var(--color-on-surface)",
                  border: "1px solid var(--color-outline-variant)",
                }}
              />
              <span className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                min
              </span>
            </div>
          )}
        </div>

        {/* Timer ring */}
        <TimerRing
          progress={timer.progress}
          displayTime={timer.displayTime}
          status={timer.status}
        />

        {/* Break badge — only visible while a break is actively running or paused */}
        {(timer.mode === "short_break" || timer.mode === "long_break") &&
          (timer.status === "running" || timer.status === "paused") && (
            <div
              className="flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-semibold -mt-4"
              style={{
                background:
                  timer.mode === "long_break"
                    ? "color-mix(in srgb, var(--color-tertiary) 14%, transparent)"
                    : "color-mix(in srgb, var(--color-secondary) 14%, transparent)",
                color:
                  timer.mode === "long_break"
                    ? "var(--color-tertiary)"
                    : "var(--color-secondary)",
                border: `1px solid ${
                  timer.mode === "long_break"
                    ? "color-mix(in srgb, var(--color-tertiary) 28%, transparent)"
                    : "color-mix(in srgb, var(--color-secondary) 28%, transparent)"
                }`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
                style={{
                  background:
                    timer.mode === "long_break"
                      ? "var(--color-tertiary)"
                      : "var(--color-secondary)",
                }}
              />
              {timer.mode === "short_break" ? "Short Break" : "Long Break"}
            </div>
          )}

        {/* Controls */}
        <TimerControls
          status={timer.status}
          onPlayPause={handlePlayPause}
          onReset={handleReset}
          onSkip={handleSkip}
          disabled={false}
        />

        {/* Session timeline — task-relative */}
        <PomodoroTimeline
          mode={timer.mode}
          status={timer.status}
          progress={timer.progress}
          remainingSec={timer.remaining}
          estimatedPomodoros={activeTask?.estimated_pomodoros ?? 1}
          completedPomodoros={activeTask?.completed_pomodoros ?? 0}
          pomoDurationSec={pomoDurationSec}
          shortBreakSec={shortBreakSec}
          longBreakSec={longBreakSec}
          pomodoroCount={timer.pomodoroCount}
          longBreakEvery={longBreakEvery}
        />
      </motion.div>

      <SpotifyPanel />

      <TaskPicker
        open={taskPickerOpen}
        onClose={() => setTaskPickerOpen(false)}
        onSelect={selectTask}
      />
    </div>
  );
}
