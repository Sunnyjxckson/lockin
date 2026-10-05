import { describe, expect, it } from "vitest";
import type { BodyLog, Meal } from "../types";
import {
  budgetGoal,
  goalFromTarget,
  mealTotals,
  photoEntries,
  pickComparePhotos,
  remainingFor,
  remainingLabel,
  ringFor,
  weighInDateFor,
  weightChart,
  weightSeries,
  weightTrend,
} from "./body";

const meal = (date: string, calories: number, protein: number, carbs = 0, fat = 0): Meal => ({
  id: `${date}-${calories}`,
  created_at: "",
  date,
  time: "12:00",
  name: null,
  photo_url: null,
  calories,
  protein,
  carbs,
  fat,
});

const body = (date: string, weight: number | null, photo: string | null = null): BodyLog => ({
  id: date,
  created_at: "",
  date,
  weight,
  photo_url: photo,
});

describe("mealTotals", () => {
  it("sums only the given date", () => {
    const meals = [meal("2026-10-05", 600, 45, 50, 20), meal("2026-10-05", 450.5, 40.25, 30, 10), meal("2026-10-04", 900, 60)];
    expect(mealTotals(meals, "2026-10-05")).toEqual({ calories: 1050.5, protein: 85.3, carbs: 80, fat: 30 });
    expect(mealTotals(meals).calories).toBe(1950.5);
  });
  it("is zero for no meals and ignores bad numbers", () => {
    expect(mealTotals([], "2026-10-05")).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(mealTotals([{ ...meal("2026-10-05", 100, 10), fat: Number.NaN }]).fat).toBe(0);
  });
});

describe("goals", () => {
  it("reads checklist targets", () => {
    expect(goalFromTarget({ kind: "range", min: 1900, max: 2100 })).toEqual({ min: 1900, max: 2100 });
    expect(goalFromTarget({ kind: "min", min: 180 })).toEqual({ min: 180, max: null });
    expect(goalFromTarget({ kind: "check" })).toEqual({ min: null, max: null });
    expect(budgetGoal(200)).toEqual({ min: null, max: 200 });
    expect(budgetGoal(0)).toEqual({ min: null, max: null });
  });
});

describe("ringFor", () => {
  const cal = { min: 1900, max: 2100 };
  it("fills toward the minimum of a range", () => {
    expect(ringFor(0, cal)).toEqual({ percent: 0, fill: 0, state: "empty" });
    const half = ringFor(950, cal);
    expect(half.percent).toBeCloseTo(0.5);
    expect(half.state).toBe("under");
  });
  it("is met inside the range and over past the cap", () => {
    expect(ringFor(1900, cal).state).toBe("met");
    expect(ringFor(2100, cal).state).toBe("met");
    const over = ringFor(2280, cal);
    expect(over.state).toBe("over");
    expect(over.percent).toBeCloseTo(1.2);
    expect(over.fill).toBe(1);
  });
  it("a minimum is never over", () => {
    expect(ringFor(240, { min: 180, max: null }).state).toBe("met");
    expect(ringFor(240, { min: 180, max: null }).fill).toBe(1);
  });
  it("a budget is under until passed", () => {
    expect(ringFor(200, { min: null, max: 200 }).state).toBe("under");
    expect(ringFor(201, { min: null, max: 200 }).state).toBe("over");
  });
  it("has no state without a goal", () => {
    expect(ringFor(500, { min: null, max: null })).toEqual({ percent: 0, fill: 0, state: "none" });
  });
});

describe("remainingFor", () => {
  it("counts down to the minimum and shows room under the cap", () => {
    expect(remainingFor(1200, { min: 1900, max: 2100 })).toEqual({ left: 700, over: 0, room: 900 });
    expect(remainingFor(2000, { min: 1900, max: 2100 })).toEqual({ left: 0, over: 0, room: 100 });
    expect(remainingFor(2250, { min: 1900, max: 2100 })).toEqual({ left: 0, over: 150, room: 0 });
  });
  it("handles a minimum only", () => {
    expect(remainingFor(150, { min: 180, max: null })).toEqual({ left: 30, over: 0, room: null });
  });
  it("labels each state", () => {
    expect(remainingLabel(1200, { min: 1900, max: 2100 })).toBe("700 left");
    expect(remainingLabel(2000, { min: 1900, max: 2100 })).toBe("In range");
    expect(remainingLabel(2250, { min: 1900, max: 2100 })).toBe("150 over");
    expect(remainingLabel(190, { min: 180, max: null }, "g")).toBe("Done");
    expect(remainingLabel(50, { min: null, max: 200 }, "g")).toBe("150g left");
    expect(remainingLabel(50, { min: null, max: null })).toBe("No target");
  });
});

