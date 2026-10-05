// Rules for the study and focus timer. Pure: no React, no db.
//
// A running timer is a focus_session row with `end` null. Everything about
// the clock is worked out from instants (milliseconds), never from a counter
// that ticks, so a reload, a closed tab or a sleeping phone changes nothing.
//
// Three kinds of time:
//   clock time    from start until now (or until it was finished)
//   active time   clock time minus pauses
//   focused time  active time minus time spent away from the app that the
//                 user did not claim back. This is what gets logged.

import { addDays, nyParts, weekDates, weekStart } from "./dates";
import type { DateStr, DayLog, FocusLive, FocusSession, TimeStr } from "../types";

// ---------- constants ----------

/** Leaving for less than this is not counted as leaving (a notification shade, a glance at the clock). */
export const MIN_AWAY_SECONDS = 5;
/** Gone this long with the timer running and nobody is studying any more: ask what happened. */
export const STALE_AWAY_SECONDS = 2 * 60 * 60;
/** No single session is believed past this without asking. */
export const MAX_SESSION_SECONDS = 6 * 60 * 60;
/** A session shorter than this is not logged. */
export const MIN_LOG_SECONDS = 60;
/** A countdown counts as completed this close to its length. */
export const COMPLETE_SLACK_SECONDS = 60;

export const PRESET_MINUTES = [25, 45, 60, 90] as const;
export const LABELS = ["Study", "Homework", "Business"] as const;
export const GRACE_OPTIONS = [30, 60, 180] as const;

export type StrictMode = "off" | "end" | "void";

// ---------- the running timer ----------

export interface Span {
  from: number;
  /** Null while it is still open. */
  to: number | null;
}

export interface Away extends Span {
  /** The user said they were still working, so it stays in focused time. */
  counted: boolean;
  /** The user has answered the "you were gone" card. */
  reviewed: boolean;
}

export interface LiveTimer {
  /** The focus_session row. */
  id: string;
  startedAt: number;
  label: string;
  /** Countdown length, or null to count up. */
  plannedSeconds: number | null;
  blockId: string | null;
  pauses: Span[];
  aways: Away[];
  /** When this state last changed. Between a device's copy and the row's, the newer one wins. */
  rev?: number;
}

export function newLive(p: { id: string; startedAt: number; label: string; plannedSeconds?: number | null; blockId?: string | null }): LiveTimer {
  return { id: p.id, startedAt: p.startedAt, label: p.label, plannedSeconds: p.plannedSeconds ?? null, blockId: p.blockId ?? null, pauses: [], aways: [] };
}

export function revOf(live: Pick<LiveTimer, "rev" | "startedAt">): number {
  return live.rev ?? live.startedAt;
}

/** What the row keeps of a running timer, so another device shows the same clock. */
export function toState(live: LiveTimer): FocusLive {
  return { started_at: live.startedAt, planned_seconds: live.plannedSeconds, pauses: live.pauses, aways: live.aways, rev: revOf(live) };
}

const isSpan = (s: unknown): s is Span => !!s && typeof (s as Span).from === "number" && ((s as Span).to === null || typeof (s as Span).to === "number");

/**
 * The timer rebuilt from its row: the saved pauses and time away when the row
 * has them, otherwise a plain clock from created_at (a row written before
 * the state was kept on it).
 */
export function liveFromRow(row: Pick<FocusSession, "id" | "created_at" | "label" | "block_id"> & { live?: FocusLive | null }): LiveTimer {
  const at = Date.parse(row.created_at);
  const state = row.live ?? null;
  const base = newLive({ id: row.id, startedAt: Number.isFinite(at) ? at : Date.now(), label: row.label ?? "Study", blockId: row.block_id });
  if (!state || typeof state.started_at !== "number") return base;
  return {
    ...base,
    startedAt: state.started_at,
    plannedSeconds: typeof state.planned_seconds === "number" ? state.planned_seconds : null,
    pauses: Array.isArray(state.pauses) ? state.pauses.filter(isSpan) : [],
    aways: Array.isArray(state.aways) ? state.aways.filter(isSpan).map((a) => ({ ...a, counted: a.counted === true, reviewed: a.reviewed === true })) : [],
    rev: typeof state.rev === "number" ? state.rev : state.started_at,
  };
}

