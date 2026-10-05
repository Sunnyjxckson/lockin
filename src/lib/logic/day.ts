// Day scoring. Pure functions: pass in items, versions and logs.
//
// A day is full when every daily item is done, partial when some are, missed
// when none are. Weekly items never count toward a day. They roll up for the
// Monday to Sunday week and are judged on Sunday.

import type { ChecklistItem, DateStr, DayLog, Target, TargetVersion } from "../types";
import { minutesOf, nyParts, weekDates, weekEnd, weekStart } from "./dates";
import { scoredItems, type ScoredItem } from "./targets";

export type DayStatus = "full" | "partial" | "missed";

export type ItemState =
  /** Meets its target. */
  | "done"
  /** Nothing logged. */
  | "open"
  /** Something is logged but it does not meet the target (a number outside
   * the range, a wake check after the cutoff, a tick with no text). */
  | "off";

/** Whether a number meets a numeric target. Non numeric targets return false. */
export function meetsNumber(target: Target, value: number | null | undefined): boolean {
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  switch (target.kind) {
    case "min":
      return value >= target.min;
    case "max":
      return value <= target.max;
    case "range":
      return value >= target.min && value <= target.max;
    default:
      return false;
  }
}

/**
 * A time-gated check counts when it was ticked at or before the cutoff on the
 * day itself. Ticked on a later calendar date it is a backfill and counts on
 * trust. A tick with no timestamp also counts.
 */
export function checkedInTime(log: Pick<DayLog, "date" | "checked" | "completed_at">, by: string): boolean {
  if (!log.checked) return false;
  if (!log.completed_at) return true;
  const at = nyParts(log.completed_at);
  if (at.date > log.date) return true;
  if (at.date < log.date) return true;
  return at.minutes <= minutesOf(by);
}

/** True when a slip was logged for this item on this day. */
export function hasSlip(log: Pick<DayLog, "slips"> | null | undefined): boolean {
  return !!log && (log.slips ?? 0) > 0;
}

/** The state of one item on one day given its target and its log row. */
export function itemState(item: Pick<ChecklistItem, "type">, target: Target, log: DayLog | null | undefined): ItemState {
  if (!log) return "open";
  // A logged slip settles the day for that item until the slip is removed.
  if (hasSlip(log)) return "off";
  switch (target.kind) {
    case "check":
      return log.checked ? "done" : "open";
    case "check_by":
      if (!log.checked) return "open";
      return checkedInTime(log, target.by) ? "done" : "off";
    case "text": {
      const hasText = !!log.text && log.text.trim().length > 0;
      if (log.checked && hasText) return "done";
      return log.checked || hasText ? "off" : "open";
    }
    case "min":
    case "max":
    case "range":
      if (log.value === null || log.value === undefined) return "open";
      return meetsNumber(target, log.value) ? "done" : "off";
  }
  // Unknown target kinds fall back to the tick.
  return item.type === "yesno" && log.checked ? "done" : "open";
}

export function isItemDone(item: Pick<ChecklistItem, "type">, target: Target, log: DayLog | null | undefined): boolean {
  return itemState(item, target, log) === "done";
}

/** Index one day's logs by item id. */
export function logsByItem(logs: readonly DayLog[], date: DateStr): Map<string, DayLog> {
  const map = new Map<string, DayLog>();
  for (const l of logs) if (l.date === date) map.set(l.item_id, l);
  return map;
}

export interface ItemResult extends ScoredItem {
  log: DayLog | null;
  state: ItemState;
  done: boolean;
}

export interface DaySummary {
  date: DateStr;
  status: DayStatus;
  /** Daily items done. */
  done: number;
  /** Daily items that count on this date. */
  total: number;
  /** 0 to 100, whole number. */
  percent: number;
  /** Daily items only, in display order. */
  items: ItemResult[];
}

export function statusFromCounts(done: number, total: number): DayStatus {
  if (total > 0 && done >= total) return "full";
  return done > 0 ? "partial" : "missed";
}

/**
 * Score one day. `logs` may hold many days, only rows for `date` are read.
 * Uses the targets that were in force on `date`.
 */
export function summarizeDay(
  date: DateStr,
  items: readonly ChecklistItem[],
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
): DaySummary {
  const byItem = logsByItem(logs, date);
  const results: ItemResult[] = scoredItems(items, versions, date)
    .filter((s) => s.item.cadence === "daily")
    .map((s) => {
      const log = byItem.get(s.item.id) ?? null;
      const state = itemState(s.item, s.target, log);
      return { ...s, log, state, done: state === "done" };
    });
  const done = results.filter((r) => r.done).length;
  const total = results.length;
  return {
    date,
    status: statusFromCounts(done, total),
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    items: results,
  };
}

export function dayStatus(
  date: DateStr,
  items: readonly ChecklistItem[],
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
): DayStatus {
  return summarizeDay(date, items, versions, logs).status;
}

// ---------- weekly items ----------

export interface WeeklyResult extends ScoredItem {
  /** The log that made it done, or the latest log in the week. */
  log: DayLog | null;
  done: boolean;
  /** The date it was done on. */
  doneOn: DateStr | null;
}

export interface WeekSummary {
  weekStart: DateStr;
  weekEnd: DateStr;
  items: WeeklyResult[];
  done: number;
  total: number;
  /** True once every weekly item is done for the week. */
  complete: boolean;
}

/**
 * Roll up weekly items for the Monday to Sunday week holding `date`. A weekly
 * item is done for the week when it is done on any day in it. Targets are the
 * ones in force on the day of each log, and membership is judged on the
 * week's Sunday (or `asOf` when the week is still running).
 */
export function summarizeWeek(
  date: DateStr,
  items: readonly ChecklistItem[],
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
  asOf?: DateStr,
): WeekSummary {
  const start = weekStart(date);
  const end = weekEnd(date);
  const judgeOn = asOf && asOf < end ? (asOf < start ? start : asOf) : end;
  const days = weekDates(date);
  const weekly = scoredItems(items, versions, judgeOn).filter((s) => s.item.cadence === "weekly");
  const results: WeeklyResult[] = weekly.map((s) => {
    let latest: DayLog | null = null;
    for (const d of days) {
      const log = logs.find((l) => l.date === d && l.item_id === s.item.id) ?? null;
      if (!log) continue;
      const dayTarget = scoredItems([s.item], versions, d)[0]?.target ?? s.target;
      if (itemState(s.item, dayTarget, log) === "done") {
        return { ...s, log, done: true, doneOn: d };
      }
      latest = log;
    }
    return { ...s, log: latest, done: false, doneOn: null };
  });
  const done = results.filter((r) => r.done).length;
  return {
    weekStart: start,
    weekEnd: end,
    items: results,
    done,
    total: results.length,
    complete: results.length > 0 && done === results.length,
  };
}
