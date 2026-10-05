"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useList } from "@/lib/db/hooks";
import { clockOf, pickLive, revOf, type Clock, type LiveTimer, type StrictMode } from "@/lib/logic/focus";
import type { FocusSession } from "@/lib/types";
import { cacheLive, getLive, getStrict, pushLive, readText, subscribePrefs, writeText } from "./store";

const none = () => null;

/** A text preference that re-renders when it changes. */
export function usePrefText(key: string): [string | null, (v: string | null) => void] {
  const value = useSyncExternalStore(subscribePrefs, () => readText(key), none);
  return [value, (v) => writeText(key, v)];
}

export function useStrict(): { mode: StrictMode; grace: number } {
  const [mode] = usePrefText("focus:strict");
  const [grace] = usePrefText("focus:grace");
  return useMemo(() => getStrict(), [mode, grace]); // eslint-disable-line react-hooks/exhaustive-deps
}

export interface FocusTimer {
  loading: boolean;
  /** The running timer, or null. */
  live: LiveTimer | null;
  row: FocusSession | null;
}

/**
 * The running timer. The row is the truth about whether one runs, and it
 * carries the pauses and time away. This device's copy is used while it is
 * the newer of the two (it is written first), and each is brought up to the
 * other here.
 */
export function useFocusTimer(): FocusTimer {
  const saved = useSyncExternalStore(subscribePrefs, getLive, none);
  const recent = useList("focus_session", { orderBy: "created_at", ascending: false, limit: 40 });
  const row = useMemo(() => recent.data.find((r) => r.end === null) ?? null, [recent.data]);
  const live = useMemo(() => (row ? pickLive(saved, row).live : null), [row, saved]);

  useEffect(() => {
    if (recent.loading) return;
    // Read the store again here, and leave a timer that started seconds ago
    // alone: its saved state is written just before its row.
    const fresh = getLive();
    if (!row) {
      if (fresh && Date.now() - fresh.startedAt > 10000) cacheLive(null);
      return;
    }
    const picked = pickLive(fresh, row);
    if (picked.from === "row") {
      if (!fresh || fresh.id !== row.id || revOf(fresh) !== revOf(picked.live)) cacheLive(picked.live);
    } else if (!row.live || revOf(picked.live) > row.live.rev) {
      pushLive(picked.live);
    }
  }, [recent.loading, row, saved]);

  return { loading: recent.loading, live, row };
}

/** Milliseconds now, refreshed every second while `on`, and when the page comes back. */
export function useTick(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    document.addEventListener("visibilitychange", tick);
    const id = on ? window.setInterval(tick, 1000) : null;
    return () => {
      document.removeEventListener("visibilitychange", tick);
      if (id !== null) window.clearInterval(id);
    };
  }, [on]);
  return now;
}

export function useClock(live: LiveTimer | null): { now: number; clock: Clock | null } {
  const now = useTick(!!live);
  return { now, clock: live ? clockOf(live, now) : null };
}
