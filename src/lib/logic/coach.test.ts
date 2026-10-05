import { describe, expect, it } from "vitest";
import { SEED_ITEMS, SEED_VICE_LIBRARY, SEED_WORKOUTS } from "../seed/data";
import type { Challenge, ChecklistItem, CoachNote, DayLog, Earning, SetLog, ViceSlip, Workout } from "../types";
import {
  activeFlagNotes,
  buildSnapshot,
  buildWeek,
  cleanCoachText,
  encodeFlagNote,
  numbersIn,
  parseFlagNote,
  pickChange,
  reconcileFlags,
  reviewDue,
  unknownNumbers,
  wordCount,
  type CoachData,
  type Flag,
} from "./coach";
import { buildCoachFixture } from "./coachFixture";
import { dayPart, detectFlags } from "./coachFlags";
import { coachPrompt, correctionPrompt, isSnapshot, morningFallback, weeklyFallback } from "./coachWrite";
import { addDays, dateRange, nyInstant } from "./dates";

const DASHES = /[\u2012\u2013\u2014\u2015\u2212]/;
const TODAY = "2026-10-05"; // a Monday
const CREATED = "2026-09-01T12:00:00.000Z";

const ITEMS: ChecklistItem[] = [...SEED_ITEMS, ...SEED_VICE_LIBRARY].map((s, i) => ({
  ...s,
  id: s.key as string,
  created_at: CREATED,
  sort_order: (i + 1) * 10,
  archived: false,
}));
const WORKOUTS: Workout[] = SEED_WORKOUTS.map((w, i) => ({ ...w, id: `w${i}`, created_at: CREATED }));

let seq = 0;
const row = <T extends object>(r: T): T & { id: string; created_at: string } => ({ ...r, id: `r${++seq}`, created_at: CREATED });

function base(today = TODAY, start = "2026-09-13"): CoachData {
  return {
    today,
    historyStart: start,
    floor: 100,
    challenge: {
      id: "challenge",
      created_at: CREATED,
      name: "30 day lock in",
      status: "active",
      ended_on: null,
      rules: null,
      restart_of: null,
      start_date: start,
      length_days: 30,
      money_target: 1000,
      money_deadline: addDays(today, 4),
      daily_floor: 100,
      money_target_start: null,
    },
    settings: { carbs_target: 180, fat_target: 60, weight_unit: "lb" },
    items: ITEMS,
    versions: [],
    logs: [],
    earnings: [],
    meals: [],
    bodyLogs: [],
    setLogs: [],
    slips: [],
    workouts: WORKOUTS,
    blocks: [
      { block_name: "Wake", start: "05:45", end: "06:30", kind: "wake" },
      { block_name: "Lift + core", start: "06:30", end: "07:30", kind: "workout" },
      { block_name: "Class", start: "09:30", end: "16:00", kind: "class" },
      { block_name: "Delivery", start: "19:00", end: "20:00", kind: "delivery" },
      { block_name: "Study, homework, business", start: "20:00", end: "23:00", kind: "study" },
    ],
  };
}

function fixtureData(today = TODAY): CoachData {
  const fx = buildCoachFixture(today, ITEMS, WORKOUTS);
  const d = base(today, fx.challenge.start_date);
  return {
    ...d,
    challenge: { ...(d.challenge as Challenge), ...fx.challenge },
    logs: fx.day_log.map(row) as DayLog[],
    earnings: fx.earning.map(row) as Earning[],
    meals: fx.meal.map(row),
    bodyLogs: fx.body_log.map(row),
    setLogs: fx.set_log.map(row) as SetLog[],
    slips: fx.vice_slip.map(row) as ViceSlip[],
  };
}

/** A clean day: every daily item done. */
function cleanDay(date: string, over: Partial<Record<string, number | false>> = {}): DayLog[] {
  const out: DayLog[] = [];
  const add = (key: string, p: Partial<DayLog>) => out.push(row({ date, item_id: key, value: null, checked: true, text: null, completed_at: null, slips: 0, ...p }));
  for (const key of ["workout", "core", "study", "bed", "vice_smoking", "vice_drinking", "vice_masturbation"]) {
    if (over[key] !== false) add(key, {});
  }
  if (over.wake !== false) add("wake", { completed_at: nyInstant(date, "05:50").toISOString() });
  else add("wake", { completed_at: nyInstant(date, "07:10").toISOString() });
  add("business", { text: "Called a lead" });
  add("calories", { value: (over.calories as number) ?? 2000 });
  add("protein", { value: (over.protein as number) ?? 185 });
  if (over.earned !== false) add("earned", { value: (over.earned as number) ?? 110 });
  return out;
}

function cleanDays(data: CoachData, per: (date: string, daysAgo: number) => Partial<Record<string, number | false>> = () => ({})): DayLog[] {
  const days = dateRange(data.historyStart, addDays(data.today, -1));
  return days.flatMap((d, i) => cleanDay(d, per(d, days.length - i)));
}

