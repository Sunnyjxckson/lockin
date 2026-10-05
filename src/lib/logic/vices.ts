// Vice rules. Pure functions: pass in items, versions, logs and slips.
//
// A vice is a checklist item with category "vice". Quit mode is a yes/no
// checked at the end of the day. Cap mode is a number logged through the day
// against a "max" target. A slip logged on a day makes that day not clean for
// that vice, whatever the tick or the number says. The count of slips is kept
// on the day_log row (day_log.slips, see syncSlipCount), so the foundation's
// scoring and streaks see it too and every screen agrees.

import type { ChecklistItem, DateStr, DayLog, SpendPeriod, Target, TargetVersion, TimeStr, ViceSlip, Weekday } from "../types";

export type { SpendPeriod };
import { addDays, challengeDates, dayNumber, minutesOf, weekdayOf } from "./dates";
import { itemState } from "./day";
import { itemStreak, type Streak } from "./streaks";
import { isActiveOn, targetOn } from "./targets";

// ---------- clean or not ----------

/** Slip counts for one vice, by date. */
export function slipCounts(slips: readonly ViceSlip[], itemId: string): Map<DateStr, number> {
  const map = new Map<DateStr, number>();
  for (const s of slips) if (s.item_id === itemId) map.set(s.date, (map.get(s.date) ?? 0) + 1);
  return map;
}

/**
 * Whether a day is clean for a vice.
 * Quit: the day is checked and no slip was logged.
 * Cap: an amount is logged, it is at or under the cap, and no slip was logged.
 */
export function isCleanDay(target: Target, log: DayLog | null | undefined, slipCount = 0): boolean {
  if (slipCount > 0 || !log) return false;
  if (target.kind === "max") return log.value !== null && log.value !== undefined && log.value <= target.max;
  return itemState({ type: "yesno" }, target, log) === "done";
}

/**
 * One vice's logs with slip days made not clean, ready for itemStreak.
 * A quit day with a slip is unticked. A capped day with a slip is pushed over
 * any cap. Days with a slip and no log row need nothing: no row is not clean.
 */
export function logsWithSlips(item: Pick<ChecklistItem, "id" | "type">, logs: readonly DayLog[], slips: readonly ViceSlip[]): DayLog[] {
  const counts = slipCounts(slips, item.id);
  const out: DayLog[] = [];
  for (const l of logs) {
    if (l.item_id !== item.id) continue;
    if (!counts.has(l.date)) out.push(l);
    else out.push({ ...l, checked: false, value: l.value === null ? null : Number.POSITIVE_INFINITY });
  }
  return out;
}

/** Clean streak for one vice. Only this vice's slips touch it. */
export function viceStreak(
  item: ChecklistItem,
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
  slips: readonly ViceSlip[],
  today: DateStr,
  from: DateStr,
): Streak {
  const streak = itemStreak(item, versions, logsWithSlips(item, logs, slips), today, from);
  // The foundation lets an unfinished today ride on yesterday's run. A slip
  // today (or going over the cap) is not unfinished: the run is over.
  const todayLog = logs.find((l) => l.item_id === item.id && l.date === today);
  const slipsToday = slips.filter((s) => s.item_id === item.id && s.date === today).length;
  if (viceDayState(item, versions, todayLog, slipsToday, today, today) === "slip") return { ...streak, current: 0, doneNow: false };
  return streak;
}

// ---------- calendar ----------

export type ViceDayState =
  /** Clean under the rule in force that day. */
  | "clean"
  /** A slip was logged, or the amount went over the cap. */
  | "slip"
  /** Tracked, nothing logged. */
  | "open"
  /** The vice was not turned on that day. */
  | "off"
  | "future";

export interface ViceDay {
  date: DateStr;
  /** The number in the cell: the day of the challenge (from 1) when `numbered`, else the day of the month. */
  day: number;
  state: ViceDayState;
  slips: number;
  isToday: boolean;
}