/**
 * Which copy of a running timer to believe: the one saved on this device or
 * the one on the row. The device copy is written first and at once (a page
 * being hidden cannot wait for the network), the row is what other devices
 * see. The newer one wins, and a tie goes to the device.
 */
export function pickLive(saved: LiveTimer | null, row: Pick<FocusSession, "id" | "created_at" | "label" | "block_id" | "live">): { live: LiveTimer; from: "device" | "row" } {
  const fromRow = liveFromRow(row);
  if (saved && saved.id === row.id && revOf(saved) >= (row.live?.rev ?? 0)) return { live: saved, from: "device" };
  return { live: fromRow, from: "row" };
}

const lengthOf = (s: Span, now: number) => Math.max(0, Math.min(s.to ?? now, now) - s.from);

export function isPaused(live: LiveTimer): boolean {
  return live.pauses.some((p) => p.to === null);
}

export function openAway(live: LiveTimer): Away | null {
  return live.aways.find((a) => a.to === null) ?? null;
}

/**
 * Pause at `now`. Pass the instant the clock on screen was drawn for, not the
 * instant of the tap, so the number the user paused on is the number that
 * stays: paused a moment later, the clock would tick once more after the tap.
 * A pause never starts before the last one ended.
 */
export function pause(live: LiveTimer, now: number): LiveTimer {
  if (isPaused(live)) return live;
  const floor = live.pauses.reduce((m, p) => Math.max(m, p.to ?? 0), live.startedAt);
  return { ...live, pauses: [...live.pauses, { from: Math.max(now, floor), to: null }] };
}

export function resume(live: LiveTimer, now: number): LiveTimer {
  return { ...live, pauses: live.pauses.map((p) => (p.to === null ? { ...p, to: Math.max(p.from, now) } : p)) };
}

/** The app went to the background. Nothing is recorded while paused. */
export function leave(live: LiveTimer, now: number): LiveTimer {
  if (isPaused(live) || openAway(live)) return live;
  return { ...live, aways: [...live.aways, { from: now, to: null, counted: false, reviewed: false }] };
}

/** The app came back. Blips shorter than MIN_AWAY_SECONDS are dropped. */
export function comeBack(live: LiveTimer, now: number): LiveTimer {
  const open = openAway(live);
  if (!open) return live;
  if (now - open.from < MIN_AWAY_SECONDS * 1000) return { ...live, aways: live.aways.filter((a) => a !== open) };
  return { ...live, aways: live.aways.map((a) => (a === open ? { ...a, to: now } : a)) };
}

/** The away the user has not answered for yet (the most recent one). */
export function pendingAway(live: LiveTimer): Away | null {
  for (let i = live.aways.length - 1; i >= 0; i--) {
    const a = live.aways[i];
    if (a.to !== null && !a.reviewed) return a;
  }
  return null;
}

/** Answer every closed, unanswered away: keep the time or take it off. */
export function reviewAways(live: LiveTimer, counted: boolean): LiveTimer {
  return { ...live, aways: live.aways.map((a) => (a.to !== null && !a.reviewed ? { ...a, counted, reviewed: true } : a)) };
}

export interface Clock {
  clockSeconds: number;
  pausedSeconds: number;
  activeSeconds: number;
  awayCount: number;
  /** All time away, claimed back or not. */
  awaySeconds: number;
  focusedSeconds: number;
  paused: boolean;
  /** Seconds left on a countdown, null when counting up. Never below 0. */
  remaining: number | null;
  /** Seconds past the end of a countdown. */
  overBy: number;
  /** 0 to 1 through a countdown, 0 when counting up. */
  progress: number;
}

