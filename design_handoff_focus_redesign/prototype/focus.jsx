/* ════════════════════════════════════════════════════════════════
   FOCUS PAGE — solo centered timer + slide-away bottom dock
   ════════════════════════════════════════════════════════════════ */
const { useState: fS, useEffect: fE, useRef: fR } = React;

/* ─── Timer ring ───────────────────────────────────────────────── */
function Ring({ progress, status, time }) {
  const R = 104, C = 2 * Math.PI * R;
  const done = status === "completed";
  return (
    <div style={{ position: "relative", width: 252, height: 252, display: "grid", placeItems: "center" }}>
      <div style={{ position: "absolute", width: 240, height: 240, borderRadius: "50%",
        background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 18%, transparent), transparent 68%)",
        opacity: status === "running" ? 1 : 0.5, transition: "opacity .6s", filter: "blur(6px)" }} />
      <svg width="252" height="252" viewBox="0 0 252 252" style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle cx="126" cy="126" r={R} fill="none" stroke="var(--ring-track)" strokeWidth="6" />
        <circle cx="126" cy="126" r={R} fill="none"
          stroke={done ? "var(--accent)" : "url(#ringgrad)"} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
          style={{ transition: "stroke-dashoffset .6s var(--ease)",
            filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--primary) 55%, transparent))" }} />
      </svg>
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span className="font-display tabnum" style={{ fontSize: 60, fontWeight: 600, letterSpacing: "-.03em",
          lineHeight: 1, color: "var(--text)" }}>{time}</span>
      </div>
    </div>
  );
}

