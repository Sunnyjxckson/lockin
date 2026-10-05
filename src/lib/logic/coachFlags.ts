// Coach pattern flags. Explicit rules over the raw rows, nothing learned and
// nothing guessed. Each flag carries the dates and numbers that tripped it.
//
// Shared ground rules
// - Only finished days count (yesterday at the latest). Today is
//   still in play.
// - A day with nothing logged at all proves nothing, so it ends a run instead
//   of counting as a miss.
// - "In bed on time" is ticked the next morning, so last night is left out
//   until it is ticked.

import type { ChecklistItem, DateStr, DayLog } from "../types";
import { addDays, dateRange, formatDateShort, formatTime, minutesOf, weekStart } from "./dates";
import { itemState } from "./day";
import { isActiveOn, targetOn } from "./targets";
import { completedRange, money, plural, round1, topSets, touchedDates, viceName, withUnit, type CoachData, type Flag } from "./coach";

export const RULES = {
  /** Days in a row under target before protein or earnings is flagged. */
  runDays: 3,
  /** Missed bedtimes in the last 7 scored nights. */
  bedMisses: 3,
  bedWindow: 7,
  /** Late night then missed wake, this many times in two weeks. */
  wakePairs: 2,
  /** Slips in the same part of the day, or with the same trigger, in two weeks. */
  viceSameTime: 3,
  viceSameTrigger: 2,
  /** Weekly best must fall by more than this share to count as a drop. */
  liftNoise: 0.01,
  /** Hourly rate: three worked days falling, and down at least this share overall. */
  rateDrop: 0.15,
  lookbackDays: 14,
} as const;

const ORDER: Flag["kind"][] = ["earned_under", "protein_under", "lift_drop", "wake_after_late", "bed_missed", "vice_pattern", "rate_drop"];

interface Ctx {
  data: CoachData;
  /** Finished days inside the lookback, oldest first. */
  days: DateStr[];
  touched: Set<DateStr>;
  logAt: (itemId: string, date: DateStr) => DayLog | undefined;
  item: (key: string) => ChecklistItem | undefined;
  /** done, missed (scored and not done), or skip (not on the checklist, or an untouched day). */
  result: (item: ChecklistItem, date: DateStr) => "done" | "missed" | "skip";
}

function makeCtx(data: CoachData): Ctx {
  const range = completedRange(data.historyStart, data.today);
  const days = range ? dateRange(range.from, range.to).slice(-RULES.lookbackDays) : [];
  const touched = touchedDates(data.logs);
  const index = new Map<string, DayLog>();
  for (const l of data.logs) index.set(`${l.item_id}|${l.date}`, l);
  const logAt = (itemId: string, date: DateStr) => index.get(`${itemId}|${date}`);
  return {
    data,
    days,
    touched,
    logAt,
    item: (key) => data.items.find((i) => i.key === key),
    result: (item, date) => {
      if (!touched.has(date) || !isActiveOn(item, data.versions, date)) return "skip";
      return itemState(item, targetOn(item, data.versions, date), logAt(item.id, date)) === "done" ? "done" : "missed";
    },
  };
}

/** The unbroken run of missed days ending on the last finished day. */
function missRun(ctx: Ctx, item: ChecklistItem): DateStr[] {
  const run: DateStr[] = [];
  for (let i = ctx.days.length - 1; i >= 0; i--) {
    if (ctx.result(item, ctx.days[i]) !== "missed") break;
    run.unshift(ctx.days[i]);
  }
  return run;
}

function numberTarget(ctx: Ctx, item: ChecklistItem, date: DateStr): number | null {
  const t = targetOn(item, ctx.data.versions, date);
  return t.kind === "min" || t.kind === "range" ? t.min : null;
}

function proteinUnder(ctx: Ctx): Flag[] {
  const item = ctx.item("protein");
  if (!item) return [];
  const run = missRun(ctx, item);
  if (run.length < RULES.runDays) return [];
  const target = numberTarget(ctx, item, run[run.length - 1]);
  if (target === null) return [];
  const values = run.map((d) => ctx.logAt(item.id, d)?.value ?? null);
  const logged = values.filter((v): v is number => v !== null);
  const avg = logged.length > 0 ? Math.round(logged.reduce((s, n) => s + n, 0) / logged.length) : null;
  const gap = avg !== null ? Math.max(0, target - avg) : null;
  return [
    {
      key: "protein_under",
      kind: "protein_under",
      title: `Protein under ${withUnit(target, item.unit)} ${run.length} days running`,
      detail:
        avg !== null
          ? `Averaged ${withUnit(avg, item.unit)} on the days you logged, ${withUnit(gap as number, item.unit)} short of ${withUnit(target, item.unit)}.`
          : `Nothing logged for protein on any of the ${run.length} days.`,
      change:
        gap !== null && gap > 0
          ? `Add one meal or shake with ${withUnit(Math.min(60, Math.ceil(gap / 5) * 5), item.unit)} of protein right after the workout. That closes the gap.`
          : "Log protein at every meal so the day's number is real.",
      evidence: run.map((d, i) => ({
        label: formatDateShort(d),
        value: values[i] === null ? "not logged" : `${withUnit(values[i] as number, item.unit)} of ${withUnit(target, item.unit)}`,
      })),
      since: run[0],
    },
  ];
}

