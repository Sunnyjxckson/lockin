"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useList } from "@/lib/db/hooks";
import { clockOf, liveFromRow, type Clock, type LiveTimer, type SessionMeta, type StrictMode } from "@/lib/logic/focus";
import type { FocusSession } from "@/lib/types";
import { getLive, getMetaMap, getStrict, readText, setLive, subscribePrefs, writeText } from "./store";

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

const EMPTY_META: Record<string, SessionMeta> = {};
export function useMetaMap(): Record<string, SessionMeta> {
  return useSyncExternalStore(subscribePrefs, getMetaMap, () => EMPTY_META);
}

export interface FocusTimer {
  loading: boolean;
  /** The running timer, or null. */
  live: LiveTimer | null;
  row: FocusSession | null;
}

/**
 * The running timer. The row is the truth about whether one runs. The saved
 * state adds pauses and time away when it belongs to that row.
 */
export function useFocusTimer(): FocusTimer {
  const saved = useSyncExternalStore(subscribePrefs, getLive, none);
  const recent = useList("focus_session", { orderBy: "created_at", ascending: false, limit: 40 });
  const row = useMemo(() => recent.data.find((r) => r.end === null) ?? null, [recent.data]);
  const live = useMemo(() => {
    if (!row) return null;
    return saved && saved.id === row.id ? saved : liveFromRow(row);
  }, [row, saved]);

  // Keep the saved state and the row in step.
  useEffect(() => {
    if (recent.loading) return;
    // Read the store again here, and leave a timer that started seconds ago
    // alone: its saved state is written just before its row.
    const fresh = getLive();
    if (!row && fresh && Date.now() - fresh.startedAt > 10000) setLive(null);
    else if (row && (!fresh || fresh.id !== row.id)) setLive(liveFromRow(row));
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
