// Money rules. Pure: no React, no db.
//
// The running total counts every earning from the challenge start date on.
// The daily floor is a fixed number: being ahead never lowers it.

import type { DateStr } from "../types";
import { diffDays } from "./dates";

/** The part of an earning the rules need. */
export interface EarningLike {
  date: DateStr;
  amount: number;
  hours: number | null;
}

export const APPS = ["DoorDash", "Uber Eats", "Instacart"] as const;
export type DeliveryApp = (typeof APPS)[number];

/** Round to cents, so sums of decimals do not drift. */
export function cents(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function sumAmounts(earnings: readonly EarningLike[]): number {
  return cents(earnings.reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0));
}

/** Total earned on one date. */
export function totalForDate(earnings: readonly EarningLike[], date: DateStr): number {
  return sumAmounts(earnings.filter((e) => e.date === date));
}

/** Total per date, for every date that has at least one entry. */
export function totalsByDate(earnings: readonly EarningLike[]): Map<DateStr, number> {
  const out = new Map<DateStr, number>();
  for (const e of earnings) out.set(e.date, cents((out.get(e.date) ?? 0) + e.amount));
  return out;
}

/** Everything earned toward the target: entries dated on or after `from`, up to `to` when given. */
export function runningTotal(earnings: readonly EarningLike[], from?: DateStr | null, to?: DateStr | null): number {
  return sumAmounts(earnings.filter((e) => (!from || e.date >= from) && (!to || e.date <= to)));
}

/** Whole days from today until the deadline. 0 on the deadline day and after it. */
export function daysLeft(today: DateStr, deadline: DateStr): number {
  return Math.max(0, diffDays(today, deadline));
}

/** Days that can still be worked: today through the deadline, inclusive. 0 once the deadline has passed. */
export function workDaysLeft(today: DateStr, deadline: DateStr): number {
  return today > deadline ? 0 : diffDays(today, deadline) + 1;
}

export interface FloorStatus {
  /** The floor that applies. Always the configured floor. */
  floor: number;
  earned: number;
  met: boolean;
  /** How far under the floor, 0 when met. */
  short: number;
  /** How far over the floor, 0 when under. */
  over: number;
  /** 0 to 1 for a progress bar. */
  progress: number;
}

/**
 * Where one day stands against the floor. `banked` (surplus from other days)
 * is accepted only to make the rule explicit: it never lowers the floor.
 */
export function floorStatus(earned: number, floor: number, banked = 0): FloorStatus {
  void banked;
  const f = Math.max(0, floor);
  const e = cents(Math.max(0, earned));
  return {
    floor: f,
    earned: e,
    met: f > 0 ? e >= f : true,
    short: cents(Math.max(0, f - e)),
    over: cents(Math.max(0, e - f)),
    progress: f > 0 ? Math.min(1, e / f) : 1,
  };
}

/**
 * Surplus banked: the sum of everything earned above the floor, day by day.
 * A short day adds nothing and takes nothing away.
 */
export function surplusBanked(earnings: readonly EarningLike[], floor: number, from?: DateStr | null, to?: DateStr | null): number {
  let sum = 0;
  for (const [date, total] of totalsByDate(earnings)) {
    if (from && date < from) continue;
    if (to && date > to) continue;
    sum += Math.max(0, total - Math.max(0, floor));
  }
  return cents(sum);
}

/**
 * Dollars per hour. Only entries with hours count, on both sides, so an entry
 * logged without hours cannot inflate the rate. Null when no hours are logged.
 */
export function hourlyRate(earnings: readonly EarningLike[]): number | null {
  let amount = 0;
  let hours = 0;
  for (const e of earnings) {
    if (e.hours && e.hours > 0) {
      amount += e.amount;
      hours += e.hours;
    }
  }
  return hours > 0 ? cents(amount / hours) : null;
}

export function totalHours(earnings: readonly EarningLike[]): number {
  return cents(earnings.reduce((s, e) => s + (e.hours && e.hours > 0 ? e.hours : 0), 0));
}

export interface Needed {
  /** Still to earn. 0 when the target is hit. */
  remaining: number;
  /** Days that can still be worked, today included. */
  days: number;
  /** Remaining spread evenly over those days. Null when no days are left. */
  perDay: number | null;
  /** What to aim for each day: perDay, but never under the floor. Null when no days are left. */
  aim: number | null;
}

/** What is needed per remaining day to hit the target by the deadline. */
export function neededPerDay(target: number, total: number, today: DateStr, deadline: DateStr, floor = 0): Needed {
  const remaining = cents(Math.max(0, target - total));
  const days = workDaysLeft(today, deadline);
  if (days === 0) return { remaining, days, perDay: null, aim: null };
  const perDay = cents(remaining / days);
  return { remaining, days, perDay, aim: Math.max(perDay, Math.max(0, floor)) };
}

export type TargetState = "active" | "hit" | "past";

/** hit wins over past. The target can be reset in either. */
export function targetState(target: number, total: number, today: DateStr, deadline: DateStr): TargetState {
  if (target > 0 && total >= target) return "hit";
  if (today > deadline) return "past";
  return "active";
}

export function canResetTarget(state: TargetState): boolean {
  return state !== "active";
}

/** A new target is valid when it is above what is already earned and due today or later. */
export function validNewTarget(target: number | null, deadline: string, total: number, today: DateStr): boolean {
  return target !== null && Number.isFinite(target) && target > total && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline >= today;
}

export interface DayGroup<E extends EarningLike> {
  date: DateStr;
  total: number;
  hours: number;
  rate: number | null;
  entries: E[];
}

/** Entries grouped by day, newest day first. Entry order inside a day is kept. */
export function groupByDay<E extends EarningLike>(earnings: readonly E[]): DayGroup<E>[] {
  const map = new Map<DateStr, E[]>();
  for (const e of earnings) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, entries]) => ({ date, total: sumAmounts(entries), hours: totalHours(entries), rate: hourlyRate(entries), entries }));
}

// ---------- display ----------

/** "$1,000", "$42.50". Cents only when there are any. */
export function formatMoney(n: number): string {
  const v = cents(n);
  const whole = Number.isInteger(v);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "1.5h", "2h". */
export function formatHours(h: number): string {
  return `${Math.round(h * 100) / 100}h`;
}

// ---------- reading a screenshot ----------

/** Replace em and en dashes (and their relatives) with a plain hyphen. */
export function stripDashes(text: string): string {
  return text.replace(/[\u2012\u2013\u2014\u2015\u2212]/g, "-");
}

/** Map whatever the model or the user wrote to one of the three apps. Null when it is none of them. */
export function normalizeApp(raw: unknown): DeliveryApp | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (s.includes("doordash") || s === "dasher" || s === "dd") return "DoorDash";
  if (s.includes("uber")) return "Uber Eats";
  if (s.includes("instacart") || s === "shopper") return "Instacart";
  return null;
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

export interface EarningRead {
  amount: number | null;
  app: DeliveryApp | null;
  hours: number | null;
}

/**
 * Clean up what the model returned. Anything missing or implausible becomes
 * null so the form shows it empty. `minutes` is used when `hours` is absent.
 */
export function parseEarningRead(raw: unknown): EarningRead {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const amount = toNumber(o.amount);
  let hours = toNumber(o.hours);
  const minutes = toNumber(o.minutes);
  if ((hours === null || hours <= 0) && minutes !== null && minutes > 0) hours = minutes / 60;
  return {
    amount: amount !== null && amount > 0 && amount < 100000 ? cents(amount) : null,
    app: normalizeApp(o.app),
    hours: hours !== null && hours > 0 && hours <= 24 ? cents(hours) : null,
  };
}
