import { describe, expect, it } from "vitest";
import { CUT_FLOOR, describeChange, isFoodGoal, lbOf, maintenanceFor, planGoal, sameNumbers } from "./goal";

describe("planGoal", () => {
  it("estimates maintenance at about 15 kcal per lb", () => {
    expect(maintenanceFor(190)).toBe(2850);
    expect(planGoal(190, "maintain")?.maintenance).toBe(2850);
  });

  it("cut is maintenance minus 500, as a range", () => {
    const p = planGoal(190, "cut")!;
    expect(p.next.calMin).toBe(2250);
    expect(p.next.calMax).toBe(2450);
    expect(p.next.protein).toBe(190);
  });

  it("maintain is maintenance plus or minus 100", () => {
    const p = planGoal(190, "maintain")!;
    expect([p.next.calMin, p.next.calMax]).toEqual([2750, 2950]);
    expect(p.next.protein).toBe(170);
  });

  it("bulk is maintenance plus 300", () => {
    const p = planGoal(190, "bulk")!;
    expect([p.next.calMin, p.next.calMax]).toEqual([3050, 3250]);
  });

  it("never cuts under the floor", () => {
    const p = planGoal(120, "cut")!;
    expect(p.next.calMin).toBe(CUT_FLOOR);
    expect(p.next.calMax).toBe(CUT_FLOOR + 200);
  });

  it("macros fit the middle of the range", () => {
    const { next } = planGoal(180, "cut")!;
    const mid = (next.calMin + next.calMax) / 2;
    const kcal = next.protein * 4 + next.carbs * 4 + next.fat * 9;
    expect(Math.abs(kcal - mid)).toBeLessThanOrEqual(25);
    expect(next.carbs).toBeGreaterThan(0);
  });

  it("gives nothing without a real weight", () => {
    expect(planGoal(null, "cut")).toBeNull();
    expect(planGoal(0, "cut")).toBeNull();
    expect(planGoal(Number.NaN, "bulk")).toBeNull();
    expect(planGoal(5000, "bulk")).toBeNull();
  });

  it("rounds protein to 5 and keeps ranges 200 wide", () => {
    for (const w of [143.4, 171.2, 205.9]) {
      for (const g of ["cut", "maintain", "bulk"] as const) {
        const { next } = planGoal(w, g)!;
        expect(next.protein % 5).toBe(0);
        expect(next.calMax - next.calMin).toBe(200);
      }
    }
  });
});

describe("helpers", () => {
  it("converts kg to lb", () => {
    expect(Math.round(lbOf(80, "kg"))).toBe(176);
    expect(lbOf(180, "lb")).toBe(180);
  });

  it("checks a goal value", () => {
    expect(isFoodGoal("cut")).toBe(true);
    expect(isFoodGoal("lean")).toBe(false);
    expect(isFoodGoal(null)).toBe(false);
  });

  it("lists old against new", () => {
    const a = planGoal(190, "cut")!.next;
    const b = planGoal(190, "bulk")!.next;
    const rows = describeChange(a, b);
    expect(rows.map((r) => r.label)).toEqual(["Calories", "Protein", "Carbs", "Fat"]);
    expect(rows[0].from).toBe("2,250 to 2,450");
    expect(rows[0].changed).toBe(true);
    expect(describeChange(a, a).every((r) => !r.changed)).toBe(true);
    expect(sameNumbers(a, { ...a })).toBe(true);
    expect(sameNumbers(a, b)).toBe(false);
  });
});