const kinds = (flags: Flag[]) => flags.map((f) => f.kind);

describe("detectFlags on clean data", () => {
  it("raises nothing when there is no data at all", () => {
    expect(detectFlags(base())).toEqual([]);
  });

  it("raises nothing when every day is done", () => {
    const d = base();
    d.logs = cleanDays(d);
    expect(detectFlags(d)).toEqual([]);
  });

  it("raises nothing before the challenge starts or on day 1", () => {
    expect(detectFlags(base(TODAY, TODAY))).toEqual([]);
    expect(detectFlags(base(TODAY, addDays(TODAY, 3)))).toEqual([]);
  });
});

describe("protein under target", () => {
  it("flags three days running and shows each day's number", () => {
    const d = base();
    d.logs = cleanDays(d, (_, ago) => (ago <= 3 ? { protein: 150 - ago } : {}));
    const f = detectFlags(d).find((x) => x.kind === "protein_under");
    expect(f?.title).toBe("Protein under 180g 3 days running");
    expect(f?.evidence).toEqual([
      { label: "Oct 2", value: "147g of 180g" },
      { label: "Oct 3", value: "148g of 180g" },
      { label: "Oct 4", value: "149g of 180g" },
    ]);
    expect(f?.detail).toContain("148g");
    expect(f?.since).toBe("2026-10-02");
  });

  it("does not flag two days, or a run that ended before yesterday", () => {
    const two = base();
    two.logs = cleanDays(two, (_, ago) => (ago <= 2 ? { protein: 150 } : {}));
    expect(kinds(detectFlags(two))).not.toContain("protein_under");
    const old = base();
    old.logs = cleanDays(old, (_, ago) => (ago >= 2 && ago <= 5 ? { protein: 150 } : {}));
    expect(kinds(detectFlags(old))).not.toContain("protein_under");
  });

  it("does not count days where nothing at all was logged", () => {
    const d = base();
    // Only one real day in the last three, and it was under.
    d.logs = cleanDay(addDays(TODAY, -1), { protein: 120 });
    expect(kinds(detectFlags(d))).not.toContain("protein_under");
  });

  it("scores each day against the target in force that day", () => {
    const d = base();
    d.logs = cleanDays(d, (_, ago) => (ago <= 3 ? { protein: 170 } : {}));
    // Target was 160 until yesterday, so only yesterday is under.
    d.versions = [
      { id: "v1", created_at: CREATED, item_id: "protein", effective_from: "2000-01-01", target: { kind: "min", min: 160 }, active: true },
      { id: "v2", created_at: CREATED, item_id: "protein", effective_from: addDays(TODAY, -1), target: { kind: "min", min: 180 }, active: true },
    ];
    expect(kinds(detectFlags(d))).not.toContain("protein_under");
  });
});

describe("earnings under the floor", () => {
  it("flags three days running with the shortfall", () => {
    const d = base();
    d.logs = cleanDays(d, (_, ago) => (ago === 3 ? { earned: 60 } : ago === 2 ? { earned: 80 } : ago === 1 ? { earned: false } : {}));
    const f = detectFlags(d).find((x) => x.kind === "earned_under");
    expect(f?.title).toBe("Under the $100 floor 3 days running");
    expect(f?.detail).toBe("$160 short of the floor across those 3 days.");
    expect(f?.evidence[2]).toEqual({ label: "Oct 4", value: "$0 of $100" });
  });

  it("stays quiet when yesterday made the floor", () => {
    const d = base();
    d.logs = cleanDays(d, (_, ago) => (ago >= 2 && ago <= 6 ? { earned: 40 } : {}));
    expect(kinds(detectFlags(d))).not.toContain("earned_under");
  });
});

describe("bedtime and wake", () => {
  it("flags bedtime missed three times in the last seven scored nights", () => {
    const d = base();
    d.logs = cleanDays(d, (_, ago) => ([2, 4, 7].includes(ago) ? { bed: false } : {}));
    const f = detectFlags(d).find((x) => x.kind === "bed_missed");
    expect(f?.title).toBe("Bedtime missed 3 of the last 7 nights");
    expect(f?.evidence.filter((e) => e.value === "missed").map((e) => e.label)).toEqual(["Sep 28", "Oct 1", "Oct 3"]);
  });

  it("does not count last night while it is still unticked", () => {
    const d = base();
    d.logs = cleanDays(d, (_, ago) => ([1, 2, 4].includes(ago) ? { bed: false } : {}));
    expect(kinds(detectFlags(d))).not.toContain("bed_missed");
  });

  it("flags wake missed after late nights, with the comparison", () => {
    const d = base();
    // Late on the nights 5 and 3 days ago, wake missed the mornings after (4 and 2 days ago).
    d.logs = cleanDays(d, (_, ago) => ({ ...([5, 3].includes(ago) ? { bed: false as const } : {}), ...([4, 2].includes(ago) ? { wake: false as const } : {}) }));
    const f = detectFlags(d).find((x) => x.kind === "wake_after_late");
    expect(f).toBeTruthy();
    expect(f?.evidence[0]).toEqual({ label: "Night of Sep 30", value: "wake missed Oct 1" });
    expect(f?.detail).toMatch(/^Wake was missed after 2 of 2 late nights, and hit after \d+ of \d+ on time nights\.$/);
  });

  it("does not blame late nights when wake is missed just as often after on time nights", () => {
    const d = base();
    d.logs = cleanDays(d, (_, ago) => ({ ...([6, 4].includes(ago) ? { bed: false as const } : {}), ...(ago <= 20 ? { wake: false as const } : {}) }));
    expect(kinds(detectFlags(d))).not.toContain("wake_after_late");
  });
});

