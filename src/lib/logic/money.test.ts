import { describe, expect, it } from "vitest";
import {
  canResetTarget,
  daysLeft,
  floorStatus,
  formatMoney,
  groupByDay,
  hourlyRate,
  neededPerDay,
  normalizeApp,
  parseEarningRead,
  runningTotal,
  stripDashes,
  surplusBanked,
  targetState,
  totalForDate,
  totalsByDate,
  validNewTarget,
  workDaysLeft,
  type EarningLike,
} from "./money";

const e = (date: string, amount: number, hours: number | null = null): EarningLike => ({ date, amount, hours });

const week: EarningLike[] = [
  e("2026-10-05", 60, 2),
  e("2026-10-05", 80.5, 3),
  e("2026-10-06", 70, 2.5),
  e("2026-10-07", 100, null),
  e("2026-10-08", 210, 6),
];

describe("totals", () => {
  it("sums a date", () => {
    expect(totalForDate(week, "2026-10-05")).toBe(140.5);
    expect(totalForDate(week, "2026-10-09")).toBe(0);
  });
  it("does not drift on decimals", () => {
    expect(totalForDate([e("2026-10-05", 0.1), e("2026-10-05", 0.2)], "2026-10-05")).toBe(0.3);
  });
  it("totals by date", () => {
    expect([...totalsByDate(week)]).toEqual([
      ["2026-10-05", 140.5],
      ["2026-10-06", 70],
      ["2026-10-07", 100],
      ["2026-10-08", 210],
    ]);
  });
  it("running total counts from the start date on", () => {
    expect(runningTotal(week)).toBe(520.5);
    expect(runningTotal(week, "2026-10-06")).toBe(380);
    expect(runningTotal(week, "2026-10-06", "2026-10-07")).toBe(170);
    expect(runningTotal([])).toBe(0);
  });
});

describe("days left", () => {
  it("counts whole days to the deadline", () => {
    expect(daysLeft("2026-10-05", "2026-10-14")).toBe(9);
    expect(daysLeft("2026-10-14", "2026-10-14")).toBe(0);
    expect(daysLeft("2026-10-20", "2026-10-14")).toBe(0);
  });
  it("crosses a month and the clock change", () => {
    expect(daysLeft("2026-10-30", "2026-11-03")).toBe(4);
  });
  it("work days include today", () => {
    expect(workDaysLeft("2026-10-05", "2026-10-14")).toBe(10);
    expect(workDaysLeft("2026-10-14", "2026-10-14")).toBe(1);
    expect(workDaysLeft("2026-10-15", "2026-10-14")).toBe(0);
  });
});

describe("floor", () => {
  it("is short under the floor", () => {
    expect(floorStatus(60, 100)).toMatchObject({ met: false, short: 40, over: 0, progress: 0.6, floor: 100 });
  });
  it("is met at the floor and over it", () => {
    expect(floorStatus(100, 100)).toMatchObject({ met: true, short: 0, over: 0, progress: 1 });
    expect(floorStatus(210, 100)).toMatchObject({ met: true, short: 0, over: 110, progress: 1 });
  });
  it("never drops when ahead", () => {
    const ahead = floorStatus(20, 100, 900);
    expect(ahead.floor).toBe(100);
    expect(ahead.met).toBe(false);
    expect(ahead.short).toBe(80);
  });
  it("a zero floor is always met", () => {
    expect(floorStatus(0, 0).met).toBe(true);
  });
});

describe("surplus banked", () => {
  it("adds what is over the floor day by day", () => {
    // 40.5 on the 5th, 110 on the 8th. The short 6th takes nothing away.
    expect(surplusBanked(week, 100)).toBe(150.5);
  });
  it("respects the range", () => {
    expect(surplusBanked(week, 100, "2026-10-06")).toBe(110);
    expect(surplusBanked(week, 100, null, "2026-10-07")).toBe(40.5);
  });
  it("is zero with nothing over", () => {
    expect(surplusBanked([e("2026-10-05", 99)], 100)).toBe(0);
    expect(surplusBanked([], 100)).toBe(0);
  });
});

describe("hourly rate", () => {
  it("divides only entries that have hours", () => {
    // 60 + 80.5 + 70 + 210 over 13.5 hours. The 100 with no hours is left out.
    expect(hourlyRate(week)).toBe(31.15);
  });
  it("is null with no hours", () => {
    expect(hourlyRate([e("2026-10-05", 50), e("2026-10-05", 20, 0)])).toBeNull();
    expect(hourlyRate([])).toBeNull();
  });
});

