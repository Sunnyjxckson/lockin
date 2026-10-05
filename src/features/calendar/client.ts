"use client";

// The browser half of calendar sync: ask the server for a round, then make
// the changes it sends back through the data layer. Also keeps track of the
// blocks edited on this device so a local move can win over an older
// change in Google.

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveBlocks } from "@/lib/blocks";
import { db } from "@/lib/db";
import { getChallenge } from "@/lib/db/helpers";
import type { LocalOp, SyncDay, SyncStats } from "@/lib/logic/calendarSync";
import { addDays, challengeEndDate, dateRange, nowIso, todayNY } from "@/lib/logic/dates";
import type { DateStr, IsoStr } from "@/lib/types";

/** Template days this far ahead are sent to Google. Days with their own rows always are. */
export const EXPORT_DAYS = 7;

export interface CalendarStatus {
  configured: boolean;
  missing: string[];
  connected: boolean;
  /** Where the Google sign in is kept. */
  storage: "database" | "cookie";
  redirectUri: string;
  calendarId?: string | null;
  calendarName?: string | null;
  importWritable?: boolean | null;
  lastSyncAt?: IsoStr | null;
}

export interface CalendarChoice {
  id: string;
  name: string;
  primary: boolean;
  writable: boolean;
}

export interface SyncOutcome {
  ok: boolean;
  stats: SyncStats;
  errors: string[];
  lastSyncAt: IsoStr | null;
  /** Nothing to sync: the challenge is over. */
  skipped?: boolean;
}

// ---------- edits made on this device ----------

const edits = new Map<string, IsoStr>();
const wakeups = new Set<() => void>();

/** Call after changing blocks here, with their row ids. Wakes the sync. */
export function noteLocalEdit(ids: readonly string[] = []): void {
  const at = nowIso();
  for (const id of ids) edits.set(id, at);
  for (const fn of Array.from(wakeups)) fn();
}

// ---------- requests ----------

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error === "not_connected" ? "Google Calendar is not connected." : (data.error ?? `Request failed (${res.status})`));
  return data;
}

export function fetchStatus(): Promise<CalendarStatus> {
  return api<CalendarStatus>("/api/calendar/status");
}

export function fetchCalendars(): Promise<{ calendarId: string | null; calendars: CalendarChoice[] }> {
  return api("/api/calendar/calendars");
}

export function chooseCalendar(calendarId: string | null): Promise<{ calendarName: string | null; importWritable: boolean | null }> {
  return api("/api/calendar/calendars", { method: "POST", body: JSON.stringify({ calendarId }) });
}

export function disconnectCalendar(): Promise<{ ok: boolean }> {
  return api("/api/calendar/disconnect", { method: "POST" });
}

// ---------- one round ----------

/** The days of the rest of the challenge, as they show now. Two reads, not two per day. */
export async function readDays(from: DateStr, to: DateStr): Promise<SyncDay[]> {
  const [rows, template] = await Promise.all([db.list("schedule_block", { from, to }), db.list("schedule_template")]);
  return dateRange(from, to).map((date) => ({ date, blocks: resolveBlocks(date, rows, template) }));
}

/** Make the changes a sync round asked for. A change whose row is gone is skipped. */
export async function applyLocalOps(ops: readonly LocalOp[]): Promise<void> {
  for (const op of ops) {
    try {
      if (op.op === "materialize") {
        const have = await db.list("schedule_block", { eq: { date: op.date }, limit: 1 });
        if (have.length === 0) await db.insertMany("schedule_block", op.rows);
      } else if (op.op === "create") {
        const twin = op.row.calendar_event_id ? await db.list("schedule_block", { eq: { calendar_event_id: op.row.calendar_event_id }, limit: 1 }) : [];
        if (twin.length === 0) await db.insert("schedule_block", op.row);
      } else if (op.op === "update") {
        await db.update("schedule_block", op.id, op.patch);
      } else {
        await db.remove("schedule_block", op.id);
      }
    } catch {
      // The row changed under us. The next round sees the real state and settles it.
    }
  }
}

interface SyncResponse {
  ok: boolean;
  localOps: LocalOp[];
  stats: SyncStats;
  partial: boolean;
  errors: string[];
  lastSyncAt: IsoStr;
}

let running: Promise<SyncOutcome> | null = null;