function ModePills() {
  const { timer } = useApp();
  const locked = timer.status === "running" || timer.status === "paused";
  const opts = [{ id: "pomodoro", label: "Pomodoro" }, { id: "custom", label: "Custom" }];
  return (
    <div className="glass-soft" style={{ display: "flex", gap: 3, padding: 4, borderRadius: 999 }}>
      {opts.map((o) => {
        const on = timer.mode === o.id || (timer.mode.includes("break") && o.id === "pomodoro");
        return (
          <button key={o.id} disabled={locked}
            onClick={() => { timer.setMode(o.id); timer.setDuration(o.id === "custom" ? timer.customMin * 60 : 45 * 60); }}
            className="pill" style={{ padding: "6px 16px", fontSize: 12.5,
              opacity: locked ? 0.5 : 1, cursor: locked ? "default" : "pointer",
              color: on ? "var(--primary)" : "var(--text-muted)",
              background: on ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "transparent" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Controls() {
  const { timer } = useApp();
  const running = timer.status === "running";
  const playAction = () => {
    if (running) timer.pause();
    else if (timer.status === "paused") timer.resume();
    else timer.start();
  };
  const ctrlBtn = { width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <button className="glass-soft hover-lift" onClick={timer.reset} title="Reset"
        style={{ ...ctrlBtn, color: "var(--text-muted)" }}><Icons.Reset size={19} /></button>
      <button onClick={playAction} className="hover-lift" title={running ? "Pause" : "Start"}
        style={{ width: 76, height: 76, borderRadius: "50%", display: "grid", placeItems: "center",
          color: "var(--on-primary)", background: "linear-gradient(135deg, var(--primary), var(--accent))",
          boxShadow: "0 14px 40px -8px color-mix(in srgb, var(--primary) 60%, transparent)" }}>
        {running ? <Icons.Pause size={28} /> : <Icons.Play size={28} style={{ marginLeft: 3 }} />}
      </button>
      <button className="glass-soft hover-lift" onClick={timer.skip} title="Skip"
        style={{ ...ctrlBtn, color: "var(--text-muted)" }}><Icons.Skip size={19} /></button>
    </div>
  );
}

/* ─── Dock: Subtasks column ────────────────────────────────────── */
function SubtasksCol() {
  const { active, toggleSubtask } = useApp();
  const [open, setOpen] = fS(true);
  const subs = active?.task?.subtasks || [];
  const done = subs.filter((s) => s.done).length;
  if (!active) return <DockEmpty icon="List" text="No task selected" />;
  if (!subs.length) return <DockEmpty icon="List" text="No subtasks" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 9,
        width: "100%", marginBottom: 11 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
          color: "var(--text-faint)" }}>Subtasks</span>
        <span className="tabnum" style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>{done}/{subs.length}</span>
        <div style={{ flex: 1, height: 4, borderRadius: 99, background: "var(--ring-track)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(done / subs.length) * 100}%`, borderRadius: 99,
            background: "linear-gradient(90deg, var(--primary), var(--accent))", transition: "width .3s" }} />
        </div>
        <Icons.Chevron size={14} style={{ color: "var(--text-faint)",
          transform: open ? "none" : "rotate(-90deg)", transition: "transform .2s" }} />
      </button>
      {open && (
        <div className="no-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 2,
          overflowY: "auto", maxHeight: 104, paddingRight: 2 }}>
          {subs.map((s) => (
            <button key={s.id} onClick={() => toggleSubtask(active.task.id, s.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 10,
                textAlign: "left", transition: "background .15s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--glass-edge),0.06)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              {s.done
                ? <Icons.CheckCircle size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
                : <Icons.Circle size={16} style={{ color: "var(--text-faint)", flexShrink: 0 }} />}
              <span style={{ fontSize: 13, color: s.done ? "var(--text-faint)" : "var(--text)",
                textDecoration: s.done ? "line-through" : "none", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Dock: Session timeline column ────────────────────────────── */
function SessionCol() {
  const { active, timer, finishTask } = useApp();
  const est = active ? Math.ceil(active.task.est) : 1;
  const done = active ? active.task.done : 0;
  const dots = Array.from({ length: Math.max(est, done + 1) });
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
        color: "var(--text-faint)", marginBottom: 12 }}>Session timeline</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: "auto" }}>
        {dots.map((_, i) => {
          const isDone = i < done;
          const isCurrent = i === done && (timer.status === "running" || timer.status === "paused");
          return (
            <div key={i} title={`Session ${i + 1}`} className={isCurrent ? "pulse-dot" : ""}
              style={{ width: isCurrent ? 16 : 13, height: isCurrent ? 16 : 13, borderRadius: "50%",
                background: isDone ? "linear-gradient(135deg, var(--primary), var(--accent))"
                  : isCurrent ? "var(--primary)" : "var(--ring-track)",
                border: isCurrent ? "2px solid color-mix(in srgb, var(--primary) 40%, transparent)" : "none",
                transition: "all .3s" }} />
          );
        })}
        <span className="tabnum" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginLeft: 4 }}>
          {done}/{est}</span>
      </div>
      {active && (
        <button onClick={() => finishTask(active.task.id)} className="pill hover-lift"
          style={{ marginTop: 12, padding: "8px 14px", fontSize: 12.5, justifyContent: "center",
            color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 14%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)" }}>
          <Icons.Check size={14} /> Mark task done
        </button>
      )}
    </div>
  );
}

/* ─── Dock: Music column (hidden when not connected) ───────────── */
const FAKE_TRACK = { name: "Weightless", artist: "Marconi Union", dur: 480 };
function MusicCol({ mini }) {
  const { spotifyConnected, setSpotifyConnected } = useApp();
  const [playing, setPlaying] = fS(true);
  const [pos, setPos] = fS(96);
  fE(() => {
    if (!playing) return;
    const id = setInterval(() => setPos((p) => (p + 1) % FAKE_TRACK.dur), 1000);
    return () => clearInterval(id);
  }, [playing]);

  if (!spotifyConnected) {
    if (mini) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
          color: "var(--text-faint)", marginBottom: 12 }}>Music</span>
        <button onClick={() => setSpotifyConnected(true)} className="pill hover-lift"
          style={{ padding: "9px 14px", fontSize: 12.5, justifyContent: "center", gap: 9,
            color: "#1DB954", background: "color-mix(in srgb, #1DB954 13%, transparent)",
            border: "1px solid color-mix(in srgb, #1DB954 30%, transparent)" }}>
          <Icons.Spotify size={16} /> Connect Spotify
        </button>
        <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.4 }}>
          Hidden until you connect your account.</p>
      </div>
    );
  }

  const art = <div style={{ width: mini ? 36 : 44, height: mini ? 36 : 44, borderRadius: 10, flexShrink: 0,
    background: "linear-gradient(135deg, #1DB954, #0d6b32)", display: "grid", placeItems: "center" }}>
    <Icons.Music size={mini ? 16 : 19} style={{ color: "rgba(255,255,255,0.9)" }} /></div>;

  if (mini) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        {art}
        <div style={{ minWidth: 0, width: 130 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis" }}>{FAKE_TRACK.name}</p>
          <p style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis" }}>{FAKE_TRACK.artist}</p>
        </div>
        <button onClick={() => setPlaying((v) => !v)} style={{ width: 34, height: 34, borderRadius: "50%",
          display: "grid", placeItems: "center", color: "#000", background: "#1DB954", flexShrink: 0 }}>
          {playing ? <Icons.Pause size={15} /> : <Icons.Play size={15} style={{ marginLeft: 1 }} />}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
        <Icons.Spotify size={13} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
          color: "var(--text-faint)" }}>Now playing</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
        {art}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis" }}>{FAKE_TRACK.name}</p>
          <p style={{ fontSize: 11.5, color: "var(--text-faint)", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis" }}>{FAKE_TRACK.artist}</p>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "var(--ring-track)", overflow: "hidden", marginBottom: 11 }}>
        <div style={{ height: "100%", width: `${(pos / FAKE_TRACK.dur) * 100}%`, background: "#1DB954",
          borderRadius: 99, transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: "auto" }}>
        <button className="icon-btn" style={{ width: 30, height: 30 }}><Icons.Prev size={16} /></button>
        <button onClick={() => setPlaying((v) => !v)} style={{ width: 40, height: 40, borderRadius: "50%",
          display: "grid", placeItems: "center", color: "#000", background: "#1DB954" }}>
          {playing ? <Icons.Pause size={17} /> : <Icons.Play size={17} style={{ marginLeft: 1 }} />}
        </button>
        <button className="icon-btn" style={{ width: 30, height: 30 }}><Icons.Next size={16} /></button>
      </div>
    </div>
  );
}

function DockEmpty({ icon, text }) {
  const Icon = Icons[icon];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", gap: 8, color: "var(--text-faint)" }}>
      <Icon size={20} /><span style={{ fontSize: 12.5 }}>{text}</span>
    </div>
  );
}

/* ─── The dock ─────────────────────────────────────────────────── */
function Dock() {
  const { focusMode, setFocusMode, spotifyConnected } = useApp();
  const divider = { width: 1, alignSelf: "stretch", background: "var(--hairline-soft)" };
  return (
    <>
      {/* full dock */}
      <div style={{ position: "fixed", left: "50%", bottom: 22, zIndex: 50,
        transform: `translateX(-50%) translateY(${focusMode ? "160%" : "0"})`,
        opacity: focusMode ? 0 : 1, transition: "transform .5s var(--ease), opacity .4s",
        width: "min(880px, calc(100vw - 36px))" }}>
        <div className="glass" style={{ borderRadius: 22, padding: "16px 18px", position: "relative" }}>
          <button onClick={() => setFocusMode(true)} className="icon-btn"
            title="Enter focus mode — hide the dock"
            style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, zIndex: 2 }}>
            <Icons.Shrink size={16} />
          </button>
          <div style={{ display: "grid",
            gridTemplateColumns: spotifyConnected ? "1.1fr 1px 1fr 1px 1.05fr" : "1.2fr 1px 1fr",
            gap: 18, minHeight: 108 }}>
            <SubtasksCol />
            <div style={divider} />
            <SessionCol />
            {spotifyConnected && <><div style={divider} /><MusicCol /></>}
          </div>
        </div>
      </div>

      {/* focus-mode mini bar — music persists, plus exit affordance */}
      <div style={{ position: "fixed", left: "50%", bottom: 22, zIndex: 50,
        transform: `translateX(-50%) translateY(${focusMode ? "0" : "160%"})`,
        opacity: focusMode ? 1 : 0, transition: "transform .5s var(--ease), opacity .4s",
        pointerEvents: focusMode ? "auto" : "none" }}>
        <div className="glass" style={{ borderRadius: 999, padding: "8px 10px 8px 14px",
          display: "flex", alignItems: "center", gap: 14 }}>
          {spotifyConnected && <><MusicCol mini /><div style={{ ...divider, height: 28, alignSelf: "center" }} /></>}
          <button onClick={() => setFocusMode(false)} className="pill hover-lift"
            style={{ padding: "8px 14px", fontSize: 12.5, color: "var(--text-muted)" }}>
            <Icons.Expand size={15} /> Show dock
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Focus page ───────────────────────────────────────────────── */
function FocusPage() {
  const { active, timer, setActive } = useApp();
  const [pickerOpen, setPickerOpen] = fS(false);
  const breakMode = timer.mode.includes("break");

  fE(() => {
    const onKey = (e) => {
      if (e.code === "Space" && e.target === document.body) { e.preventDefault();
        timer.status === "running" ? timer.pause() : timer.status === "paused" ? timer.resume() : timer.start(); }
      if (e.key === "Escape") setActive((a) => a); // noop placeholder
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timer]);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "88px 20px 234px" }}>
      <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <ModePills />
        <Ring progress={timer.progress} status={timer.status} time={timer.displayTime} />

        {/* task name — the ONLY thing beside the timer */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          {active?.project && (
            <span className="pill" style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700,
              letterSpacing: ".04em", textTransform: "uppercase", color: active.project.color,
              background: `color-mix(in srgb, ${active.project.color} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${active.project.color} 26%, transparent)` }}>
              {active.project.name}</span>
          )}
          <button onClick={() => setPickerOpen(true)} className="hover-lift"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", borderRadius: 12 }}>
            <span className="font-display" style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-.01em",
              color: active ? "var(--text)" : "var(--text-faint)", maxWidth: 440 }}>
              {active ? active.task.title : "Choose a task to focus on"}</span>
            <Icons.Pencil size={15} style={{ color: "var(--text-faint)", opacity: 0.6, flexShrink: 0 }} />
          </button>
          {breakMode && (timer.status === "running" || timer.status === "paused") && (
            <span className="pill chip-accent" style={{ padding: "4px 14px", fontSize: 12 }}>
              <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)" }} />
              {timer.mode === "long_break" ? "Long break" : "Short break"}</span>
          )}
        </div>

        <Controls />
      </div>

      <Dock />
      <TaskPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

window.FocusPage = FocusPage;
