// Ongoing mode and challenges. Pure functions, no db, no React.
//
// The model
// - Ongoing is the default. Every log is keyed by its date and belongs to one
//   history that starts on app_settings.history_start and never resets.
// - A challenge is a layer on top: a start, a length, and rules (which items
//   count, and the target each is held to while it runs). Starting, ending,
//   finishing or restarting one only writes challenge rows. No log is ever
//   touched, so the history underneath stays as it was.
// - At most one challenge is active. The others are kept as a record.

import type { Challenge, ChallengeRule, ChallengeStatus, ChecklistItem, DateStr, NewRow, Target, TargetVersion } from "../types";
import { addDays, dayNumber, diffDays, isDateStr } from "./dates";
import { statusFromCounts, type DayStatus, type DaySummary } from "./day";
import { versionOn } from "./targets";

type Span = Pick<Challenge, "start_date" | "length_days">;
type Run = Pick<Challenge, "start_date" | "length_days" | "ended_on" | "status">;

export const MAX_CHALLENGE_DAYS = 365;
export const DEFAULT_CHALLENGE_NAME = "Lock in";

// ---------- dates ----------

/** The last day of the plan: start plus length. */
export function plannedEnd(c: Span): DateStr {
  return addDays(c.start_date, Math.max(1, Math.floor(c.length_days)) - 1);
}

/** The last day it ran, or will run. Before start_date when it never ran a day. */
export function lastDay(c: Run): DateStr {
  if (c.status === "active" || !c.ended_on) return plannedEnd(c);
  const end = plannedEnd(c);
  return c.ended_on > end ? end : c.ended_on;
}

/** Whether the challenge covered a date. */
export function ranOn(c: Run, date: DateStr): boolean {
  return date >= c.start_date && date <= lastDay(c);
}

/** Days it actually covered, up to `today`. */
export function daysRun(c: Run, today: DateStr): number {
  const last = lastDay(c);
  const to = last < today ? last : today;
  return to < c.start_date ? 0 : diffDays(c.start_date, to) + 1;
}

/**
 * upcoming: active, starts after today. running: active and today is one of
 * its days. finished: active, the last day has passed and it has not been
 * closed yet. closed: any other status.
 */
export type ChallengePhase = "upcoming" | "running" | "finished" | "closed";

export function challengePhase(c: Run, today: DateStr): ChallengePhase {
  if (c.status !== "active") return "closed";
  if (today < c.start_date) return "upcoming";
  return today > plannedEnd(c) ? "finished" : "running";
}

// ---------- which mode is the app in ----------

export function activeChallenge<C extends Pick<Challenge, "status">>(challenges: readonly C[]): C | null {
  return challenges.find((c) => c.status === "active") ?? null;
}

export interface ModeInfo<C extends Run = Challenge> {
  /** "challenge" only while one is running today. Everything else is ongoing. */
  mode: "challenge" | "ongoing";
  /** The challenge running today. Null in ongoing mode. */
  challenge: C | null;
  /** Its day number today, starting at 1. Null in ongoing mode. */
  day: number | null;
  length: number | null;
  /** Its last planned day. Null in ongoing mode. */
  lastDay: DateStr | null;
  /** The active challenge when its last day has passed and it still needs closing. */
  finished: C | null;
  /** The active challenge when it has not started yet. */
  upcoming: C | null;
  /** First date of the ongoing history. */
  historyStart: DateStr;
}

export function modeOn<C extends Run>(challenges: readonly C[], historyStart: DateStr, today: DateStr): ModeInfo<C> {
  const active = activeChallenge(challenges);
  const phase = active ? challengePhase(active, today) : "closed";
  const running = active && phase === "running" ? active : null;
  return {
    mode: running ? "challenge" : "ongoing",
    challenge: running,
    day: running ? dayNumber(running.start_date, today) : null,
    length: running ? running.length_days : null,
    lastDay: running ? plannedEnd(running) : null,
    finished: active && phase === "finished" ? active : null,
    upcoming: active && phase === "upcoming" ? active : null,
    historyStart: historyStart <= today ? historyStart : today,
  };
}

/** Closed challenges, newest first. */
export function pastChallenges<C extends Run>(challenges: readonly C[]): C[] {
  return challenges
    .filter((c) => c.status !== "active")
    .sort((a, b) => (a.start_date === b.start_date ? 0 : a.start_date < b.start_date ? 1 : -1));
}

export const STATUS_LABEL: Record<ChallengeStatus, string> = {
  active: "Active",
  succeeded: "Finished",
  ended: "Ended early",
  abandoned: "Restarted",
};

// ---------- rules ----------