describe("vice patterns", () => {
  const slip = (ago: number, time: string, trigger: string | null, item = "vice_smoking"): ViceSlip =>
    row({ item_id: item, date: addDays(TODAY, -ago), time, trigger, amount: null });

  it("flags three slips in the same part of the day", () => {
    const d = base();
    d.slips = [slip(9, "22:10", null), slip(5, "23:40", "bored"), slip(2, "00:30", null), slip(7, "13:00", "lunch")];
    const f = detectFlags(d).find((x) => x.kind === "vice_pattern");
    expect(f?.title).toBe("Smoking slips cluster late at night");
    expect(f?.detail).toBe("In the last 14 days, 3 of 4 slips came late at night (9 PM to 5 AM).");
    expect(f?.evidence).toHaveLength(3);
    expect(f?.evidence[0]).toEqual({ label: "Sep 26, 10:10 PM", value: "no trigger logged" });
  });

  it("flags a shared trigger, ignoring case and spacing", () => {
    const d = base();
    d.slips = [slip(9, "09:00", "After  delivery shift"), slip(3, "15:00", "after delivery shift.")];
    const f = detectFlags(d).find((x) => x.kind === "vice_pattern");
    expect(f?.title).toBe('Smoking slips share a trigger: "after delivery shift"');
    expect(f?.change).toContain("after delivery shift");
  });

  it("keeps vices apart and ignores scattered or old slips", () => {
    const d = base();
    d.slips = [slip(9, "22:10", "a"), slip(5, "23:40", "b", "vice_drinking"), slip(2, "22:30", "c", "vice_masturbation"), slip(20, "22:00", "a"), slip(19, "22:00", "a")];
    expect(kinds(detectFlags(d))).not.toContain("vice_pattern");
  });

  it("puts times in the right part of the day", () => {
    expect(dayPart("04:59").name).toBe("late night");
    expect(dayPart("05:00").name).toBe("morning");
    expect(dayPart("12:00").name).toBe("afternoon");
    expect(dayPart("17:00").name).toBe("evening");
    expect(dayPart("21:00").name).toBe("late night");
  });
});

describe("lifts dropping", () => {
  const set = (date: string, exercise: string, weight: number | null, reps: number, n = 1): SetLog => row({ date, exercise, set_number: n, weight, reps });

  it("flags a lift whose best set fell two weeks in a row", () => {
    const d = base();
    d.setLogs = [
      set("2026-09-14", "Bench press", 185, 6), set("2026-09-14", "Bench press", 185, 5, 2),
      set("2026-09-21", "Bench press", 180, 6),
      set("2026-09-28", "Bench press", 175, 5),
      set("2026-09-15", "Back squat", 225, 6), set("2026-09-22", "Back squat", 230, 6), set("2026-09-29", "Back squat", 235, 6),
    ];
    const flags = detectFlags(d).filter((x) => x.kind === "lift_drop");
    expect(flags).toHaveLength(1);
    expect(flags[0].title).toBe("Bench press down two weeks in a row");
    expect(flags[0].evidence).toEqual([
      { label: "Week of Sep 14", value: "185 lb x 6 on Sep 14" },
      { label: "Week of Sep 21", value: "180 lb x 6 on Sep 21" },
      { label: "Week of Sep 28", value: "175 lb x 5 on Sep 28" },
    ]);
  });

  it("needs three weeks in a row, and the drop has to be recent", () => {
    const gap = base();
    gap.setLogs = [set("2026-09-07", "Bench press", 185, 6), set("2026-09-21", "Bench press", 180, 6), set("2026-09-28", "Bench press", 175, 6)];
    expect(detectFlags(gap)).toEqual([]);
    const stale = base();
    stale.setLogs = [set("2026-08-31", "Bench press", 185, 6), set("2026-09-07", "Bench press", 180, 6), set("2026-09-14", "Bench press", 175, 6)];
    expect(detectFlags(stale)).toEqual([]);
  });

  it("does not flag one down week or a recovery", () => {
    const d = base();
    d.setLogs = [set("2026-09-14", "Bench press", 185, 6), set("2026-09-21", "Bench press", 175, 6), set("2026-09-28", "Bench press", 180, 6)];
    expect(detectFlags(d)).toEqual([]);
  });

  it("treats fewer reps at the same weight as a drop, and compares bodyweight lifts by reps", () => {
    const d = base();
    d.setLogs = [
      set("2026-09-14", "Bench press", 185, 8), set("2026-09-21", "Bench press", 185, 6), set("2026-09-28", "Bench press", 185, 4),
      set("2026-09-17", "Pull up", null, 10), set("2026-09-24", "Pull up", null, 8), set("2026-10-01", "Pull up", 0, 6),
    ];
    const flags = detectFlags(d).filter((x) => x.kind === "lift_drop");
    expect(flags.map((f) => f.key)).toEqual(["lift_drop:bench press", "lift_drop:pull up"]);
    expect(flags[1].evidence[2].value).toBe("6 reps on Oct 1");
  });
});

