// Progress screen rules. Pure functions: pass in the challenge, items,
// versions and logs. Scoring is never redone here. Every day goes through
// summarizeDay, every week through summarizeWeek and every streak through
// allStreaks, so past days are judged against the targets in force that day.

import type { BodyLog, ChecklistItem, DateStr, DayLog, TargetVersion } from "../types";
import {
  addDays,
  challengeDates,
  dayNumber,
  formatDateShort,
  weekEnd,
  weekStart,
  weekdayOf,
} from "./dates";
import { summarizeDay, summarizeWeek, type DayStatus, type DaySummary, type WeeklyResult } from "./day";
import { allStreaks, type Streak } from "./streaks";
import { isActiveOn } from "./targets";

export interface ProgressInput {
  startDate: DateStr;
  lengthDays: number;
  today: DateStr;
  items: readonly ChecklistItem[];
  versions: readonly TargetVersion[];
  logs: readonly DayLog[];
}

// ---------- grid ----------

/**
 * full, partial and missed are the foundation's day status. Today with
 * nothing done yet is "open" rather than missed, because the day is not over.
 * Days after today are "future".
 */
export type CellKind = DayStatus | "open" | "future";

export interface GridCell {
  date: DateStr;
  /** 1 based day of the challenge. */
  day: number;
  kind: CellKind;
  isToday: boolean;
  /** Daily items done and counted on that date. Zero for future days. */
  done: number;
  total: number;
  /** 0 to 100. */
  percent: number;
  /** The scored day, null for future days. */
  summary: DaySummary | null;
}

export interface GridModel {
  cells: GridCell[];
  /** Blank cells before day 1 so columns line up Monday to Sunday. */
  lead: number;
  length: number;
  /** Today's day number when today is inside the challenge. */
  todayDay: number | null;
}

export function cellKind(status: DayStatus, date: DateStr, today: DateStr): CellKind {
  if (date > today) return "future";
  if (date === today && status === "missed") return "open";
  return status;
}

export function buildGrid(input: ProgressInput): GridModel {
  const { startDate, lengthDays, today, items, versions, logs } = input;
  const length = Math.max(0, Math.floor(lengthDays));
  const cells: GridCell[] = challengeDates(startDate, length).map((date, i) => {
    if (date > today) {
      return { date, day: i + 1, kind: "future", isToday: false, done: 0, total: 0, percent: 0, summary: null };
    }
    const summary = summarizeDay(date, items, versions, logs);
    return {
      date,
      day: i + 1,
      kind: cellKind(summary.status, date, today),
      isToday: date === today,
      done: summary.done,
      total: summary.total,
      percent: summary.percent,
      summary,
    };
  });
  const n = dayNumber(startDate, today);
  return {
    cells,
    lead: (weekdayOf(startDate) + 6) % 7,
    length,
    todayDay: n >= 1 && n <= length ? n : null,
  };
}

// ---------- what counts so far ----------

/**
 * Whether one item on one day counts toward a rate yet. Past days always
 * count. Today counts once the item is done, so an unfinished morning does
 * not drag the numbers down. On day 1 there is nothing else to show, so today
 * counts in full.
 */
function countsYet(cell: GridCell, done: boolean, onlyToday: boolean): boolean {
  if (cell.kind === "future") return false;
  if (!cell.isToday) return true;
  return done || onlyToday;
}

function isOnlyToday(grid: GridModel): boolean {
  return !grid.cells.some((c) => c.kind !== "future" && !c.isToday);
}

function pct(done: number, total: number): number {
  return total <= 0 ? 0 : Math.round((done / total) * 100);
}

// ---------- headline ----------

export interface Headline {
  /** Day of the challenge, clamped to 0 (not started) through length. */
  day: number;
  length: number;
  started: boolean;
  finished: boolean;
  /** Full days, today included once it is full. */
  lockedIn: number;
  /** Past days with some but not all items done. */
  partial: number;
  /** Past days with nothing done. */
  missed: number;
  /** Item completions over items that count so far, 0 to 100. */
  percent: number;
  /** Days left after today. */
  remaining: number;
}

export function headline(grid: GridModel, startDate: DateStr, today: DateStr): Headline {
  const n = dayNumber(startDate, today);
  const day = Math.min(Math.max(n, 0), grid.length);
  const onlyToday = isOnlyToday(grid);
  let lockedIn = 0;
  let partial = 0;
  let missed = 0;
  let done = 0;
  let total = 0;
  for (const cell of grid.cells) {
    if (cell.kind === "future" || !cell.summary) continue;
    if (cell.kind === "full") lockedIn++;
    else if (!cell.isToday && cell.kind === "partial") partial++;
    else if (!cell.isToday && cell.kind === "missed") missed++;
    for (const r of cell.summary.items) {
      if (!countsYet(cell, r.done, onlyToday)) continue;
      total++;
      if (r.done) done++;
    }
  }
  return {
    day,
    length: grid.length,
    started: n >= 1,
    finished: n > grid.length,
    lockedIn,
    partial,
    missed,
    percent: pct(done, total),
    remaining: Math.max(0, grid.length - day),
  };
}

