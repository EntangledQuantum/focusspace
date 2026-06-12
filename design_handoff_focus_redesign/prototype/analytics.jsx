/* ════════════════════════════════════════════════════════════════
   ANALYTICS PAGE
   ════════════════════════════════════════════════════════════════ */
function StatCard({ icon, label, value, sub, color }) {
  const Icon = Icons[icon];
  return (
    <div className="glass hover-lift" style={{ borderRadius: 20, padding: 18, flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center",
          color: color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}><Icon size={17} /></div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-faint)" }}>{label}</span>
      </div>
      <p className="font-display tabnum" style={{ fontSize: 30, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>{value}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{sub}</p>
    </div>
  );
}

const WEEK = [
  { d: "Mon", h: 3.5 }, { d: "Tue", h: 5.2 }, { d: "Wed", h: 2.0 }, { d: "Thu", h: 6.1 },
  { d: "Fri", h: 4.4 }, { d: "Sat", h: 1.2 }, { d: "Sun", h: 3.0 },
];

function AnalyticsPage() {
  const { projects } = useApp();
  const max = Math.max(...WEEK.map((w) => w.h));
  const totalH = WEEK.reduce((n, w) => n + w.h, 0);
  const breakdown = [
    { name: "Aurora App", color: "#ff5fa2", pct: 46 },
    { name: "Q3 Writing", color: "#b06bf6", pct: 31 },
    { name: "Personal", color: "#46c98b", pct: 23 },
  ];
  return (
    <div style={{ minHeight: "100dvh", padding: "104px 20px 60px", display: "flex", justifyContent: "center" }}>
      <div className="fade-up" style={{ width: "min(880px, 100%)" }}>
        <h1 className="font-display" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em",
          color: "var(--text)", marginBottom: 4 }}>Analytics</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>Your last 7 days of deep work.</p>

        <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <StatCard icon="Clock" label="Focus time" value={`${totalH.toFixed(1)}h`} sub="this week" color="#ff5fa2" />
          <StatCard icon="Target" label="Sessions" value="34" sub="+6 vs last week" color="#b06bf6" />
          <StatCard icon="Flame" label="Streak" value="12" sub="days in a row" color="#f2a341" />
          <StatCard icon="Check" label="Tasks done" value="19" sub="this week" color="#46c98b" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
          <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
            <p className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>Focus by day</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 180 }}>
              {WEEK.map((w) => (
                <div key={w.d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
                  <span className="tabnum" style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{w.h}h</span>
                  <div style={{ width: "100%", maxWidth: 34, height: `${(w.h / max) * 130}px`, borderRadius: 8,
                    background: "linear-gradient(to top, var(--primary), var(--accent))",
                    boxShadow: "0 4px 14px -4px color-mix(in srgb, var(--primary) 50%, transparent)" }} />
                  <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{w.d}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
            <p className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>By project</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {breakdown.map((b) => (
                <div key={b.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{b.name}</span>
                    <span className="tabnum" style={{ fontSize: 12.5, fontWeight: 700, color: b.color }}>{b.pct}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 99, background: "var(--ring-track)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${b.pct}%`, borderRadius: 99, background: b.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.AnalyticsPage = AnalyticsPage;
