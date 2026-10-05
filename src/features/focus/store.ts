"use client";

// The running timer's state, and every write the focus feature makes.
//
// The focus_session row (end null) is the timer. Its pauses and time away are
// kept on the row too (`live`), so another device shows the same clock, and a
// finished session keeps its away numbers in its own columns.
//
// This device also holds a copy of the running state in prefs. It is written
// first and at once, because a page that is being hidden cannot wait for the
// network, and then pushed to the row. Whichever copy is newer wins.
//
// Still per device, on purpose: how strict the timer is when the app is left,
// the full screen switch, the phone blocker walk through being done, and the
// note of which days this feature ticked Study by itself (so it only ever
// unticks its own tick).

import { db } from "@/lib/db";
import { getItemByKey, getLogs, getSettings, setChecked } from "@/lib/db/helpers";
import { addDays, todayNY } from "@/lib/logic/dates";
import { cleanLabel, editPatch, finish, manualRow, minutesOn, newLive, pickLive, revOf, startRow, studyTick, toState, type LiveTimer, type SessionMeta, type StrictMode } from "@/lib/logic/focus";
import { getPref, setPref } from "@/lib/prefs";
import type { DateStr, FocusSession, TimeStr } from "@/lib/types";

const K_LIVE = "focus:live";
const K_TICKS = "focus:autotick";