// ---------- weeks ----------

export interface WeekRollup {
  /** 1 based, in challenge order. */
  index: number;
  /** Monday and Sunday of the calendar week. */
  weekStart: DateStr;
  weekEnd: DateStr;
  /** First and last challenge day inside the week. */
  from: DateStr;
  to: DateStr;
  state: "past" | "current" | "future";
  /** Day counts for the challenge days in this week that have happened. */
  full: number;
  partial: number;
  missed: number;
  /** Daily item completions over what counts so far in this week. */
  done: number;
  total: number;
  /** 0 to 100, null before the week has anything to count. */
  percent: number | null;
  /** The weekly items as the foundation rolled them up. */
  weekly: WeeklyResult[];
  weeklyDone: number;
  weeklyTotal: number;
}

export function weeklyRollups(grid: GridModel, input: ProgressInput): WeekRollup[] {
  const { today, items, versions, logs } = input;
  const onlyToday = isOnlyToday(grid);
  const byWeek = new Map<DateStr, GridCell[]>();
  for (const cell of grid.cells) {
    const key = weekStart(cell.date);
    const list = byWeek.get(key);
    if (list) list.push(cell);
    else byWeek.set(key, [cell]);
  }
  const out: WeekRollup[] = [];
  let index = 0;
  for (const [start, cells] of byWeek) {
    index++;
    const end = weekEnd(start);
    const state = today < cells[0].date ? "future" : today > end ? "past" : "current";
    let full = 0;
    let partial = 0;
    let missed = 0;
    let done = 0;
    let total = 0;
    for (const cell of cells) {
      if (cell.kind === "future" || !cell.summary) continue;
      if (cell.kind === "full") full++;
      else if (!cell.isToday && cell.kind === "partial") partial++;
      else if (!cell.isToday && cell.kind === "missed") missed++;
      for (const r of cell.summary.items) {
        if (!countsYet(cell, r.done, onlyToday)) continue;
        total++;
        if (r.done) done++;
      }
    }
    const week = state === "future" ? null : summarizeWeek(start, items, versions, logs, today);
    out.push({
      index,
      weekStart: start,
      weekEnd: end,
      from: cells[0].date,
      to: cells[cells.length - 1].date,
      state,
      full,
      partial,
      missed,
      done,
      total,
      percent: total > 0 ? pct(done, total) : null,
      weekly: week?.items ?? [],
      weeklyDone: week?.done ?? 0,
      weeklyTotal: week?.total ?? 0,
    });
  }
  return out;
}

// ---------- per item rates ----------

export interface ItemRate {
  item: ChecklistItem;
  /** Days (or weeks for weekly items) done. */
  done: number;
  /** Days or weeks that count so far. */
  total: number;
  /** 0 to 1, null when nothing counts yet (a weekly item in its first week). */
  rate: number | null;
  unit: "day" | "week";
  /** Still in the checklist today. */
  current: boolean;
}

/**
 * Completion rate for every item that was ever scored in the challenge so
 * far. Weekly items count weeks: a week counts once it has ended, or as soon
 * as the item is done in it. Lowest rate first.
 */
export function itemRates(grid: GridModel, weeks: readonly WeekRollup[], input: ProgressInput): ItemRate[] {
  const onlyToday = isOnlyToday(grid);
  const rows = new Map<string, ItemRate>();
  const row = (item: ChecklistItem, unit: "day" | "week"): ItemRate => {
    let r = rows.get(item.id);
    if (!r) {
      r = {
        item,
        done: 0,
        total: 0,
        rate: null,
        unit,
        current: !item.archived && isActiveOn(item, input.versions, input.today),
      };
      rows.set(item.id, r);
    }
    return r;
  };
  for (const cell of grid.cells) {
    if (!cell.summary) continue;
    for (const res of cell.summary.items) {
      const r = row(res.item, "day");
      if (!countsYet(cell, res.done, onlyToday)) continue;
      r.total++;
      if (res.done) r.done++;
    }
  }
  for (const week of weeks) {
    if (week.state === "future") continue;
    for (const res of week.weekly) {
      const r = row(res.item, "week");
      if (week.state === "past" || res.done) {
        r.total++;
        if (res.done) r.done++;
      }
    }
  }
  const list = [...rows.values()].map((r) => ({ ...r, rate: r.total > 0 ? r.done / r.total : null }));
  return list.sort(
    (a, b) =>
      (a.rate ?? 2) - (b.rate ?? 2) ||
      a.item.sort_order - b.item.sort_order ||
      a.item.name.localeCompare(b.item.name),
  );
}

// ---------- streaks ----------

/**
 * broken: had a run and lost it. cold: never got one going. behind: running,
 * but shorter than the best. best: on the longest run so far.
 */
export type StreakHealth = "broken" | "cold" | "behind" | "best";

export interface StreakRow extends Streak {
  item: ChecklistItem;
  unit: "day" | "week";
  health: StreakHealth;
}