describe("weight", () => {
  const logs = [body("2026-10-16", 186.4), body("2026-10-09", 188), body("2026-10-12", null), body("2026-09-20", 195), body("2026-10-23", 185)];
  it("builds a sorted series inside the challenge", () => {
    const s = weightSeries(logs, "2026-10-05", 30);
    expect(s.map((p) => p.date)).toEqual(["2026-10-09", "2026-10-16", "2026-10-23"]);
    expect(s.map((p) => p.day)).toEqual([5, 12, 19]);
  });
  it("computes the trend", () => {
    const t = weightTrend(weightSeries(logs, "2026-10-05", 30));
    expect(t?.change).toBe(-3);
    expect(t?.perWeek).toBe(-1.5);
    expect(t?.sinceLast).toBe(-1.4);
    expect(t?.direction).toBe("down");
  });
  it("handles zero and one weigh-in", () => {
    expect(weightTrend([])).toBeNull();
    const t = weightTrend(weightSeries([body("2026-10-09", 188)], "2026-10-05", 30));
    expect(t?.change).toBe(0);
    expect(t?.perWeek).toBeNull();
    expect(t?.sinceLast).toBeNull();
    expect(t?.direction).toBe("flat");
  });
  it("lays points out left to right, heavier higher", () => {
    const box = { width: 300, height: 120, padLeft: 30, padRight: 10, padTop: 10, padBottom: 20 };
    const c = weightChart(weightSeries(logs, "2026-10-05", 30), 30, box);
    expect(c.points).toHaveLength(3);
    expect(c.points[0].x).toBeLessThan(c.points[1].x);
    expect(c.points[0].y).toBeLessThan(c.points[2].y);
    expect(c.path.startsWith("M")).toBe(true);
    for (const p of c.points) {
      expect(p.x).toBeGreaterThanOrEqual(30);
      expect(p.x).toBeLessThanOrEqual(290);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(100);
    }
    expect(c.ticks).toHaveLength(3);
    const one = weightChart(weightSeries([body("2026-10-05", 190)], "2026-10-05", 30), 30, box);
    expect(one.path).toBe("");
    expect(one.points[0].x).toBe(30);
    expect(weightChart([], 30, box).points).toEqual([]);
  });
  it("finds the weigh-in day of a week", () => {
    expect(weighInDateFor("2026-10-05", 5)).toBe("2026-10-09");
    expect(weighInDateFor("2026-10-05", 0)).toBe("2026-10-11");
    expect(weighInDateFor("2026-10-05", null)).toBe("2026-10-09");
  });
});

describe("progress photos", () => {
  it("picks day 1 and the latest", () => {
    const logs = [body("2026-10-16", 186, "c"), body("2026-10-05", 190, "a"), body("2026-10-09", 188, "b"), body("2026-10-23", 185)];
    expect(photoEntries(logs).map((p) => p.photo_url)).toEqual(["a", "b", "c"]);
    const pair = pickComparePhotos(logs, "2026-10-05");
    expect(pair.before?.photo_url).toBe("a");
    expect(pair.after?.photo_url).toBe("c");
  });
  it("uses the first photo in the challenge as day 1", () => {
    const logs = [body("2026-09-01", 200, "old"), body("2026-10-07", 190, "a"), body("2026-10-14", 188, "b")];
    expect(pickComparePhotos(logs, "2026-10-05").before?.photo_url).toBe("a");
    expect(pickComparePhotos(logs).before?.photo_url).toBe("old");
  });
  it("has no after photo with only one, and nothing with none", () => {
    expect(pickComparePhotos([body("2026-10-05", 190, "a")], "2026-10-05")).toEqual({
      before: { date: "2026-10-05", photo_url: "a", weight: 190 },
      after: null,
    });
    expect(pickComparePhotos([body("2026-10-05", 190)], "2026-10-05")).toEqual({ before: null, after: null });
  });
  it("falls back to the oldest when every photo is before the start", () => {
    const pair = pickComparePhotos([body("2026-09-01", 200, "x"), body("2026-09-10", 199, "y")], "2026-10-05");
    expect(pair.before?.photo_url).toBe("x");
    expect(pair.after?.photo_url).toBe("y");
  });
});