export function viceDayState(
  item: ChecklistItem,
  versions: readonly TargetVersion[],
  log: DayLog | null | undefined,
  slipCount: number,
  date: DateStr,
  today: DateStr,
): ViceDayState {
  if (date > today) return "future";
  if (slipCount > 0) return "slip";
  if (!isActiveOn(item, versions, date)) return "off";
  const target = targetOn(item, versions, date);
  if (isCleanDay(target, log, 0)) return "clean";
  if (target.kind === "max" && log && log.value !== null && log.value !== undefined) return "slip";
  return "open";
}

/** One entry per day of the window, in order. Pass `numbered` false for plain dates outside a challenge. */
export function viceCalendar(
  item: ChecklistItem,
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
  slips: readonly ViceSlip[],
  startDate: DateStr,
  lengthDays: number,
  today: DateStr,
  numbered = true,
): ViceDay[] {
  const counts = slipCounts(slips, item.id);
  const byDate = new Map<DateStr, DayLog>();
  for (const l of logs) if (l.item_id === item.id) byDate.set(l.date, l);
  return challengeDates(startDate, lengthDays).map((date) => {
    const n = counts.get(date) ?? 0;
    return {
      date,
      day: numbered ? dayNumber(startDate, date) : Number(date.slice(8)),
      state: viceDayState(item, versions, byDate.get(date), n, date, today),
      slips: n,
      isToday: date === today,
    };
  });
}

/** Clean days from `from` up to and including `today`. */
export function cleanDayCount(
  item: ChecklistItem,
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
  slips: readonly ViceSlip[],
  from: DateStr,
  today: DateStr,
): number {
  const counts = slipCounts(slips, item.id);
  const byDate = new Map<DateStr, DayLog>();
  for (const l of logs) if (l.item_id === item.id) byDate.set(l.date, l);
  let n = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (viceDayState(item, versions, byDate.get(d), counts.get(d) ?? 0, d, today) === "clean") n++;
  }
  return n;
}

// ---------- dollars kept ----------

export interface TypicalSpend {
  amount: number;
  period: SpendPeriod;
}

/** The typical spend stored on a vice, or null when none is set. */
export function spendOf(item: Pick<ChecklistItem, "typical_spend" | "spend_period">): TypicalSpend | null {
  const amount = Number(item.typical_spend);
  if (item.typical_spend === null || item.typical_spend === undefined || !Number.isFinite(amount) || amount <= 0) return null;
  return { amount, period: item.spend_period === "day" ? "day" : "week" };
}

/** "$40 a week". */
export function describeSpend(spend: TypicalSpend): string {
  return `$${trimNumber(spend.amount)} a ${spend.period}`;
}

/**
 * Before typical_spend and spend_period existed the spend was kept in the
 * item's hint as "Usually $40 a week". This reads that sentence so old rows
 * can be moved to the real fields. Nothing writes it any more.
 */
export function parseLegacySpendHint(hint: string | null | undefined): TypicalSpend | null {
  if (!hint) return null;
  const m = /^Usually \$([0-9]+(?:\.[0-9]+)?) a (day|week)$/.exec(hint.trim());
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, period: m[2] as SpendPeriod };
}

export function spendPerDay(spend: TypicalSpend): number {
  return spend.period === "week" ? spend.amount / 7 : spend.amount;
}

export interface DollarsKept {
  /** What the clean days would have cost at the typical spend. */
  saved: number;
  /** Dollars spent in logged slips. */
  spent: number;
  /** saved minus spent. Can go below zero. */
  kept: number;
  cleanDays: number;
}

