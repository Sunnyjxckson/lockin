// Coach, step 1: the deterministic part. Pure functions that turn raw rows
// into a compact snapshot the coach writes from. No React, no db, no model.
//
// Everything the coach says has to trace back to a number in here. Pattern
// flags are detected by explicit rules in coachFlags.ts and passed in, so the
// model never gets to invent one.

import type {
  AppSettings,
  BodyLog,
  Challenge,
  ChecklistItem,
  CoachNote,
  DateStr,
  DayLog,
  Earning,
  Meal,
  NewRow,
  SetLog,
  Target,
  TargetVersion,
  TimeStr,
  ViceSlip,
  Workout,
} from "../types";
import { WEEKDAY_NAMES } from "../types";
import {
  addDays,
  challengeEndDate,
  dateRange,
  dayNumber,
  diffDays,
  formatDateLong,
  formatDateShort,
  formatTime,
  weekEnd,
  weekStart,
  weekdayOf,
} from "./dates";
import { summarizeDay, summarizeWeek, type DayStatus, type ItemResult } from "./day";
import { itemStreak } from "./streaks";
import { describeTarget, isActiveOn } from "./targets";

// ---------- input ----------

export interface CoachBlock {
  block_name: string;
  start: TimeStr;
  end: TimeStr;
  kind: string;
}

/** Every row the coach reads. The client loads these and hands them over. */
export interface CoachData {
  today: DateStr;
  challenge: Challenge;
  settings: Pick<AppSettings, "carbs_target" | "fat_target" | "weight_unit"> | null;
  items: ChecklistItem[];
  versions: TargetVersion[];
  logs: DayLog[];
  earnings: Earning[];
  meals: Meal[];
  bodyLogs: BodyLog[];
  setLogs: SetLog[];
  slips: ViceSlip[];
  workouts: Workout[];
  /** Today's schedule blocks. */
  blocks: CoachBlock[];
}

// ---------- flags ----------

export type FlagKind =
  | "earned_under"
  | "protein_under"
  | "lift_drop"
  | "wake_after_late"
  | "bed_missed"
  | "vice_pattern"
  | "rate_drop";

export interface FlagEvidence {
  label: string;
  value: string;
}

export interface Flag {
  /** Stable identity, for example "lift_drop:bench press" or "protein_under". */
  key: string;
  kind: FlagKind;
  title: string;
  /** One sentence with the numbers. */
  detail: string;
  /** One concrete thing to do about it. */
  change: string;
  /** The rows behind it: dates and numbers. */
  evidence: FlagEvidence[];
  /** First date in the evidence. */
  since: DateStr;
}

