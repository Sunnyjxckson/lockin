// Body rules: macro totals, what is left to eat, ring fill, weight trend,
// chart geometry, and which progress photos to compare. Pure, no db.

import type { BodyLog, DateStr, Meal, Target } from "../types";
import { addDays, diffDays } from "./dates";

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const MACRO_KEYS = ["calories", "protein", "carbs", "fat"] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

function num(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Sum of the meals, optionally only those on `date`. */
export function mealTotals(meals: readonly Pick<Meal, "date" | MacroKey>[], date?: DateStr): Macros {
  const out = { ...ZERO_MACROS };
  for (const m of meals) {
    if (date !== undefined && m.date !== date) continue;
    for (const k of MACRO_KEYS) out[k] += num(m[k]);
  }
  for (const k of MACRO_KEYS) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

/** A goal for one macro. min is a number to reach, max a number to stay under. */
export interface Goal {
  min: number | null;
  max: number | null;
}

export const NO_GOAL: Goal = { min: null, max: null };

/** Turn a checklist target into a goal. Calories is a range, protein a minimum. */
export function goalFromTarget(target: Target | null | undefined): Goal {
  if (!target) return NO_GOAL;
  if (target.kind === "min") return { min: target.min, max: null };
  if (target.kind === "max") return { min: null, max: target.max };
  if (target.kind === "range") return { min: target.min, max: target.max };
  return NO_GOAL;
}

/** Carbs and fat are budgets: a number to land at or under. */
export function budgetGoal(amount: number | null | undefined): Goal {
  return amount && amount > 0 ? { min: null, max: amount } : NO_GOAL;
}

/** The number the ring fills toward: the minimum when there is one, else the cap. */
export function goalReference(goal: Goal): number | null {
  const ref = goal.min ?? goal.max;
  return ref !== null && ref > 0 ? ref : null;
}

export type RingState = "none" | "empty" | "under" | "met" | "over";

export interface Ring {
  /** total / reference, not capped. 1.2 means 20 percent over. 0 with no goal. */
  percent: number;
  /** percent clamped to 0..1, for drawing. */
  fill: number;
  /**
   * none: no goal set. empty: nothing eaten. under: on the way.
   * met: at or past a minimum and not past a cap. over: past the cap.
   */
  state: RingState;
}

export function ringFor(total: number, goal: Goal): Ring {
  const ref = goalReference(goal);
  const t = Math.max(0, num(total));
  if (ref === null) return { percent: 0, fill: 0, state: "none" };
  const percent = t / ref;
  const fill = Math.min(1, percent);
  let state: RingState;
  if (goal.max !== null && t > goal.max) state = "over";
  else if (t === 0) state = "empty";
  else if (goal.min !== null && t >= goal.min) state = "met";
  else state = "under";
  return { percent, fill, state };
}

export interface Remaining {
  /** Still to eat to reach the reference. Never negative. */
  left: number;
  /** Amount past the cap. 0 when there is no cap or it is not passed. */
  over: number;
  /** Space before the cap. Null with no cap, 0 when at or past it. */
  room: number | null;
}

export function remainingFor(total: number, goal: Goal): Remaining {
  const t = Math.max(0, num(total));
  const ref = goalReference(goal);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    left: ref === null ? 0 : r1(Math.max(0, ref - t)),
    over: goal.max === null ? 0 : r1(Math.max(0, t - goal.max)),
    room: goal.max === null ? null : r1(Math.max(0, goal.max - t)),
  };
}

export type Goals = Record<MacroKey, Goal>;

export function remainingAll(totals: Macros, goals: Goals): Record<MacroKey, Remaining> {
  return {
    calories: remainingFor(totals.calories, goals.calories),
    protein: remainingFor(totals.protein, goals.protein),
    carbs: remainingFor(totals.carbs, goals.carbs),
    fat: remainingFor(totals.fat, goals.fat),
  };
}

/** Short line under a ring: "320 left", "In range", "40 over", "Done". */
export function remainingLabel(total: number, goal: Goal, unit = ""): string {
  const ring = ringFor(total, goal);
  const rem = remainingFor(total, goal);
  const n = (v: number) => `${Math.round(v).toLocaleString("en-US")}${unit}`;
  if (ring.state === "none") return "No target";
  if (ring.state === "over") return `${n(rem.over)} over`;
  if (ring.state === "met") return goal.max !== null ? "In range" : "Done";
  return `${n(rem.left)} left`;
}

// ---------- weight ----------

export interface WeightPoint {
  date: DateStr;
  /** Day number from the start of the window (a challenge, or a run of plain days), 1 based. Can be below 1 or past the end. */
  day: number;
  weight: number;
}

/** Weigh-ins with a number, oldest first. With a start date, only from then on. */
export function weightSeries(logs: readonly BodyLog[], startDate?: DateStr, lengthDays?: number): WeightPoint[] {
  const end = startDate !== undefined && lengthDays !== undefined ? addDays(startDate, lengthDays - 1) : undefined;
  return logs
    .filter((l) => typeof l.weight === "number" && Number.isFinite(l.weight) && l.weight > 0)
    .filter((l) => (startDate === undefined || l.date >= startDate) && (end === undefined || l.date <= end))
    .map((l) => ({ date: l.date, day: startDate === undefined ? 1 : diffDays(startDate, l.date) + 1, weight: l.weight as number }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface WeightTrend {
  first: WeightPoint;
  latest: WeightPoint;
  /** latest minus first. Negative is weight lost. */
  change: number;
  /** Change per 7 days. Null with one weigh-in. */
  perWeek: number | null;
  /** latest minus the weigh-in before it. Null with one weigh-in. */
  sinceLast: number | null;
  direction: "down" | "up" | "flat";
}

export function weightTrend(series: readonly WeightPoint[]): WeightTrend | null {
  if (series.length === 0) return null;
  const first = series[0];
  const latest = series[series.length - 1];
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const change = r1(latest.weight - first.weight);
  const days = diffDays(first.date, latest.date);
  const prev = series.length > 1 ? series[series.length - 2] : null;
  return {
    first,
    latest,
    change,
    perWeek: days > 0 ? r1((change / days) * 7) : null,
    sinceLast: prev ? r1(latest.weight - prev.weight) : null,
    direction: Math.abs(change) < 0.05 ? "flat" : change < 0 ? "down" : "up",
  };
}

export interface ChartBox {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

export interface WeightChart {
  points: (WeightPoint & { x: number; y: number })[];
  /** SVG path through the points. Empty with fewer than two. */
  path: string;
  /** Horizontal guide lines, top to bottom. */
  ticks: { value: number; y: number }[];
  yMin: number;
  yMax: number;
}

/** Lay the weigh-ins out on a chart whose x axis is day 1 to lengthDays. */
export function weightChart(series: readonly WeightPoint[], lengthDays: number, box: ChartBox): WeightChart {
  const innerW = Math.max(1, box.width - box.padLeft - box.padRight);
  const innerH = Math.max(1, box.height - box.padTop - box.padBottom);
  if (series.length === 0) return { points: [], path: "", ticks: [], yMin: 0, yMax: 0 };
  const weights = series.map((p) => p.weight);
  let lo = Math.min(...weights);
  let hi = Math.max(...weights);
  // Keep at least a 4 unit window so one weigh-in, or a flat week, sits mid chart.
  const span = Math.max(4, hi - lo);
  const mid = (hi + lo) / 2;
  lo = Math.floor(mid - span / 2 - span * 0.15);
  hi = Math.ceil(mid + span / 2 + span * 0.15);
  const lastDay = Math.max(2, lengthDays);
  const xOf = (day: number) => box.padLeft + (Math.min(lastDay, Math.max(1, day)) - 1) / (lastDay - 1) * innerW;
  const yOf = (w: number) => box.padTop + (1 - (w - lo) / (hi - lo)) * innerH;
  const r = (n: number) => Math.round(n * 100) / 100;
  const points = series.map((p) => ({ ...p, x: r(xOf(p.day)), y: r(yOf(p.weight)) }));
  const path = points.length > 1 ? points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ") : "";
  const ticks = [hi, (hi + lo) / 2, lo].map((value) => ({ value: Math.round(value * 10) / 10, y: r(yOf(value)) }));
  return { points, path, ticks, yMin: lo, yMax: hi };
}

/** The weekly weigh-in date for the week holding `date` (weeks run Monday to Sunday). */
export function weighInDateFor(weekMonday: DateStr, weeklyDay: number | null | undefined): DateStr {
  const wd = weeklyDay ?? 5;
  return addDays(weekMonday, (wd + 6) % 7);
}

// ---------- progress photos ----------

export interface PhotoEntry {
  date: DateStr;
  photo_url: string;
  weight: number | null;
}

/** Body logs that carry a photo, oldest first. */
export function photoEntries(logs: readonly BodyLog[]): PhotoEntry[] {
  return logs
    .filter((l) => !!l.photo_url)
    .map((l) => ({ date: l.date, photo_url: l.photo_url as string, weight: l.weight ?? null }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface PhotoPair {
  /** The day 1 photo: the first one taken on or after the start date, else the oldest. */
  before: PhotoEntry | null;
  /** The newest photo that is not the before photo. */
  after: PhotoEntry | null;
}

export function pickComparePhotos(logs: readonly BodyLog[], startDate?: DateStr): PhotoPair {
  const all = photoEntries(logs);
  if (all.length === 0) return { before: null, after: null };
  const before = (startDate !== undefined ? all.find((p) => p.date >= startDate) : undefined) ?? all[0];
  const latest = all[all.length - 1];
  return { before, after: latest.date === before.date ? null : latest };
}
