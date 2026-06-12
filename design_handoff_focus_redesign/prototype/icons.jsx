/* Lightweight lucide-style stroke icons */
const Ic = ({ d, size = 18, fill = "none", sw = 2, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  Timer:    (p) => <Ic {...p}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6M5 5l1.5 1.5"/></Ic>,
  Folder:   (p) => <Ic {...p}><path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></Ic>,
  Chart:    (p) => <Ic {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></Ic>,
  Settings: (p) => <Ic {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 .9 14H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3 8.6a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 8 4.1h.1A1.7 1.7 0 0 0 9.3 2.5V2a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 16 4.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></Ic>,
  Play:     (p) => <Ic {...p} fill="currentColor" sw={0}><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z"/></Ic>,
  Pause:    (p) => <Ic {...p} fill="currentColor" sw={0}><rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/></Ic>,
  Reset:    (p) => <Ic {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></Ic>,
  Skip:     (p) => <Ic {...p}><path d="M5 5v14l9-7zM19 5v14"/></Ic>,
  Check:    (p) => <Ic {...p}><path d="M20 6 9 17l-5-5"/></Ic>,
  CheckCircle:(p)=> <Ic {...p}><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></Ic>,
  Circle:   (p) => <Ic {...p}><circle cx="12" cy="12" r="9"/></Ic>,
  Chevron:  (p) => <Ic {...p}><path d="M6 9l6 6 6-6"/></Ic>,
  Pencil:   (p) => <Ic {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></Ic>,
  Expand:   (p) => <Ic {...p}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></Ic>,
  Shrink:   (p) => <Ic {...p}><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></Ic>,
  Music:    (p) => <Ic {...p}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></Ic>,
  Sun:      (p) => <Ic {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></Ic>,
  Moon:     (p) => <Ic {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></Ic>,
  List:     (p) => <Ic {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></Ic>,
  Shuffle:  (p) => <Ic {...p}><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></Ic>,
  Prev:     (p) => <Ic {...p} fill="currentColor" sw={0}><path d="M6 5v14M19 5 9 12l10 7z"/></Ic>,
  Next:     (p) => <Ic {...p} fill="currentColor" sw={0}><path d="M18 5v14M5 5l10 7L5 19z"/></Ic>,
  Volume:   (p) => <Ic {...p}><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></Ic>,
  Mute:     (p) => <Ic {...p}><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/></Ic>,
  Plus:     (p) => <Ic {...p}><path d="M12 5v14M5 12h14"/></Ic>,
  Sliders:  (p) => <Ic {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></Ic>,
  Flame:    (p) => <Ic {...p}><path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-1.5.6-2.5 1.3-3.3C9 9 9.5 7.5 8.5 6c2 .5 3 2 3 2 .5-2 .5-4 .5-6z"/></Ic>,
  Logout:   (p) => <Ic {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></Ic>,
  Target:   (p) => <Ic {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></Ic>,
  Clock:    (p) => <Ic {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Ic>,
  Bell:     (p) => <Ic {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></Ic>,
  Wallpaper:(p) => <Ic {...p}><rect x="3" y="4" width="18" height="14" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 14l-5-4-7 6"/></Ic>,
  X:        (p) => <Ic {...p}><path d="M18 6 6 18M6 6l12 12"/></Ic>,
  Search:   (p) => <Ic {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></Ic>,
  Dots:     (p) => <Ic {...p}><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></Ic>,
  Spotify:  ({ size = 18, color = "#1DB954" }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  ),
};

window.Icons = Icons;
