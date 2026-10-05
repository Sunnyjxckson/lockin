// Streaks are per item and computed from day_log every time. Nothing stored.

import type { ChecklistItem, DateStr, DayLog, TargetVersion } from "../types";
import { addDays, weekStart } from "./dates";
import { hasSlip, itemState, summarizeWeek } from "./day";
import { isActiveOn, targetOn } from "./targets";

export interface Streak {
  /** Days in a row (weeks in a row for weekly items) ending now. */
  current: number;
  /** Longest run inside the window. */
  best: number;
  /** Whether the current period (today, or this week) is already done. */
  doneNow: boolean;
}

function logIndex(logs: readonly DayLog[], itemId: string): Map<DateStr, DayLog> {
  const map = new Map<DateStr, DayLog>();
  for (const l of logs) if (l.item_id === itemId) map.set(l.date, l);
  return map;
}

/**
 * Streak for one item.
 *
 * Daily items: counts back from `today`. A day that is not done yet today does
 * not break the streak, it just is not counted. The first earlier day that is
 * not done ends it. Days before `from` (the challenge start) and days before
 * the item existed are never counted.
 *
 * Weekly items: same idea in Monday to Sunday weeks.
 */
export function itemStreak(
  item: ChecklistItem,
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
  today: DateStr,
  from: DateStr,
): Streak {
  return item.cadence === "weekly"
    ? weeklyStreak(item, versions, logs, today, from)
    : dailyStreak(item, versions, logs, today, from);
}

function dailyStreak(
  item: ChecklistItem,
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
  today: DateStr,
  from: DateStr,
): Streak {
  const byDate = logIndex(logs, item.id);
  const doneOn = (d: DateStr) => itemState(item, targetOn(item, versions, d), byDate.get(d)) === "done";

  const doneNow = today >= from && isActiveOn(item, versions, today) && doneOn(today);
  let current = 0;
  let d = doneNow ? today : addDays(today, -1);
  // Today not being done yet does not break a run. A slip today does: it is
  // not unfinished, it is over.
  const slippedToday = hasSlip(byDate.get(today));
  while (!slippedToday && d >= from && isActiveOn(item, versions, d) && doneOn(d)) {
    current++;
    d = addDays(d, -1);
  }

  let best = 0;
  let run = 0;
  for (let x = from; x <= today; x = addDays(x, 1)) {
    if (isActiveOn(item, versions, x) && doneOn(x)) {
      run++;
      if (run > best) best = run;
    } else if (x !== today || slippedToday) {
      run = 0;
    }
  }
  return { current, best: Math.max(best, current), doneNow };
}

function weeklyStreak(
  item: ChecklistItem,
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
  today: DateStr,
  from: DateStr,
): Streak {
  const own = logs.filter((l) => l.item_id === item.id);
  const weekDone = (anyDay: DateStr) =>
    summarizeWeek(anyDay, [item], versions, own, today).items.some((r) => r.done);

  const firstWeek = weekStart(from);
  const thisWeek = weekStart(today);
  const doneNow = today >= from && weekDone(today);

  let current = 0;
  let w = doneNow ? thisWeek : addDays(thisWeek, -7);
  while (w >= firstWeek && weekDone(w)) {
    current++;
    w = addDays(w, -7);
  }

  let best = 0;
  let run = 0;
  for (let x = firstWeek; x <= thisWeek; x = addDays(x, 7)) {
    if (weekDone(x)) {
      run++;
      if (run > best) best = run;
    } else if (x !== thisWeek) {
      run = 0;
    }
  }
  return { current, best: Math.max(best, current), doneNow };
}

/** Streaks for many items at once, keyed by item id. */
export function allStreaks(
  items: readonly ChecklistItem[],
  versions: readonly TargetVersion[],
  logs: readonly DayLog[],
  today: DateStr,
  from: DateStr,
): Record<string, Streak> {
  const out: Record<string, Streak> = {};
  for (const item of items) out[item.id] = itemStreak(item, versions, logs, today, from);
  return out;
}

/** Days in a row, ending today or yesterday, where the whole day was full. */
export function fullDayStreak(statusByDate: Record<DateStr, "full" | "partial" | "missed">, today: DateStr, from: DateStr): number {
  let n = 0;
  let d = statusByDate[today] === "full" ? today : addDays(today, -1);
  while (d >= from && statusByDate[d] === "full") {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
