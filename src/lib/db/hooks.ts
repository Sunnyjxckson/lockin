"use client";

// React hooks over the data layer. They re-read after any write to the
// tables they depend on, so screens stay live without manual refreshes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, subscribe, type Query } from "./index";
import { getBlocksForDate, type DayBlock } from "../blocks";
import { activeChallenge, floorOn, modeOn, scoringVersions, type ModeInfo } from "../logic/challenge";
import { nyParts, todayNY } from "../logic/dates";
import { summarizeDay, summarizeWeek, type DaySummary, type WeekSummary } from "../logic/day";
import type { AppSettings, Challenge, ChecklistItem, DateStr, DayLog, Row, TableName, TargetVersion, Workout } from "../types";

export interface Loadable<T> {
  data: T;
  /** True until the first read finishes. Stays false on later refreshes. */
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

// Last result per query, so a screen you come back to paints at once and
// then refreshes.
const cache = new Map<string, unknown>();

/** Forget cached reads. Called after a full data reset. */
export function clearQueryCache(): void {
  cache.clear();
}

/**
 * Run an async read, cache it under `key`, and run it again whenever one of
 * `tables` is written to. The base for every other hook here, and the one to
 * use for a custom read that spans tables.
 */
export function useQuery<T>(key: string, tables: readonly TableName[], read: () => Promise<T>, initial: T): Loadable<T> {
  const [state, setState] = useState<{ key: string; data: T; loading: boolean; error: Error | null }>(() => ({
    key,
    data: cache.has(key) ? (cache.get(key) as T) : initial,
    loading: !cache.has(key),
    error: null,
  }));
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  const tablesKey = tables.join(",");
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    const run = () => {
      readRef.current().then(
        (data) => {
          cache.set(key, data);
          if (live) setState({ key, data, loading: false, error: null });
        },
        (error: unknown) => {
          if (live) setState((s) => ({ ...s, key, loading: false, error: error instanceof Error ? error : new Error(String(error)) }));
        },
      );
    };
    run();
    const offs = (tablesKey ? (tablesKey.split(",") as TableName[]) : []).map((t) => subscribe(t, run));
    return () => {
      live = false;
      for (const off of offs) off();
    };
  }, [key, tablesKey, tick]);

  // The key changed and the effect has not answered yet: show the cached
  // result for the new key if there is one, never the old key's rows.
  if (state.key !== key) {
    const hit = cache.has(key);
    return { data: hit ? (cache.get(key) as T) : initial, loading: !hit, error: null, reload };
  }
  return { data: state.data, loading: state.loading, error: state.error, reload };
}

const EMPTY: never[] = [];

/** Live list of rows. `query` can be an inline object, it is compared by value. */
export function useList<K extends TableName>(table: K, query?: Query<K>): Loadable<Row<K>[]> {
  const q = JSON.stringify(query ?? {});
  return useQuery<Row<K>[]>(`list:${table}:${q}`, [table], () => db.list(table, JSON.parse(q) as Query<K>), EMPTY);
}

/** Live single row by id. Null while loading and when missing. */
export function useRow<K extends TableName>(table: K, id: string | null | undefined): Loadable<Row<K> | null> {
  return useQuery<Row<K> | null>(`row:${table}:${id ?? ""}`, [table], () => (id ? db.get(table, id) : Promise.resolve(null)), null);
}

// ---------- typed hooks ----------

/** Every challenge, past and present, oldest start first. */
export function useChallenges(): Loadable<Challenge[]> {
  return useList("challenge", { orderBy: "start_date" });
}

/**
 * The challenge with status "active", or null. It may not have started yet,
 * or its last day may have passed. For what is running today use useMode().
 */
export function useChallenge(): Loadable<Challenge | null> {
  const all = useChallenges();
  const active = useMemo(() => activeChallenge(all.data), [all.data]);
  return { data: active, loading: all.loading, error: all.error, reload: all.reload };
}

const EARNED_QUERY = { eq: { key: "earned" } } as const;

export interface ModeState extends ModeInfo {
  loading: boolean;
  today: DateStr;
  /** Every challenge, oldest start first. */
  challenges: Challenge[];
  /** The least to earn today: the running challenge's own target for "Earned today" when it has one, otherwise `baseFloor`. */
  floor: number;
  /** The floor saved in settings, which applies whenever no challenge overrides it. */
  baseFloor: number;
}

