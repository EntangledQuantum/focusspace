/* ════════════════════════════════════════════════════════════════
   Shared UI: horizontal TopNav, TaskPicker, glass quick-controls
   ════════════════════════════════════════════════════════════════ */
const { useState: uS, useRef: uR, useEffect: uE } = React;

function Logo({ size = 30 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 9, position: "relative",
      background: "linear-gradient(135deg, var(--primary), var(--accent))",
      boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 45%, transparent)",
      display: "grid", placeItems: "center", flexShrink: 0 }}>
      <div style={{ width: size * 0.34, height: size * 0.34, borderRadius: "50%",
        border: "2.5px solid rgba(255,255,255,0.95)" }} />
    </div>
  );
}

const NAV = [
  { id: "focus",     label: "Focus",     icon: "Timer" },
  { id: "projects",  label: "Projects",  icon: "Folder" },
  { id: "analytics", label: "Analytics", icon: "Chart" },
  { id: "settings",  label: "Settings",  icon: "Settings" },
];

function GlassControls() {
  const { tint, setTint, blur, setBlur } = useApp();
  const [open, setOpen] = uS(false);
  const ref = uR(null);
  uE(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)}
        style={{ width: 36, height: 36 }} title="Glass tint & blur">
        <Icons.Sliders size={17} />
      </button>
      {open && (
        <div className="glass pop" style={{ position: "absolute", top: 46, right: 0, width: 244,
          borderRadius: 18, padding: 16, zIndex: 80, boxShadow: "var(--shadow-lg)" }}>
          <p className="font-display" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em",
            textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 14 }}>Glass</p>
          <GlassSlider label="Tint" value={tint} min={0} max={1} step={0.01}
            onChange={setTint} display={`${Math.round(tint * 100)}%`} />
          <div style={{ height: 14 }} />
          <GlassSlider label="Blur" value={blur} min={0} max={48} step={1} accent
            onChange={setBlur} display={`${blur}px`} />
        </div>
      )}
    </div>
  );
}

function GlassSlider({ label, value, min, max, step, onChange, display, accent }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>{label}</span>
        <span className="tabnum" style={{ fontSize: 12.5, fontWeight: 700,
          color: accent ? "var(--accent)" : "var(--primary)" }}>{display}</span>
      </div>
      <input type="range" className={"rng" + (accent ? " accent" : "")} value={value}
        min={min} max={max} step={step} style={{ width: "100%" }}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

function TopNav() {
  const { route, setRoute, theme, setTheme, focusMode } = useApp();
  return (
    <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 60,
      display: "flex", justifyContent: "center", padding: "16px 18px",
      pointerEvents: "none",
      opacity: focusMode ? 0 : 1, transform: focusMode ? "translateY(-12px)" : "none",
      transition: "opacity .4s var(--ease), transform .4s var(--ease)" }}>
      <nav className="glass" style={{ pointerEvents: focusMode ? "none" : "auto",
        display: "flex", alignItems: "center", gap: 6, borderRadius: 999,
        padding: "8px 10px 8px 14px", width: "100%", maxWidth: 880 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 6 }}>
          <Logo size={28} />
          <span className="font-display" style={{ fontWeight: 800, fontSize: 15.5, letterSpacing: "-.01em",
            color: "var(--text)" }}>FocusSpace</span>
        </div>
        <div style={{ display: "flex", gap: 2, marginLeft: "auto", marginRight: "auto" }}>
          {NAV.map((n) => {
            const Icon = Icons[n.icon];
            const on = route === n.id;
            return (
              <button key={n.id} onClick={() => setRoute(n.id)}
                className="pill hover-lift"
                style={{ padding: "8px 15px", fontSize: 13.5, position: "relative",
                  color: on ? "var(--primary)" : "var(--text-muted)",
                  background: on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent",
                  border: on ? "1px solid color-mix(in srgb, var(--primary) 26%, transparent)" : "1px solid transparent" }}>
                <Icon size={16} />
                <span style={{ display: "inline" }}>{n.label}</span>
              </button>
            );
          })}
        </div>
        <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          style={{ width: 36, height: 36 }} title="Toggle theme">
          {theme === "dark" ? <Icons.Sun size={17} /> : <Icons.Moon size={17} />}
        </button>
        <GlassControls />
      </nav>
    </header>
  );
}

/* ─── Task picker modal ────────────────────────────────────────── */
function TaskPicker({ open, onClose }) {
  const { projects, selectTask, TAGS } = useApp();
  const [q, setQ] = uS("");
  if (!open) return null;
  const ql = q.trim().toLowerCase();
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120,
      background: "rgba(5,3,8,0.5)", backdropFilter: "blur(4px)", display: "grid",
      placeItems: "start center", paddingTop: "12vh", animation: "pop .2s var(--ease)" }}>
      <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: "min(560px, 92vw)",
        borderRadius: 24, overflow: "hidden", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px",
          borderBottom: "1px solid var(--hairline-soft)" }}>
          <Icons.Search size={17} style={{ color: "var(--text-faint)" }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Choose a task to focus on…"
            style={{ flex: 1, background: "none", border: "none", outline: "none",
              fontSize: 15, color: "var(--text)" }} />
          <button className="icon-btn" onClick={onClose} style={{ width: 30, height: 30 }}><Icons.X size={16} /></button>
        </div>
        <div className="no-scrollbar" style={{ maxHeight: "52vh", overflowY: "auto", padding: 10 }}>
          {projects.map((p) => {
            const tasks = p.tasks.filter((t) => !ql || t.title.toLowerCase().includes(ql));
            if (!tasks.length) return null;
            return (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px 6px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: p.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em",
                    textTransform: "uppercase", color: "var(--text-faint)" }}>{p.name}</span>
                </div>
                {tasks.map((t) => (
                  <button key={t.id} onClick={() => { selectTask(t, p); onClose(); }}
                    className="hover-lift" style={{ width: "100%", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 12, padding: "11px 12px",
                      borderRadius: 14, background: "transparent" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--glass-edge),0.07)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <Icons.Target size={16} style={{ color: p.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</p>
                      <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 1 }}>
                        {t.done}/{Math.ceil(t.est)} sessions{t.subtasks.length ? ` · ${t.subtasks.length} subtasks` : ""}</p>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {t.tags.map((tg) => (
                        <span key={tg} style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px",
                          borderRadius: 99, color: TAGS[tg].color,
                          background: `color-mix(in srgb, ${TAGS[tg].color} 16%, transparent)` }}>#{TAGS[tg].name}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TopNav, TaskPicker, Logo, GlassSlider, NAV });
