import { describe, expect, it } from "vitest";
import type { SetLog } from "../types";
import { formatSet, isLoggable, lastSession, lastSessionByExercise, parseReps, parseWeight, prefillSet, sessionVolume, setsOn, suggestedWeight, topReps, workoutProgress } from "./workout";

const set = (date: string, exercise: string, n: number, weight: number | null, reps: number | null): SetLog => ({
  id: `${date}-${exercise}-${n}`,
  created_at: "",
  date,
  exercise,
  set_number: n,
  weight,
  reps,
});

const bench = { name: "Bench press", sets: 4, reps: "6 to 8" };

const logs = [
  set("2026-10-05", "Bench press", 2, 135, 7),
  set("2026-10-05", "Bench press", 1, 135, 8),
  set("2026-10-12", "Bench press", 1, 140, 8),
  set("2026-10-12", "bench press ", 2, 140, 6),
  set("2026-10-12", "Barbell row", 1, 115, 8),
  set("2026-10-19", "Bench press", 1, 145, 6),
];

describe("lastSession", () => {
  it("returns the most recent earlier session in set order", () => {
    const last = lastSession(logs, "Bench press", "2026-10-19");
    expect(last.map((l) => [l.date, l.set_number, l.weight])).toEqual([
      ["2026-10-12", 1, 140],
      ["2026-10-12", 2, 140],
    ]);
  });
  it("never includes the day itself and is empty with no history", () => {
    expect(lastSession(logs, "Bench press", "2026-10-05")).toEqual([]);
    expect(lastSession(logs, "Back squat", "2026-10-19")).toEqual([]);
    expect(lastSession(logs, "Bench press", "2026-10-12")[0].date).toBe("2026-10-05");
  });
  it("skips blank rows", () => {
    const withBlank = [...logs, set("2026-10-15", "Bench press", 1, null, null)];
    expect(lastSession(withBlank, "Bench press", "2026-10-19")[0].date).toBe("2026-10-12");
  });
  it("maps every exercise", () => {
    const by = lastSessionByExercise(logs, [bench, { name: "Barbell row" }, { name: "Dumbbell curl" }], "2026-10-19");
    expect(by["Bench press"]).toHaveLength(2);
    expect(by["Barbell row"]).toHaveLength(1);
    expect(by["Dumbbell curl"]).toEqual([]);
  });
});

describe("prefillSet", () => {
  const last = lastSession(logs, "Bench press", "2026-10-19");
  it("uses the same set from last time", () => {
    expect(prefillSet(bench, 1, last, [])).toEqual({ weight: 140, reps: 8 });
    expect(prefillSet(bench, 2, last, [])).toEqual({ weight: 140, reps: 6 });
  });
  it("uses last time's final set when it had fewer sets", () => {
    expect(prefillSet(bench, 4, last, [])).toEqual({ weight: 140, reps: 6 });
  });
  it("carries a weight change made earlier today", () => {
    const today = setsOn(logs, "Bench press", "2026-10-19");
    expect(prefillSet(bench, 2, last, today)).toEqual({ weight: 145, reps: 6 });
  });
  it("falls back to planned reps with no history", () => {
    expect(prefillSet(bench, 1, [], [])).toEqual({ weight: null, reps: 6 });
    expect(prefillSet({ name: "Plank", sets: 3, reps: "45 sec" }, 1, [], [])).toEqual({ weight: null, reps: null });
    expect(prefillSet(bench, 2, [], [set("2026-10-19", "Bench press", 1, 95, 10)])).toEqual({ weight: 95, reps: 10 });
  });
});