function earnedUnder(ctx: Ctx): Flag[] {
  const item = ctx.item("earned");
  if (!item) return [];
  const run = missRun(ctx, item);
  if (run.length < RULES.runDays) return [];
  const floor = numberTarget(ctx, item, run[run.length - 1]) ?? ctx.data.floor;
  const values = run.map((d) => ctx.logAt(item.id, d)?.value ?? 0);
  const short = values.reduce((s, v) => s + Math.max(0, floor - v), 0);
  return [
    {
      key: "earned_under",
      kind: "earned_under",
      title: `Under the ${money(floor)} floor ${run.length} days running`,
      detail: `${money(short)} short of the floor across those ${run.length} days.`,
      change: `Start the first delivery block on time and do not end it until the day reads ${money(floor)}.`,
      evidence: run.map((d, i) => ({ label: formatDateShort(d), value: `${money(values[i])} of ${money(floor)}` })),
      since: run[0],
    },
  ];
}

/** Nights that were scored: touched, on the checklist, and not last night unless ticked. */
function bedNights(ctx: Ctx, item: ChecklistItem): { date: DateStr; hit: boolean }[] {
  const lastNight = addDays(ctx.data.today, -1);
  const out: { date: DateStr; hit: boolean }[] = [];
  for (const d of ctx.days) {
    const r = ctx.result(item, d);
    if (r === "skip") continue;
    if (d === lastNight && r === "missed") continue;
    out.push({ date: d, hit: r === "done" });
  }
  return out;
}

function bedMissed(ctx: Ctx): Flag[] {
  const item = ctx.item("bed");
  if (!item) return [];
  const nights = bedNights(ctx, item).slice(-RULES.bedWindow);
  const missed = nights.filter((n) => !n.hit);
  if (missed.length < RULES.bedMisses) return [];
  return [
    {
      key: "bed_missed",
      kind: "bed_missed",
      title: `Bedtime missed ${missed.length} of the last ${nights.length} nights`,
      detail: `In bed on time ${nights.length - missed.length} of ${plural(nights.length, "night")}.`,
      change: "Set an alarm 30 minutes before bed time. When it goes, screens off and the last block ends.",
      evidence: nights.map((n) => ({ label: formatDateShort(n.date), value: n.hit ? "on time" : "missed" })),
      since: missed[0].date,
    },
  ];
}

function wakeAfterLate(ctx: Ctx): Flag[] {
  const bed = ctx.item("bed");
  const wake = ctx.item("wake");
  if (!bed || !wake) return [];
  const nights = bedNights(ctx, bed);
  let lateTotal = 0;
  let onTimeTotal = 0;
  let onTimeWakeHit = 0;
  const pairs: { night: DateStr; morning: DateStr }[] = [];
  for (const n of nights) {
    const morning = addDays(n.date, 1);
    if (morning >= ctx.data.today) continue;
    const w = ctx.result(wake, morning);
    if (w === "skip") continue;
    if (n.hit) {
      onTimeTotal++;
      if (w === "done") onTimeWakeHit++;
    } else {
      lateTotal++;
      if (w === "missed") pairs.push({ night: n.date, morning });
    }
  }
  if (pairs.length < RULES.wakePairs) return [];
  // Only a pattern if late nights do worse than on time nights.
  const lateMissRate = pairs.length / lateTotal;
  const onTimeMissRate = onTimeTotal > 0 ? (onTimeTotal - onTimeWakeHit) / onTimeTotal : 0;
  if (lateMissRate <= onTimeMissRate) return [];
  const evidence = pairs.map((p) => ({ label: `Night of ${formatDateShort(p.night)}`, value: `wake missed ${formatDateShort(p.morning)}` }));
  if (onTimeTotal > 0) evidence.push({ label: "After on time nights", value: `up on time ${onTimeWakeHit} of ${onTimeTotal}` });
  return [
    {
      key: "wake_after_late",
      kind: "wake_after_late",
      title: "Wake time goes after late nights",
      detail: `Wake was missed after ${pairs.length} of ${plural(lateTotal, "late night")}${onTimeTotal > 0 ? `, and hit after ${onTimeWakeHit} of ${plural(onTimeTotal, "on time night")}` : ""}.`,
      change: "The wake is decided the night before. Hold bed time tonight and the morning takes care of itself.",
      evidence,
      since: pairs[0].night,
    },
  ];
}