// ---------- a tiny store over prefs ----------

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = () => fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** Parsed once per stored string, so the same object comes back until it changes. */
export function readJson<T>(key: string, fallback: T): T {
  const raw = getPref(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function writeJson(key: string, value: unknown): void {
  setPref(key, value === null ? null : JSON.stringify(value));
  listeners.forEach((fn) => fn());
}

export function readText(key: string): string | null {
  return getPref(key);
}

export function writeText(key: string, value: string | null): void {
  setPref(key, value);
  listeners.forEach((fn) => fn());
}

// ---------- live timer ----------

export function getLive(): LiveTimer | null {
  return readJson<LiveTimer | null>(K_LIVE, null);
}

/** Keep a copy on this device without touching the row (it came from the row). */
export function cacheLive(live: LiveTimer | null): void {
  writeJson(K_LIVE, live);
}

let pushed = 0;

/** Write the running state to its row, for other devices. A failure is left for the next change to retry. */
export function pushLive(live: LiveTimer): void {
  const rev = revOf(live);
  if (rev <= pushed) return;
  pushed = rev;
  db.update("focus_session", live.id, { live: toState(live) }).catch(() => {
    if (pushed === rev) pushed = 0;
  });
}

/** Save a change to the running timer: here at once, then on the row. */
export function setLive(live: LiveTimer | null): void {
  if (!live) return cacheLive(null);
  const prev = getLive();
  const stamped: LiveTimer = { ...live, rev: Math.max(Date.now(), (prev?.rev ?? 0) + 1, (live.rev ?? 0) + 1) };
  cacheLive(stamped);
  pushLive(stamped);
}

/** Change the live timer, if there is one. */
export function changeLive(fn: (live: LiveTimer) => LiveTimer): LiveTimer | null {
  const live = getLive();
  if (!live) return null;
  const next = fn(live);
  if (next === live) return live;
  setLive(next);
  return getLive();
}

/**
 * Bring this device's copy in line with the row before acting on it: another
 * device may have paused, resumed or finished the timer since.
 */
export async function refreshLive(): Promise<LiveTimer | null> {
  const row = await runningRow().catch(() => undefined);
  if (row === undefined) return getLive();
  if (!row) {
    const have = getLive();
    if (have && Date.now() - have.startedAt > 10000) cacheLive(null);
    return getLive();
  }
  const picked = pickLive(getLive(), row);
  if (picked.from === "row") cacheLive(picked.live);
  return picked.live;
}

// ---------- settings on this device ----------

export function getStrict(): { mode: StrictMode; grace: number } {
  const mode = readText("focus:strict");
  const grace = Number(readText("focus:grace"));
  return { mode: mode === "end" || mode === "void" ? mode : "off", grace: grace > 0 ? grace : 60 };
}

// ---------- the study item ----------

/**
 * Bring the "Study or homework block" item in line with a date's sessions.
 * Only yesterday and today are touched, older days are settled.
 */
export async function syncStudy(date: DateStr): Promise<void> {
  const today = todayNY();
  if (date > today || date < addDays(today, -1)) return;
  const [item, settings, sessions, logs] = await Promise.all([
    getItemByKey("study"),
    getSettings(),
    db.list("focus_session", { from: date, to: date }),
    getLogs(date, date),
  ]);
  if (!item || !item.active) return;
  const ticks = readJson<Record<string, boolean>>(K_TICKS, {});
  const log = logs.find((l) => l.item_id === item.id);
  const decision = studyTick({
    minutes: minutesOn(sessions, date),
    goal: settings?.focus_goal_minutes ?? 0,
    blockCompleted: sessions.some((s) => s.end !== null && s.block_id !== null && s.completed === true),
    checked: log?.checked === true,
    autoTicked: ticks[date] === true,
  });
  if (decision === "none") return;
  await setChecked(item.id, date, decision === "tick");
  const next: Record<string, boolean> = {};
  for (const d of Object.keys(ticks)) if (d >= addDays(today, -7)) next[d] = ticks[d];
  if (decision === "tick") next[date] = true;
  else delete next[date];
  writeJson(K_TICKS, next);
}

// ---------- timer actions ----------

export async function runningRow(): Promise<FocusSession | null> {
  const rows = await db.list("focus_session", { orderBy: "created_at", ascending: false, limit: 40 });
  return rows.find((r) => r.end === null) ?? null;
}

export async function startTimer(p: { label: string; plannedSeconds: number | null; blockId?: string | null }): Promise<LiveTimer> {
  const existing = await runningRow();
  const have = getLive();
  if (existing && have && have.id === existing.id) return have;
  if (existing) await db.remove("focus_session", existing.id);
  const now = Date.now();
  const label = cleanLabel(p.label);
  // The saved state goes in before the row, so nothing ever sees the row without it.
  const id = crypto.randomUUID();
  const live: LiveTimer = { ...newLive({ id, startedAt: now, label, plannedSeconds: p.plannedSeconds, blockId: p.blockId ?? null }), rev: now };
  cacheLive(live);
  try {
    await db.insert("focus_session", { ...startRow(now, label, p.blockId ?? null, live), id });
  } catch (e) {
    cacheLive(null);
    throw e;
  }
  return live;
}

export interface FinishResult {
  logged: boolean;
  minutes: number;
  meta: SessionMeta | null;
}

/**
 * Close the running timer. `at` is when it really ended (the moment the user
 * left, for strict mode). `minutes` overrides the computed number when the
 * user was asked what really happened.
 */
export async function finishTimer(live: LiveTimer, opts: { at?: number; minutes?: number } = {}): Promise<FinishResult> {
  const done = finish(live, opts.at ?? Date.now());
  const minutes = opts.minutes ?? done.patch.minutes;
  const logged = opts.minutes !== undefined ? minutes >= 1 : done.log;
  setLive(null);
  const row = await db.get("focus_session", live.id);
  if (!row) return { logged: false, minutes: 0, meta: null };
  if (!logged) {
    await db.remove("focus_session", live.id);
    return { logged: false, minutes: 0, meta: null };
  }
  // A length the user typed in is their word, so the countdown no longer vouches for it.
  const meta: SessionMeta = opts.minutes !== undefined ? { ...done.meta, completed: false } : done.meta;
  await db.update("focus_session", live.id, { ...done.patch, ...meta, minutes });
  await syncStudy(row.date);
  return { logged: true, minutes, meta };
}

export async function discardTimer(live: LiveTimer): Promise<void> {
  setLive(null);
  const row = await db.get("focus_session", live.id);
  if (row) await db.remove("focus_session", live.id);
}

// ---------- by hand ----------

export async function logManual(input: { date: DateStr; minutes: number; label: string; start: TimeStr }): Promise<void> {
  await db.insert("focus_session", manualRow(input));
  await syncStudy(input.date);
}

export async function editSession(row: FocusSession, input: { date: DateStr; minutes: number; label: string }): Promise<void> {
  // An edited length is the user's word, so the countdown no longer vouches for it.
  await db.update("focus_session", row.id, { ...editPatch(row, input), ...(Math.round(input.minutes) !== row.minutes ? { completed: false } : {}) });
  await syncStudy(row.date);
  if (input.date !== row.date) await syncStudy(input.date);
}

export async function deleteSession(row: FocusSession): Promise<void> {
  await db.remove("focus_session", row.id);
  await syncStudy(row.date);
}
