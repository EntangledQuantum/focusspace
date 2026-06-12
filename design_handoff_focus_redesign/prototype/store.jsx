/* ════════════════════════════════════════════════════════════════
   Global store: theme, tint/blur, wallpaper, spotify, timer, tasks
   ════════════════════════════════════════════════════════════════ */
const { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } = React;

const LS = "focusspace.redesign.v1";
const loadState = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };

/* ─── Sample data ──────────────────────────────────────────────── */
const TAGS = {
  design:  { name: "design",   color: "#ff5fa2" },
  code:    { name: "code",     color: "#b06bf6" },
  writing: { name: "writing",  color: "#5fb0ff" },
  research:{ name: "research", color: "#46c98b" },
  admin:   { name: "admin",    color: "#f2a341" },
};

const SEED_PROJECTS = [
  {
    id: "p1", name: "Aurora App", color: "#ff5fa2",
    tasks: [
      { id: "t1", title: "Redesign the focus timer screen", tags: ["design"], est: 4, done: 2,
        notes: "Solo timer, dock for the rest. Keep it calm.",
        subtasks: [
          { id: "s1", title: "Audit current cramped layout", done: true },
          { id: "s2", title: "Sketch solo-timer composition", done: true },
          { id: "s3", title: "Build the slide-away dock", done: false },
          { id: "s4", title: "Tune glass tint + blur", done: false },
        ] },
      { id: "t2", title: "Wire up the bottom music dock", tags: ["code"], est: 3, done: 0,
        subtasks: [
          { id: "s5", title: "Hide when Spotify disconnected", done: false },
          { id: "s6", title: "Persist mini-bar in focus mode", done: false },
        ] },
      { id: "t3", title: "Horizontal nav migration", tags: ["code","design"], est: 2, done: 0, subtasks: [] },
    ],
  },
  {
    id: "p2", name: "Q3 Writing", color: "#b06bf6",
    tasks: [
      { id: "t4", title: "Draft the launch announcement", tags: ["writing"], est: 3, done: 1,
        subtasks: [
          { id: "s7", title: "Outline key beats", done: true },
          { id: "s8", title: "First pass copy", done: false },
        ] },
      { id: "t5", title: "Research competitor onboarding", tags: ["research"], est: 2, done: 0, subtasks: [] },
    ],
  },
  {
    id: "p3", name: "Personal", color: "#46c98b",
    tasks: [
      { id: "t6", title: "Inbox zero + weekly review", tags: ["admin"], est: 1, done: 0, subtasks: [] },
      { id: "t7", title: "Read 30 pages", tags: ["research"], est: 1, done: 0, subtasks: [] },
    ],
  },
];

const WALLPAPERS = [
  { id: "wp-aurora", name: "Aurora" },
  { id: "wp-dusk",   name: "Dusk" },
  { id: "wp-mist",   name: "Mist" },
  { id: "wp-noir",   name: "Noir" },
  { id: "wp-photo",  name: "Your photo" },
];

const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/* ─── Toast ────────────────────────────────────────────────────── */
const ToastCtx = createContext(null);
function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, kind = "default") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
        zIndex: 200, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} className="glass pop" style={{
            padding: "11px 18px", borderRadius: 999, fontSize: 13.5, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 9, color: "var(--text)",
            boxShadow: "var(--shadow-lg)" }}>
            <span style={{ width: 7, height: 7, borderRadius: 99,
              background: t.kind === "success" ? "var(--primary)" : "var(--accent)" }} />
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