async function round(): Promise<SyncOutcome> {
  const none: SyncStats = { pulled: 0, pushed: 0, removed: 0 };
  const challenge = await getChallenge();
  const today = todayNY();
  if (!challenge) return { ok: true, stats: none, errors: [], lastSyncAt: null, skipped: true };
  const to = challengeEndDate(challenge.start_date, challenge.length_days);
  const from = today > challenge.start_date ? today : challenge.start_date;
  if (from > to) return { ok: true, stats: none, errors: [], lastSyncAt: null, skipped: true };
  const lastExport = addDays(from, EXPORT_DAYS - 1);
  const exportDates = dateRange(from, lastExport < to ? lastExport : to);

  const total: SyncStats = { ...none };
  const errors: string[] = [];
  let lastSyncAt: IsoStr | null = null;
  // A big first sync can take more than one round. Three is plenty.
  for (let i = 0; i < 3; i++) {
    const sent = new Map(edits);
    const days = await readDays(from, to);
    const res = await api<SyncResponse>("/api/calendar/sync", {
      method: "POST",
      body: JSON.stringify({ days, exportDates, edits: Object.fromEntries(sent) }),
    });
    await applyLocalOps(res.localOps);
    total.pulled += res.stats.pulled;
    total.pushed += res.stats.pushed;
    total.removed += res.stats.removed;
    errors.push(...res.errors);
    lastSyncAt = res.lastSyncAt;
    if (res.errors.length === 0 && !res.partial) {
      for (const [id, at] of sent) if (edits.get(id) === at) edits.delete(id);
    }
    if (!res.partial) break;
  }
  return { ok: errors.length === 0, stats: total, errors, lastSyncAt };
}

/** Run a sync. Calls made while one is running share it. */
export function syncCalendar(): Promise<SyncOutcome> {
  if (!running) {
    running = round().finally(() => {
      running = null;
    });
  }
  return running;
}

// ---------- hook ----------

export interface CalendarSync {
  status: CalendarStatus | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  last: SyncOutcome | null;
  /** Ask the server again whether Google is connected. */
  refresh: () => Promise<void>;
  /** Sync now. Resolves to null when not connected. */
  sync: () => Promise<SyncOutcome | null>;
  disconnect: () => Promise<void>;
  setStatus: (patch: Partial<CalendarStatus>) => void;
}

let lastAutoSync = 0;

/**
 * Calendar state for a screen. While mounted and connected it pulls on open,
 * again when the app comes back to the front, and pushes shortly after any
 * local edit.
 */
export function useCalendarSync(): CalendarSync {
  const [status, setStatusState] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<SyncOutcome | null>(null);
  const connected = !!status?.connected;
  const again = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setStatusState(await fetchStatus());
    } catch {
      setStatusState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    fetchStatus()
      .then(
        (s) => live && setStatusState(s),
        () => live && setStatusState(null),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const sync = useCallback(async (): Promise<SyncOutcome | null> => {
    if (!connected) return null;
    if (running) again.current = true;
    setSyncing(true);
    setError(null);
    try {
      let out = await syncCalendar();
      while (again.current) {
        again.current = false;
        out = await syncCalendar();
      }
      lastAutoSync = Date.now();
      setLast(out);
      if (out.lastSyncAt) setStatusState((s) => (s ? { ...s, lastSyncAt: out.lastSyncAt } : s));
      if (out.errors.length > 0) setError(out.errors[0]);
      return out;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed.";
      setError(message);
      if (message.includes("not connected")) void refresh();
      return null;
    } finally {
      setSyncing(false);
    }
  }, [connected, refresh]);

  // Pull on open, and when the app comes back after a while.
  useEffect(() => {
    if (!connected) return;
    const first = window.setTimeout(() => {
      if (Date.now() - lastAutoSync > 30_000) void sync();
    }, 0);
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAutoSync > 5 * 60_000) void sync();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearTimeout(first);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [connected, sync]);

  // Push shortly after a local edit.
  useEffect(() => {
    if (!connected) return;
    let timer: number | undefined;
    const wake = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync(), 1500);
    };
    wakeups.add(wake);
    return () => {
      wakeups.delete(wake);
      window.clearTimeout(timer);
    };
  }, [connected, sync]);

  const disconnect = useCallback(async () => {
    await disconnectCalendar();
    setLast(null);
    await refresh();
  }, [refresh]);

  const setStatus = useCallback((patch: Partial<CalendarStatus>) => {
    setStatusState((s) => (s ? { ...s, ...patch } : s));
  }, []);

  return { status, loading, syncing, error, last, refresh, sync, disconnect, setStatus };
}