describe("hourly rate falling on one app", () => {
  const earn = (ago: number, app: string, amount: number, hours: number | null): Earning => row({ date: addDays(TODAY, -ago), amount, app, hours, screenshot_url: null });

  it("flags three falling days and names the app that pays more", () => {
    const d = base();
    d.earnings = [earn(6, "DoorDash", 72, 3), earn(4, "DoorDash", 60, 3), earn(1, "DoorDash", 48, 3), earn(4, "Uber Eats", 46, 2), earn(2, "Uber Eats", 50, 2)];
    const f = detectFlags(d).find((x) => x.kind === "rate_drop");
    expect(f?.title).toBe("DoorDash hourly rate is falling");
    expect(f?.detail).toBe("$24/h, then $20/h, then $16/h over the last three DoorDash days. Uber Eats paid $24/h over the same stretch.");
    expect(f?.evidence[2]).toEqual({ label: "Oct 4", value: "$16/h ($48 in 3h)" });
    expect(f?.change).toContain("Uber Eats first");
  });

  it("ignores small dips, entries without hours, and a rate that bounced", () => {
    const small = base();
    small.earnings = [earn(6, "DoorDash", 72, 3), earn(4, "DoorDash", 70, 3), earn(1, "DoorDash", 68, 3)];
    expect(detectFlags(small)).toEqual([]);
    const noHours = base();
    noHours.earnings = [earn(6, "DoorDash", 72, null), earn(4, "DoorDash", 60, null), earn(1, "DoorDash", 48, null)];
    expect(detectFlags(noHours)).toEqual([]);
    const bounce = base();
    bounce.earnings = [earn(6, "DoorDash", 72, 3), earn(4, "DoorDash", 45, 3), earn(1, "DoorDash", 60, 3)];
    expect(detectFlags(bounce)).toEqual([]);
  });
});

describe("the fixture", () => {
  it("contains every pattern, in priority order", () => {
    const flags = detectFlags(fixtureData());
    expect(kinds(flags)).toEqual(["earned_under", "protein_under", "lift_drop", "wake_after_late", "bed_missed", "vice_pattern", "rate_drop"]);
    expect(flags.find((f) => f.kind === "protein_under")?.title).toBe("Protein under 180g 4 days running");
    expect(flags.find((f) => f.kind === "lift_drop")?.key).toBe("lift_drop:bench press");
    expect(flags.find((f) => f.kind === "vice_pattern")?.title).toBe('Smoking slips: late night, "after delivery shift"');
    expect(flags.find((f) => f.kind === "rate_drop")?.key).toBe("rate_drop:doordash");
    for (const f of flags) {
      expect(f.evidence.length).toBeGreaterThanOrEqual(2);
      expect(`${f.title} ${f.detail} ${f.change} ${JSON.stringify(f.evidence)}`).not.toMatch(DASHES);
    }
  });

  it("detects the same patterns whatever weekday today is", () => {
    for (let i = 0; i < 7; i++) {
      const flags = detectFlags(fixtureData(addDays(TODAY, i)));
      expect(new Set(kinds(flags)).size).toBe(7);
    }
  });
});

