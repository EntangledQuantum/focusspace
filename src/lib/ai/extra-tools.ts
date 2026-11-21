import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { performDelete, DESTRUCTIVE_ACTIONS } from "./confirm";
import { UUID_RE, ToolError, type makeResolvers } from "./resolve";
import { formatStatus, timerLine } from "./status";
import { readTimerState } from "@/lib/timer/persist";
import { CommandError, getExtensionState, runTaskCommand, runTimerCommand, type TimerAction } from "@/lib/extension/service";
import { SOUND_PRESETS, type SoundPresetId } from "@/lib/audio/sound-settings";

type DB = SupabaseClient<Database>;
type Resolvers = ReturnType<typeof makeResolvers>;
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

function fmtDur(sec: number) {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

const TONE_IDS = SOUND_PRESETS.map((p) => p.id) as [SoundPresetId, ...SoundPresetId[]];
const TIMER_MODE = z.enum(["pomodoro", "custom", "short_break", "long_break"]);

/**
 * `supabase` must already be user-scoped (see scopeToUser) — makeTaskTools
 * passes the scoped client and shared resolvers. Timer commands go through
 * the same service as the Chrome extension (lib/extension/service.ts), so
 * every remote client follows one set of rules (optimistic concurrency,
 * overdue sessions recorded, accidental <10s sessions dropped).
 */
export function makeExtraTools(
  supabase: DB,
  userId: string,
  opts: { destructive: "allow" | "confirm" },
  resolve: Resolvers,
): ToolSet {
  /** Task from an explicit ref, else the first open task of a project. */
  async function pickTask(taskRef?: string, projectRef?: string): Promise<TaskRow | null> {
    if (taskRef) {
      const project = projectRef ? await resolve.project(projectRef) : null;
      return resolve.task(taskRef, project?.id);
    }
    if (projectRef) {
      const p = await resolve.project(projectRef);
      const { data } = await supabase.from("tasks").select("*").eq("project_id", p.id).eq("status", "todo").order("sort_order").limit(1);
      if (!data?.[0]) throw new ToolError(`"${p.name}" has no open tasks.`);
      return data[0];
    }
    return null;
  }

  /** Run a service command, turning its conflicts into tool errors the agent can read. */
  async function command<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof CommandError) throw new ToolError(e.message);
      throw e;
    }
  }

  async function timezone(): Promise<string | null> {
    const { data } = await supabase.from("profiles").select("timezone").maybeSingle();
    return data?.timezone ?? null;
  }

  /** Timer line after a command — the agent sees the new state without another call. */
  async function timerAfter(prefix: string): Promise<string> {
    const [state, tz] = await Promise.all([getExtensionState(supabase, userId), timezone()]);
    const task = state.task ? ` · task: ${state.task.title} (id: ${state.task.id})` : "";
    return `${prefix}\n${timerLine(state, tz)}${task}`;
  }

  async function nowPlaying(): Promise<string | null> {
    const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
    const auth = await getUserSpotifyAccessToken(supabase, userId);
    if ("error" in auth) return null;
    try {
      const res = await spotifyUserFetch(auth.token, "/me/player");
      if (res.status === 204 || !res.ok) return "nothing playing";
      const p = res.json as { is_playing?: boolean; item?: { name?: string; artists?: { name: string }[] } } | null;
      if (!p?.item) return "nothing playing";
      return `${p.is_playing ? "playing" : "paused"} · ${p.item.name} — ${(p.item.artists ?? []).map((a) => a.name).join(", ")}`;
    } catch {
      return "unavailable";
    }
  }

  const simple = (action: TimerAction, done: string) => tool({
    description: {
      pause: "Pause the running timer.",
      resume: "Resume a paused timer.",
      skip: "Skip the current session — ends it without counting it as completed (sessions under 10s are discarded).",
      stop: "Stop / reset the timer: ends the current session (not counted) and returns to idle. Keeps the selected task and its completed pomodoros.",
      start: "",
    }[action],
    inputSchema: z.object({}),
    execute: async () => {
      await command(() => runTimerCommand(supabase, userId, action));
      return timerAfter(done);
    },
  });

  return {
    get_workspace_state: tool({
      description:
        "CALL FIRST. Compact live status: timer (running/paused/idle, mode, mm:ss + seconds left, ends_at), selected task + subtasks, project, " +
        "pomodoro cycle, timer settings, Spotify now playing, timezone. Cheap — call again whenever you need fresh state.",
      inputSchema: z.object({ music: z.boolean().optional().default(true).describe("Include Spotify now playing (one extra API call)") }),
      execute: async ({ music }) => {
        const [state, { data: s }, { data: profile }] = await Promise.all([
          getExtensionState(supabase, userId),
          supabase.from("user_settings").select("focus_duration_sec, short_break_sec, long_break_sec, long_break_every, auto_start_breaks, auto_start_pomodoros, ai_destructive, spotify_refresh_token").maybeSingle(),
          supabase.from("profiles").select("timezone").maybeSingle(),
        ]);
        return formatStatus(state, {
          timezone: profile?.timezone,
          destructive: s?.ai_destructive ?? opts.destructive,
          settings: {
            focusSec: s?.focus_duration_sec ?? 1500,
            shortBreakSec: s?.short_break_sec ?? 300,
            longBreakSec: s?.long_break_sec ?? 900,
            longBreakEvery: s?.long_break_every ?? 4,
            autoStartBreaks: s?.auto_start_breaks,
            autoStartPomodoros: s?.auto_start_pomodoros,
          },
          music: music && s?.spotify_refresh_token ? await nowPlaying() : music ? null : undefined,
        });
      },
    }),

    reset_task_progress: tool({
      description:
        "Start a task over: uncheck ALL its subtasks, set completed pomodoros to 0, and stop the timer if this task is running. Same as the dock Reset button.",
      inputSchema: z.object({ taskRef: z.string().min(1) }),
      execute: async ({ taskRef }) => {
        const t = await resolve.task(taskRef);
        const timer = await readTimerState(supabase, userId);
        if (timer?.currentTaskId === t.id && (timer.status === "running" || timer.status === "paused")) {
          await command(() => runTimerCommand(supabase, userId, "stop"));
        }
        await supabase.from("subtasks").update({ done: false }).eq("task_id", t.id);
        await supabase.from("tasks").update({ completed_pomodoros: 0 }).eq("id", t.id);
        return `Reset "${t.title}" (id: ${t.id}) — subtasks unchecked, pomodoros 0.`;
      },
    }),

    get_settings: tool({
      description: "Read timer, sound and app settings as compact JSON (durations in seconds).",
      inputSchema: z.object({}),
      execute: async () => {
        const cols = [
          "focus_duration_sec", "short_break_sec", "long_break_sec", "long_break_every", "auto_start_breaks", "auto_start_pomodoros",
          "theme", "ai_destructive", "dnd_during_focus", "completion_tone", "break_end_tone", "sound_enabled", "sound_volume",
        ] as const;
        const { data } = await supabase.from("user_settings").select(cols.join(", ")).maybeSingle();
        if (!data) return "No settings yet.";
        // Project explicitly: the local SQLite shim returns every column (incl. secrets like Spotify tokens).
        const row = data as unknown as Record<string, unknown>;
        return JSON.stringify(Object.fromEntries(cols.map((c) => [c, row[c]])));
      },
    }),

    update_settings: tool({
      description: "Change timer/app settings: durations (in SECONDS), auto-start, theme, delete confirmation, and notification sounds (on/off, volume, tones).",
      inputSchema: z.object({
        focusDurationSec: z.number().int().min(300).max(7200).optional(),
        shortBreakSec: z.number().int().min(60).max(1800).optional(),
        longBreakSec: z.number().int().min(300).max(3600).optional(),
        longBreakEvery: z.number().int().min(1).max(12).optional(),
        autoStartBreaks: z.boolean().optional(),
        autoStartPomodoros: z.boolean().optional(),
        theme: z.enum(["dark", "light", "system"]).optional(),
        destructive: z.enum(["allow", "confirm"]).optional(),
        soundEnabled: z.boolean().optional().describe("Master on/off for notification sounds"),
        soundVolume: z.number().int().min(0).max(100).optional().describe("Notification volume 0–100"),
        focusEndTone: z.enum(TONE_IDS).optional().describe("Sound when a focus session ends"),
        breakEndTone: z.enum(TONE_IDS).optional().describe("Sound when a break ends"),
        muteDuringFocus: z.boolean().optional().describe("Do-not-disturb: mute tones during focus"),
      }),
      execute: async (input) => {
        const patch: Database["public"]["Tables"]["user_settings"]["Update"] = {};
        if (input.focusDurationSec !== undefined) patch.focus_duration_sec = input.focusDurationSec;
        if (input.shortBreakSec !== undefined) patch.short_break_sec = input.shortBreakSec;
        if (input.longBreakSec !== undefined) patch.long_break_sec = input.longBreakSec;
        if (input.longBreakEvery !== undefined) patch.long_break_every = input.longBreakEvery;
        if (input.autoStartBreaks !== undefined) patch.auto_start_breaks = input.autoStartBreaks;
        if (input.autoStartPomodoros !== undefined) patch.auto_start_pomodoros = input.autoStartPomodoros;
        if (input.theme !== undefined) patch.theme = input.theme;
        if (input.destructive !== undefined) patch.ai_destructive = input.destructive;
        if (input.soundEnabled !== undefined) patch.sound_enabled = input.soundEnabled;
        if (input.soundVolume !== undefined) patch.sound_volume = input.soundVolume;
        if (input.focusEndTone !== undefined) patch.completion_tone = input.focusEndTone;
        if (input.breakEndTone !== undefined) patch.break_end_tone = input.breakEndTone;
        if (input.muteDuringFocus !== undefined) patch.dnd_during_focus = input.muteDuringFocus;
        if (!Object.keys(patch).length) throw new ToolError("Nothing to update — pass at least one setting.");
        const { error } = await supabase.from("user_settings").update(patch);
        if (error) throw new ToolError(`Couldn't update settings: ${error.message}`);
        return `Updated settings: ${Object.keys(patch).join(", ")}.`;
      },
    }),

    // ─── TIMER ─────────────────────────────────────────────────────────
    // Writes timer_state; open FocusSpace tabs and the extension follow it.
    start_timer: tool({
      description:
        "Start a session. mode: pomodoro (default, uses the focus length), custom, short_break, long_break. durationSec overrides the length. " +
        "taskRef (or projectRef → its first open task) picks the task; omit to keep the selected one. " +
        "Switching to a different task ends a running session first; otherwise starting while a session runs is an error (pause/stop it). " +
        "After creating a task, ASK the user before starting.",
      inputSchema: z.object({
        mode: TIMER_MODE.optional(),
        taskRef: z.string().optional(),
        projectRef: z.string().optional(),
        durationSec: z.number().int().min(60).max(14400).optional(),
      }),
      execute: async ({ mode, taskRef, projectRef, durationSec }) => {
        const task = await pickTask(taskRef, projectRef);
        if (task) {
          const snap = await readTimerState(supabase, userId);
          if (snap?.currentTaskId !== task.id) {
            if (snap && (snap.status === "running" || snap.status === "paused")) {
              await command(() => runTimerCommand(supabase, userId, "stop"));
            }
            await command(() => runTaskCommand(supabase, userId, { action: "select", taskId: task.id }));
          }
        }
        await command(() => runTimerCommand(supabase, userId, "start", { mode, durationSec }));
        return timerAfter("Started.");
      },
    }),

    pause_timer: simple("pause", "Paused."),
    resume_timer: simple("resume", "Resumed."),
    skip_timer: simple("skip", "Skipped."),
    reset_timer: simple("stop", "Stopped."),

    set_active_task: tool({
      description:
        "Select which task the focus screen / next start_timer will use. Pass taskRef, or projectRef alone to pick that project's first open task. " +
        "Not allowed while a session is running or paused (stop it, or use start_timer with taskRef).",
      inputSchema: z.object({ taskRef: z.string().optional(), projectRef: z.string().optional() })
        .refine((v) => v.taskRef || v.projectRef, "Pass taskRef or projectRef"),
      execute: async ({ taskRef, projectRef }) => {
        const t = (await pickTask(taskRef, projectRef))!;
        await command(() => runTaskCommand(supabase, userId, { action: "select", taskId: t.id }));
        return `Selected "${t.title}" (id: ${t.id}).`;
      },
    }),

    confirm_action: tool({
      description:
        "MCP only: execute a destructive action that a delete tool deferred (when delete confirmation is on). " +
        "Only call this after the user explicitly confirmed. Pass the action + id from the confirm payload.",
      inputSchema: z.object({ action: z.enum(DESTRUCTIVE_ACTIONS), id: z.string().regex(UUID_RE, "id must be a uuid") }),
      execute: async ({ action, id }) => performDelete(supabase, action, id),
    }),

    analytics_overview: tool({
      description: "Rich analytics overview: totals, streak, today/yesterday/7d/30d, average session. Use for 'how am I doing' questions.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase.from("v_daily_focus").select("day, total_seconds, sessions, completed_sessions").order("day", { ascending: false }).limit(400);
        const rows = data ?? [];
        const dayOf = (d: number) => {
          const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10);
        };
        const sumSince = (iso: string) => rows.filter((r) => r.day.slice(0, 10) >= iso).reduce((a, r) => ({ sec: a.sec + (r.total_seconds ?? 0), sess: a.sess + (r.sessions ?? 0) }), { sec: 0, sess: 0 });
        const today = rows.find((r) => r.day.slice(0, 10) === dayOf(0));
        const yest = rows.find((r) => r.day.slice(0, 10) === dayOf(-1));
        const last7 = sumSince(dayOf(-6));
        const last30 = sumSince(dayOf(-29));
        const all = rows.reduce((a, r) => ({ sec: a.sec + (r.total_seconds ?? 0), sess: a.sess + (r.sessions ?? 0) }), { sec: 0, sess: 0 });
        const active = new Set(rows.filter((r) => (r.completed_sessions ?? 0) > 0).map((r) => r.day.slice(0, 10)));
        let streak = 0;
        let cursor = active.has(dayOf(0)) ? dayOf(0) : dayOf(-1);
        while (active.has(cursor)) {
          streak++;
          const d = new Date(cursor + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() - 1);
          cursor = d.toISOString().slice(0, 10);
        }
        const avg = last7.sess ? last7.sec / last7.sess : 0;
        return [
          `Today: ${fmtDur(today?.total_seconds ?? 0)} (${today?.sessions ?? 0} sessions)`,
          `Yesterday: ${fmtDur(yest?.total_seconds ?? 0)} (${yest?.sessions ?? 0} sessions)`,
          `Last 7 days: ${fmtDur(last7.sec)} (${last7.sess} sessions, avg ${fmtDur(avg)} / session)`,
          `Last 30 days: ${fmtDur(last30.sec)} (${last30.sess} sessions)`,
          `All time: ${fmtDur(all.sec)} (${all.sess} sessions)`,
          `Current streak: ${streak} day${streak === 1 ? "" : "s"}`,
          `Active days recorded: ${active.size}`,
        ].join("\n");
      },
    }),

    analytics_by_project: tool({
      description: "Focus time broken down by project (completed pomodoro + custom sessions).",
      inputSchema: z.object({ range: z.enum(["7d", "30d", "all"]).optional().default("30d") }),
      execute: async ({ range }) => {
        let q = supabase.from("focus_sessions").select("project_id, actual_duration_sec, completed").in("mode", ["pomodoro", "custom"]).not("ended_at", "is", null);
        if (range !== "all") {
          const d = new Date(); d.setDate(d.getDate() - (range === "7d" ? 7 : 30));
          q = q.gte("started_at", d.toISOString());
        }
        const { data: sessions } = await q;
        const { data: projects } = await supabase.from("projects").select("id, name");
        const names = new Map((projects ?? []).map((p) => [p.id, p.name]));
        const agg = new Map<string, { sec: number; n: number }>();
        for (const s of sessions ?? []) {
          const key = s.project_id ?? "(no project)";
          const cur = agg.get(key) ?? { sec: 0, n: 0 };
          cur.sec += s.actual_duration_sec ?? 0;
          cur.n += 1;
          agg.set(key, cur);
        }
        if (!agg.size) return "No focus sessions in that range.";
        return [...agg.entries()]
          .sort((a, b) => b[1].sec - a[1].sec)
          .map(([id, v]) => `- ${names.get(id) ?? "No project"}: ${fmtDur(v.sec)} (${v.n} sessions)`)
          .join("\n");
      },
    }),

    analytics_by_tag: tool({
      description: "Focus time broken down by tag.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase.from("v_tag_focus").select("tag_name, tag_color, total_seconds");
        if (!data?.length) return "No tagged focus time yet.";
        return data
          .sort((a, b) => (b.total_seconds ?? 0) - (a.total_seconds ?? 0))
          .map((r) => `- #${r.tag_name}: ${fmtDur(r.total_seconds ?? 0)}`)
          .join("\n");
      },
    }),

    analytics_heatmap: tool({
      description: "Day-by-day focus seconds for a heatmap (defaults to last 90 days).",
      inputSchema: z.object({ days: z.number().int().min(7).max(365).optional().default(90) }),
      execute: async ({ days }) => {
        const start = new Date(); start.setDate(start.getDate() - days);
        const { data } = await supabase.from("v_daily_focus").select("day, total_seconds, sessions, completed_sessions").gte("day", start.toISOString().slice(0, 10)).order("day");
        if (!data?.length) return "No daily focus data yet.";
        return data.map((r) => `${r.day.slice(0, 10)}  ${fmtDur(r.total_seconds ?? 0)}  (${r.sessions} sess, ${r.completed_sessions} done)`).join("\n");
      },
    }),

    analytics_sessions: tool({
      description: "Recent completed focus sessions with task and project names.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional().default(15),
        projectRef: z.string().optional(),
      }),
      execute: async ({ limit, projectRef }) => {
        let projectId: string | undefined;
        if (projectRef) {
          if (UUID_RE.test(projectRef)) projectId = projectRef;
          else {
            const { data } = await supabase.from("projects").select("id").ilike("name", `%${projectRef}%`).limit(1);
            projectId = data?.[0]?.id;
          }
        }
        let q = supabase.from("focus_sessions").select("started_at, actual_duration_sec, mode, completed, task_id, project_id").in("mode", ["pomodoro", "custom"]).not("ended_at", "is", null).order("started_at", { ascending: false }).limit(limit);
        if (projectId) q = q.eq("project_id", projectId);
        const { data } = await q;
        if (!data?.length) return "No sessions.";
        const taskIds = [...new Set(data.map((s) => s.task_id).filter(Boolean))] as string[];
        const { data: tasks } = taskIds.length ? await supabase.from("tasks").select("id, title").in("id", taskIds) : { data: [] };
        const titles = new Map((tasks ?? []).map((t) => [t.id, t.title]));
        return data.map((s) => {
          const when = s.started_at?.slice(0, 16).replace("T", " ");
          return `- ${when}  ${fmtDur(s.actual_duration_sec ?? 0)}  ${s.mode}${s.completed ? "" : " (incomplete)"}  ${s.task_id ? titles.get(s.task_id) ?? s.task_id : "no task"}`;
        }).join("\n");
      },
    }),

    now_playing: tool({
      description: "Read what Spotify is playing now (track, artist, device, paused/playing). Requires the user to have connected Spotify in Settings.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        const res = await spotifyUserFetch(auth.token, "/me/player");
        if (res.status === 204) return "Nothing is playing.";
        if (!res.ok) return `Spotify error (${res.status}).`;
        const p = res.json as {
          is_playing?: boolean;
          device?: { name?: string };
          item?: { name?: string; artists?: { name: string }[]; album?: { name?: string } };
        } | null;
        if (!p?.item) return "Nothing is playing.";
        const artists = (p.item.artists ?? []).map((a) => a.name).join(", ");
        return `${p.is_playing ? "Playing" : "Paused"}: ${p.item.name} — ${artists}${p.item.album?.name ? ` (${p.item.album.name})` : ""}${p.device?.name ? ` on ${p.device.name}` : ""}.`;
      },
    }),

    search_music: tool({
      description: "Search Spotify for tracks, playlists, albums, or artists. Then play with play_music using a returned uri.",
      inputSchema: z.object({
        query: z.string().min(1),
        type: z.enum(["track", "playlist", "album", "artist"]).optional().default("track"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, type, limit }) => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        const res = await spotifyUserFetch(auth.token, "/search", { params: { q: query, type, limit: String(limit) } });
        if (!res.ok) return `Search failed (${res.status}).`;
        const data = res.json as Record<string, { items?: { name?: string; uri?: string; artists?: { name: string }[]; owner?: { display_name?: string } }[] }>;
        // Spotify pads playlist search results with null entries.
        const items = (data[`${type}s`]?.items ?? []).filter(Boolean);
        if (!items.length) return `No ${type}s for "${query}".`;
        return items.map((it) => {
          const extra = it.artists?.map((a) => a.name).join(", ") ?? it.owner?.display_name ?? "";
          return `- ${it.name}${extra ? ` — ${extra}` : ""}  uri: ${it.uri}`;
        }).join("\n");
      },
    }),

    play_music: tool({
      description: "Play a Spotify track, album, or playlist. Pass a spotify: uri from search_music, or a search query (plays the first track match).",
      inputSchema: z.object({
        uri: z.string().optional().describe("spotify:track:... / album / playlist uri"),
        query: z.string().optional().describe("If no uri, search and play the first track"),
      }),
      execute: async ({ uri, query }) => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        let playUri = uri;
        if (!playUri && query) {
          const found = await spotifyUserFetch(auth.token, "/search", { params: { q: query, type: "track", limit: "1" } });
          const track = (found.json as { tracks?: { items?: { uri?: string; name?: string; artists?: { name: string }[] }[] } })?.tracks?.items?.[0];
          if (!track?.uri) return `No track for "${query}".`;
          playUri = track.uri;
        }
        if (!playUri) return "Pass a uri or a query.";
        const body = playUri.includes(":track:") ? { uris: [playUri] } : { context_uri: playUri };
        const res = await spotifyUserFetch(auth.token, "/me/player/play", { method: "PUT", body });
        if (res.status === 404) return "No active Spotify device. Open Spotify (or the FocusSpace player) first.";
        if (!res.ok && res.status !== 204) return `Play failed (${res.status}).`;
        return `Playing ${playUri}.`;
      },
    }),

    pause_music: tool({
      description: "Pause Spotify playback.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        const res = await spotifyUserFetch(auth.token, "/me/player/pause", { method: "PUT" });
        if (res.status === 404) return "No active Spotify device.";
        if (!res.ok && res.status !== 204) return `Pause failed (${res.status}).`;
        return "Paused.";
      },
    }),

    resume_music: tool({
      description: "Resume Spotify playback on the current device.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        const res = await spotifyUserFetch(auth.token, "/me/player/play", { method: "PUT", body: {} });
        if (res.status === 404) return "No active Spotify device.";
        if (!res.ok && res.status !== 204) return `Resume failed (${res.status}).`;
        return "Resumed.";
      },
    }),

    next_track: tool({
      description: "Skip to the next Spotify track.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        const res = await spotifyUserFetch(auth.token, "/me/player/next", { method: "POST" });
        if (!res.ok && res.status !== 204) return `Skip failed (${res.status}).`;
        return "Skipped to next track.";
      },
    }),

    previous_track: tool({
      description: "Go to the previous Spotify track.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        const res = await spotifyUserFetch(auth.token, "/me/player/previous", { method: "POST" });
        if (!res.ok && res.status !== 204) return `Previous failed (${res.status}).`;
        return "Went to previous track.";
      },
    }),

    set_volume: tool({
      description: "Set Spotify volume (0–100).",
      inputSchema: z.object({ percent: z.number().int().min(0).max(100) }),
      execute: async ({ percent }) => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        const res = await spotifyUserFetch(auth.token, "/me/player/volume", { method: "PUT", params: { volume_percent: String(percent) } });
        if (!res.ok && res.status !== 204) return `Volume failed (${res.status}).`;
        return `Volume set to ${percent}%.`;
      },
    }),

    set_shuffle: tool({
      description: "Turn Spotify shuffle on or off.",
      inputSchema: z.object({ on: z.boolean() }),
      execute: async ({ on }) => {
        const { getUserSpotifyAccessToken, spotifyUserFetch } = await import("@/lib/spotify/server");
        const auth = await getUserSpotifyAccessToken(supabase, userId);
        if ("error" in auth) return auth.error;
        const res = await spotifyUserFetch(auth.token, "/me/player/shuffle", { method: "PUT", params: { state: on ? "true" : "false" } });
        if (!res.ok && res.status !== 204) return `Shuffle failed (${res.status}).`;
        return `Shuffle ${on ? "on" : "off"}.`;
      },
    }),

    analytics_compare: tool({
      description: "Compare this week vs last week (or 30d vs previous 30d) of focus time.",
      inputSchema: z.object({ window: z.enum(["7d", "30d"]).optional().default("7d") }),
      execute: async ({ window }) => {
        const n = window === "7d" ? 7 : 30;
        const { data } = await supabase.from("v_daily_focus").select("day, total_seconds, sessions").order("day", { ascending: false }).limit(n * 2 + 2);
        const rows = data ?? [];
        const dayOf = (d: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
        const inRange = (from: string, to: string) => rows.filter((r) => { const d = r.day.slice(0, 10); return d >= from && d <= to; });
        const curFrom = dayOf(-(n - 1)); const curTo = dayOf(0);
        const prevFrom = dayOf(-(n * 2 - 1)); const prevTo = dayOf(-n);
        const sum = (rs: typeof rows) => rs.reduce((a, r) => ({ sec: a.sec + (r.total_seconds ?? 0), sess: a.sess + (r.sessions ?? 0) }), { sec: 0, sess: 0 });
        const cur = sum(inRange(curFrom, curTo));
        const prev = sum(inRange(prevFrom, prevTo));
        const delta = cur.sec - prev.sec;
        const pct = prev.sec ? Math.round((delta / prev.sec) * 100) : null;
        return [
          `This ${window}: ${fmtDur(cur.sec)} (${cur.sess} sessions)`,
          `Previous ${window}: ${fmtDur(prev.sec)} (${prev.sess} sessions)`,
          `Change: ${delta >= 0 ? "+" : ""}${fmtDur(Math.abs(delta))}${pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct}%)`}`,
        ].join("\n");
      },
    }),
  };
}
