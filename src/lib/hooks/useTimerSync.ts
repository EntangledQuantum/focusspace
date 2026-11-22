"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTimerStore } from "@/lib/stores/timer";
import { createClient } from "@/lib/supabase/client";
import { applyRow, fetchTimer, listenToPeers, msUntilDue, onTimerChange, rowFromDb } from "@/lib/timer/client";

/** Fallback poll when Realtime is unavailable (local mode, blocked websockets). */
const POLL_NO_REALTIME_MS = 5_000;
/** Safety-net poll while Realtime is connected. */
const POLL_WITH_REALTIME_MS = 60_000;

/**
 * Re-read the server timer now (e.g. right after a Focus AI timer tool).
 * Kept for existing callers; every tab is subscribed anyway.
 */
export async function pullTimerState(qc: QueryClient): Promise<boolean> {
  const before = useTimerStore.getState().updatedAt;
  await fetchTimer();
  const changed = useTimerStore.getState().updatedAt !== before;
  if (changed) invalidate(qc);
  return changed;
}

function invalidate(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["sessions"] });
  qc.invalidateQueries({ queryKey: ["subtasks"] });
  qc.invalidateQueries({ queryKey: ["projects-with-tasks"] });
  qc.invalidateQueries({ queryKey: ["analytics"] });
}

/**
 * Keeps this tab's timer mirror equal to the server row (the single source of
 * truth): Supabase Realtime on the user's own `timer_state` row, a light poll
 * as fallback, an immediate read on focus / reconnect, and a read exactly when
 * the running session is due (the server then records the completion once,
 * whichever tab or client asks first). Mounted once per tab, in Providers.
 */
export function useTimerSync() {
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let realtimeUp = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let dueTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: { unsubscribe: () => unknown } | null = null;

    listenToPeers();
    const offChange = onTimerChange(() => invalidate(qc));

    const schedulePoll = () => {
      clearTimeout(pollTimer);
      pollTimer = setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === "visible" || !realtimeUp) await fetchTimer();
        schedulePoll();
      }, realtimeUp ? POLL_WITH_REALTIME_MS : POLL_NO_REALTIME_MS);
    };

    // Ask the server as soon as the running session is due.
    const scheduleDue = () => {
      clearTimeout(dueTimer);
      const ms = msUntilDue(useTimerStore.getState());
      if (ms === null) return;
      dueTimer = setTimeout(() => { if (!cancelled) void fetchTimer(); }, Math.max(0, ms) + 250);
    };
    const offDue = useTimerStore.subscribe((s, prev) => {
      if (s.updatedAt !== prev.updatedAt || s.status !== prev.status || s.clockOffsetMs !== prev.clockOffsetMs) scheduleDue();
    });

    const wake = () => { if (!cancelled) void fetchTimer(); };
    const onVisible = () => { if (document.visibilityState === "visible") wake(); };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onVisible);

    (async () => {
      await fetchTimer();
      scheduleDue();
      schedulePoll();
      try {
        const supabase = createClient() as unknown as {
          auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
          channel?: (name: string) => {
            on: (ev: string, filter: Record<string, string>, cb: (p: { new: Record<string, unknown> }) => void) => {
              subscribe: (cb: (status: string) => void) => { unsubscribe: () => unknown };
            };
          };
        };
        if (typeof supabase.channel !== "function") return; // local mode: poll only
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        channel = supabase
          .channel(`timer_state:${user.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "timer_state", filter: `user_id=eq.${user.id}` }, (p) => {
            if (p.new && Object.keys(p.new).length) applyRow(rowFromDb(p.new));
          })
          .subscribe((status) => {
            const up = status === "SUBSCRIBED";
            if (up !== realtimeUp) {
              realtimeUp = up;
              if (up) wake(); // catch anything missed while connecting
              schedulePoll();
            }
          });
      } catch {
        /* Realtime unavailable — the poll covers it */
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      clearTimeout(dueTimer);
      offDue();
      offChange();
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisible);
      void channel?.unsubscribe();
    };
  }, [qc]);
}