describe("buildSnapshot", () => {
  it("scores yesterday with real numbers and leaves last night's bedtime pending", () => {
    const data = fixtureData();
    const s = buildSnapshot(data, detectFlags(data));
    expect(s.today).toMatchObject({ dayNumber: 23, lengthDays: 30, phase: "active", weekday: "Monday", label: "Monday, Oct 5" });
    expect(s.yesterday?.pending).toEqual(["In bed on time"]);
    const misses = s.yesterday?.misses ?? [];
    expect(misses.map((m) => m.key)).toEqual(["protein", "earned"]);
    expect(misses[0]).toMatchObject({ logged: "148g", target: "180g or more", gap: "32g under", state: "off" });
    expect(misses[1]).toMatchObject({ logged: "$85", gap: "$15 under" });
    expect(s.yesterday?.done).toBe(9);
    expect(s.yesterday?.total).toBe(12);
  });

  it("puts the money position in plain numbers", () => {
    const data = fixtureData();
    const s = buildSnapshot(data, []);
    const total = data.earnings.reduce((n, e) => n + e.amount, 0);
    expect(s.money.total).toBeCloseTo(total, 2);
    expect(s.money.daysLeft).toBe(5);
    expect(s.money.state).toBe("active");
    expect(s.money.neededPerDay).toBe(Math.ceil((3000 - total) / 5));
    expect(s.money.earnedYesterday).toBe(85);
    expect(s.money.apps.map((a) => a.app)).toContain("DoorDash");
  });

  it("carries the plan, the workout, lifts, macros and slips", () => {
    const data = fixtureData();
    const s = buildSnapshot(data, detectFlags(data));
    expect(s.plan.workout?.name).toBe("Upper A");
    expect(s.plan.workout?.exercises[0]).toBe("Bench press 4 x 6 to 8");
    expect(s.plan.blocks[1]).toEqual({ name: "Lift + core", kind: "workout", start: "6:30 AM", end: "7:30 AM" });
    expect(s.lifts.find((l) => l.exercise === "Bench press")?.sessions.map((x) => x.top)).toEqual(["185 lb x 6", "180 lb x 6", "175 lb x 5"]);
    expect(s.macros.days).toHaveLength(7);
    expect(s.macros.days[5]).toMatchObject({ protein: 148, date: "2026-10-04" });
    expect(s.macros.days[5].carbs).toBeGreaterThan(100);
    expect(s.macros.targets.protein).toBe("180g or more");
    expect(s.vices.find((v) => v.name === "smoking")?.slips).toHaveLength(4);
    expect(s.items.find((i) => i.key === "protein")).toMatchObject({ streak: 0, hits7: 3, days7: 7 });
    expect(s.flags).toHaveLength(7);
    expect(s.weight.change).toMatch(/^down \d(\.\d)? lb since/);
    expect(s.days).toHaveLength(14);
  });

  it("handles day 1 and the days before it", () => {
    const one = buildSnapshot(base(TODAY, TODAY), []);
    expect(one.yesterday).toBeNull();
    expect(one.days).toEqual([]);
    expect(one.today.dayNumber).toBe(1);
    expect(one.money.earnedYesterday).toBeNull();
    const before = buildSnapshot(base(TODAY, addDays(TODAY, 2)), []);
    expect(before.today.phase).toBe("before");
    expect(before.items).toEqual([]);
  });
});