/** The items a challenge counts. Null rules mean the whole checklist. */
export function challengeItems<I extends Pick<ChecklistItem, "id">>(c: Pick<Challenge, "rules">, items: readonly I[]): I[] {
  if (!c.rules) return items.slice();
  const ids = new Set(c.rules.map((r) => r.item_id));
  return items.filter((i) => ids.has(i.id));
}

/** The target a challenge sets for an item, or null when it leaves the item's own target alone. */
export function ruleTarget(c: Pick<Challenge, "rules">, itemId: string): Target | null {
  return c.rules?.find((r) => r.item_id === itemId)?.target ?? null;
}

/** A day scored for the challenge: the same day, counting only the challenge's items. */
export function challengeDay(c: Pick<Challenge, "rules">, summary: DaySummary): DaySummary {
  if (!c.rules) return summary;
  const ids = new Set(c.rules.map((r) => r.item_id));
  const items = summary.items.filter((r) => ids.has(r.item.id));
  const done = items.filter((r) => r.done).length;
  return { ...summary, items, done, total: items.length, status: statusFromCounts(done, items.length), percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100) };
}

/**
 * The target history to score with: the saved versions, with every challenge's
 * rule targets laid over the days that challenge ran. Outside those days, and
 * for items a challenge does not name, nothing changes, so the ongoing history
 * reads the same before, during and after a challenge.
 *
 * A challenge that ran from A to B and holds an item to target T gives:
 * the item's version in force on A, with T, dated A. T on every version that
 * starts inside A to B (an item switched off mid challenge stays off). And the
 * item's own target again from the day after B.
 */
export function scoringVersions(versions: readonly TargetVersion[], challenges: readonly Challenge[]): TargetVersion[] {
  let out = versions.slice();
  const ordered = challenges
    .filter((c) => c.rules && c.rules.some((r) => r.target))
    .sort((a, b) => (a.start_date === b.start_date ? (a.created_at < b.created_at ? -1 : 1) : a.start_date < b.start_date ? -1 : 1));
  for (const c of ordered) {
    const from = c.start_date;
    const to = lastDay(c);
    if (to < from) continue;
    const after = addDays(to, 1);
    for (const rule of c.rules as ChallengeRule[]) {
      if (!rule.target) continue;
      const target = rule.target;
      const atStart = versionOn(out, rule.item_id, from);
      const atAfter = versionOn(out, rule.item_id, after);
      const next: TargetVersion[] = [];
      let hasStart = false;
      let hasAfter = false;
      for (const v of out) {
        if (v.item_id !== rule.item_id || v.effective_from < from || v.effective_from > after) {
          next.push(v);
        } else if (v.effective_from === after) {
          hasAfter = true;
          next.push(v);
        } else {
          if (v.effective_from === from) hasStart = true;
          next.push({ ...v, target });
        }
      }
      if (!hasStart && atStart) {
        next.push({ ...atStart, id: `challenge:${c.id}:${rule.item_id}:start`, effective_from: from, target });
      }
      if (!hasAfter && atAfter) {
        next.push({ ...atAfter, id: `challenge:${c.id}:${rule.item_id}:after`, effective_from: after });
      }
      out = next;
    }
  }
  return out.sort((a, b) => (a.effective_from === b.effective_from ? 0 : a.effective_from < b.effective_from ? -1 : 1));
}

// ---------- consistency: the ongoing measure ----------

export interface Consistency {
  /** Full days in the window. */
  full: number;
  /** Days with some but not all items done. */
  partial: number;
  /** Days the window covers. Fewer than `window` early in the history. */
  days: number;
  /** The size asked for, 30 by default. */
  window: number;
  /** 0 to 100. */
  percent: number;
}

/**
 * How many of the last `window` days were full. One slip costs one day out of
 * the window, it does not put the count back to zero the way a streak does.
 * Today counts once it is full. Until then the window ends yesterday, so an
 * unfinished morning does not read as a miss.
 */
export function consistency(statusByDate: Readonly<Record<DateStr, DayStatus>>, today: DateStr, from: DateStr, window = 30): Consistency {
  const size = Math.max(1, Math.floor(window));
  const end = statusByDate[today] === "full" ? today : addDays(today, -1);
  const first = addDays(end, -(size - 1));
  const start = first < from ? from : first;
  let full = 0;
  let partial = 0;
  let days = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days++;
    if (statusByDate[d] === "full") full++;
    else if (statusByDate[d] === "partial") partial++;
  }
  return { full, partial, days, window: size, percent: days === 0 ? 0 : Math.round((full / days) * 100) };
}

/** "26 of the last 30 days", "3 of 4 days" early on, "First day" before anything is behind you. */
export function consistencyLabel(c: Consistency): string {
  if (c.days === 0) return "First day";
  if (c.days < c.window) return `${c.full} of ${c.days} ${c.days === 1 ? "day" : "days"}`;
  return `${c.full} of the last ${c.window} days`;
}

