// Calendar dates and clock times for the app. Pure functions, no db, no React.
// Every calendar date is an America/New_York date stored as "YYYY-MM-DD".
// Calendar dates are never derived from a UTC string.

import type { DateStr, IsoStr, TimeStr, Weekday } from "../types";

export const TIME_ZONE = "America/New_York";

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export interface NyParts {
  date: DateStr;
  time: TimeStr;
  hour: number;
  minute: number;
  /** Minutes since midnight. */
  minutes: number;
  weekday: Weekday;
}

/** The New York wall clock for an instant. */
export function nyParts(at: Date | IsoStr = new Date()): NyParts {
  const d = typeof at === "string" ? new Date(at) : at;
  const map: Record<string, string> = {};
  for (const p of partsFormat.formatToParts(d)) map[p.type] = p.value;
  const date = `${map.year}-${map.month}-${map.day}`;
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  return {
    date,
    time: `${pad(hour)}:${pad(minute)}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
    weekday: weekdayOf(date),
  };
}

/** Today's calendar date in New York. */
export function todayNY(now: Date = new Date()): DateStr {
  return nyParts(now).date;
}

/** The current New York clock time as "HH:MM". */
export function timeNY(now: Date = new Date()): TimeStr {
  return nyParts(now).time;
}

/** Timestamp for created_at and completed_at. An instant, not a calendar date. */
export function nowIso(now: Date = new Date()): IsoStr {
  return now.toJSON();
}

export function isDateStr(s: unknown): s is DateStr {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Day arithmetic runs on a UTC day count so no time zone can shift it.
function toDayCount(date: DateStr): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromDayCount(n: number): DateStr {
  const t = new Date(n * 86_400_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addDays(date: DateStr, n: number): DateStr {
  return fromDayCount(toDayCount(date) + n);
}

/** Whole days from a to b. Positive when b is later. */
export function diffDays(a: DateStr, b: DateStr): number {
  return toDayCount(b) - toDayCount(a);
}

export function weekdayOf(date: DateStr): Weekday {
  // Day count 0 (1970-01-01) was a Thursday.
  return ((((toDayCount(date) + 4) % 7) + 7) % 7) as Weekday;
}

/** Inclusive list of dates from a to b. Empty when b is before a. */
export function dateRange(a: DateStr, b: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let n = toDayCount(a), end = toDayCount(b); n <= end; n++) out.push(fromDayCount(n));
  return out;
}

// ---------- day counts ----------
// Plain date arithmetic for a run of days with a start and a length. What a
// challenge is, and whether one is running, lives in ./challenge.

/** Day 1 is start_date. Before the start this is 0 or negative. Never stored. */
export function dayNumber(startDate: DateStr, date: DateStr): number {
  return diffDays(startDate, date) + 1;
}

export function dateOfDay(startDate: DateStr, day: number): DateStr {
  return addDays(startDate, day - 1);
}

export function challengeEndDate(startDate: DateStr, lengthDays: number): DateStr {
  return addDays(startDate, lengthDays - 1);
}

export function isInChallenge(startDate: DateStr, lengthDays: number, date: DateStr): boolean {
  const n = dayNumber(startDate, date);
  return n >= 1 && n <= lengthDays;
}

export function challengeDates(startDate: DateStr, lengthDays: number): DateStr[] {
  return dateRange(startDate, challengeEndDate(startDate, lengthDays));
}

// ---------- weeks (Monday to Sunday, weekly items roll up on Sunday) ----------

export function weekStart(date: DateStr): DateStr {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function weekEnd(date: DateStr): DateStr {
  return addDays(weekStart(date), 6);
}

export function weekDates(date: DateStr): DateStr[] {
  const s = weekStart(date);
  return dateRange(s, addDays(s, 6));
}

// ---------- months ----------

/** The first day of the month a date is in. */
export function monthStart(date: DateStr): DateStr {
  return `${date.slice(0, 7)}-01`;
}

/** The last day of the month a date is in. */
export function monthEnd(date: DateStr): DateStr {
  const [y, m] = date.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return addDays(next, -1);
}

/** The first day of the month before or after, by `n` months. */
export function addMonths(date: DateStr, n: number): DateStr {
  const [y, m] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

// ---------- clock times ----------

export function isTimeStr(s: unknown): s is TimeStr {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function minutesOf(time: TimeStr): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function timeFromMinutes(minutes: number): TimeStr {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function addMinutes(time: TimeStr, delta: number): TimeStr {
  return timeFromMinutes(minutesOf(time) + delta);
}

/** Minutes from start to end. An end at or before the start is the next day. */
export function durationMinutes(start: TimeStr, end: TimeStr): number {
  const d = minutesOf(end) - minutesOf(start);
  return d > 0 ? d : d + 1440;
}

/** "06:30" to "6:30 AM". Pass short for "6:30a" style without the space. */
export function formatTime(time: TimeStr): string {
  const [h, m] = time.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/** 90 to "1h 30m", 45 to "45m", 120 to "2h". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

// ---------- display ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Monday, Oct 5" */
export function formatDateLong(date: DateStr): string {
  const [, m, d] = date.split("-").map(Number);
  return `${DAYS[weekdayOf(date)]}, ${MONTHS[m - 1]} ${d}`;
}

/** "Oct 5" */
export function formatDateShort(date: DateStr): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Thursday, October 8" */
export function formatDateFull(date: DateStr): string {
  const [, m, d] = date.split("-").map(Number);
  return `${DAYS[weekdayOf(date)]}, ${MONTHS_LONG[m - 1]} ${d}`;
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 2026" */
export function formatMonth(date: DateStr): string {
  const [y, m] = date.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

// ---------- instants ----------

/** The instant a New York wall clock time happens on a calendar date. */
export function nyInstant(date: DateStr, time: TimeStr): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Start from the wall time read as UTC, then correct by the zone offset
  // seen at that guess. Two passes settle it on both sides of a clock change.
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = nyParts(new Date(guess));
    const [py, pm, pd] = p.date.split("-").map(Number);
    const seen = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
    guess += wall - seen;
  }
  return new Date(guess);
}

// ---------- edit lock ----------

/**
 * The instant a day locks: noon New York time on the day after `date`.
 *
 * Backfill: days before the app was first opened (`installedOn`) were logged
 * on paper, so they stay open as long as the install day itself does, which
 * is noon on the day after install.
 */
export function lockInstant(date: DateStr, installedOn?: DateStr | null): Date {
  const anchor = installedOn && date < installedOn ? installedOn : date;
  return nyInstant(addDays(anchor, 1), "12:00");
}

/** A day can be edited until noon the next day, then it locks. */
export function isDayLocked(date: DateStr, now: Date = new Date(), installedOn?: DateStr | null): boolean {
  return now.getTime() >= lockInstant(date, installedOn).getTime();
}

/** Editable means not in the future and not locked. */
export function isDayEditable(date: DateStr, now: Date = new Date(), installedOn?: DateStr | null): boolean {
  return date <= todayNY(now) && !isDayLocked(date, now, installedOn);
}