describe("ongoing mode and challenge mode", () => {
  it("names the challenge and its day count while one is running", () => {
    const s = buildSnapshot(fixtureData(), []);
    expect(s.today).toMatchObject({ mode: "challenge", challenge: "30 day lock in", dayNumber: 23, lengthDays: 30, daysLeft: 7 });
    expect(s.days[s.days.length - 1].dayNumber).toBe(22);
  });

  it("has no day count in ongoing mode, and keeps the whole history", () => {
    const data = { ...fixtureData(), challenge: null };
    const s = buildSnapshot(data, detectFlags(data));
    expect(s.today).toMatchObject({ mode: "ongoing", challenge: null, dayNumber: null, lengthDays: null, daysLeft: null, phase: "active" });
    expect(s.days).toHaveLength(14);
    expect(s.days.every((d) => d.dayNumber === null)).toBe(true);
    // Same days, same scores, same streaks as with the challenge on top.
    const withChallenge = buildSnapshot(fixtureData(), []);
    expect(s.days.map((d) => [d.date, d.status, d.done])).toEqual(withChallenge.days.map((d) => [d.date, d.status, d.done]));
    expect(s.items).toEqual(withChallenge.items);
    expect(s.vices).toEqual(withChallenge.vices);
    expect(s.week).toEqual(withChallenge.week);
  });

  it("keeps scoring after a challenge has ended, with streaks running across the end", () => {
    const data = fixtureData();
    const ended: CoachData = { ...data, challenge: { ...(data.challenge as Challenge), status: "ended", ended_on: addDays(TODAY, -5) } };
    const s = buildSnapshot(ended, []);
    expect(s.today.mode).toBe("ongoing");
    expect(s.yesterday?.date).toBe(addDays(TODAY, -1));
    expect(s.items).toEqual(buildSnapshot(data, []).items);
  });

  it("speaks of money as a floor only when there is no target", () => {
    const data: CoachData = { ...fixtureData(), challenge: null, floor: 120 };
    const s = buildSnapshot(data, []);
    expect(s.money).toMatchObject({ target: 0, state: "active", floor: 120, neededPerDay: null, daysLeft: 0 });
    expect(morningFallback(s)).toMatch(/Money: \$[\d,.]+ so far\. Floor is \$120 today\./);
    const noTarget: CoachData = { ...fixtureData(), challenge: { ...(fixtureData().challenge as Challenge), money_target: null, money_deadline: null } };
    expect(buildSnapshot(noTarget, []).money.target).toBe(0);
  });

  it("counts full days over the last 30 so one slip is one day, not a restart", () => {
    const d = base(TODAY, "2026-08-01");
    d.challenge = null;
    d.logs = cleanDays(d, (_date, ago) => (ago === 3 ? { workout: false } : {}));
    const s = buildSnapshot(d, []);
    expect(s.today.consistency).toEqual({ full: 29, days: 30, window: 30, label: "29 of the last 30 days" });
    const text = morningFallback(s);
    expect(text).toContain("Consistency: 29 of the last 30 days locked in.");
    expect(text).not.toMatch(/Day \d/);
    expect(unknownNumbers(text, s)).toEqual([]);
  });

  it("reads focus minutes per day when sessions are passed in", () => {
    const d = base();
    d.settings = { carbs_target: 180, fat_target: 60, weight_unit: "lb", focus_goal_minutes: 90 };
    d.focus = [
      row({ date: TODAY, start: "09:00", end: "09:50", minutes: 50, label: "Stats", source: "timer" as const, block_id: null }),
      row({ date: TODAY, start: "14:00", end: "14:30", minutes: 30, label: null, source: "manual" as const, block_id: null }),
    ];
    const s = buildSnapshot(d, []);
    expect(s.focus.goalMinutes).toBe(90);
    expect(s.focus.days[s.focus.days.length - 1]).toEqual({ date: TODAY, label: "Oct 5", minutes: 80 });
    expect(buildSnapshot(base(), []).focus.days.every((x) => x.minutes === 0)).toBe(true);
  });
});

describe("buildWeek and the one change", () => {
  it("rolls the week up per item", () => {
    const data = fixtureData();
    const w = buildWeek(data, "2026-10-04");
    expect(w).toMatchObject({ start: "2026-09-28", end: "2026-10-04", label: "Sep 28 to Oct 4", daysScored: 7 });
    expect(w.full + w.partial + w.missed).toBe(7);
    expect(w.items.find((i) => i.key === "protein")).toMatchObject({ hits: 3, of: 7 });
    expect(w.items.find((i) => i.key === "protein")?.note).toMatch(/^averaged \d+g on 7 logged days, target 180g or more$/);
    expect(w.held).toContain("Workout");
    expect(w.slipped[0]).toBe("Protein");
    expect(w.items.find((i) => i.key === "bed")).toMatchObject({ hits: 3, of: 6 });
    expect(w.slips).toEqual([{ vice: "smoking", count: 2 }]);
    expect(w.floorDays).toBe(4);
    expect(w.weightChange).toMatch(/^down /);
  });

  it("only scores days inside the challenge and up to today", () => {
    const data = fixtureData("2026-10-07");
    expect(buildWeek(data, "2026-10-07").daysScored).toBe(3);
    const early = base(TODAY, "2026-10-01");
    expect(buildWeek(early, "2026-10-04").daysScored).toBe(4);
  });

  it("picks the top flag's change, else the most missed item, else nothing", () => {
    const flag = { change: "Do the thing." };
    const items = [
      { key: "study", name: "Study", hits: 5, of: 7, note: null },
      { key: "bed", name: "In bed on time", hits: 2, of: 7, note: null },
    ];
    expect(pickChange([flag], { items })).toBe("Do the thing.");
    expect(pickChange([], { items })).toContain("30 minutes before bed");
    expect(pickChange([], { items: [{ key: null, name: "Read", hits: 1, of: 7, note: null }] })).toBe('Give "Read" a fixed time on the schedule every day next week.');
    expect(pickChange([], { items: [{ key: "study", name: "Study", hits: 7, of: 7, note: null }] })).toContain("Nothing in the data");
  });
});