describe("needed per day", () => {
  it("spreads what is left over the days left, today included", () => {
    expect(neededPerDay(1000, 400, "2026-10-09", "2026-10-14", 100)).toEqual({ remaining: 600, days: 6, perDay: 100, aim: 100 });
  });
  it("aims above the floor when behind", () => {
    expect(neededPerDay(1000, 100, "2026-10-12", "2026-10-14", 100)).toEqual({ remaining: 900, days: 3, perDay: 300, aim: 300 });
  });
  it("never aims under the floor when ahead", () => {
    const n = neededPerDay(1000, 900, "2026-10-05", "2026-10-14", 100);
    expect(n.perDay).toBe(10);
    expect(n.aim).toBe(100);
  });
  it("has nothing to aim for after the deadline", () => {
    expect(neededPerDay(1000, 700, "2026-10-15", "2026-10-14", 100)).toEqual({ remaining: 300, days: 0, perDay: null, aim: null });
  });
  it("is zero once hit", () => {
    expect(neededPerDay(1000, 1200, "2026-10-10", "2026-10-14", 100)).toMatchObject({ remaining: 0, perDay: 0, aim: 100 });
  });
});

describe("target state", () => {
  it("is active before the deadline and under target", () => {
    expect(targetState(1000, 500, "2026-10-14", "2026-10-14")).toBe("active");
    expect(canResetTarget("active")).toBe(false);
  });
  it("is hit at the target, even after the deadline", () => {
    expect(targetState(1000, 1000, "2026-10-08", "2026-10-14")).toBe("hit");
    expect(targetState(1000, 1500, "2026-10-20", "2026-10-14")).toBe("hit");
    expect(canResetTarget("hit")).toBe(true);
  });
  it("is past the day after the deadline", () => {
    expect(targetState(1000, 500, "2026-10-15", "2026-10-14")).toBe("past");
    expect(canResetTarget("past")).toBe(true);
  });
  it("checks a new target", () => {
    expect(validNewTarget(2000, "2026-11-03", 1000, "2026-10-15")).toBe(true);
    expect(validNewTarget(900, "2026-11-03", 1000, "2026-10-15")).toBe(false);
    expect(validNewTarget(2000, "2026-10-14", 1000, "2026-10-15")).toBe(false);
    expect(validNewTarget(null, "2026-11-03", 1000, "2026-10-15")).toBe(false);
    expect(validNewTarget(2000, "", 1000, "2026-10-15")).toBe(false);
  });
});

describe("group by day", () => {
  it("groups newest first with totals and rate", () => {
    const g = groupByDay(week);
    expect(g.map((d) => d.date)).toEqual(["2026-10-08", "2026-10-07", "2026-10-06", "2026-10-05"]);
    expect(g[3]).toMatchObject({ total: 140.5, hours: 5, rate: 28.1 });
    expect(g[3].entries).toHaveLength(2);
    expect(g[1].rate).toBeNull();
  });
});

describe("display", () => {
  it("formats money", () => {
    expect(formatMoney(1000)).toBe("$1,000");
    expect(formatMoney(42.5)).toBe("$42.50");
    expect(formatMoney(0)).toBe("$0");
  });
  it("strips long dashes", () => {
    expect(stripDashes("a \u2014 b \u2013 c")).toBe("a - b - c");
  });
});

describe("screenshot read", () => {
  it("normalizes the app", () => {
    expect(normalizeApp("doordash")).toBe("DoorDash");
    expect(normalizeApp("Door Dash Dasher")).toBe("DoorDash");
    expect(normalizeApp("UberEats")).toBe("Uber Eats");
    expect(normalizeApp("Uber Driver")).toBe("Uber Eats");
    expect(normalizeApp("instacart shopper")).toBe("Instacart");
    expect(normalizeApp("Lyft")).toBeNull();
    expect(normalizeApp(null)).toBeNull();
  });
  it("cleans a good read", () => {
    expect(parseEarningRead({ amount: "$1,084.256", app: "DOORDASH", hours: 3.5 })).toEqual({ amount: 1084.26, app: "DoorDash", hours: 3.5 });
  });
  it("falls back to minutes", () => {
    expect(parseEarningRead({ amount: 42, app: "uber eats", hours: null, minutes: 90 })).toEqual({ amount: 42, app: "Uber Eats", hours: 1.5 });
  });
  it("blanks what it cannot trust", () => {
    expect(parseEarningRead({ amount: -5, app: "?", hours: 40 })).toEqual({ amount: null, app: null, hours: null });
    expect(parseEarningRead("nope")).toEqual({ amount: null, app: null, hours: null });
    expect(parseEarningRead(null)).toEqual({ amount: null, app: null, hours: null });
  });
});
