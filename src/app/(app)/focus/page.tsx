"use client";

import { useEffect, useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTimer } from "@/lib/hooks/useTimer";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { TimerRing } from "@/components/timer/TimerRing";
import { TimerControls } from "@/components/timer/TimerControls";
import { TaskPicker } from "@/components/timer/TaskPicker";
import { motion, AnimatePresence } from "framer-motion";
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

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  const { data: settings } = useQuery<import("@/types/database").UserSettings | null>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return (data as import("@/types/database").UserSettings | null) ?? null;
    },
  });

  const timer = useTimer();
  const { requestPermission, notifyCompletion } = useNotifications(settings ?? null);

  const pomoDurationSec = settings?.focus_duration_sec ?? 25 * 60;
  const shortBreakSec = settings?.short_break_sec ?? 5 * 60;
  const longBreakSec = settings?.long_break_sec ?? 15 * 60;
  const longBreakEvery = settings?.long_break_every ?? 4;

  const isBreak = timer.mode === "short_break" || timer.mode === "long_break";
  const modeLabel = {
    pomodoro: "Pomodoro",
    custom: "Custom Target",
    short_break: "Short Break",
    long_break: "Long Break",
  }[timer.mode];

  timer.onCompleteRef.current = useCallback(async () => {
    await timer.completeSession();
    const label = isBreak ? "Break complete — back to work!" : "Session complete! Great focus.";
    notifyCompletion(label, activeTask?.title ?? "");
    toast.success(label);

    if (!isBreak && settings?.auto_start_breaks) {
      const isLongBreak = (timer.pomodoroCount + 1) % longBreakEvery === 0;
      const nextMode = isLongBreak ? "long_break" : "short_break";
      const nextDur = isLongBreak ? longBreakSec : shortBreakSec;
      setTimeout(() => {
        timer.startSession({ mode: nextMode, durationSec: nextDur });
      }, 600);
    }
  }, [timer, isBreak, activeTask, settings, notifyCompletion, shortBreakSec, longBreakSec, longBreakEvery]);

  function handlePlayPause() {
    if (timer.status === "idle" || timer.status === "completed") {
      const dur = timer.mode === "custom" ? customMinutes * 60 : pomoDurationSec;
      timer.startSession({
        mode: timer.mode,
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

    // Find next todo task — same project first, then any
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
        const { data: p } = await supabase.from("projects").select("*").eq("id", next.project_id).single();
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

  const currentDurationSec = timer.mode === "custom" ? customMinutes * 60 : pomoDurationSec;

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
        className="glass rounded-[2rem] p-10 flex flex-col items-center gap-10 relative overflow-hidden w-full max-w-[420px]"
      >
        {/* Subtle inner ring */}
        <div className="absolute inset-0 rounded-[2rem] pointer-events-none"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }} />

        {/* Task context */}
        <div className="flex flex-col items-center gap-3 text-center">
          {activeProject && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
              style={{
                background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                color: "var(--color-primary)",
                border: "1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)",
              }}>
              {activeProject.name}
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTaskPickerOpen(true)}
              className="flex items-center gap-2 max-w-[260px] group"
            >
              {activeTask ? (
                <h2 className="text-xl font-semibold leading-snug text-center"
                  style={{ fontFamily: "var(--font-display)", color: "var(--color-on-surface)" }}>
                  {activeTask.title}
                </h2>
              ) : (
                <span className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                  Choose a task to focus on…
                </span>
              )}
              <Pencil size={13} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
                style={{ color: "var(--color-on-surface-variant)" }} />
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

        {/* Timer ring */}
        <TimerRing
          progress={timer.progress}
          displayTime={timer.displayTime}
          status={timer.status}
        />

        {/* Controls */}
        <TimerControls
          status={timer.status}
          onPlayPause={handlePlayPause}
          onReset={handleReset}
          onSkip={handleSkip}
          disabled={false}
        />

        {/* Session count badges */}
        {timer.pomodoroCount > 0 && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: Math.min(timer.pomodoroCount, 8) }).map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full"
                style={{ background: "var(--color-primary)", opacity: 0.7 }} />
            ))}
            {timer.pomodoroCount > 8 && (
              <span className="text-xs ml-1" style={{ color: "var(--color-on-surface-variant)" }}>
                +{timer.pomodoroCount - 8}
              </span>
            )}
          </div>
        )}
      </motion.div>

      <SpotifyPanel autoStart={settings?.spotify_auto_start ?? true} />

      <TaskPicker
        open={taskPickerOpen}
        onClose={() => setTaskPickerOpen(false)}
        onSelect={selectTask}
      />
    </div>
  );
}
