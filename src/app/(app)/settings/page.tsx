"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { MESH_WALLPAPERS } from "@/components/layout/WallpaperRenderer";
import { AnimatedBackdrop } from "@/components/effects/AnimatedBackdrop";
import { SliderRow } from "@/components/layout/TopNav";
import { EFFECTS, effectSettingsFor, type EffectSettings } from "@/lib/effects";
import { TONE_OPTIONS } from "@/lib/audio/tones";
import { playTone } from "@/lib/audio/tones";
import { WallpaperEditModal, type CropResult } from "@/components/settings/WallpaperEditModal";
import { clearSpotifyToken } from "@/lib/spotify/api";
import { toast } from "sonner";
import { Bell, Paintbrush, Timer, Upload, Loader2, Trash2, Sliders, Music, LogOut, Sparkles, Ban } from "lucide-react";
import type { UserSettings, Wallpaper } from "@/types/database";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_STORAGE_MB = 50;

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export default function SettingsPage() {
  const supabase = createClient();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return data as UserSettings;
    },
  });

  const { data: userWallpapers = [] } = useQuery<Wallpaper[]>({
    queryKey: ["wallpapers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wallpapers")
        .select("*")
        .eq("is_builtin", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const [local, setLocal] = useState<Partial<UserSettings>>({});
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const glassSaveRef = useRef<{ id: ReturnType<typeof setTimeout> | null; v: { tint: number; blur: number } }>({
    id: null, v: { tint: 0.5, blur: 22 },
  });

  useEffect(() => {
    if (settings) {
      setLocal(settings);
      glassSaveRef.current.v = { tint: settings.glass_tint ?? 0.5, blur: settings.glass_blur ?? 22 };
    }
  }, [settings]);

  // Live CSS-var update + debounced write for the glass sliders
  function updateGlass(partial: Partial<{ tint: number; blur: number }>) {
    const g = glassSaveRef.current;
    g.v = { ...g.v, ...partial };
    if (partial.tint !== undefined) {
      field("glass_tint", g.v.tint);
      document.documentElement.style.setProperty("--glass-tint", String(g.v.tint));
    }
    if (partial.blur !== undefined) {
      field("glass_blur", g.v.blur);
      document.documentElement.style.setProperty("--glass-blur", `${g.v.blur}px`);
    }
    if (g.id) clearTimeout(g.id);
    g.id = setTimeout(() => {
      save.mutate({ glass_tint: g.v.tint, glass_blur: g.v.blur });
    }, 300);
  }

  const save = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { user_id: _uid, ...updateFields } = patch as UserSettings;
      const { error } = await supabase.from("user_settings").update(updateFields).eq("user_id", settings!.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["wallpaper"] });
    },
    onError: () => toast.error("Failed to save"),
  });

  function field<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  function saveField<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    field(key, value);
    save.mutate({ [key]: value } as Partial<UserSettings>);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`File too large — maximum is 15 MB`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setPendingFile(file);
  }

  async function handleCropConfirm(result: CropResult) {
    setPendingFile(null);
    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    const path = `user-${user!.id}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("wallpapers")
      .upload(path, result.blob, { contentType: "image/jpeg" });

    if (uploadError) { toast.error("Upload failed"); setUploading(false); return; }

    const { data: wp, error: dbError } = await supabase.from("wallpapers").insert({
      user_id: user!.id,
      name: result.name,
      storage_path: path,
      is_builtin: false,
    }).select().single();

    if (dbError || !wp) {
      toast.error("Failed to save wallpaper");
    } else {
      qc.invalidateQueries({ queryKey: ["wallpapers"] });
      saveField("active_wallpaper_id", wp.id);
      toast.success("Wallpaper set!");
    }
    setUploading(false);
  }

  async function deleteWallpaper(wp: Wallpaper) {
    await supabase.storage.from("wallpapers").remove([wp.storage_path]);
    await supabase.from("wallpapers").delete().eq("id", wp.id);

    if (local.active_wallpaper_id === wp.id) {
      saveField("active_wallpaper_id", null);
    }
    qc.invalidateQueries({ queryKey: ["wallpapers"] });
    toast.success("Wallpaper deleted");
  }

  async function requestNotifPermission() {
    if (!("Notification" in window)) { toast.error("Notifications not supported"); return; }
    const result = await Notification.requestPermission();
    if (result === "granted") {
      saveField("browser_notifs_enabled", true);
      toast.success("Notifications enabled");
    } else {
      toast.error("Permission denied");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-on-surface-variant)" }} />
      </div>
    );
  }

  const storageMbUsed = Math.round((userWallpapers.length * 2.5)); // rough estimate ~2.5MB per cropped jpeg
  const storagePercent = Math.min(100, (storageMbUsed / MAX_STORAGE_MB) * 100);

  // Photo blur/brightness controls only apply to an uploaded photo background
  const activeIsPhoto = userWallpapers.some((w) => w.id === local.active_wallpaper_id);

  const activeEffect = local.active_effect ?? null;
  const storedEffectSettings = (local.effect_settings as Record<string, Partial<EffectSettings>> | null) ?? {};

  // Live + debounced write for the active effect's settings
  function updateEffect(partial: Partial<EffectSettings>) {
    if (!activeEffect) return;
    const current = effectSettingsFor(activeEffect, storedEffectSettings);
    const next = { ...current, ...partial };
    const merged = { ...storedEffectSettings, [activeEffect]: next };
    field("effect_settings", merged as UserSettings["effect_settings"]);
    save.mutate({ effect_settings: merged as UserSettings["effect_settings"] });
  }

  function selectEffect(id: string | null) {
    saveField("active_effect", id);
  }

  return (
    <>
      {pendingFile && (
        <WallpaperEditModal
          file={pendingFile}
          onConfirm={handleCropConfirm}
          onCancel={() => setPendingFile(null)}
        />
      )}

      <div className="p-8 max-w-3xl mx-auto space-y-6 pb-16" style={{ paddingTop: 104 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", color: "var(--color-on-surface)" }}>
            Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-on-surface-variant)" }}>
            Tune the space to disappear into.
          </p>
        </div>

        {/* Appearance */}
        <Section icon={<Paintbrush size={18} />} title="Appearance" desc="Theme, wallpaper, and the glass over it.">
          <Field label="Theme" description="Dark or light surface tones.">
            <div className="glass-soft flex rounded-full" style={{ gap: 3, padding: 4 }}>
              {THEME_OPTIONS.map((opt) => {
                const on = local.theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => saveField("theme", opt.value)}
                    className="pill"
                    style={{
                      padding: "6px 14px", fontSize: 12.5,
                      color: on ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                      background: on ? "color-mix(in srgb, var(--color-primary) 15%, transparent)" : "transparent",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Background */}
          <div className="space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: 4 }}>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-on-surface)" }}>Background</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
                A preset or your own photo. Add a live effect on top below.
              </p>
            </div>

            {/* Mesh wallpaper presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MESH_WALLPAPERS.map((s) => {
                const isActive = local.active_wallpaper_id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => saveField("active_wallpaper_id", s.id)}
                    className={`relative rounded-xl overflow-hidden transition-all ${s.id}`}
                    style={{
                      aspectRatio: "16/9",
                      outline: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                      outlineOffset: "2px",
                    }}
                  >
                    <div className="absolute inset-0 flex items-end p-1.5">
                      <span className="text-[9px] font-semibold leading-none px-1.5 py-1 rounded"
                        style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                        {s.name}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                        style={{ background: "var(--color-primary)" }}>
                        <span className="text-[7px] leading-none">✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* User-uploaded wallpapers */}
            {userWallpapers.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                {userWallpapers.map((wp) => {
                  const isActive = local.active_wallpaper_id === wp.id;
                  const imgUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wallpapers/${wp.storage_path}`;
                  return (
                    <div key={wp.id} className="relative group">
                      <button
                        onClick={() => saveField("active_wallpaper_id", wp.id)}
                        className="relative w-full rounded-xl overflow-hidden transition-all"
                        style={{
                          aspectRatio: "16/9",
                          outline: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                          outlineOffset: "2px",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgUrl} alt={wp.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-end p-1.5">
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded truncate max-w-full"
                            style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                            {wp.name}
                          </span>
                        </div>
                        {isActive && (
                          <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                            style={{ background: "var(--color-primary)" }}>
                            <span className="text-[7px]">✓</span>
                          </div>
                        )}
                      </button>
                      <button
                        onClick={() => deleteWallpaper(wp)}
                        className="absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.75)", color: "#ff6b6b" }}
                        title="Delete wallpaper">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Upload button */}
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all text-sm font-medium"
              style={{
                background: "var(--color-surface-container-high)",
                color: uploading ? "var(--color-on-surface-variant)" : "var(--color-on-surface)",
                border: "1px dashed var(--color-outline-variant)",
                opacity: uploading ? 0.7 : 1,
                pointerEvents: uploading ? "none" : "auto",
              }}>
              {uploading
                ? <Loader2 size={14} className="animate-spin" />
                : <Upload size={14} />}
              {uploading ? "Uploading…" : "Upload image"}
              <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={uploading} />
            </label>

            {/* Storage quota */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                <span>{userWallpapers.length} custom wallpaper{userWallpapers.length !== 1 ? "s" : ""}</span>
                <span>~{storageMbUsed} MB / {MAX_STORAGE_MB} MB</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--color-surface-container-high)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${storagePercent}%`,
                    background: storagePercent > 80 ? "var(--color-error)" : "var(--color-primary)",
                  }}
                />
              </div>
              <p className="text-[10px]" style={{ color: "var(--color-on-surface-variant)" }}>
                Max 15 MB per file · 50 MB total
              </p>
            </div>

            {/* Photo adjustments — only when an uploaded photo is the background */}
            {activeIsPhoto && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 4 }}>
                <p className="text-xs font-medium mb-3" style={{ color: "var(--color-on-surface)" }}>
                  Photo adjustments
                </p>
                <div className="space-y-4">
                  <SliderRow
                    label="Blur"
                    display={`${local.wallpaper_blur ?? 60}%`}
                    value={local.wallpaper_blur ?? 60}
                    min={0} max={100} step={5}
                    onChange={(v) => { field("wallpaper_blur", v); save.mutate({ wallpaper_blur: v }); }}
                  />
                  <SliderRow
                    label="Brightness" accent
                    display={`${local.wallpaper_opacity ?? 40}%`}
                    value={local.wallpaper_opacity ?? 40}
                    min={0} max={100} step={5}
                    onChange={(v) => { field("wallpaper_opacity", v); save.mutate({ wallpaper_opacity: v }); }}
                  />
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Live Effect — overlays on top of whatever background is set */}
        <Section icon={<Sparkles size={18} />} title="Live Effect" desc="Weather & ambience layered over your wallpaper.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* None */}
            <button
              onClick={() => selectEffect(null)}
              className="relative rounded-xl overflow-hidden transition-all flex items-center justify-center"
              style={{
                aspectRatio: "16/9",
                background: "var(--color-surface-container-high)",
                outline: !activeEffect ? "2px solid var(--color-primary)" : "2px solid transparent",
                outlineOffset: "2px",
                color: "var(--color-on-surface-variant)",
              }}
            >
              <div className="flex flex-col items-center gap-1">
                <Ban size={15} />
                <span className="text-[9px] font-semibold">No effect</span>
              </div>
              {!activeEffect && (
                <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                  style={{ background: "var(--color-primary)" }}>
                  <span className="text-[7px] leading-none">✓</span>
                </div>
              )}
            </button>

            {EFFECTS.map((e) => {
              const isActive = activeEffect === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => selectEffect(e.id)}
                  className="relative rounded-xl overflow-hidden transition-all wp-noir"
                  style={{
                    aspectRatio: "16/9",
                    outline: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                    outlineOffset: "2px",
                  }}
                >
                  <AnimatedBackdrop
                    variant={e.variant}
                    intensity={Math.min(1, e.defaults.intensity * 1.6)}
                    speed={e.defaults.speed}
                    density={e.defaults.density}
                    className="absolute inset-0"
                  />
                  <div className="absolute inset-0 flex items-end p-1.5">
                    <span className="text-[9px] font-semibold leading-none px-1.5 py-1 rounded"
                      style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                      {e.name}
                    </span>
                  </div>
                  {isActive && (
                    <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                      style={{ background: "var(--color-primary)" }}>
                      <span className="text-[7px] leading-none">✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Per-effect settings — only when an effect is selected */}
          {activeEffect && (() => {
            const def = EFFECTS.find((e) => e.id === activeEffect);
            if (!def) return null;
            const s = effectSettingsFor(activeEffect, storedEffectSettings);
            return (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: 14 }} className="space-y-4">
                <p className="text-xs font-medium" style={{ color: "var(--color-on-surface)" }}>
                  {def.name} settings
                </p>
                <SliderRow
                  label="Intensity"
                  display={`${Math.round(s.intensity * 100)}%`}
                  value={s.intensity}
                  min={0} max={1} step={0.02}
                  onChange={(v) => updateEffect({ intensity: v })}
                />
                <SliderRow
                  label="Speed" accent
                  display={`${s.speed.toFixed(2)}×`}
                  value={s.speed}
                  min={0.25} max={2} step={0.05}
                  onChange={(v) => updateEffect({ speed: v })}
                />
                {def.hasDensity && (
                  <SliderRow
                    label="Density"
                    display={`${Math.round(s.density * 100)}%`}
                    value={s.density}
                    min={0.3} max={1.5} step={0.05}
                    onChange={(v) => updateEffect({ density: v })}
                  />
                )}
              </div>
            );
          })()}
        </Section>

        {/* Glass tint + blur — drives every .glass card live */}
        <Section icon={<Sliders size={18} />} title="Glass" desc="How opaque and frosted the cards over your wallpaper feel.">
          <div className="space-y-4">
            <SliderRow
              label="Tint"
              display={`${Math.round((local.glass_tint ?? 0.5) * 100)}%`}
              value={local.glass_tint ?? 0.5}
              min={0} max={1} step={0.01}
              onChange={(v) => updateGlass({ tint: v })}
            />
            <SliderRow
              label="Blur" accent
              display={`${local.glass_blur ?? 22}px`}
              value={local.glass_blur ?? 22}
              min={0} max={48} step={1}
              onChange={(v) => updateGlass({ blur: v })}
            />
          </div>
        </Section>

        {/* Music */}
        <MusicSection settings={settings} onSave={(patch) => save.mutate(patch)} />

        {/* Notifications */}
        <Section icon={<Bell size={18} />} title="Notifications">
          <Field label="Completion Tone" description="Sound played when a session completes.">
            <select
              value={local.completion_tone ?? "soft-chime"}
              onChange={(e) => saveField("completion_tone", e.target.value)}
              className="px-3 py-2 rounded-xl text-sm outline-none"
              style={{
                background: "var(--color-surface-container-high)",
                color: "var(--color-on-surface)",
                border: "1px solid var(--color-outline-variant)",
              }}
            >
              {TONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button
              onClick={() => playTone(local.completion_tone ?? "soft-chime")}
              className="ml-2 px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: "var(--color-surface-container-high)", color: "var(--color-on-surface-variant)", border: "1px solid var(--color-outline-variant)" }}
            >
              Preview
            </button>
          </Field>

          <Field label="Do Not Disturb" description="Mute all tones during active focus sessions.">
            <Toggle
              checked={local.dnd_during_focus ?? false}
              onChange={(v) => saveField("dnd_during_focus", v)}
            />
          </Field>

          <Field label="Browser Notifications" description="Get notified when a session completes, even with the tab hidden.">
            <button
              onClick={requestNotifPermission}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
              style={{
                background: "color-mix(in srgb, var(--color-primary-container) 25%, transparent)",
                color: "var(--color-primary)",
                border: "1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)",
              }}
            >
              <Bell size={14} />
              Enable Browser Notifications
            </button>
          </Field>
        </Section>

        {/* Timer Logic */}
        <Section icon={<Timer size={18} />} title="Timer Logic">
          <Field label="Focus Duration" description={`${Math.floor((local.focus_duration_sec ?? 1500) / 60)} min`}>
            <input
              type="range" min={5} max={120} step={5}
              value={Math.floor((local.focus_duration_sec ?? 1500) / 60)}
              onChange={(e) => field("focus_duration_sec", parseInt(e.target.value) * 60)}
              onMouseUp={() => save.mutate({ focus_duration_sec: local.focus_duration_sec })}
              onTouchEnd={() => save.mutate({ focus_duration_sec: local.focus_duration_sec })}
              className="w-48"
              style={{ accentColor: "var(--color-primary)" }}
            />
          </Field>

          <Field label="Short Break" description={`${Math.floor((local.short_break_sec ?? 300) / 60)} min`}>
            <input
              type="range" min={1} max={30} step={1}
              value={Math.floor((local.short_break_sec ?? 300) / 60)}
              onChange={(e) => field("short_break_sec", parseInt(e.target.value) * 60)}
              onMouseUp={() => save.mutate({ short_break_sec: local.short_break_sec })}
              onTouchEnd={() => save.mutate({ short_break_sec: local.short_break_sec })}
              className="w-48"
              style={{ accentColor: "var(--color-secondary)" }}
            />
          </Field>

          <Field label="Long Break" description={`${Math.floor((local.long_break_sec ?? 900) / 60)} min`}>
            <input
              type="range" min={5} max={60} step={5}
              value={Math.floor((local.long_break_sec ?? 900) / 60)}
              onChange={(e) => field("long_break_sec", parseInt(e.target.value) * 60)}
              onMouseUp={() => save.mutate({ long_break_sec: local.long_break_sec })}
              onTouchEnd={() => save.mutate({ long_break_sec: local.long_break_sec })}
              className="w-48"
              style={{ accentColor: "var(--color-tertiary)" }}
            />
          </Field>

          <Field label="Long break every" description="Number of pomodoros before a long break.">
            <select
              value={local.long_break_every ?? 4}
              onChange={(e) => saveField("long_break_every", parseInt(e.target.value))}
              className="px-3 py-2 rounded-xl text-sm outline-none"
              style={{
                background: "var(--color-surface-container-high)",
                color: "var(--color-on-surface)",
                border: "1px solid var(--color-outline-variant)",
              }}
            >
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} sessions</option>)}
            </select>
          </Field>

          <Field label="Auto-start breaks" description="Automatically start break timer after a focus session.">
            <Toggle
              checked={local.auto_start_breaks ?? false}
              onChange={(v) => saveField("auto_start_breaks", v)}
            />
          </Field>

          <Field label="Auto-start pomodoros" description="Automatically start next focus session after a break.">
            <Toggle
              checked={local.auto_start_pomodoros ?? false}
              onChange={(v) => saveField("auto_start_pomodoros", v)}
            />
          </Field>
        </Section>

        {/* Sign out */}
        <SignOutButton />
      </div>
    </>
  );
}

function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="pill hover-lift btn-hover-error"
      style={{
        padding: "11px 18px", fontSize: 13.5,
        color: "var(--color-on-surface-variant)",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <LogOut size={16} /> Sign out
    </button>
  );
}

function MusicSection({
  settings,
  onSave,
}: {
  settings: UserSettings | undefined;
  onSave: (patch: Partial<UserSettings>) => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const isConnected = !!settings?.spotify_access_token;

  function connectSpotify() { window.location.href = "/api/spotify/connect?next=/settings"; }

  async function disconnectSpotify() {
    const { error } = await supabase.from("user_settings").update({
      spotify_access_token: null,
      spotify_refresh_token: null,
      spotify_token_expires_at: null,
    }).eq("user_id", settings!.user_id);
    if (!error) {
      clearSpotifyToken();
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["spotify-token"] });
      toast.success("Spotify disconnected");
    }
  }

  return (
    <Section icon={<Music size={18} />} title="Music">
      <Field label="Spotify" description={isConnected ? "Spotify is connected." : "Connect to play music during focus sessions."}>
        {isConnected ? (
          <button
            onClick={disconnectSpotify}
            className="px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95"
            style={{
              background: "color-mix(in srgb, var(--color-error) 15%, transparent)",
              color: "var(--color-error)",
              border: "1px solid color-mix(in srgb, var(--color-error) 30%, transparent)",
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={connectSpotify}
            className="px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 flex items-center gap-2"
            style={{ background: "#1DB954", color: "#000" }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Connect Spotify
          </button>
        )}
      </Field>
      {isConnected && (
        <>
          <Field label="Auto-start music" description="Play music automatically when a focus session starts.">
            <Toggle
              checked={settings?.spotify_auto_start ?? true}
              onChange={(v) => onSave({ spotify_auto_start: v })}
            />
          </Field>
          <Field
            label="Take over playback"
            description="If Spotify is already playing on another device when a session starts, move it here. Off keeps playing there."
          >
            <Toggle
              checked={settings?.spotify_takeover ?? true}
              onChange={(v) => onSave({ spotify_takeover: v })}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="glass" style={{ borderRadius: 22, padding: 22 }}>
      <div className="flex items-center" style={{ gap: 11, marginBottom: 14 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 34, height: 34, borderRadius: 11,
            background: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
            color: "var(--color-primary)",
          }}
        >
          {icon}
        </div>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700, color: "var(--color-on-surface)" }}>
            {title}
          </p>
          {desc && <p style={{ fontSize: 12.5, color: "var(--color-on-surface-variant)", opacity: 0.8, marginTop: 1 }}>{desc}</p>}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{ padding: "11px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="min-w-0">
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-on-surface)" }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: "var(--color-on-surface-variant)", opacity: 0.8, marginTop: 2 }}>{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex shrink-0 ${checked ? "grad-primary justify-end" : "justify-start"}`}
      style={{
        width: 46, height: 27, borderRadius: 99, padding: 3,
        background: checked ? undefined : "rgba(255,255,255,0.13)",
        transition: "background .2s",
      }}
    >
      <span
        style={{
          width: 21, height: 21, borderRadius: "50%", background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all .2s",
        }}
      />
    </button>
  );
}