export function streakHealth(s: Streak): StreakHealth {
  if (s.current === 0) return s.best > 0 ? "broken" : "cold";
  return s.current < s.best ? "behind" : "best";
}

const HEALTH_ORDER: Record<StreakHealth, number> = { broken: 0, cold: 1, behind: 2, best: 3 };

/**
 * Streaks for everything in the checklist today, habits and the vices that
 * are turned on, with the ones that are slipping at the top.
 */
export function streakRows(input: ProgressInput): StreakRow[] {
  const { startDate, today, items, versions, logs } = input;
  const live = items.filter((i) => !i.archived && isActiveOn(i, versions, today));
  const streaks = allStreaks(live, versions, logs, today, startDate);
  const rows: StreakRow[] = live.map((item) => {
    const s = streaks[item.id];
    return { ...s, item, unit: item.cadence === "weekly" ? "week" : "day", health: streakHealth(s) };
  });
  return rows.sort((a, b) => {
    const h = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
    if (h !== 0) return h;
    if (a.health === "broken") return b.best - a.best || a.item.sort_order - b.item.sort_order;
    if (a.health === "behind") return b.best - b.current - (a.best - a.current) || a.item.sort_order - b.item.sort_order;
    if (a.health === "best") return a.current - b.current || a.item.sort_order - b.item.sort_order;
    return a.item.sort_order - b.item.sort_order;
  });
}

// ---------- everything at once ----------

export interface ProgressModel {
  grid: GridModel;
  headline: Headline;
  weeks: WeekRollup[];
  rates: ItemRate[];
  streaks: StreakRow[];
}

export function buildProgress(input: ProgressInput): ProgressModel {
  const grid = buildGrid(input);
  const weeks = weeklyRollups(grid, input);
  return {
    grid,
    headline: headline(grid, input.startDate, input.today),
    weeks,
    rates: itemRates(grid, weeks, input),
    streaks: streakRows(input),
  };
}

// ---------- share card ----------

export interface CardPhoto {
  date: DateStr;
  /** Storage reference, resolve it before drawing. */
  ref: string;
  /** "Day 1", or the short date when it was taken before the start. */
  label: string;
}

export interface CardStreak {
  name: string;
  current: number;
  unit: "day" | "week";
}

export interface CardData {
  day: number;
  length: number;
  started: boolean;
  percent: number;
  lockedIn: number;
  remaining: number;
  /** "Oct 5 to Nov 3". */
  range: string;
  /** One entry per challenge day, for the small grid. */
  cells: { kind: CellKind; isToday: boolean }[];
  lead: number;
  /** Longest live streaks first, at most `maxStreaks`. Zero streaks left out. */
  streaks: CardStreak[];
  before: CardPhoto | null;
  after: CardPhoto | null;
}

/**
 * The first photo in body_log and the latest one. With a single photo there
 * is a before and no after.
 */
export function pickPhotos(
  bodyLogs: readonly BodyLog[],
  startDate: DateStr,
  today: DateStr,
): { before: CardPhoto | null; after: CardPhoto | null } {
  const withPhoto = bodyLogs
    .filter((b) => !!b.photo_url && b.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (withPhoto.length === 0) return { before: null, after: null };
  const make = (b: BodyLog): CardPhoto => {
    const n = dayNumber(startDate, b.date);
    return { date: b.date, ref: b.photo_url as string, label: n >= 1 ? `Day ${n}` : formatDateShort(b.date) };
  };
  const first = withPhoto[0];
  const last = withPhoto[withPhoto.length - 1];
  return { before: make(first), after: last.date === first.date ? null : make(last) };
}

export function topStreaks(rows: readonly StreakRow[], max = 3): CardStreak[] {
  return rows
    .filter((r) => r.current > 0)
    .slice()
    .sort(
      (a, b) =>
        // Daily streaks before weekly ones, since a week count of 2 is not
        // comparable to a day count of 2.
        (a.unit === b.unit ? 0 : a.unit === "day" ? -1 : 1) ||
        b.current - a.current ||
        b.best - a.best ||
        a.item.sort_order - b.item.sort_order,
    )
    .slice(0, Math.max(0, max))
    .map((r) => ({ name: r.item.name, current: r.current, unit: r.unit }));
}

export function cardData(
  model: ProgressModel,
  startDate: DateStr,
  today: DateStr,
  bodyLogs: readonly BodyLog[] = [],
  maxStreaks = 3,
): CardData {
  const h = model.headline;
  const last = addDays(startDate, Math.max(0, h.length - 1));
  return {
    day: h.day,
    length: h.length,
    started: h.started,
    percent: h.percent,
    lockedIn: h.lockedIn,
    remaining: h.remaining,
    range: `${formatDateShort(startDate)} to ${formatDateShort(last)}`,
    cells: model.grid.cells.map((c) => ({ kind: c.kind, isToday: c.isToday })),
    lead: model.grid.lead,
    streaks: topStreaks(model.streaks, maxStreaks),
    ...pickPhotos(bodyLogs, startDate, today),
  };
}

/** "1 day", "4 days", "2 weeks". */
export function countLabel(n: number, unit: "day" | "week"): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}