export function dollarsKept(cleanDays: number, spend: TypicalSpend | null, slips: readonly Pick<ViceSlip, "amount">[]): DollarsKept {
  const saved = spend ? roundCents(cleanDays * spendPerDay(spend)) : 0;
  const spent = roundCents(slips.reduce((sum, s) => sum + (s.amount ?? 0), 0));
  return { saved, spent, kept: roundCents(saved - spent), cleanDays };
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "$1,240", "$12.50", "-$40". */
export function formatDollars(n: number): string {
  const abs = Math.abs(n);
  const whole = Math.abs(abs - Math.round(abs)) < 0.005;
  const text = abs.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return `${n < 0 ? "-" : ""}$${text}`;
}

// ---------- triggers ----------

export const TRIGGER_CHIPS = ["bored", "stressed", "tired", "with friends", "late night", "alone", "celebrating"] as const;

/** Chips and free text become one comma separated string for the slip row. */
export function joinTriggers(chips: readonly string[], text = ""): string | null {
  const parts = [...chips, ...text.split(",")].map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length > 0 ? unique.join(", ") : null;
}

export function splitTriggers(trigger: string | null | undefined): string[] {
  if (!trigger) return [];
  return trigger
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);
}

// ---------- pattern summary ----------

export type TimeBucket = "morning" | "afternoon" | "evening" | "late night";

/** Morning 5 to noon, afternoon noon to 5, evening 5 to 9, late night 9 PM to 5 AM. */
export function timeBucket(time: TimeStr): TimeBucket {
  const m = minutesOf(time);
  if (m >= 5 * 60 && m < 12 * 60) return "morning";
  if (m >= 12 * 60 && m < 17 * 60) return "afternoon";
  if (m >= 17 * 60 && m < 21 * 60) return "evening";
  return "late night";
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export interface Top<T> {
  value: T;
  count: number;
}

export interface SlipPattern {
  total: number;
  timeOfDay: Top<TimeBucket> | null;
  trigger: Top<string> | null;
  weekday: Top<Weekday> | null;
}

/** The most common value. Ties go to the one seen in the most recent slip. */
function top<T>(values: readonly T[]): Top<T> | null {
  const counts = new Map<T, number>();
  let best: Top<T> | null = null;
  // Values arrive newest first, so the first to reach a count wins a tie.
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const v of values) {
    const count = counts.get(v) ?? 0;
    if (!best || count > best.count) best = { value: v, count };
  }
  return best;
}

/** Newest first, by date then time. */
export function sortSlips<T extends Pick<ViceSlip, "date" | "time">>(slips: readonly T[]): T[] {
  return [...slips].sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)));
}

export function slipPattern(slips: readonly Pick<ViceSlip, "date" | "time" | "trigger">[]): SlipPattern {
  const ordered = sortSlips(slips);
  return {
    total: ordered.length,
    timeOfDay: top(ordered.map((s) => timeBucket(s.time))),
    trigger: top(ordered.flatMap((s) => splitTriggers(s.trigger))),
    weekday: top(ordered.map((s) => weekdayOf(s.date))),
  };
}

// ---------- caps ----------

export const CAP_UNITS = [
  { value: "min", label: "Minutes" },
  { value: "times", label: "Count" },
  { value: "$", label: "Dollars" },
] as const;

export type CapUnit = (typeof CAP_UNITS)[number]["value"];

/** "12 min", "$40", "3 times". */
export function formatAmount(value: number, unit: string | null): string {
  const n = trimNumber(value);
  if (unit === "$") return `$${n}`;
  if (unit === "times") return `${n} ${value === 1 ? "time" : "times"}`;
  return unit ? `${n} ${unit}` : n;
}

/** Quick add steps for the amount sheet. */
export function quickAdds(unit: string | null): number[] {
  if (unit === "min") return [5, 15, 30];
  if (unit === "$") return [5, 10, 20];
  return [1, 2, 3];
}

/** The line shown for a vice's rule: "Quit completely", "Under 30 min a day". */
export function describeRule(item: Pick<ChecklistItem, "mode" | "unit">, target: Target): string {
  if (item.mode === "cap" && target.kind === "max") return `${formatAmount(target.max, item.unit)} or less a day`;
  return "Quit completely";
}