export function clockOf(live: LiveTimer, now: number): Clock {
  const at = Math.max(now, live.startedAt);
  const clock = at - live.startedAt;
  const paused = live.pauses.reduce((n, p) => n + lengthOf(p, at), 0);
  const away = live.aways.reduce((n, a) => n + lengthOf(a, at), 0);
  const lost = live.aways.reduce((n, a) => n + (a.counted ? 0 : lengthOf(a, at)), 0);
  const active = Math.max(0, clock - paused);
  const focusedSeconds = Math.floor(Math.max(0, active - lost) / 1000);
  const planned = live.plannedSeconds;
  return {
    clockSeconds: Math.floor(clock / 1000),
    pausedSeconds: Math.floor(paused / 1000),
    activeSeconds: Math.floor(active / 1000),
    awayCount: live.aways.length,
    awaySeconds: Math.floor(away / 1000),
    focusedSeconds,
    paused: isPaused(live),
    remaining: planned === null ? null : Math.max(0, planned - focusedSeconds),
    overBy: planned === null ? 0 : Math.max(0, focusedSeconds - planned),
    progress: planned === null || planned <= 0 ? 0 : Math.min(1, focusedSeconds / planned),
  };
}

// ---------- left running ----------

export interface StaleInfo {
  /** Why it is not believed. */
  reason: "away" | "long";
  /** How long the timer claims, in clock minutes. */
  clockMinutes: number;
  /** The instant the session most likely really ended. */
  endedAt: number;
  /** What to offer as the real number. */
  suggestedMinutes: number;
}

/**
 * A timer left running. Two ways to tell: the app has been in the background
 * for hours (the phone went to bed with it), or the session is longer than
 * anyone works in one sitting. Either way it is capped and the user is asked,
 * it is never logged as is.
 */
export function staleInfo(live: LiveTimer, now: number): StaleInfo | null {
  const open = openAway(live);
  const longAway = live.aways.find((a) => !a.reviewed && lengthOf(a, now) >= STALE_AWAY_SECONDS * 1000) ?? null;
  const gone = longAway ?? (open && lengthOf(open, now) >= STALE_AWAY_SECONDS * 1000 ? open : null);
  const c = clockOf(live, now);
  const cap = Math.min(MAX_SESSION_SECONDS, live.plannedSeconds ?? MAX_SESSION_SECONDS);
  if (gone) {
    const before = clockOf(live, gone.from).focusedSeconds;
    return { reason: "away", clockMinutes: Math.floor(c.clockSeconds / 60), endedAt: gone.from, suggestedMinutes: Math.round(Math.min(before, cap) / 60) };
  }
  if (c.activeSeconds > MAX_SESSION_SECONDS) {
    return { reason: "long", clockMinutes: Math.floor(c.clockSeconds / 60), endedAt: now, suggestedMinutes: Math.round(cap / 60) };
  }
  return null;
}

// ---------- strict mode ----------

export interface StrictResult {
  action: "end" | "void";
  /** When the user left. An ended session stops here. */
  at: number;
  awaySeconds: number;
}

/** In strict mode, an away longer than the grace period ends or voids the session. */
export function strictBreach(live: LiveTimer, mode: StrictMode, graceSeconds: number, now: number): StrictResult | null {
  if (mode === "off") return null;
  for (const a of live.aways) {
    if (a.reviewed) continue;
    const len = lengthOf(a, now);
    if (len > graceSeconds * 1000) return { action: mode, at: a.from, awaySeconds: Math.floor(len / 1000) };
  }
  return null;
}

// ---------- finishing ----------

/** What a finished session keeps beyond its length: the columns added in migration 0009. */
export interface SessionMeta {
  clock_minutes: number;
  away_count: number;
  away_minutes: number;
  planned_minutes: number | null;
  /** A countdown that reached its length. */
  completed: boolean;
}