// ---------- small formatters ----------

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "$1,000", "$42.50". */
export function money(n: number): string {
  const v = Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
  const whole = Number.isInteger(v);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "180g", "$100", "2,050 kcal", "30 min". */
export function withUnit(n: number, unit: string | null): string {
  const v = round1(n).toLocaleString("en-US");
  if (!unit) return v;
  if (unit === "$") return money(n);
  return unit.length <= 2 ? `${v}${unit}` : `${v} ${unit}`;
}

/** "No smoking" to "smoking". Other names come back lower case. */
export function viceName(name: string): string {
  return name.replace(/^no\s+/i, "").trim().toLowerCase();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Whether anything at all was logged on a date. An untouched day proves nothing. */
export function touchedDates(logs: readonly DayLog[]): Set<DateStr> {
  const out = new Set<DateStr>();
  for (const l of logs) {
    if (l.checked || l.value !== null || (l.text && l.text.trim())) out.add(l.date);
  }
  return out;
}

/** First and last challenge days that are over (yesterday at the latest). Null before day 2. */
export function completedRange(challenge: Pick<Challenge, "start_date" | "length_days">, today: DateStr): { from: DateStr; to: DateStr } | null {
  const end = challengeEndDate(challenge.start_date, challenge.length_days);
  const yesterday = addDays(today, -1);
  const to = yesterday > end ? end : yesterday;
  return to >= challenge.start_date ? { from: challenge.start_date, to } : null;
}

// ---------- snapshot ----------

export interface MissLine {
  key: string | null;
  name: string;
  /** open: nothing logged. off: logged but short of the target. */
  state: "open" | "off";
  /** What was logged, formatted. Null when nothing. */
  logged: string | null;
  /** The target in words. */
  target: string;
  /** How far off, formatted: "30g under", "150 kcal over". Null when not a number. */
  gap: string | null;
}

export interface DayLine {
  date: DateStr;
  label: string;
  dayNumber: number;
  status: DayStatus;
  done: number;
  total: number;
  missed: string[];
}

export interface ItemLine {
  key: string | null;
  name: string;
  target: string;
  streak: number;
  best: number;
  /** Done on this many of the last 7 finished days it was on the checklist. */
  hits7: number;
  days7: number;
}

export interface MoneyLine {
  total: number;
  target: number;
  deadline: DateStr;
  deadlineLabel: string;
  state: "active" | "hit" | "past";
  remaining: number;
  /** Days that can still be worked, today included. */
  daysLeft: number;
  /** Remaining spread over the days left, rounded up to a dollar. Null when no days are left. */
  neededPerDay: number | null;
  floor: number;
  /** True when the floor alone is enough to get there. */
  floorCovers: boolean;
  earnedYesterday: number | null;
  earnedToday: number;
  last7: { date: DateStr; label: string; amount: number }[];
  /** Last 14 days by app, entries with hours only for the rate. */
  apps: { app: string; amount: number; hours: number; perHour: number | null }[];
}

export interface MacroDay {
  date: DateStr;
  label: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface LiftLine {
  exercise: string;
  sessions: { date: DateStr; label: string; top: string }[];
}

export interface WeekLine {
  start: DateStr;
  end: DateStr;
  label: string;
  /** Days of the week that are scored so far. */
  daysScored: number;
  full: number;
  partial: number;
  missed: number;
  items: { key: string | null; name: string; hits: number; of: number; note: string | null }[];
  held: string[];
  slipped: string[];
  weekly: { name: string; done: boolean }[];
  earned: number;
  floorDays: number;
  slips: { vice: string; count: number }[];
  weightChange: string | null;
}

export interface CoachSnapshot {
  version: 1;
  today: {
    date: DateStr;
    label: string;
    weekday: string;
    dayNumber: number;
    lengthDays: number;
    daysLeft: number;
    phase: "before" | "active" | "after";
  };
  plan: {
    blocks: { name: string; kind: string; start: string; end: string }[];
    workout: { name: string; detail: string | null; exercises: string[] } | null;
    core: { name: string; detail: string | null; exercises: string[] } | null;
  };
  yesterday: {
    date: DateStr;
    label: string;
    status: DayStatus;
    done: number;
    total: number;
    misses: MissLine[];
    /** Items that get checked the morning after and are still open. */
    pending: string[];
  } | null;
  days: DayLine[];
  items: ItemLine[];
  money: MoneyLine;
  macros: {
    targets: { calories: string | null; protein: string | null; carbs: string; fat: string };
    days: MacroDay[];
  };
  lifts: LiftLine[];
  weight: { unit: string; entries: { date: DateStr; label: string; weight: number }[]; change: string | null };
  vices: { name: string; cleanStreak: number; slips: { date: DateStr; label: string; time: string; trigger: string | null }[] }[];
  week: WeekLine;
  flags: Pick<Flag, "kind" | "title" | "detail" | "change" | "evidence">[];
  /** The rule-based pick for next week's one change. */
  suggestedChange: string;
}

function gapFor(target: Target, value: number | null, unit: string | null): string | null {
  if (value === null) return null;
  if (target.kind === "min" && value < target.min) return `${withUnit(target.min - value, unit)} under`;
  if (target.kind === "max" && value > target.max) return `${withUnit(value - target.max, unit)} over`;
  if (target.kind === "range") {
    if (value < target.min) return `${withUnit(target.min - value, unit)} under`;
    if (value > target.max) return `${withUnit(value - target.max, unit)} over`;
  }
  return null;
}

export function missLine(r: ItemResult): MissLine {
  const value = r.log?.value ?? null;
  const isNumber = r.target.kind === "min" || r.target.kind === "max" || r.target.kind === "range";
  return {
    key: r.item.key,
    name: r.item.name,
    state: r.state === "off" ? "off" : "open",
    logged: isNumber && value !== null ? withUnit(value, r.item.unit) : null,
    target: describeTarget(r.target, r.item.unit),
    gap: isNumber ? gapFor(r.target, value, r.item.unit) : null,
  };
}

/** Best set of a session. Weighted sets compare by estimated one rep max, bodyweight sets by reps. */
export interface TopSet {
  date: DateStr;
  weight: number;
  reps: number;
  score: number;
  label: string;
}

export function topSets(setLogs: readonly SetLog[], unit: string): Map<string, TopSet[]> {
  const byExercise = new Map<string, Map<DateStr, TopSet>>();
  for (const s of setLogs) {
    const reps = s.reps ?? 0;
    const weight = s.weight ?? 0;
    if (reps <= 0) continue;
    const score = weight > 0 ? weight * (1 + reps / 30) : reps;
    const label = weight > 0 ? `${round1(weight)} ${unit} x ${reps}` : plural(reps, "rep");
    const name = s.exercise.trim();
    if (!name) continue;
    let days = byExercise.get(name);
    if (!days) byExercise.set(name, (days = new Map()));
    const prev = days.get(s.date);
    // A weighted set always beats a bodyweight one on the same day.
    if (!prev || (weight > 0 && prev.weight === 0) || (weight > 0 === prev.weight > 0 && score > prev.score)) {
      days.set(s.date, { date: s.date, weight, reps, score, label });
    }
  }
  const out = new Map<string, TopSet[]>();
  for (const [name, days] of byExercise) {
    out.set(name, [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)));
  }
  return out;
}

function sum(ns: number[]): number {
  return Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100;
}

function buildMoney(data: CoachData): MoneyLine {
  const { challenge: c, today, earnings } = data;
  const counted = earnings.filter((e) => e.date >= c.start_date && e.date <= today);
  const total = sum(counted.map((e) => e.amount));
  const onDate = (d: DateStr) => sum(counted.filter((e) => e.date === d).map((e) => e.amount));
  const remaining = Math.max(0, Math.round((c.money_target - total) * 100) / 100);
  const daysLeft = today > c.money_deadline ? 0 : diffDays(today, c.money_deadline) + 1;
  const state = c.money_target > 0 && total >= c.money_target ? "hit" : today > c.money_deadline ? "past" : "active";
  const neededPerDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : null;
  const yesterday = addDays(today, -1);
  const from14 = addDays(today, -14);
  const apps = new Map<string, { amount: number; hours: number; rated: number }>();
  for (const e of counted) {
    if (e.date < from14) continue;
    const a = apps.get(e.app) ?? { amount: 0, hours: 0, rated: 0 };
    a.amount += e.amount;
    if (e.hours && e.hours > 0) {
      a.hours += e.hours;
      a.rated += e.amount;
    }
    apps.set(e.app, a);
  }
  const last7From = addDays(today, -7) < c.start_date ? c.start_date : addDays(today, -7);
  return {
    total,
    target: c.money_target,
    deadline: c.money_deadline,
    deadlineLabel: formatDateShort(c.money_deadline),
    state,
    remaining,
    daysLeft,
    neededPerDay,
    floor: c.daily_floor,
    floorCovers: neededPerDay !== null && neededPerDay <= c.daily_floor,
    earnedYesterday: yesterday >= c.start_date ? onDate(yesterday) : null,
    earnedToday: onDate(today),
    last7: yesterday >= last7From ? dateRange(last7From, yesterday).map((d) => ({ date: d, label: formatDateShort(d), amount: onDate(d) })) : [],
    apps: [...apps.entries()]
      .map(([app, a]) => ({
        app,
        amount: sum([a.amount]),
        hours: round1(a.hours),
        perHour: a.hours > 0 ? Math.round((a.rated / a.hours) * 100) / 100 : null,
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/** One Monday to Sunday week, scored up to `today`. */
export function buildWeek(data: CoachData, anyDateInWeek: DateStr): WeekLine {
  const { challenge: c, today, items, versions, logs } = data;
  const start = weekStart(anyDateInWeek);
  const end = weekEnd(anyDateInWeek);
  const challengeEnd = challengeEndDate(c.start_date, c.length_days);
  const from = start < c.start_date ? c.start_date : start;
  const to = [end, today, challengeEnd].sort()[0];
  const days = from <= to ? dateRange(from, to) : [];

  const lastNight = addDays(today, -1);
  let full = 0;
  let partial = 0;
  let missed = 0;
  const perItem = new Map<string, { item: ChecklistItem; hits: number; of: number; values: number[] }>();
  for (const d of days) {
    const s = summarizeDay(d, items, versions, logs);
    if (s.status === "full") full++;
    else if (s.status === "partial") partial++;
    else missed++;
    for (const r of s.items) {
      // Last night's bedtime is ticked this morning. Until then it is not a miss.
      if (r.item.key === "bed" && r.state === "open" && d === lastNight) continue;
      const row = perItem.get(r.item.id) ?? { item: r.item, hits: 0, of: 0, values: [] };
      row.of++;
      if (r.done) row.hits++;
      if (r.log?.value !== null && r.log?.value !== undefined) row.values.push(r.log.value);
      perItem.set(r.item.id, row);
    }
  }
  const rows = [...perItem.values()].sort((a, b) => a.item.sort_order - b.item.sort_order);
  const lineItems = rows.map((r) => {
    let note: string | null = null;
    if (r.item.type === "number" && r.values.length > 0 && r.item.key !== "earned") {
      const avg = Math.round(sum(r.values) / r.values.length);
      note = `averaged ${withUnit(avg, r.item.unit)} on ${plural(r.values.length, "logged day")}, target ${describeTarget(r.item.target, r.item.unit)}`;
    }
    return { key: r.item.key, name: r.item.name, hits: r.hits, of: r.of, note };
  });
  const held = lineItems.filter((r) => r.of > 0 && r.hits === r.of).map((r) => r.name);
  const slipped = lineItems
    .filter((r) => r.hits < r.of)
    .sort((a, b) => b.of - b.hits - (a.of - a.hits))
    .map((r) => r.name);

  const wk = days.length > 0 ? summarizeWeek(days[0], items, versions, logs, to) : null;
  const earnedByDay = days.map((d) => sum(data.earnings.filter((e) => e.date === d).map((e) => e.amount)));
  const slipCounts = new Map<string, number>();
  for (const s of data.slips) {
    if (days.length === 0 || s.date < days[0] || s.date > to) continue;
    const item = items.find((i) => i.id === s.item_id);
    if (!item) continue;
    const name = viceName(item.name);
    slipCounts.set(name, (slipCounts.get(name) ?? 0) + 1);
  }
  const weights = data.bodyLogs
    .filter((b) => b.weight !== null && days.length > 0 && b.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const inWeek = weights.filter((b) => b.date >= start);
  const before = weights.filter((b) => b.date < start);
  let weightChange: string | null = null;
  if (inWeek.length > 0 && before.length > 0) {
    const unit = data.settings?.weight_unit ?? "lb";
    const now = inWeek[inWeek.length - 1].weight as number;
    const prev = before[before.length - 1].weight as number;
    const delta = round1(now - prev);
    weightChange = delta === 0 ? `flat at ${now} ${unit}` : `${delta < 0 ? "down" : "up"} ${Math.abs(delta)} ${unit}, ${prev} to ${now}`;
  }

  return {
    start,
    end,
    label: `${formatDateShort(start)} to ${formatDateShort(end)}`,
    daysScored: days.length,
    full,
    partial,
    missed,
    items: lineItems,
    held,
    slipped,
    weekly: wk ? wk.items.map((w) => ({ name: w.item.name, done: w.done })) : [],
    earned: sum(earnedByDay),
    floorDays: earnedByDay.filter((n) => n >= c.daily_floor).length,
    slips: [...slipCounts.entries()].map(([vice, count]) => ({ vice, count })),
    weightChange,
  };
}

const CHANGE_BY_KEY: Record<string, string> = {
  wake: "Phone charges across the room, so the alarm puts your feet on the floor.",
  workout: "Lay out the gym clothes before bed so the morning workout needs no decisions.",
  core: "Do core straight after the last set, before you leave the gym floor.",
  calories: "Log every meal when you eat it, not at night, so the number steers the day.",
  protein: "Put a protein meal or shake in the first block after the workout, every day.",
  earned: "Start the first delivery block on time and stay out until the day reads the floor.",
  study: "Start the study block at its scheduled time with the phone in another room.",
  business: "Write tomorrow's one business move the night before and do it before noon.",
  bed: "Set an alarm 30 minutes before bed time. When it goes, screens off.",
};

function workoutLine(w: Workout | null): { name: string; detail: string | null; exercises: string[] } | null {
  if (!w) return null;
  return { name: w.name, detail: w.detail, exercises: w.exercises.map((e) => `${e.name} ${e.sets} x ${e.reps}`) };
}

export interface SnapshotOptions {
  /** Any date in the week the `week` block should cover. Default: today. */
  weekOf?: DateStr;
}

/** The whole picture, compact, with every number the coach may use. */
export function buildSnapshot(data: CoachData, flags: readonly Flag[], options: SnapshotOptions = {}): CoachSnapshot {
  const { challenge: c, today, items, versions, logs } = data;
  const end = challengeEndDate(c.start_date, c.length_days);
  const phase = today < c.start_date ? "before" : today > end ? "after" : "active";
  const weekday = weekdayOf(today);
  const unit = data.settings?.weight_unit ?? "lb";

  // Finished days, newest last, two weeks at most.
  const range = completedRange(c, today);
  const dayDates = range ? dateRange(range.from, range.to).slice(-14) : [];
  const summaries = dayDates.map((d) => summarizeDay(d, items, versions, logs));
  const days: DayLine[] = summaries.map((s) => ({
    date: s.date,
    label: formatDateShort(s.date),
    dayNumber: dayNumber(c.start_date, s.date),
    status: s.status,
    done: s.done,
    total: s.total,
    missed: s.items.filter((r) => !r.done).map((r) => r.item.name),
  }));

  const yesterdayDate = addDays(today, -1);
  const ys = summaries.find((s) => s.date === yesterdayDate) ?? null;
  const yesterday = ys
    ? (() => {
        const notDone = ys.items.filter((r) => !r.done);
        // "In bed on time" is ticked the next morning, so open is not a miss yet.
        const pending = notDone.filter((r) => r.item.key === "bed" && r.state === "open");
        const misses = notDone.filter((r) => !pending.includes(r));
        return {
          date: ys.date,
          label: formatDateLong(ys.date),
          status: ys.status,
          done: ys.done,
          total: ys.total,
          misses: misses.map(missLine),
          pending: pending.map((r) => r.item.name),
        };
      })()
    : null;

  const last7 = summaries.slice(-7);
  const streakDay = today > end ? end : today;
  const itemLines: ItemLine[] = items
    .filter((i) => i.cadence === "daily" && phase !== "before" && isActiveOn(i, versions, streakDay))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => {
      const st = itemStreak(i, versions, logs, streakDay, c.start_date);
      const rows = last7.map((s) => s.items.find((r) => r.item.id === i.id)).filter((r): r is ItemResult => !!r);
      return {
        key: i.key,
        name: i.name,
        target: describeTarget(i.target, i.unit),
        streak: st.current,
        best: st.best,
        hits7: rows.filter((r) => r.done).length,
        days7: rows.length,
      };
    });

  // Macros: calories and protein are what the checklist scored, carbs and fat come from meals.
  const cal = items.find((i) => i.key === "calories");
  const pro = items.find((i) => i.key === "protein");
  const macroFrom = addDays(today, -6) < c.start_date ? c.start_date : addDays(today, -6);
  const macroDays: MacroDay[] = (phase === "before" ? [] : dateRange(macroFrom, today > end ? end : today)).map((d) => {
    const meals = data.meals.filter((m) => m.date === d);
    const logValue = (item: ChecklistItem | undefined) => (item ? (logs.find((l) => l.date === d && l.item_id === item.id)?.value ?? null) : null);
    const mealSum = (f: "calories" | "protein" | "carbs" | "fat") => (meals.length > 0 ? Math.round(sum(meals.map((m) => m[f]))) : null);
    return {
      date: d,
      label: formatDateShort(d),
      calories: logValue(cal) ?? mealSum("calories"),
      protein: logValue(pro) ?? mealSum("protein"),
      carbs: mealSum("carbs"),
      fat: mealSum("fat"),
    };
  });

  const lifts: LiftLine[] = [...topSets(data.setLogs.filter((s) => s.date <= today && s.date >= addDays(today, -35)), unit).entries()]
    .map(([exercise, sets]) => ({
      exercise,
      sessions: sets.slice(-3).map((s) => ({ date: s.date, label: formatDateShort(s.date), top: s.label })),
    }))
    .filter((l) => l.sessions.length >= 2)
    .slice(0, 8);

  const weights = data.bodyLogs
    .filter((b) => b.weight !== null && b.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((b) => ({ date: b.date, label: formatDateShort(b.date), weight: b.weight as number }));
  let weightChange: string | null = null;
  if (weights.length >= 2) {
    const first = weights[0].weight;
    const last = weights[weights.length - 1].weight;
    const delta = round1(last - first);
    weightChange = delta === 0 ? `flat at ${last} ${unit}` : `${delta < 0 ? "down" : "up"} ${Math.abs(delta)} ${unit} since ${weights[0].label}`;
  }

  const slipFrom = addDays(today, -14);
  const vices = items
    .filter((i) => i.category === "vice" && phase !== "before" && isActiveOn(i, versions, streakDay))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      name: viceName(i.name),
      cleanStreak: itemStreak(i, versions, logs, streakDay, c.start_date).current,
      slips: data.slips
        .filter((s) => s.item_id === i.id && s.date >= slipFrom && s.date <= today)
        .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))
        .map((s) => ({ date: s.date, label: formatDateShort(s.date), time: formatTime(s.time), trigger: s.trigger?.trim() || null })),
    }));

  const main = data.workouts.find((w) => w.weekday === weekday && w.slot === "main") ?? null;
  const core = data.workouts.find((w) => w.weekday === weekday && w.slot === "core") ?? null;
  const week = buildWeek(data, options.weekOf ?? today);
  const flagLines = flags.map((f) => ({ kind: f.kind, title: f.title, detail: f.detail, change: f.change, evidence: f.evidence }));

  return {
    version: 1,
    today: {
      date: today,
      label: formatDateLong(today),
      weekday: WEEKDAY_NAMES[weekday],
      dayNumber: dayNumber(c.start_date, today),
      lengthDays: c.length_days,
      daysLeft: Math.max(0, diffDays(today, end)),
      phase,
    },
    plan: {
      blocks: data.blocks
        .slice()
        .sort((a, b) => (a.start < b.start ? -1 : 1))
        .map((b) => ({ name: b.block_name, kind: b.kind, start: formatTime(b.start), end: formatTime(b.end) })),
      workout: workoutLine(main),
      core: workoutLine(core),
    },
    yesterday,
    days,
    items: itemLines,
    money: buildMoney(data),
    macros: {
      targets: {
        calories: cal ? describeTarget(cal.target, cal.unit) : null,
        protein: pro ? describeTarget(pro.target, pro.unit) : null,
        carbs: `${data.settings?.carbs_target ?? 0}g`,
        fat: `${data.settings?.fat_target ?? 0}g`,
      },
      days: macroDays,
    },
    lifts,
    weight: { unit, entries: weights.slice(-6), change: weightChange },
    vices,
    week,
    flags: flagLines,
    suggestedChange: pickChange(flags, week),
  };
}

/**
 * Next week's one change, by rule. The top flag wins because it is the
 * strongest signal. Otherwise the item missed most often. Otherwise nothing.
 */
export function pickChange(flags: readonly Pick<Flag, "change">[], week: Pick<WeekLine, "items">): string {
  if (flags.length > 0) return flags[0].change;
  const worst = week.items
    .filter((r) => r.hits < r.of)
    .sort((a, b) => b.of - b.hits - (a.of - a.hits))[0];
  if (!worst) return "Keep the same schedule. Nothing in the data says to change it.";
  if (worst.key && CHANGE_BY_KEY[worst.key]) return CHANGE_BY_KEY[worst.key];
  if (worst.key?.startsWith("vice_")) return `Log each ${viceName(worst.name)} slip with the time and what set it off, so the pattern shows.`;
  return `Give "${worst.name}" a fixed time on the schedule every day next week.`;
}

// ---------- text guards ----------

/** No em or en dashes, ever. Ranges become "to", the rest become commas. */
export function cleanCoachText(text: string): string {
  return text
    .replace(/(\d)\s*[\u2012\u2013\u2014\u2015\u2212]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[\u2012\u2013\u2014\u2015]\s*/g, ", ")
    .replace(/\u2212/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/^[ \t]*[-*\u2022][ \t]+/gm, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/,\s*,/g, ",")
    .trim();
}

/** Every number in a text, with thousands commas folded in. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
};

/**
 * Numbers the coach wrote that are nowhere in the snapshot. Whole numbers up
 * to 10 pass, since they are counts the reader can check at a glance ("one
 * change", "3 days"). Anything else has to be in the data.
 */
export function unknownNumbers(text: string, snapshot: unknown): number[] {
  const known = new Set(numbersIn(JSON.stringify(snapshot)));
  const written = numbersIn(text);
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) written.push(n);
  }
  const bad = written.filter((n) => !(Number.isInteger(n) && n <= 10) && !known.has(n));
  return [...new Set(bad)];
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ---------- flag notes ----------

/** What a coach_note of kind "flag" keeps in its body, as JSON. */
export interface FlagNote {
  v: 1;
  flag: Flag;
  /** Hidden by the user. Stays hidden until the pattern clears. */
  dismissed_on: DateStr | null;
  /** The rules stopped detecting it on this date. */
  resolved_on: DateStr | null;
}

export function encodeFlagNote(n: FlagNote): string {
  return JSON.stringify(n);
}

export function parseFlagNote(body: string): FlagNote | null {
  try {
    const v = JSON.parse(body) as Partial<FlagNote> | null;
    if (!v || typeof v !== "object" || !v.flag || typeof v.flag.key !== "string" || typeof v.flag.title !== "string") return null;
    return {
      v: 1,
      flag: { ...v.flag, evidence: Array.isArray(v.flag.evidence) ? v.flag.evidence : [] },
      dismissed_on: v.dismissed_on ?? null,
      resolved_on: v.resolved_on ?? null,
    };
  } catch {
    return null;
  }
}

export interface FlagChanges {
  insert: NewRow<"coach_note">[];
  update: { id: string; body: string }[];
}

/**
 * Bring the saved flag notes in line with what the rules detect today.
 * A new pattern gets a note. A live one has its evidence refreshed and keeps
 * its dismissal. One that is no longer detected is marked resolved, so if it
 * comes back later it is a new flag and shows again.
 */
export function reconcileFlags(detected: readonly Flag[], notes: readonly CoachNote[], today: DateStr): FlagChanges {
  const open = new Map<string, { id: string; note: FlagNote; body: string }>();
  for (const n of notes) {
    if (n.kind !== "flag") continue;
    const parsed = parseFlagNote(n.body);
    if (parsed && !parsed.resolved_on && !open.has(parsed.flag.key)) open.set(parsed.flag.key, { id: n.id, note: parsed, body: n.body });
  }
  const changes: FlagChanges = { insert: [], update: [] };
  const seen = new Set<string>();
  for (const flag of detected) {
    if (seen.has(flag.key)) continue;
    seen.add(flag.key);
    const hit = open.get(flag.key);
    if (!hit) {
      changes.insert.push({ date: today, kind: "flag", source: "fallback", body: encodeFlagNote({ v: 1, flag, dismissed_on: null, resolved_on: null }) });
      continue;
    }
    const body = encodeFlagNote({ ...hit.note, flag });
    if (body !== hit.body) changes.update.push({ id: hit.id, body });
  }
  for (const [key, hit] of open) {
    if (!seen.has(key)) changes.update.push({ id: hit.id, body: encodeFlagNote({ ...hit.note, resolved_on: today }) });
  }
  return changes;
}

/** Flag notes that should show as cards: detected, not dismissed, not resolved. */
export function activeFlagNotes(notes: readonly CoachNote[]): { id: string; date: DateStr; note: FlagNote }[] {
  const out: { id: string; date: DateStr; note: FlagNote }[] = [];
  for (const n of notes) {
    if (n.kind !== "flag") continue;
    const note = parseFlagNote(n.body);
    if (note && !note.resolved_on && !note.dismissed_on) out.push({ id: n.id, date: n.date, note });
  }
  return out;
}

// ---------- when the Sunday review is due ----------

export interface ReviewDue {
  /** The Sunday the review is dated. */
  weekEnd: DateStr;
  weekStart: DateStr;
  /** Write it without being asked: the week is over, or it is Sunday evening. */
  auto: boolean;
}

/**
 * Which week's review is current. On Sunday it is this week (written on
 * request during the day, on its own from 8:00 PM). Monday to Saturday it is
 * the week that just ended. Null when that week has no challenge days.
 */
export function reviewDue(today: DateStr, time: TimeStr, challenge: Pick<Challenge, "start_date" | "length_days">): ReviewDue | null {
  const isSunday = weekdayOf(today) === 0;
  const sunday = isSunday ? today : addDays(weekStart(today), -1);
  const monday = weekStart(sunday);
  const end = challengeEndDate(challenge.start_date, challenge.length_days);
  if (sunday < challenge.start_date || monday > end) return null;
  return { weekEnd: sunday, weekStart: monday, auto: !isSunday || time >= "20:00" };
}

/** The next Sunday a review will land, for the empty state. */
export function nextReviewDate(today: DateStr): DateStr {
  return weekEnd(today);
}
