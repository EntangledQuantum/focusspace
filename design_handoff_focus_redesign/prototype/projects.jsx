/* ════════════════════════════════════════════════════════════════
   PROJECTS PAGE — task board with one-tap Run
   ════════════════════════════════════════════════════════════════ */
const { useState: pjS } = React;

function RunButton({ task, project }) {
  const { runTask, active, timer } = useApp();
  const isActive = active?.task?.id === task.id;
  const live = isActive && (timer.status === "running" || timer.status === "paused");
  return (
    <button onClick={(e) => { e.stopPropagation(); runTask(task, project); }}
      className="pill hover-lift" title="Switch to this task & start the timer"
      style={{ padding: "8px 15px", fontSize: 13, flexShrink: 0,
        color: live ? "var(--on-primary)" : "var(--primary)",
        background: live ? "linear-gradient(135deg, var(--primary), var(--accent))"
          : "color-mix(in srgb, var(--primary) 13%, transparent)",
        border: live ? "1px solid transparent" : "1px solid color-mix(in srgb, var(--primary) 28%, transparent)",
        boxShadow: live ? "0 6px 20px -6px color-mix(in srgb, var(--primary) 60%, transparent)" : "none" }}>
      {live ? <><span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor" }} /> Running</>
        : <><Icons.Play size={13} /> Run</>}
    </button>
  );
}

function TaskRow({ task, project }) {
  const { active, toggleSubtask, TAGS } = useApp();
  const [open, setOpen] = pjS(false);
  const est = Math.ceil(task.est);
  const subsDone = task.subtasks.filter((s) => s.done).length;
  const isActive = active?.task?.id === task.id;
  return (
    <div style={{ borderRadius: 16, overflow: "hidden",
      border: isActive ? "1px solid color-mix(in srgb, var(--primary) 32%, transparent)" : "1px solid var(--hairline-soft)",
      background: isActive ? "color-mix(in srgb, var(--primary) 7%, transparent)" : "rgba(var(--glass-edge),0.03)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 15px" }}>
        <button onClick={() => task.subtasks.length && setOpen((v) => !v)}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 13, textAlign: "left",
            cursor: task.subtasks.length ? "pointer" : "default" }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center",
            background: `color-mix(in srgb, ${project.color} 16%, transparent)` }}>
            <Icons.Target size={18} style={{ color: project.color }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 4, flexWrap: "wrap" }}>
              <span className="tabnum" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{task.done}/{est} sessions</span>
              {task.subtasks.length > 0 && (
                <span className="tabnum" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>· {subsDone}/{task.subtasks.length} subtasks</span>)}
              {task.tags.map((tg) => (
                <span key={tg} style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                  color: TAGS[tg].color, background: `color-mix(in srgb, ${TAGS[tg].color} 15%, transparent)` }}>#{TAGS[tg].name}</span>))}
            </div>
          </div>
        </button>
        {/* session dots */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {Array.from({ length: est }).map((_, i) => (
            <span key={i} style={{ width: 7, height: 7, borderRadius: 99,
              background: i < task.done ? "linear-gradient(135deg, var(--primary), var(--accent))" : "var(--ring-track)" }} />))}
        </div>
        <RunButton task={task} project={project} />
        {task.subtasks.length > 0 && (
          <button className="icon-btn" onClick={() => setOpen((v) => !v)} style={{ width: 30, height: 30 }}>
            <Icons.Chevron size={15} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .2s" }} /></button>)}
      </div>
      {open && task.subtasks.length > 0 && (
        <div style={{ padding: "2px 15px 13px 67px", display: "flex", flexDirection: "column", gap: 1 }}>
          {task.subtasks.map((s) => (
            <button key={s.id} onClick={() => toggleSubtask(task.id, s.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 9, textAlign: "left" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--glass-edge),0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              {s.done ? <Icons.CheckCircle size={15} style={{ color: "var(--primary)", flexShrink: 0 }} />
                : <Icons.Circle size={15} style={{ color: "var(--text-faint)", flexShrink: 0 }} />}
              <span style={{ fontSize: 13, color: s.done ? "var(--text-faint)" : "var(--text)",
                textDecoration: s.done ? "line-through" : "none" }}>{s.title}</span>
            </button>))}
        </div>
      )}
    </div>
  );
}

function ProjectsPage() {
  const { projects } = useApp();
  const totalTasks = projects.reduce((n, p) => n + p.tasks.length, 0);
  return (
    <div style={{ minHeight: "100dvh", padding: "104px 20px 60px", display: "flex", justifyContent: "center" }}>
      <div className="fade-up" style={{ width: "min(880px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 26, gap: 16 }}>
          <div>
            <h1 className="font-display" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", color: "var(--text)" }}>Projects</h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
              {totalTasks} open tasks across {projects.length} projects · hit <strong style={{ color: "var(--primary)" }}>Run</strong> to jump straight into focus.</p>
          </div>
          <button className="pill glass-soft hover-lift" style={{ padding: "10px 16px", fontSize: 13.5, color: "var(--text)" }}>
            <Icons.Plus size={16} /> New project</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {projects.map((p) => (
            <div key={p.id} className="glass" style={{ borderRadius: 22, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                <span style={{ width: 11, height: 11, borderRadius: 99, background: p.color,
                  boxShadow: `0 0 12px ${p.color}` }} />
                <h2 className="font-display" style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{p.name}</h2>
                <span className="tabnum" style={{ fontSize: 12, color: "var(--text-faint)" }}>{p.tasks.length} tasks</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {p.tasks.map((t) => <TaskRow key={t.id} task={t} project={p} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.ProjectsPage = ProjectsPage;