describe("fallback writing", () => {
  it("writes a morning brief with the plan, the misses, the money and the top flag", () => {
    const data = fixtureData();
    const s = buildSnapshot(data, detectFlags(data));
    const text = morningFallback(s);
    const lines = text.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("Today: Upper A at 6:30 AM, class 9:30 AM to 4:00 PM, delivery 7:00 to 8:00 PM and study at 8:00 PM.");
    expect(lines[1]).toBe("Yesterday: 9 of 12. Missed protein (148g, 32g under) and earnings ($85, $15 under). Still to check: in bed on time.");
    expect(lines[2]).toMatch(/^Money: \$[\d,.]+ of \$3,000, 5 days left through Oct 9\. /);
    expect(lines[3]).toBe("Watch: under the $100 floor 3 days running. 6 more flags in Coach.");
    expect(text).not.toMatch(DASHES);
    expect(wordCount(text)).toBeLessThan(90);
    expect(unknownNumbers(text, s)).toEqual([]);
  });

  it("covers day 1, a clean yesterday, and the money states", () => {
    const one = base(TODAY, TODAY);
    expect(morningFallback(buildSnapshot(one, []))).toContain("Yesterday: nothing behind you yet. This is day 1.");

    const clean = base();
    clean.logs = cleanDays(clean);
    clean.earnings = [row({ date: addDays(TODAY, -1), amount: 1200, app: "DoorDash", hours: 5, screenshot_url: null })];
    const text = morningFallback(buildSnapshot(clean, []));
    expect(text).toContain("Yesterday: 12 of 12, nothing missed.");
    expect(text).toContain("Money: $1,200, past the $1,000 target. The $100 floor still stands today.");
    expect(text).not.toContain("Watch:");

    const behind = base();
    behind.challenge!.money_deadline = addDays(TODAY, 1);
    expect(morningFallback(buildSnapshot(behind, []))).toContain("That takes $500 a day, so the $100 floor is not enough right now.");

    const past = base();
    past.challenge!.money_deadline = addDays(TODAY, -1);
    expect(morningFallback(buildSnapshot(past, []))).toContain("Oct 4 has passed. Set a new target in Money.");

    const idle = base();
    expect(morningFallback(buildSnapshot(idle, []))).toContain("Yesterday: nothing logged.");
  });

  it("writes a weekly review that ends in exactly one change", () => {
    const data = fixtureData();
    const flags = detectFlags(data);
    const s = buildSnapshot(data, flags, { weekOf: "2026-10-04" });
    const text = weeklyFallback(s);
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^Sep 28 to Oct 4: /);
    expect(lines[1]).toMatch(/^Held: workout, /);
    expect(lines[2]).toMatch(/^Slipped: protein 3 of 7 \(averaged \d+g on 7 logged days, target 180g or more\); wake time 4 of 7; earnings 4 of 7\.$/);
    expect(lines[3]).toMatch(/earned, floor hit 4 of 7 days, 2 smoking slips, weight down/);
    expect(lines[4]).toBe(`One change: ${flags[0].change}`);
    expect(text.match(/One change:/g)).toHaveLength(1);
    expect(text).not.toMatch(DASHES);
    expect(unknownNumbers(text, s)).toEqual([]);
  });

  it("says so when a week has no scored days", () => {
    const s = buildSnapshot(base(TODAY, addDays(TODAY, 2)), []);
    expect(weeklyFallback(s)).toBe("No scored days in this week yet.");
    expect(morningFallback(s)).toContain("Nothing is scored yet");
  });
});

describe("the prompt", () => {
  const data = fixtureData();
  const s = buildSnapshot(data, detectFlags(data));

  it("holds the model to the data and bans dashes without containing any", () => {
    for (const kind of ["morning", "weekly"] as const) {
      const p = coachPrompt(kind, s);
      expect(`${p.system}${p.user}`).not.toMatch(DASHES);
      expect(p.system).toContain("Never use an em dash or an en dash");
      expect(p.system).toContain("Use only what is in the data block");
      expect(p.system).toContain("No moralizing about the vices");
      expect(p.user).toContain(JSON.stringify(s));
    }
    expect(coachPrompt("morning", s).user).toContain("15 seconds");
    expect(coachPrompt("weekly", s).user).toContain("Exactly one");
    expect(correctionPrompt([42, 7.5])).toContain("42, 7.5");
  });

  it("accepts a real snapshot after a JSON round trip and rejects junk", () => {
    expect(isSnapshot(JSON.parse(JSON.stringify(s)))).toBe(true);
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot({ version: 1 })).toBe(false);
    expect(isSnapshot({ ...s, version: 2 })).toBe(false);
  });
});

describe("text guards", () => {
  it("removes em and en dashes and markdown", () => {
    expect(cleanCoachText("Lift at 6:30 \u2014 then class. Eat 1,900\u20132,100 kcal.")).toBe("Lift at 6:30, then class. Eat 1,900 to 2,100 kcal.");
    expect(cleanCoachText("- **Held:** workout\n\n\n\n* Slipped: bed")).toBe("Held: workout\n\nSlipped: bed");
    expect(cleanCoachText("\u201cOne change\u201d \u2013 it\u2019s bed.")).toBe('"One change", it\'s bed.');
    expect(cleanCoachText("a\u2014b \u2013 c")).not.toMatch(DASHES);
  });

  it("finds numbers the snapshot does not contain", () => {
    const snap = { total: 640, target: "$1,000", time: "6:30 AM", date: "2026-10-14", protein: 148.5 };
    expect(numbersIn("$1,000 and 2,050 kcal at 6:30, 148.5g")).toEqual([1000, 2050, 6, 30, 148.5]);
    expect(unknownNumbers("You are at $640 of $1,000. Lift at 6:30. Three days left to Oct 14.", snap)).toEqual([]);
    expect(unknownNumbers("You are at $650 and need $72 a day.", snap)).toEqual([650, 72]);
    expect(unknownNumbers("Fifteen days in, 9 of 10 done.", snap)).toEqual([15]);
  });
});