export interface Finished {
  /** False when it is too short to log. */
  log: boolean;
  /** The row patch. Minutes are focused minutes. The running state is cleared. */
  patch: { end: TimeStr; minutes: number; live: null } & SessionMeta;
  meta: SessionMeta;
}

/**
 * Close a timer at `at`. The session keeps the date it started on, so one
 * that runs past midnight counts toward the day it began (the evening it
 * belongs to), and `end` is just the wall time it stopped.
 */
export function finish(live: LiveTimer, at: number): Finished {
  const closed = comeBack(resume(live, at), at);
  const c = clockOf(closed, at);
  const planned = closed.plannedSeconds;
  const meta: SessionMeta = {
    clock_minutes: Math.round(c.clockSeconds / 60),
    away_count: c.awayCount,
    away_minutes: Math.round(c.awaySeconds / 60),
    planned_minutes: planned === null ? null : Math.round(planned / 60),
    completed: planned !== null && c.focusedSeconds >= planned - COMPLETE_SLACK_SECONDS,
  };
  return {
    log: c.focusedSeconds >= MIN_LOG_SECONDS,
    patch: { end: nyParts(new Date(at)).time, minutes: Math.round(c.focusedSeconds / 60), live: null, ...meta },
    meta,
  };
}

const NO_META = { away_count: 0, away_minutes: 0, clock_minutes: null, planned_minutes: null, completed: false, live: null } as const;

/** The row for a timer that starts at `now`. created_at carries the exact instant. */
export function startRow(now: number, label: string, blockId: string | null, live?: LiveTimer) {
  const p = nyParts(new Date(now));
  return {
    date: p.date,
    start: p.time,
    end: null,
    minutes: 0,
    label,
    source: "timer" as const,
    block_id: blockId,
    ...NO_META,
    planned_minutes: live?.plannedSeconds ? Math.round(live.plannedSeconds / 60) : null,
    live: live ? toState(live) : null,
    created_at: new Date(now).toISOString(),
  };
}

// ---------- logging by hand, editing ----------

export const MAX_MANUAL_MINUTES = 16 * 60;

export function cleanLabel(label: string | null | undefined): string {
  const t = (label ?? "").replace(/[\u2012-\u2015]/g, ", ").replace(/\s+/g, " ").trim().slice(0, 40);
  return t || "Study";
}

export function manualProblem(input: { date: DateStr; minutes: number | null }, today: DateStr): string | null {
  if (input.date > today) return "That day has not happened yet.";
  if (input.minutes === null || !Number.isFinite(input.minutes) || input.minutes < 1) return "Enter how many minutes.";
  if (input.minutes > MAX_MANUAL_MINUTES) return "That is more than 16 hours. Split it up.";
  return null;
}

