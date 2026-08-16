import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { executeConfirmedAction } from "./confirm";
import { remainingSec, writeTimerState, readTimerState } from "@/lib/timer/persist";
import { MAX_ESTIMATED_POMOS } from "@/lib/mode";

type DB = SupabaseClient<Database>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTask(supabase: DB, ref: string) {
  if (UUID_RE.test(ref)) {
    const { data } = await supabase.from("tasks").select("*").eq("id", ref).maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase.from("tasks").select("*").ilike("title", `%${ref}%`).order("created_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

function fmtDur(sec: number) {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

export function makeExtraTools(supabase: DB, userId: string, opts: { destructive: "allow" | "confirm" }): ToolSet {
  return {
    get_workspace_state: tool({
      description:
        "REQUIRED FIRST CALL. Snapshot of the live timer, current task, and the user's Pomodoro settings. " +
        "Call this before creating/editing tasks or touching the timer so estimates use the real focus length.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: settings }, { data: profile }, timer] = await Promise.all([
          supabase.from("user_settings").select("focus_duration_sec, short_break_sec, long_break_sec, long_break_every, auto_start_breaks, auto_start_pomodoros, ai_destructive, theme, spotify_refresh_token").eq("user_id", userId).maybeSingle(),
          supabase.from("profiles").select("display_name, timezone").eq("id", userId).maybeSingle(),
          readTimerState(supabase, userId),
        ]);
        const focusSec = settings?.focus_duration_sec ?? 1500;
        const focusMin = Math.round(focusSec / 60);
        let currentTask: string | null = null;
        if (timer?.currentTaskId) {
          const { data: t } = await supabase.from("tasks").select("id, title, estimated_pomodoros, completed_pomodoros, status").eq("id", timer.currentTaskId).maybeSingle();
          if (t) currentTask = `${t.title} (id: ${t.id}) [${t.completed_pomodoros}/${t.estimated_pomodoros} pomos, ${t.status}]`;
        }
        const rem = timer ? remainingSec(timer) : focusSec;
        return [
          `Timezone: ${profile?.timezone || "UTC"}${profile?.display_name ? ` · User: ${profile.display_name}` : ""}`,
          `Focus length: ${focusMin} min per pomodoro (${focusSec}s). Short break ${Math.round((settings?.short_break_sec ?? 300) / 60)} min. Long break ${Math.round((settings?.long_break_sec ?? 900) / 60)} min every ${settings?.long_break_every ?? 4} pomos.`,
          `Estimate rule: estimated_pomodoros = ceil(taskMinutes / ${focusMin}). Max ${MAX_ESTIMATED_POMOS}. Half values (1.5) are allowed.`,
          `Destructive deletes: ${settings?.ai_destructive ?? opts.destructive}.`,
          timer
            ? `Timer: ${timer.status} · mode ${timer.mode} · remaining ${fmtDur(rem)} · pomodoro count ${timer.pomodoroCount}`
            : "Timer: idle (no snapshot yet).",
          `Current task: ${currentTask ?? "(none)"}`,
          settings?.spotify_refresh_token
            ? "Spotify: connected. Use now_playing, search_music, play_music, pause_music, resume_music, next_track, previous_track, set_volume, set_shuffle."
            : "Spotify: not connected. The user must connect it in Settings → Music before music tools work.",
          `After you create a task, ASK the user if they want you to start the timer. Do not auto-start.`,
        ].join("\n");
      },
    }),

    reset_task_progress: tool({
      description:
        "Start a task over: uncheck ALL its subtasks, set completed pomodoros to 0, and reset the timer cycle if this task is active. Same as the dock Reset button.",
      inputSchema: z.object({ taskRef: z.string() }),
      execute: async ({ taskRef }) => {
        const t = await resolveTask(supabase, taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        await supabase.from("subtasks").update({ done: false }).eq("task_id", t.id);
        await supabase.from("tasks").update({ completed_pomodoros: 0 }).eq("id", t.id);
        const timer = await readTimerState(supabase, userId);
        if (timer && timer.currentTaskId === t.id) {
          await writeTimerState(supabase, userId, {
            ...timer,
            status: "idle",
            startedAt: null,
            pausedAt: null,
            accumulatedPausedMs: 0,
            currentSessionId: null,
            pomodoroCount: 0,
            source: "mcp",
          });
        }
        return `Reset "${t.title}" — all subtasks unchecked, session timeline cleared.`;
      },
    }),

    get_settings: tool({
      description: "Read timer and app settings (focus length, breaks, auto-start, theme, destructive policy).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase.from("user_settings").select(
          "focus_duration_sec, short_break_sec, long_break_sec, long_break_every, auto_start_breaks, auto_start_pomodoros, theme, ai_destructive, dnd_during_focus, completion_tone",
        ).eq("user_id", userId).maybeSingle();
        if (!data) return "No settings yet.";
        return JSON.stringify(data, null, 2);
      },
    }),

    update_settings: tool({
      description: "Change timer/app settings. Durations are in SECONDS.",
      inputSchema: z.object({
        focusDurationSec: z.number().int().min(300).max(7200).optional(),
        shortBreakSec: z.number().int().min(60).max(1800).optional(),
        longBreakSec: z.number().int().min(300).max(3600).optional(),
        longBreakEvery: z.number().int().min(1).max(12).optional(),
        autoStartBreaks: z.boolean().optional(),
        autoStartPomodoros: z.boolean().optional(),
        theme: z.enum(["dark", "light", "system"]).optional(),
        destructive: z.enum(["allow", "confirm"]).optional(),
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
        if (!Object.keys(patch).length) return "Nothing to update.";
        const { error } = await supabase.from("user_settings").update(patch).eq("user_id", userId);
        return error ? `Failed: ${error.message}` : `Updated settings: ${Object.keys(patch).join(", ")}.`;
      },
    }),

    start_timer: tool({
      description: "Start a focus (or break) session. Ask the user first after creating a new task. Uses their configured focus length unless durationSec is passed.",
      inputSchema: z.object({
        mode: z.enum(["pomodoro", "custom", "short_break", "long_break"]).optional().default("pomodoro"),
        taskRef: z.string().optional(),
        durationSec: z.number().int().min(60).max(14400).optional(),
      }),
      execute: async ({ mode, taskRef, durationSec }) => {
        const { data: settings } = await supabase.from("user_settings").select("focus_duration_sec, short_break_sec, long_break_sec").eq("user_id", userId).maybeSingle();
        const task = taskRef ? await resolveTask(supabase, taskRef) : null;
        if (taskRef && !task) return `No task matching "${taskRef}".`;
        const defaults: Record<string, number> = {
          pomodoro: settings?.focus_duration_sec ?? 1500,
          custom: durationSec ?? settings?.focus_duration_sec ?? 1500,
          short_break: settings?.short_break_sec ?? 300,
          long_break: settings?.long_break_sec ?? 900,
        };
        const dur = durationSec ?? defaults[mode];
        const { data: session, error } = await supabase.from("focus_sessions").insert({
          user_id: userId,
          mode,
          planned_duration_sec: dur,
          task_id: task?.id ?? null,
          project_id: task?.project_id ?? null,
          started_at: new Date().toISOString(),
        }).select("id").single();
        if (error) return `Failed to start session: ${error.message}`;
        const prev = await readTimerState(supabase, userId);
        await writeTimerState(supabase, userId, {
          mode,
          status: "running",
          plannedDurationSec: dur,
          startedAt: Date.now(),
          pausedAt: null,
          accumulatedPausedMs: 0,
          currentSessionId: session.id,
          currentTaskId: task?.id ?? prev?.currentTaskId ?? null,
          currentProjectId: task?.project_id ?? prev?.currentProjectId ?? null,
          pomodoroCount: prev?.pomodoroCount ?? 0,
          source: "mcp",
        });
        return `Started ${mode} (${fmtDur(dur)})${task ? ` on "${task.title}"` : ""}.`;
      },
    }),

    pause_timer: tool({
      description: "Pause the running timer.",
      inputSchema: z.object({}),
      execute: async () => {
        const timer = await readTimerState(supabase, userId);
        if (!timer || timer.status !== "running") return "Timer is not running.";
        await writeTimerState(supabase, userId, { ...timer, status: "paused", pausedAt: Date.now(), source: "mcp" });
        return "Timer paused.";
      },
    }),

    resume_timer: tool({
      description: "Resume a paused timer.",
      inputSchema: z.object({}),
      execute: async () => {
        const timer = await readTimerState(supabase, userId);
        if (!timer || timer.status !== "paused" || !timer.pausedAt) return "Timer is not paused.";
        await writeTimerState(supabase, userId, {
          ...timer,
          status: "running",
          accumulatedPausedMs: timer.accumulatedPausedMs + (Date.now() - timer.pausedAt),
          pausedAt: null,
          source: "mcp",
        });
        return "Timer resumed.";
      },
    }),

    skip_timer: tool({
      description: "Skip the current session (does not count as completed).",
      inputSchema: z.object({}),
      execute: async () => {
        const timer = await readTimerState(supabase, userId);
        if (!timer) return "No timer.";
        if (timer.currentSessionId) {
          await supabase.from("focus_sessions").update({
            ended_at: new Date().toISOString(),
            actual_duration_sec: timer.plannedDurationSec - remainingSec(timer),
            completed: false,
          }).eq("id", timer.currentSessionId);
        }
        await writeTimerState(supabase, userId, {
          ...timer, status: "idle", startedAt: null, pausedAt: null, accumulatedPausedMs: 0,
          currentSessionId: null, source: "mcp",
        });
        return "Session skipped.";
      },
    }),

    reset_timer: tool({
      description: "Reset the current timer cycle without changing the task's completed pomodoros.",
      inputSchema: z.object({}),
      execute: async () => {
        const timer = await readTimerState(supabase, userId);
        if (!timer) return "No timer.";
        await writeTimerState(supabase, userId, {
          ...timer, status: "idle", startedAt: null, pausedAt: null, accumulatedPausedMs: 0,
          currentSessionId: null, source: "mcp",
        });
        return "Timer reset.";
      },
    }),

    set_active_task: tool({
      description: "Select which task the focus screen / next start_timer will use.",
      inputSchema: z.object({ taskRef: z.string() }),
      execute: async ({ taskRef }) => {
        const t = await resolveTask(supabase, taskRef);
        if (!t) return `No task matching "${taskRef}".`;
        const prev = await readTimerState(supabase, userId);
        await writeTimerState(supabase, userId, {
          mode: prev?.mode ?? "pomodoro",
          status: prev?.status === "running" ? prev.status : "idle",
          plannedDurationSec: prev?.plannedDurationSec ?? 1500,
          startedAt: prev?.startedAt ?? null,
          pausedAt: prev?.pausedAt ?? null,
          accumulatedPausedMs: prev?.accumulatedPausedMs ?? 0,
          currentSessionId: prev?.currentSessionId ?? null,
          currentTaskId: t.id,
          currentProjectId: t.project_id,
          pomodoroCount: prev?.currentTaskId === t.id ? (prev?.pomodoroCount ?? 0) : 0,
          source: "mcp",
        });
        return `Active task is now "${t.title}".`;
      },
    }),

    confirm_action: tool({
      description: "Execute a destructive action that was deferred (when delete confirmation is on). Pass the action + id from the confirm payload.",
      inputSchema: z.object({
        action: z.enum(["delete_project", "delete_task", "delete_subtask", "delete_tag"]),
        id: z.string(),
      }),
      execute: async ({ action, id }) => executeConfirmedAction(supabase, action, id),
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
        const items = data[`${type}s`]?.items ?? [];
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
