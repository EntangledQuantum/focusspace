/* ════════════════════════════════════════════════════════════════
   APP SHELL — wallpaper + nav + routing
   ════════════════════════════════════════════════════════════════ */
function Shell() {
  const { route, wallpaper } = useApp();
  const Page = { focus: FocusPage, projects: ProjectsPage, analytics: AnalyticsPage, settings: SettingsPage }[route] || FocusPage;
  return (
    <>
      <div className={"wallpaper " + wallpaper} />
      <div style={{ position: "relative", zIndex: 10, height: "100dvh", overflowY: "auto" }} className="no-scrollbar">
        <Page />
      </div>
      <TopNav />
    </>
  );
}

function App() {
  return (
    <ToastHost>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ToastHost>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