/* ─── Timer engine ─────────────────────────────────────────────── */
function useTimerEngine(onComplete) {
  const saved = loadState().timer || {};
  const [mode, setMode]       = useState(saved.mode || "pomodoro"); // pomodoro | custom | short_break | long_break
  const [status, setStatus]   = useState("idle"); // idle | running | paused | completed
  const [total, setTotal]     = useState(saved.total || 45 * 60);
  const [remaining, setRem]   = useState(saved.remaining ?? 45 * 60);
  const [customMin, setCustomMin] = useState(saved.customMin || 45);
  const endRef = useRef(null);
  const raf = useRef(null);
  const completeCb = useRef(onComplete);
  useEffect(() => { completeCb.current = onComplete; }, [onComplete]);

  // persist
  useEffect(() => {
    const s = loadState();
    s.timer = { mode, total, remaining, customMin };
    localStorage.setItem(LS, JSON.stringify(s));
  }, [mode, total, remaining, customMin]);

  const tick = useCallback(() => {
    if (endRef.current == null) return;
    const rem = (endRef.current - Date.now()) / 1000;
    if (rem <= 0) {
      setRem(0); setStatus("completed"); endRef.current = null;
      cancelAnimationFrame(raf.current);
      completeCb.current && completeCb.current();
      return;
    }
    setRem(rem);
    raf.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback((opts = {}) => {
    const m = opts.mode || mode;
    const dur = opts.durationSec ?? (m === "custom" ? customMin * 60 : total);
    setMode(m); setTotal(dur); setRem(dur);
    endRef.current = Date.now() + dur * 1000;
    setStatus("running");
    cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(tick);
  }, [mode, total, customMin, tick]);

  const pause = useCallback(() => {
    if (status !== "running") return;
    cancelAnimationFrame(raf.current);
    setRem((endRef.current - Date.now()) / 1000);
    endRef.current = null; setStatus("paused");
  }, [status]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    endRef.current = Date.now() + remaining * 1000;
    setStatus("running");
    cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(tick);
  }, [status, remaining, tick]);

  const reset = useCallback(() => {
    cancelAnimationFrame(raf.current); endRef.current = null;
    setStatus("idle"); setRem(total);
  }, [total]);

  const skip = useCallback(() => {
    cancelAnimationFrame(raf.current); endRef.current = null;
    setStatus("completed"); setRem(0);
  }, []);

  const setDuration = useCallback((sec) => {
    if (status === "running") return;
    setTotal(sec); setRem(sec);
  }, [status]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const progress = total > 0 ? 1 - remaining / total : 0;
  return { mode, setMode, status, total, remaining, progress, customMin, setCustomMin,
    displayTime: fmt(remaining), start, pause, resume, reset, skip, setDuration };
}

/* ─── App provider ─────────────────────────────────────────────── */
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

function AppProvider({ children }) {
  const init = loadState();
  const [route, setRoute] = useState(init.route || "focus");
  const [theme, setTheme] = useState(init.theme || "dark");
  const [tint, setTint]   = useState(init.tint ?? 0.5);
  const [blur, setBlur]   = useState(init.blur ?? 22);
  const [wallpaper, setWallpaper] = useState(init.wallpaper || "wp-aurora");
  const [spotifyConnected, setSpotifyConnected] = useState(init.spotify ?? true);
  const [focusMode, setFocusMode] = useState(false);
  const [projects, setProjects] = useState(SEED_PROJECTS);
  const [active, setActive] = useState({ task: SEED_PROJECTS[0].tasks[0], project: SEED_PROJECTS[0] }); // { task, project }
  const [durations] = useState({ pomodoro: 45 * 60, short: 5 * 60, long: 15 * 60, every: 4 });
  const toast = useToast();

  // apply theme + tint vars to <html>
  useEffect(() => {
    const r = document.documentElement;
    r.classList.toggle("light", theme === "light");
    r.classList.toggle("dark", theme === "dark");
    r.style.setProperty("--glass-tint", tint);
    r.style.setProperty("--glass-blur", blur + "px");
  }, [theme, tint, blur]);

  // persist prefs
  useEffect(() => {
    const s = loadState();
    Object.assign(s, { route, theme, tint, blur, wallpaper, spotify: spotifyConnected });
    localStorage.setItem(LS, JSON.stringify(s));
  }, [route, theme, tint, blur, wallpaper, spotifyConnected]);

  const onComplete = useCallback(() => {
    setActive((a) => {
      if (a && timerModeRef.current === "pomodoro") {
        // bump completed pomodoro on the active task
        setProjects((ps) => ps.map((p) => ({
          ...p, tasks: p.tasks.map((t) => t.id === a.task.id ? { ...t, done: t.done + 1 } : t),
        })));
        return { ...a, task: { ...a.task, done: a.task.done + 1 } };
      }
      return a;
    });
    toast(timerModeRef.current === "pomodoro" ? "Session complete — nice focus!" : "Break done — back to it", "success");
  }, [toast]);

  const timer = useTimerEngine(onComplete);
  const timerModeRef = useRef(timer.mode);
  useEffect(() => { timerModeRef.current = timer.mode; }, [timer.mode]);

  // Run a task: switch active + (re)start the pomodoro immediately
  const runTask = useCallback((task, project) => {
    setActive({ task, project });
    setRoute("focus");
    timer.start({ mode: "pomodoro", durationSec: durations.pomodoro });
    toast(`Now focusing · ${task.title}`, "success");
  }, [timer, durations, toast]);

  const selectTask = useCallback((task, project) => {
    setActive({ task, project });
  }, []);

  const toggleSubtask = useCallback((taskId, subId) => {
    setProjects((ps) => ps.map((p) => ({
      ...p, tasks: p.tasks.map((t) => t.id !== taskId ? t : {
        ...t, subtasks: t.subtasks.map((s) => s.id === subId ? { ...s, done: !s.done } : s),
      }),
    })));
    setActive((a) => a && a.task.id === taskId ? {
      ...a, task: { ...a.task, subtasks: a.task.subtasks.map((s) => s.id === subId ? { ...s, done: !s.done } : s) },
    } : a);
  }, []);

  const finishTask = useCallback((taskId) => {
    let next = null, nextProj = null;
    setProjects((ps) => {
      const np = ps.map((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }));
      for (const p of np) { if (p.tasks.length) { next = p.tasks[0]; nextProj = p; break; } }
      return np;
    });
    setActive(next ? { task: next, project: nextProj } : null);
    timer.reset();
    toast(next ? `Done! Next · ${next.title}` : "All tasks complete 🎉", "success");
  }, [timer, toast]);

  const value = {
    route, setRoute, theme, setTheme, tint, setTint, blur, setBlur,
    wallpaper, setWallpaper, spotifyConnected, setSpotifyConnected,
    focusMode, setFocusMode, projects, setProjects, active, setActive,
    durations, timer, runTask, selectTask, toggleSubtask, finishTask,
    TAGS, WALLPAPERS, fmt,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

Object.assign(window, { AppProvider, useApp, ToastHost, useToast, fmt, WALLPAPERS, TAGS });
