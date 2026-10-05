// The ongoing view of progress: weeks and months that do not end. Pure.
//
// Nothing here knows about challenges. It reads the same items, versions and
// logs as everything else and scores each day with summarizeDay, from the
// first day of the history up to today. Days before the history starts are
// "before": never tracked, never counted.

import type { ChecklistItem, DateStr, DayLog, TargetVersion } from "../types";
import { consistency, type Consistency } from "./challenge";
import { addDays, addMonths, dateRange, diffDays, formatDateShort, formatMonth, monthEnd, monthStart, weekEnd, weekStart, weekdayOf } from "./dates";
import { summarizeDay, summarizeWeek, type DayStatus, type WeeklyResult } from "./day";
import { cellKind, type GridCell } from "./progress";

export interface OngoingInput {
  /** First date of the history. */
  historyStart: DateStr;
  today: DateStr;
  items: readonly ChecklistItem[];
  versions: readonly TargetVersion[];
  logs: readonly DayLog[];
}

/** One scored cell per date. `day` is the day of the month. */
export function ongoingCells(input: OngoingInput, from: DateStr, to: DateStr): GridCell[] {
  const { historyStart, today, items, versions, logs } = input;
  return dateRange(from, to).map((date) => {
    const day = Number(date.slice(8));
    if (date > today || date < historyStart) {
      return { date, day, kind: date > today ? "future" : "before", isToday: false, done: 0, total: 0, percent: 0, summary: null };
    }
    const summary = summarizeDay(date, items, versions, logs);
    return {
      date,
      day,
      kind: cellKind(summary.status, date, today),
      isToday: date === today,
      done: summary.done,
      total: summary.total,
      percent: summary.percent,
      summary,
    };
  });
}

/** The status of every day in the history so far. */
export function statusByDate(input: OngoingInput): Record<DateStr, DayStatus> {
  const out: Record<DateStr, DayStatus> = {};
  if (input.historyStart > input.today) return out;
  for (const d of dateRange(input.historyStart, input.today)) {
    out[d] = summarizeDay(d, input.items, input.versions, input.logs).status;
  }
  return out;
}

export interface Tally {
  /** Full days, today included once it is full. */
  full: number;
  /** Finished days with some but not all items done. */
  partial: number;
  /** Finished days with nothing done. */
  missed: number;
  /** Days that count so far: finished days, plus today once it is full. */
  days: number;
  /** Full days over days that count, 0 to 100. Null before anything counts. */
  percent: number | null;
}

/** Day counts for a run of cells. Today only counts once it is full, so an unfinished morning is not a miss. */
export function tally(cells: readonly GridCell[]): Tally {
  let full = 0;
  let partial = 0;
  let missed = 0;
  for (const c of cells) {
    if (c.kind === "full") full++;
    else if (c.isToday) continue;
    else if (c.kind === "partial") partial++;
    else if (c.kind === "missed") missed++;
  }
  const days = full + partial + missed;
  return { full, partial, missed, days, percent: days > 0 ? Math.round((full / days) * 100) : null };
}

// ---------- weeks ----------

export interface OngoingWeek extends Tally {
  /** Monday and Sunday. */
  weekStart: DateStr;
  weekEnd: DateStr;
  /** "Oct 5 to Oct 11". */
  label: string;
  state: "current" | "past";
  /** Seven cells, Monday first. */
  cells: GridCell[];
  /** The weekly items as rolled up for this week. */
  weekly: WeeklyResult[];
  weeklyDone: number;
  weeklyTotal: number;
}

/** The latest weeks, this week first, back to the week the history starts in. */
export function ongoingWeeks(input: OngoingInput, max = 8): OngoingWeek[] {
  const { historyStart, today, items, versions, logs } = input;
  if (historyStart > today) return [];
  const first = weekStart(historyStart);
  const out: OngoingWeek[] = [];
  for (let start = weekStart(today); start >= first && out.length < max; start = addDays(start, -7)) {
    const end = weekEnd(start);
    const cells = ongoingCells(input, start, end);
    const week = summarizeWeek(start, items, versions, logs, today);
    out.push({
      ...tally(cells),
      weekStart: start,
      weekEnd: end,
      label: `${formatDateShort(start)} to ${formatDateShort(end)}`,
      state: today <= end ? "current" : "past",
      cells,
      weekly: week.items,
      weeklyDone: week.done,
      weeklyTotal: week.total,
    });
  }
  return out;
}

// ---------- months ----------

export interface OngoingMonth extends Tally {
  /** "2026-10". */
  key: string;
  /** "October 2026". */
  label: string;
  state: "current" | "past";
  /** Blank cells before the 1st so columns line up Monday to Sunday. */
  lead: number;
  /** One cell per day of the month. */
  cells: GridCell[];
}

/** Every month from the one the history starts in to this one, newest first. */
export function ongoingMonths(input: OngoingInput, max = 24): OngoingMonth[] {
  const { historyStart, today } = input;
  if (historyStart > today) return [];
  const first = monthStart(historyStart);
  const out: OngoingMonth[] = [];
  for (let start = monthStart(today); start >= first && out.length < max; start = addMonths(start, -1)) {
    const cells = ongoingCells(input, start, monthEnd(start));
    out.push({
      ...tally(cells),
      key: start.slice(0, 7),
      label: formatMonth(start),
      state: start === monthStart(today) ? "current" : "past",
      lead: (weekdayOf(start) + 6) % 7,
      cells,
    });
  }
  return out;
}

// ---------- the headline ----------

export interface OngoingHeadline {
  /** Full days out of the last 30, the main number. */
  last30: Consistency;
  last7: Consistency;
  /** Days in the history so far, today included. */
  totalDays: number;
  /** Full days in the whole history. */
  fullDays: number;
  /** Full days in a row ending today or yesterday. */
  fullStreak: number;
  /** The longest run of full days in the history. */
  bestFullStreak: number;
}

export function ongoingHeadline(status: Readonly<Record<DateStr, DayStatus>>, historyStart: DateStr, today: DateStr): OngoingHeadline {
  let fullDays = 0;
  let best = 0;
  let run = 0;
  if (historyStart <= today) {
    for (const d of dateRange(historyStart, today)) {
      if (status[d] === "full") {
        fullDays++;
        run++;
        if (run > best) best = run;
      } else if (d !== today) {
        run = 0;
      }
    }
  }
  let streak = 0;
  for (let d = status[today] === "full" ? today : addDays(today, -1); d >= historyStart && status[d] === "full"; d = addDays(d, -1)) streak++;
  return {
    last30: consistency(status, today, historyStart, 30),
    last7: consistency(status, today, historyStart, 7),
    totalDays: historyStart <= today ? diffDays(historyStart, today) + 1 : 0,
    fullDays,
    fullStreak: streak,
    bestFullStreak: Math.max(best, streak),
  };
}