describe("flag notes", () => {
  const flag = (key: string, title = key): Flag => ({ key, kind: "protein_under", title, detail: "d", change: "c", evidence: [{ label: "Oct 4", value: "148g" }], since: "2026-10-02" });
  const note = (body: string, id: string): CoachNote => ({ id, created_at: CREATED, date: "2026-10-03", kind: "flag", body, source: "fallback" });
  const stored = (key: string, id: string, extra: Partial<{ dismissed_on: string; resolved_on: string }> = {}) =>
    note(encodeFlagNote({ v: 1, flag: flag(key), dismissed_on: extra.dismissed_on ?? null, resolved_on: extra.resolved_on ?? null }), id);

  it("round trips and rejects anything that is not a flag note", () => {
    expect(parseFlagNote(encodeFlagNote({ v: 1, flag: flag("a"), dismissed_on: null, resolved_on: null }))?.flag.key).toBe("a");
    expect(parseFlagNote("plain text")).toBeNull();
    expect(parseFlagNote('{"x":1}')).toBeNull();
  });

  it("inserts new flags and leaves unchanged ones alone", () => {
    const r = reconcileFlags([flag("a"), flag("b")], [stored("a", "n1")], TODAY);
    expect(r.update).toEqual([]);
    expect(r.insert).toHaveLength(1);
    expect(r.insert[0]).toMatchObject({ date: TODAY, kind: "flag", source: "fallback" });
    expect(parseFlagNote(r.insert[0].body)?.flag.key).toBe("b");
  });

  it("refreshes evidence and keeps a dismissal", () => {
    const r = reconcileFlags([flag("a", "new title")], [stored("a", "n1", { dismissed_on: "2026-10-04" })], TODAY);
    expect(r.insert).toEqual([]);
    const body = parseFlagNote(r.update[0].body);
    expect(body).toMatchObject({ dismissed_on: "2026-10-04", resolved_on: null });
    expect(body?.flag.title).toBe("new title");
  });

  it("resolves flags that cleared, and a returning pattern is a new flag", () => {
    const cleared = reconcileFlags([], [stored("a", "n1", { dismissed_on: "2026-10-04" })], TODAY);
    expect(parseFlagNote(cleared.update[0].body)?.resolved_on).toBe(TODAY);
    const back = reconcileFlags([flag("a")], [stored("a", "n1", { dismissed_on: "2026-10-01", resolved_on: "2026-10-02" })], TODAY);
    expect(back.insert).toHaveLength(1);
    expect(back.update).toEqual([]);
  });

  it("shows only flags that are live and not dismissed", () => {
    const notes = [stored("a", "n1"), stored("b", "n2", { dismissed_on: TODAY }), stored("c", "n3", { resolved_on: TODAY }), { ...note("hello", "n4"), kind: "morning" as const }];
    expect(activeFlagNotes(notes).map((n) => n.id)).toEqual(["n1"]);
  });
});

describe("reviewDue", () => {
  const c = "2026-10-05";
  it("is on request on Sunday and automatic from 8 PM", () => {
    expect(reviewDue("2026-10-11", "09:00", c)).toEqual({ weekEnd: "2026-10-11", weekStart: "2026-10-05", auto: false });
    expect(reviewDue("2026-10-11", "20:00", c)?.auto).toBe(true);
  });
  it("covers the week that just ended on any other day", () => {
    expect(reviewDue("2026-10-14", "07:00", c)).toEqual({ weekEnd: "2026-10-11", weekStart: "2026-10-05", auto: true });
  });
  it("is null before the first week ends, and never stops after that", () => {
    expect(reviewDue("2026-10-05", "07:00", c)).toBeNull();
    expect(reviewDue("2026-10-10", "07:00", c)).toBeNull();
    expect(reviewDue("2026-11-08", "07:00", c)?.weekEnd).toBe("2026-11-08");
    expect(reviewDue("2026-11-10", "07:00", c)?.weekEnd).toBe("2026-11-08");
    // The first challenge ended on Nov 3. The history is ongoing, so reviews keep coming.
    expect(reviewDue("2026-11-17", "07:00", c)?.weekEnd).toBe("2026-11-15");
    expect(reviewDue("2027-03-03", "07:00", c)?.weekEnd).toBe("2027-02-28");
  });
});