describe("helpers", () => {
  it("parses reps", () => {
    expect(parseReps("6 to 8")).toBe(6);
    expect(parseReps("10 each leg")).toBe(10);
    expect(parseReps("10 min")).toBeNull();
    expect(parseReps("to failure")).toBeNull();
  });
  it("formats a set", () => {
    expect(formatSet({ weight: 135, reps: 8 })).toBe("135 x 8");
    expect(formatSet({ weight: 42.5, reps: 10 })).toBe("42.5 x 10");
    expect(formatSet({ weight: null, reps: 9 })).toBe("9 reps");
    expect(formatSet({ weight: null, reps: null })).toBe("");
    expect(formatSet(null)).toBe("");
  });
  it("counts logged sets against the plan", () => {
    const w = { exercises: [bench, { name: "Barbell row", sets: 4, reps: "8" }] };
    expect(workoutProgress(w, logs, "2026-10-12")).toEqual({ logged: 3, total: 8, complete: false });
    expect(workoutProgress(w, logs, "2026-10-13")).toEqual({ logged: 0, total: 8, complete: false });
    expect(workoutProgress(null, logs, "2026-10-12")).toEqual({ logged: 0, total: 0, complete: false });
    const extra = [...logs, set("2026-10-12", "Bench press", 9, 100, 5)];
    expect(workoutProgress(w, extra, "2026-10-12").logged).toBe(3);
    const one = { exercises: [{ name: "Barbell row", sets: 1, reps: "8" }] };
    expect(workoutProgress(one, logs, "2026-10-12").complete).toBe(true);
  });
  it("sums volume and knows what is loggable", () => {
    expect(sessionVolume([{ weight: 100, reps: 5 }, { weight: null, reps: 8 }])).toBe(500);
    expect(isLoggable({ kind: "lift", exercises: [bench] })).toBe(true);
    expect(isLoggable({ kind: "sport", exercises: [bench] })).toBe(false);
    expect(isLoggable(null)).toBe(false);
  });
});

describe("parseWeight", () => {
  it("takes the first number in the plan text", () => {
    expect(parseWeight("40s (try 45s)")).toBe(40);
    expect(parseWeight("200")).toBe(200);
    expect(parseWeight("7.5 lb")).toBe(7.5);
    expect(parseWeight("Light")).toBeNull();
    expect(parseWeight(null)).toBeNull();
    expect(parseWeight(undefined)).toBeNull();
  });
});

describe("topReps", () => {
  it("is the top of the range", () => {
    expect(topReps("8 to 10")).toBe(10);
    expect(topReps("10")).toBe(10);
    expect(topReps("10 each leg")).toBe(10);
    expect(topReps("12 to 15")).toBe(15);
  });
  it("skips timed and non numeric work", () => {
    expect(topReps("10 min")).toBeNull();
    expect(topReps("45 sec")).toBeNull();
    expect(topReps("close to failure")).toBeNull();
    expect(topReps("about 1 hour")).toBeNull();
  });
});

describe("suggestedWeight", () => {
  const press = { name: "Incline DB press", sets: 3, reps: "8 to 10" };
  const day = (reps: (number | null)[], weight: number | null = 40) => reps.map((r, i) => set("2026-10-12", "Incline DB press", i + 1, weight, r));
  it("adds 5 when every planned set hit the top of the range", () => {
    expect(suggestedWeight(press, day([10, 10, 10]))).toBe(45);
    expect(suggestedWeight(press, day([10, 11, 10]))).toBe(45);
  });
  it("is null when a set fell short, was skipped or has no weight", () => {
    expect(suggestedWeight(press, day([10, 9, 10]))).toBeNull();
    expect(suggestedWeight(press, day([10, 10]))).toBeNull();
    expect(suggestedWeight(press, day([10, 10, null]))).toBeNull();
    expect(suggestedWeight(press, day([10, 10, 10], null))).toBeNull();
    expect(suggestedWeight(press, [])).toBeNull();
  });
  it("is null for timed work", () => {
    expect(suggestedWeight({ sets: 3, reps: "10 min" }, day([10, 10, 10]))).toBeNull();
  });
});

describe("prefillSet with the plan weight and progression", () => {
  const press = { name: "Incline DB press", sets: 3, reps: "8 to 10", weight: "40s (try 45s)" };
  it("starts from the planned weight with no history", () => {
    expect(prefillSet(press, 1, [], [])).toEqual({ weight: 40, reps: 8 });
    expect(prefillSet({ ...press, weight: "Light" }, 1, [], [])).toEqual({ weight: null, reps: 8 });
  });
  it("history wins over the planned weight", () => {
    const last = [set("2026-10-12", "Incline DB press", 1, 42.5, 9)];
    expect(prefillSet(press, 1, last, [])).toEqual({ weight: 42.5, reps: 9 });
  });
  it("starts the first set 5 lb up after a full session at the top of the range", () => {
    const last = [1, 2, 3].map((n) => set("2026-10-12", "Incline DB press", n, 40, 10));
    expect(prefillSet(press, 1, last, [])).toEqual({ weight: 45, reps: 10 });
    expect(prefillSet(press, 2, last, [])).toEqual({ weight: 40, reps: 10 });
  });
});