const DAY_PARTS: { name: string; label: string; from: number; to: number }[] = [
  { name: "morning", label: "in the morning (5 AM to noon)", from: 300, to: 720 },
  { name: "afternoon", label: "in the afternoon (noon to 5 PM)", from: 720, to: 1020 },
  { name: "evening", label: "in the evening (5 PM to 9 PM)", from: 1020, to: 1260 },
  { name: "late night", label: "late at night (9 PM to 5 AM)", from: 1260, to: 1740 },
];

export function dayPart(time: string): (typeof DAY_PARTS)[number] {
  let m = minutesOf(time);
  if (m < 300) m += 1440;
  return DAY_PARTS.find((p) => m >= p.from && m < p.to) ?? DAY_PARTS[3];
}

function normTrigger(t: string | null): string {
  return (t ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "");
}

function vicePatterns(ctx: Ctx): Flag[] {
  const { data } = ctx;
  const from = addDays(data.today, -RULES.lookbackDays);
  const out: Flag[] = [];
  for (const item of data.items) {
    if (item.category !== "vice") continue;
    const slips = data.slips
      .filter((s) => s.item_id === item.id && s.date >= from && s.date <= data.today && s.date >= data.historyStart)
      .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
    if (slips.length < Math.min(RULES.viceSameTime, RULES.viceSameTrigger)) continue;

    const byPart = new Map<string, typeof slips>();
    const byTrigger = new Map<string, typeof slips>();
    for (const s of slips) {
      const part = dayPart(s.time).name;
      byPart.set(part, [...(byPart.get(part) ?? []), s]);
      const trig = normTrigger(s.trigger);
      if (trig) byTrigger.set(trig, [...(byTrigger.get(trig) ?? []), s]);
    }
    const topPart = [...byPart.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const topTrigger = [...byTrigger.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const timeHit = topPart && topPart[1].length >= RULES.viceSameTime ? topPart : null;
    const triggerHit = topTrigger && topTrigger[1].length >= RULES.viceSameTrigger ? topTrigger : null;
    if (!timeHit && !triggerHit) continue;

    const name = viceName(item.name);
    const Name = name.charAt(0).toUpperCase() + name.slice(1);
    const part = timeHit ? DAY_PARTS.find((p) => p.name === timeHit[0]) : null;
    const bits: string[] = [];
    if (timeHit && part) bits.push(`${timeHit[1].length} of ${plural(slips.length, "slip")} came ${part.label}`);
    if (triggerHit) bits.push(`${triggerHit[1].length} of ${slips.length} logged "${triggerHit[0]}" as the trigger`);
    const shown = new Set([...(timeHit?.[1] ?? []), ...(triggerHit?.[1] ?? [])]);
    const title = timeHit && triggerHit
      ? `${Name} slips: ${timeHit[0]}, "${triggerHit[0]}"`
      : timeHit
        ? `${Name} slips cluster ${part?.name === "late night" ? "late at night" : `in the ${timeHit[0]}`}`
        : `${Name} slips share a trigger: "${triggerHit?.[0]}"`;
    const change = triggerHit
      ? `Decide now what you do right after "${triggerHit[0]}" and put it on the schedule as a block.`
      : `Put a block on the schedule for the ${timeHit?.[0]} window so that time already has a plan.`;
    out.push({
      key: `vice_pattern:${item.id}`,
      kind: "vice_pattern",
      title,
      detail: `In the last ${RULES.lookbackDays} days, ${bits.join(" and ")}.`,
      change,
      evidence: slips
        .filter((s) => shown.has(s))
        .map((s) => ({ label: `${formatDateShort(s.date)}, ${formatTime(s.time)}`, value: s.trigger?.trim() || "no trigger logged" })),
      since: slips[0].date,
    });
  }
  return out;
}

function liftDrops(ctx: Ctx): Flag[] {
  const { data } = ctx;
  const unit = data.settings?.weight_unit ?? "lb";
  const thisWeek = weekStart(data.today);
  const out: Flag[] = [];
  for (const [exercise, sets] of topSets(data.setLogs.filter((s) => s.date <= data.today), unit)) {
    // Best set of each week.
    const weeks = new Map<DateStr, (typeof sets)[number]>();
    for (const s of sets) {
      const w = weekStart(s.date);
      const prev = weeks.get(w);
      if (!prev || s.score > prev.score) weeks.set(w, s);
    }
    const ordered = [...weeks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const last3 = ordered.slice(-3);
    if (last3.length < 3) continue;
    const [a, b, c] = last3;
    // Three weeks in a row, the latest being this week or last week.
    if (addDays(a[0], 7) !== b[0] || addDays(b[0], 7) !== c[0]) continue;
    if (c[0] !== thisWeek && c[0] !== addDays(thisWeek, -7)) continue;
    // Do not mix weighted and bodyweight weeks.
    if (a[1].weight > 0 !== b[1].weight > 0 || b[1].weight > 0 !== c[1].weight > 0) continue;
    const drop = (x: number, y: number) => y < x * (1 - RULES.liftNoise);
    if (!drop(a[1].score, b[1].score) || !drop(b[1].score, c[1].score)) continue;
    const pct = Math.round((1 - c[1].score / a[1].score) * 100);
    out.push({
      key: `lift_drop:${exercise.toLowerCase()}`,
      kind: "lift_drop",
      title: `${exercise} down two weeks in a row`,
      detail: `Best set went ${a[1].label}, then ${b[1].label}, then ${c[1].label}. About ${pct} percent off in two weeks.`,
      change: `Next ${exercise.toLowerCase()} session, load ${b[1].weight > 0 ? `${round1(b[1].weight)} ${unit}` : "the same reps as last week"} and get every rep before adding anything.`,
      evidence: last3.map(([w, s]) => ({ label: `Week of ${formatDateShort(w)}`, value: `${s.label} on ${formatDateShort(s.date)}` })),
      since: a[1].date,
    });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

function rateDrops(ctx: Ctx): Flag[] {
  const { data } = ctx;
  const from = addDays(data.today, -RULES.lookbackDays);
  const rated = data.earnings.filter((e) => e.hours && e.hours > 0 && e.date >= from && e.date <= data.today);
  const byApp = new Map<string, Map<DateStr, { amount: number; hours: number }>>();
  for (const e of rated) {
    let days = byApp.get(e.app);
    if (!days) byApp.set(e.app, (days = new Map()));
    const d = days.get(e.date) ?? { amount: 0, hours: 0 };
    d.amount += e.amount;
    d.hours += e.hours as number;
    days.set(e.date, d);
  }
  const rate = (d: { amount: number; hours: number }) => d.amount / d.hours;
  const out: Flag[] = [];
  for (const [app, days] of byApp) {
    const last3 = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-3);
    if (last3.length < 3) continue;
    const [r1, r2, r3] = last3.map(([, d]) => rate(d));
    if (!(r2 < r1 && r3 < r2 && r3 <= r1 * (1 - RULES.rateDrop))) continue;
    // The best other app over the same stretch, if it pays more.
    let better: { app: string; rate: number } | null = null;
    for (const [other, odays] of byApp) {
      if (other === app) continue;
      const span = [...odays.entries()].filter(([d]) => d >= last3[0][0]);
      const hours = span.reduce((s, [, d]) => s + d.hours, 0);
      if (hours <= 0) continue;
      const r = span.reduce((s, [, d]) => s + d.amount, 0) / hours;
      if (r > r3 && (!better || r > better.rate)) better = { app: other, rate: r };
    }
    const perHour = (n: number) => `${money(Math.round(n * 100) / 100)}/h`;
    out.push({
      key: `rate_drop:${app.toLowerCase()}`,
      kind: "rate_drop",
      title: `${app} hourly rate is falling`,
      detail: `${perHour(r1)}, then ${perHour(r2)}, then ${perHour(r3)} over the last three ${app} days${better ? `. ${better.app} paid ${perHour(better.rate)} over the same stretch` : ""}.`,
      change: better
        ? `Run the next delivery block on ${better.app} first and switch to ${app} only when it goes quiet.`
        : `Change one thing on the next ${app} block, the zone or the start time, and compare the rate.`,
      evidence: last3.map(([d, v]) => ({
        label: formatDateShort(d),
        value: `${perHour(rate(v))} (${money(Math.round(v.amount * 100) / 100)} in ${round1(v.hours)}h)`,
      })),
      since: last3[0][0],
    });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

/** Every pattern the rules can see today, most important first. */
export function detectFlags(data: CoachData): Flag[] {
  const ctx = makeCtx(data);
  const all = [
    ...earnedUnder(ctx),
    ...proteinUnder(ctx),
    ...liftDrops(ctx),
    ...wakeAfterLate(ctx),
    ...bedMissed(ctx),
    ...vicePatterns(ctx),
    ...rateDrops(ctx),
  ];
  return all.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