function wrapTime(start: TimeStr, minutes: number): TimeStr {
  const [h, m] = start.split(":").map(Number);
  const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

/** A row logged by hand. End wraps past midnight, the date stays. */
export function manualRow(input: { date: DateStr; minutes: number; label: string; start: TimeStr }) {
  const minutes = Math.round(input.minutes);
  return { date: input.date, start: input.start, end: wrapTime(input.start, minutes), minutes, label: cleanLabel(input.label), source: "manual" as const, block_id: null, ...NO_META };
}

/** The patch for editing a finished session. End follows the new length. */
export function editPatch(row: Pick<FocusSession, "start">, input: { date: DateStr; minutes: number; label: string }) {
  const minutes = Math.round(input.minutes);
  return { date: input.date, minutes, label: cleanLabel(input.label), end: wrapTime(row.start, minutes) };
}

// ---------- totals ----------

type Counted = Pick<FocusSession, "date" | "minutes" | "end">;

/** Minutes logged on a date. Running timers (end null) hold 0 and add nothing. */
export function minutesOn(sessions: readonly Counted[], date: DateStr): number {
  return sessions.reduce((n, s) => n + (s.date === date && s.end !== null ? Math.max(0, s.minutes) : 0), 0);
}

export interface WeekDay {
  date: DateStr;
  /** "M", "T", ... */
  letter: string;
  minutes: number;
  met: boolean;
  future: boolean;
  today: boolean;
}

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Monday to Sunday of the week holding `today`. `liveMinutes` is the running timer, added to its own date. */
export function weekByDay(sessions: readonly Counted[], today: DateStr, goal: number, live?: { date: DateStr; minutes: number } | null): WeekDay[] {
  return weekDates(today).map((date, i) => {
    const minutes = minutesOn(sessions, date) + (live && live.date === date ? live.minutes : 0);
    return { date, letter: LETTERS[i], minutes, met: goal > 0 && minutes >= goal, future: date > today, today: date === today };
  });
}

export function goalProgress(minutes: number, goal: number): number {
  return goal > 0 ? Math.min(1, minutes / goal) : minutes > 0 ? 1 : 0;
}

// ---------- the study item on the checklist ----------

export type TickDecision = "tick" | "untick" | "none";

/**
 * Whether to touch the "Study or homework block" item for a date.
 * Tick when the day's minutes reach the goal or a scheduled block's timer was
 * completed. Untick only a tick this feature made itself, and only when the
 * reason for it is gone (a session was edited down or deleted). A tick the
 * user made by hand is never removed.
 */
export function studyTick(input: { minutes: number; goal: number; blockCompleted: boolean; checked: boolean; autoTicked: boolean }): TickDecision {
  const earned = (input.goal > 0 && input.minutes >= input.goal) || input.blockCompleted;
  if (earned) return input.checked ? "none" : "tick";
  if (input.checked && input.autoTicked) return "untick";
  return "none";
}

// ---------- a study block that is live on the schedule ----------

interface BlockLike {
  id: string;
  kind: string;
  block_name: string;
  start: TimeStr;
  end: TimeStr;
}

const mins = (t: TimeStr) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** The study block running right now, with the seconds left in it. */
export function liveStudyBlock<T extends BlockLike>(blocks: readonly T[], nowSeconds: number): { block: T; remainingSeconds: number } | null {
  for (const b of blocks) {
    if (b.kind !== "study") continue;
    const s = mins(b.start) * 60;
    let e = mins(b.end) * 60;
    if (e <= s) e = 24 * 3600;
    if (nowSeconds >= s && nowSeconds < e && e - nowSeconds >= MIN_LOG_SECONDS) return { block: b, remainingSeconds: Math.floor(e - nowSeconds) };
  }
  return null;
}

// ---------- formatting ----------

/** "4m 10s", "45s", "1h 5m". For time away. */
export function formatAway(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  if (t < 60) return `${t}s`;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const s = t % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ---------- business log ----------

export interface BusinessMove {
  date: DateStr;
  text: string;
}

export interface BusinessWeek {
  weekStart: DateStr;
  weekEnd: DateStr;
  moves: BusinessMove[];
}

/** The business item's logged text, newest week first, newest move first. Empty weeks are left out. */
export function businessWeeks(logs: readonly Pick<DayLog, "date" | "item_id" | "text">[], itemId: string): BusinessWeek[] {
  const by = new Map<DateStr, BusinessMove[]>();
  for (const l of logs) {
    const text = (l.text ?? "").trim();
    if (l.item_id !== itemId || !text) continue;
    const w = weekStart(l.date);
    const list = by.get(w) ?? [];
    list.push({ date: l.date, text });
    by.set(w, list);
  }
  return Array.from(by.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([w, moves]) => ({ weekStart: w, weekEnd: addDays(w, 6), moves: moves.sort((a, b) => (a.date < b.date ? 1 : -1)) }));
}

export function businessSummary(weeks: readonly BusinessWeek[], today: DateStr): { total: number; thisWeek: number; activeWeeks: number } {
  const w = weekStart(today);
  return {
    total: weeks.reduce((n, x) => n + x.moves.length, 0),
    thisWeek: weeks.find((x) => x.weekStart === w)?.moves.length ?? 0,
    activeWeeks: weeks.length,
  };
}