/**
 * Which mode the app is in today. `mode` is "challenge" only while one is
 * running: then `challenge`, `day` and `length` are set. Otherwise it is
 * "ongoing" and screens show plain dates and consistency over time.
 * `historyStart` is the first date of the ongoing history in both modes.
 */
export function useMode(): ModeState {
  const today = useToday();
  const all = useChallenges();
  const settings = useSettings();
  const earned = useList("checklist_item", EARNED_QUERY);
  const earnedId = earned.data[0]?.id ?? null;
  return useMemo(() => {
    const info = modeOn(all.data, settings.data?.history_start ?? today, today);
    const baseFloor = settings.data?.daily_floor ?? 0;
    return { ...info, loading: all.loading || settings.loading, today, challenges: all.data, floor: floorOn(baseFloor, info.challenge, earnedId), baseFloor };
  }, [all.data, all.loading, settings.data, settings.loading, today, earnedId]);
}

export function useSettings(): Loadable<AppSettings | null> {
  return useRow("app_settings", "app");
}

export interface ChecklistData {
  /** Every item, including vices that are off and archived ones. */
  items: ChecklistItem[];
  /** The target history to score with: saved versions with challenge rules laid over the days each challenge ran. */
  versions: TargetVersion[];
  /** The saved versions alone, as Settings wrote them. */
  savedVersions: TargetVersion[];
}

const NO_CHECKLIST: ChecklistData = { items: [], versions: [], savedVersions: [] };

/** Items and their target history. Feed these to the logic functions. */
export function useChecklist(): Loadable<ChecklistData> {
  return useQuery<ChecklistData>(
    "checklist",
    ["checklist_item", "target_version", "challenge"],
    async () => {
      const [items, saved, challenges] = await Promise.all([
        db.list("checklist_item", { orderBy: "sort_order" }),
        db.list("target_version", { orderBy: "effective_from" }),
        db.list("challenge"),
      ]);
      return { items, versions: scoringVersions(saved, challenges), savedVersions: saved };
    },
    NO_CHECKLIST,
  );
}

/** Day logs for an inclusive date range. */
export function useLogs(from: DateStr, to: DateStr = from): Loadable<DayLog[]> {
  return useList("day_log", { from, to, orderBy: "date" });
}

export interface DayData {
  summary: DaySummary | null;
  week: WeekSummary | null;
  loading: boolean;
}

/** One day scored, plus the weekly items for the week it sits in. */
export function useDay(date: DateStr): DayData {
  const checklist = useChecklist();
  const today = useToday();
  const range = useMemo(() => {
    const w = summarizeWeek(date, [], [], []);
    return { from: w.weekStart, to: w.weekEnd };
  }, [date]);
  const logs = useLogs(range.from, range.to);
  const loading = checklist.loading || logs.loading;
  return useMemo(() => {
    if (loading) return { summary: null, week: null, loading: true };
    const { items, versions } = checklist.data;
    return {
      summary: summarizeDay(date, items, versions, logs.data),
      week: summarizeWeek(date, items, versions, logs.data, today),
      loading: false,
    };
  }, [loading, checklist.data, logs.data, date, today]);
}

export function useWorkouts(): Loadable<Workout[]> {
  return useList("workout", { orderBy: "weekday" });
}

/** A day's schedule blocks: per-day rows if any, else the weekday template. */
export function useDayBlocks(date: DateStr): Loadable<DayBlock[]> {
  return useQuery<DayBlock[]>(`blocks:${date}`, ["schedule_block", "schedule_template"], () => getBlocksForDate(date), EMPTY);
}

// ---------- clock ----------

/** A Date that updates every `everyMs` and when the app comes back to the front. */
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [everyMs]);
  return now;
}

/** Today's New York calendar date. Rolls over at midnight on its own. */
export function useToday(): DateStr {
  const now = useNow(30_000);
  return todayNY(now);
}

/** The New York date the app was first opened on. Drives the backfill window. */
export function useInstalledOn(): DateStr | null {
  const settings = useSettings();
  return settings.data ? nyParts(settings.data.created_at).date : null;
}
