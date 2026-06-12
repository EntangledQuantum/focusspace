/* ════════════════════════════════════════════════════════════════
   SETTINGS PAGE
   ════════════════════════════════════════════════════════════════ */
function Section({ icon, title, desc, children }) {
  const Icon = Icons[icon];
  return (
    <div className="glass" style={{ borderRadius: 22, padding: 22, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
        <div style={{ width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center",
          color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}><Icon size={18} /></div>
        <div>
          <p className="font-display" style={{ fontSize: 15.5, fontWeight: 700, color: "var(--text)" }}>{title}</p>
          {desc && <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 1 }}>{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({ label, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      padding: "11px 0", borderTop: "1px solid var(--hairline-soft)" }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{sub}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Switch({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{ width: 46, height: 27, borderRadius: 99, padding: 3,
      background: on ? "linear-gradient(135deg, var(--primary), var(--accent))" : "var(--ring-track)",
      transition: "background .2s", display: "flex", justifyContent: on ? "flex-end" : "flex-start" }}>
      <span style={{ width: 21, height: 21, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all .2s" }} />
    </button>
  );
}

function SettingsPage() {
  const { theme, setTheme, tint, setTint, blur, setBlur, wallpaper, setWallpaper,
    spotifyConnected, setSpotifyConnected, WALLPAPERS } = useApp();
  const [notif, setNotif] = React.useState(true);
  const [autoBreak, setAutoBreak] = React.useState(true);

  return (
    <div style={{ minHeight: "100dvh", padding: "104px 20px 60px", display: "flex", justifyContent: "center" }}>
      <div className="fade-up" style={{ width: "min(720px, 100%)" }}>
        <h1 className="font-display" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em",
          color: "var(--text)", marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>Tune the space to disappear into.</p>

        <Section icon="Wallpaper" title="Appearance" desc="Theme, wallpaper, and the glass over it.">
          <Row label="Theme" sub="Dark or light surface tones.">
            <div className="glass-soft" style={{ display: "flex", gap: 3, padding: 4, borderRadius: 999 }}>
              {[["dark", "Moon"], ["light", "Sun"]].map(([t, ic]) => {
                const Icon = Icons[ic]; const on = theme === t;
                return (
                  <button key={t} onClick={() => setTheme(t)} className="pill" style={{ padding: "6px 14px", fontSize: 12.5,
                    color: on ? "var(--primary)" : "var(--text-muted)",
                    background: on ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "transparent" }}>
                    <Icon size={14} /> {t[0].toUpperCase() + t.slice(1)}</button>);
              })}
            </div>
          </Row>

          <Row label="Wallpaper" sub="The image you focus over.">
            <div style={{ display: "flex", gap: 8 }}>
              {WALLPAPERS.map((w) => (
                <button key={w.id} onClick={() => setWallpaper(w.id)} title={w.name}
                  className={w.id} style={{ width: 46, height: 32, borderRadius: 9, position: "relative",
                    border: wallpaper === w.id ? "2px solid var(--primary)" : "2px solid transparent",
                    boxShadow: wallpaper === w.id ? "0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent)" : "none",
                    backgroundSize: "cover" }} />
              ))}
            </div>
          </Row>

          <div style={{ padding: "16px 0 4px", borderTop: "1px solid var(--hairline-soft)" }}>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Glass tint</p>
            <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 12 }}>
              How opaque the cards over your wallpaper feel.</p>
            <GlassSlider label="Tint" value={tint} min={0} max={1} step={0.01} onChange={setTint} display={`${Math.round(tint * 100)}%`} />
            <div style={{ height: 16 }} />
            <GlassSlider label="Blur" value={blur} min={0} max={48} step={1} accent onChange={setBlur} display={`${blur}px`} />
          </div>
        </Section>

        <Section icon="Spotify" title="Music" desc="Connect Spotify to show the player in your dock.">
          <Row label="Spotify account" sub={spotifyConnected ? "Connected — player shows in the focus dock." : "Not connected — music stays hidden."}>
            {spotifyConnected ? (
              <button onClick={() => setSpotifyConnected(false)} className="pill hover-lift"
                style={{ padding: "8px 15px", fontSize: 12.5, color: "var(--text-muted)",
                  background: "rgba(var(--glass-edge),0.06)", border: "1px solid var(--hairline)" }}>Disconnect</button>
            ) : (
              <button onClick={() => setSpotifyConnected(true)} className="pill hover-lift"
                style={{ padding: "8px 15px", fontSize: 12.5, color: "#000", background: "#1DB954" }}>
                <Icons.Spotify size={15} color="#000" /> Connect</button>
            )}
          </Row>
        </Section>

        <Section icon="Clock" title="Timer" desc="Default session lengths.">
          <Row label="Focus duration" sub="Length of one pomodoro."><DurChip v="45 min" /></Row>
          <Row label="Short break"><DurChip v="5 min" /></Row>
          <Row label="Long break" sub="Every 4 sessions."><DurChip v="15 min" /></Row>
          <Row label="Auto-start breaks" sub="Flow straight into the break.">
            <Switch on={autoBreak} onChange={setAutoBreak} /></Row>
        </Section>

        <Section icon="Bell" title="Notifications">
          <Row label="Session alerts" sub="Notify when a session or break ends.">
            <Switch on={notif} onChange={setNotif} /></Row>
        </Section>

        <button className="pill hover-lift" style={{ padding: "11px 18px", fontSize: 13.5, color: "var(--text-muted)",
          background: "rgba(var(--glass-edge),0.05)", border: "1px solid var(--hairline)" }}>
          <Icons.Logout size={16} /> Sign out</button>
      </div>
    </div>
  );
}

function DurChip({ v }) {
  return <span className="pill glass-soft tabnum" style={{ padding: "7px 14px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{v}</span>;
}

window.SettingsPage = SettingsPage;
