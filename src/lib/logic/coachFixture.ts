// Demo data for the coach: about three weeks of realistic logs that contain
// every pattern the rules look for. Used by the tests and by the dev-only
// page at /coach/dev. Nothing in the shipped app imports this file.
//
// Patterns planted, all relative to `today`:
// - protein under target the last 4 days
// - earnings under the floor the last 3 days
// - bedtime missed 4 of the last 7 scored nights, wake missed after 3 of them
// - bench press best set down two weeks in a row (other lifts steady or up)
// - smoking slips late at night, mostly after a delivery shift
// - DoorDash hourly rate falling over its last three days, Uber Eats steady

import type { Challenge, ChecklistItem, DateStr, NewRow, Workout } from "../types";
import { addDays, dateRange, nyInstant, weekdayOf } from "./dates";

export const FIXTURE_DAYS = 22;

export interface CoachFixture {
  challenge: Pick<Challenge, "start_date" | "length_days" | "money_target" | "money_deadline" | "daily_floor">;
  day_log: NewRow<"day_log">[];
  earning: NewRow<"earning">[];
  meal: NewRow<"meal">[];
  set_log: NewRow<"set_log">[];
  vice_slip: NewRow<"vice_slip">[];
  body_log: NewRow<"body_log">[];
}

/** Small repeatable generator so the same day always gets the same numbers. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildCoachFixture(today: DateStr, items: readonly ChecklistItem[], workouts: readonly Workout[]): CoachFixture {
  const start = addDays(today, -FIXTURE_DAYS);
  const yesterday = addDays(today, -1);
  const days = dateRange(start, yesterday);
  const ago = (d: DateStr) => days.length - days.indexOf(d); // 1 is yesterday
  const id = (key: string) => items.find((i) => i.key === key)?.id ?? null;
  const rand = seeded(20261005);
  const at = (date: DateStr, time: string) => nyInstant(date, time).toISOString();

  const fx: CoachFixture = {
    challenge: { start_date: start, length_days: 30, money_target: 3000, money_deadline: addDays(today, 4), daily_floor: 100 },
    day_log: [],
    earning: [],
    meal: [],
    set_log: [],
    vice_slip: [],
    body_log: [],
  };

  const check = (key: string, date: DateStr, time = "21:30", onDate: DateStr = date) => {
    const item = id(key);
    if (item) fx.day_log.push({ date, item_id: item, value: null, checked: true, text: null, completed_at: at(onDate, time) });
  };
  const value = (key: string, date: DateStr, n: number) => {
    const item = id(key);
    if (item) fx.day_log.push({ date, item_id: item, value: n, checked: true, text: null, completed_at: at(date, "21:00") });
  };

  // Nights the bedtime was missed, counted back from today. 1 is last night,
  // which stays unticked because it gets ticked this morning.
  const lateNights = new Set([3, 4, 6, 8]);
  // Mornings after 3 of those 4 nights were missed too.
  const lateWakes = new Set([2, 3, 5]);
  const smokeSlips: Record<number, [string, string]> = {
    12: ["22:40", "After delivery shift"],
    9: ["23:15", "after delivery shift"],
    6: ["22:05", "Bored, scrolling"],
    2: ["23:30", "After delivery shift"],
  };
  const proteinLow: Record<number, number> = { 4: 152, 3: 139, 2: 161, 1: 148 };
  const earnedLow: Record<number, number> = { 3: 72, 2: 78, 1: 85 };
  // DoorDash: last three worked days falling. [days ago, amount, hours]
  const doorDashLast: Record<number, [number, number]> = { 5: [72, 3], 3: [60, 3], 1: [48, 3] };
  const businessMoves = ["Emailed two advisors about a pilot", "Followed up with a med spa lead", "Sent the investor update", "Booked a demo for Thursday", "Wrote the cohort outline"];

  for (const d of days) {
    const n = ago(d);
    const wd = weekdayOf(d);

    // Wake: on time unless it followed one of the late nights.
    if (lateWakes.has(n)) check("wake", d, "07:05");
    else check("wake", d, "05:48");

    check("workout", d, "07:35");
    if (n !== 10) check("core", d, "07:40");
    if (n !== 7 && n !== 13) check("study", d, "22:45");
    if (n !== 11) {
      const item = id("business");
      if (item) fx.day_log.push({ date: d, item_id: item, value: null, checked: true, text: businessMoves[n % businessMoves.length], completed_at: at(d, "20:10") });
    }
    // Bed for night d is ticked the next morning. Last night is still open.
    if (n > 1 && !lateNights.has(n)) check("bed", d, "05:50", addDays(d, 1));

    // Vices.
    if (!smokeSlips[n]) check("vice_smoking", d, "22:50");
    else {
      const smoking = id("vice_smoking");
      if (smoking) fx.vice_slip.push({ item_id: smoking, date: d, time: smokeSlips[n][0], trigger: smokeSlips[n][1], amount: null });
    }
    if (n === 15) {
      const drinking = id("vice_drinking");
      if (drinking) fx.vice_slip.push({ item_id: drinking, date: d, time: "20:30", trigger: "Out with friends", amount: null });
    } else check("vice_drinking", d, "22:50");
    check("vice_masturbation", d, "22:50");

    // Food. Three meals a day that add up to the logged totals.
    const protein = proteinLow[n] ?? 182 + Math.floor(rand() * 16);
    const calories = n === 9 ? 2340 : 1920 + Math.floor(rand() * 160);
    value("protein", d, protein);
    value("calories", d, calories);
    const carbs = Math.round((calories * 0.36) / 4);
    const fat = Math.round((calories - protein * 4 - carbs * 4) / 9);
    const split = [0.3, 0.35, 0.35];
    const names = ["Eggs, oats and a shake", "Chicken, rice and greens", "Steak, potatoes and salad"];
    const times = ["08:10", "13:20", "19:40"];
    split.forEach((share, i) => {
      fx.meal.push({
        date: d,
        time: times[i],
        name: names[i],
        photo_url: null,
        calories: Math.round(calories * share),
        protein: Math.round(protein * share),
        carbs: Math.round(carbs * share),
        fat: Math.round(fat * share),
      });
    });

    // Money. DoorDash and Uber Eats most days, Instacart on weekends.
    let total = 0;
    const earn = (app: string, amount: number, hours: number) => {
      fx.earning.push({ date: d, amount, app, hours, screenshot_url: null });
      total += amount;
    };
    if (earnedLow[n] !== undefined) {
      const dd = doorDashLast[n];
      if (dd) {
        earn("DoorDash", dd[0], dd[1]);
        earn("Uber Eats", Math.round((earnedLow[n] - dd[0]) * 100) / 100, n === 1 ? 1.5 : 0.5);
      } else {
        earn("Uber Eats", earnedLow[n], 3.5);
      }
    } else if (doorDashLast[n]) {
      earn("DoorDash", doorDashLast[n][0], doorDashLast[n][1]);
      earn("Uber Eats", 46, 2);
    } else {
      const ddHours = 3 + Math.floor(rand() * 2);
      earn("DoorDash", Math.round(ddHours * (23 + rand() * 4)), ddHours);
      earn("Uber Eats", Math.round(2 * (22 + rand() * 3)), 2);
      if (wd === 6 || wd === 0) earn("Instacart", 38 + Math.floor(rand() * 20), 1.5);
    }
    value("earned", d, Math.round(total * 100) / 100);

    // Lifts: log the day's main workout when it is a lift.
    const main = workouts.find((w) => w.weekday === wd && w.slot === "main" && w.kind === "lift");
    if (main) {
      const week = Math.floor((n - 1) / 7); // 0 is the most recent week
      main.exercises.forEach((ex, ei) => {
        const base = [185, 135, 95, 120, 30, 50, 225, 185, 60][ei % 9];
        const isBench = ex.name === "Bench press";
        // Bench: 185 x 6, then 180 x 6, then 175 x 5. Everything else creeps up.
        const weight = isBench ? [175, 180, 185, 185][Math.min(week, 3)] : base + (3 - Math.min(week, 3)) * 5 - 10;
        const reps = isBench ? [5, 6, 6, 6][Math.min(week, 3)] : 8;
        for (let set = 1; set <= ex.sets; set++) {
          fx.set_log.push({ date: d, exercise: ex.name, set_number: set, weight, reps });
        }
      });
    }

    // Friday weigh-in.
    if (wd === 5) {
      const w = Math.round((188.6 + n * 0.17) * 10) / 10;
      fx.body_log.push({ date: d, weight: w, photo_url: null });
      value("weighin", d, w);
    }
    if (wd === 3) check("talk", d, "15:00");
  }

  return fx;
}