// ---------- starting, ending, finishing, restarting ----------

export interface ChallengeInput {
  name: string;
  start_date: DateStr;
  length_days: number;
  /** Null: the whole checklist. */
  rules: ChallengeRule[] | null;
  money_target?: number | null;
  money_deadline?: DateStr | null;
  daily_floor: number;
}

/** Why an input cannot be saved, or null when it can. */
export function challengeProblem(input: ChallengeInput, today: DateStr): string | null {
  if (!input.name.trim()) return "Give it a name.";
  if (!isDateStr(input.start_date)) return "Pick a start date.";
  if (input.start_date < today) return "It starts today or later.";
  if (!Number.isInteger(input.length_days) || input.length_days < 1) return "Length is at least 1 day.";
  if (input.length_days > MAX_CHALLENGE_DAYS) return `Length is ${MAX_CHALLENGE_DAYS} days at most.`;
  if (input.rules && input.rules.length === 0) return "Pick at least one item.";
  const hasTarget = input.money_target !== null && input.money_target !== undefined;
  if (hasTarget) {
    if (!(Number(input.money_target) > 0)) return "The money target is above zero.";
    if (!input.money_deadline || !isDateStr(input.money_deadline)) return "Pick a deadline for the money target.";
    if (input.money_deadline < input.start_date) return "The money deadline is on or after the start.";
  }
  return null;
}

/** The row for a new, active challenge. */
export function newChallengeRow(input: ChallengeInput, restartOf: string | null = null): NewRow<"challenge"> {
  const hasTarget = input.money_target !== null && input.money_target !== undefined && input.money_target > 0;
  return {
    name: input.name.trim() || DEFAULT_CHALLENGE_NAME,
    status: "active",
    start_date: input.start_date,
    length_days: Math.floor(input.length_days),
    ended_on: null,
    rules: input.rules ? input.rules.map((r) => ({ item_id: r.item_id, target: r.target ?? null })) : null,
    restart_of: restartOf,
    money_target: hasTarget ? (input.money_target as number) : null,
    money_deadline: hasTarget ? (input.money_deadline ?? null) : null,
    daily_floor: input.daily_floor,
    money_target_start: null,
  };
}

type Closing = Pick<Challenge, "status" | "ended_on">;

/**
 * Stop it early. It keeps the days it ran, today included. One that has not
 * started yet never ran a day.
 */
export function endPatch(c: Run, today: DateStr): Closing {
  const end = plannedEnd(c);
  const last = today < c.start_date ? addDays(c.start_date, -1) : today > end ? end : today;
  return { status: "ended", ended_on: last };
}

/** Close one that ran its full length. */
export function finishPatch(c: Span): Closing {
  return { status: "succeeded", ended_on: plannedEnd(c) };
}

/** Whether a challenge can be marked finished: active and its last day is today or behind. */
export function canFinish(c: Run, today: DateStr): boolean {
  return c.status === "active" && today >= plannedEnd(c);
}

/**
 * Restart: the old run is closed the day before the new one starts and the
 * same name, length and rules begin again on `today`. A money target moves
 * forward by the same number of days.
 */
export function restartRows(c: Challenge, today: DateStr): { close: Closing | null; next: NewRow<"challenge"> } {
  const shift = diffDays(c.start_date, today);
  const next = newChallengeRow(
    {
      name: c.name,
      start_date: today,
      length_days: c.length_days,
      rules: c.rules,
      money_target: c.money_target,
      money_deadline: c.money_target !== null && c.money_deadline ? addDays(c.money_deadline, shift) : null,
      daily_floor: c.daily_floor,
    },
    c.id,
  );
  if (c.status !== "active") return { close: null, next };
  const before = addDays(today, -1);
  const end = plannedEnd(c);
  return { close: { status: "abandoned", ended_on: before > end ? end : before }, next };
}

// ---------- the record of one challenge ----------

export interface ChallengeRecord {
  /** Days it covered so far. */
  days: number;
  length: number;
  full: number;
  partial: number;
  missed: number;
}

/** Day counts for a challenge from the status of each of its days. Today only counts once it is full. */
export function challengeRecord(c: Run, statusByDate: Readonly<Record<DateStr, DayStatus>>, today: DateStr): ChallengeRecord {
  const last = lastDay(c);
  const to = last < today ? last : today;
  let full = 0;
  let partial = 0;
  let missed = 0;
  for (let d = c.start_date; d <= to; d = addDays(d, 1)) {
    const s = statusByDate[d] ?? "missed";
    if (s === "full") full++;
    else if (d === today) continue;
    else if (s === "partial") partial++;
    else missed++;
  }
  return { days: daysRun(c, today), length: c.length_days, full, partial, missed };
}
