// The food goal: cut, maintain or bulk. Pure. Turns bodyweight and a goal
// into daily calorie, protein, carb and fat targets.
//
// The method is deliberately simple and says so. Maintenance is estimated
// from bodyweight alone at about 15 kcal per lb (a common rule of thumb for a
// moderately active person). It is a starting point: if the scale does not
// move the way the goal says over two or three weeks, nudge the numbers.
//
//   cut       maintenance minus about 500 (roughly 1 lb a week)
//   maintain  maintenance
//   bulk      maintenance plus about 300 (a slow, lean gain)
//
// Every goal is a range of 200 kcal (the middle plus or minus 100) because
// the planner and the checklist score a range. A cut never goes under
// CUT_FLOOR calories a day. Protein is about 0.9 to 1 g per lb: 1 g on a cut
// to hold muscle, 0.9 otherwise. Fat is about 0.3 g per lb and carbs fill
// the rest of the middle of the range.

export type FoodGoal = "cut" | "maintain" | "bulk";

export const FOOD_GOALS: readonly FoodGoal[] = ["cut", "maintain", "bulk"];
export const GOAL_LABEL: Record<FoodGoal, string> = { cut: "Cut", maintain: "Maintain", bulk: "Bulk" };

/** Maintenance calories per lb of bodyweight. */
export const KCAL_PER_LB = 15;
/** Calories added to maintenance for each goal. */
export const GOAL_OFFSET: Record<FoodGoal, number> = { cut: -500, maintain: 0, bulk: 300 };
/** Protein grams per lb for each goal. */
export const PROTEIN_PER_LB: Record<FoodGoal, number> = { cut: 1, maintain: 0.9, bulk: 0.9 };
/** Fat grams per lb. */
export const FAT_PER_LB = 0.3;
/** The least a cut may ask for in a day. */
export const CUT_FLOOR = 1500;
/** Half the width of a calorie range. */
const HALF_RANGE = 100;

export interface GoalNumbers {
  calMin: number;
  calMax: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface GoalPlan {
  goal: FoodGoal;
  /** Estimated maintenance calories. */
  maintenance: number;
  next: GoalNumbers;
}

export function isFoodGoal(v: unknown): v is FoodGoal {
  return v === "cut" || v === "maintain" || v === "bulk";
}

export function lbOf(weight: number, unit: "lb" | "kg"): number {
  return unit === "kg" ? weight * 2.20462 : weight;
}

function nearest(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/** Maintenance calories for a bodyweight in lb, to the nearest 50. */
export function maintenanceFor(weightLb: number): number {
  return nearest(weightLb * KCAL_PER_LB, 50);
}

/** New targets for a goal at a bodyweight in lb, or null when the weight is not a real weight. */
export function planGoal(weightLb: number | null | undefined, goal: FoodGoal): GoalPlan | null {
  if (weightLb === null || weightLb === undefined || !Number.isFinite(weightLb) || weightLb < 60 || weightLb > 700) return null;
  const maintenance = maintenanceFor(weightLb);
  let mid = nearest(maintenance + GOAL_OFFSET[goal], 50);
  let calMin = mid - HALF_RANGE;
  let calMax = mid + HALF_RANGE;
  if (goal === "cut" && calMin < CUT_FLOOR) {
    calMin = CUT_FLOOR;
    calMax = CUT_FLOOR + 2 * HALF_RANGE;
    mid = CUT_FLOOR + HALF_RANGE;
  }
  const protein = nearest(weightLb * PROTEIN_PER_LB[goal], 5);
  const fat = nearest(weightLb * FAT_PER_LB, 5);
  const carbs = Math.max(0, nearest((mid - protein * 4 - fat * 9) / 4, 5));
  return { goal, maintenance, next: { calMin, calMax, protein, carbs, fat } };
}

export interface GoalChange {
  label: string;
  from: string;
  to: string;
  changed: boolean;
}

function kcal(min: number, max: number): string {
  return `${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}`;
}

/** Old against new, one row per number, for the confirm sheet. */
export function describeChange(old: GoalNumbers, next: GoalNumbers): GoalChange[] {
  const row = (label: string, from: string, to: string): GoalChange => ({ label, from, to, changed: from !== to });
  return [
    row("Calories", kcal(old.calMin, old.calMax), kcal(next.calMin, next.calMax)),
    row("Protein", `${old.protein}g or more`, `${next.protein}g or more`),
    row("Carbs", `${old.carbs}g`, `${next.carbs}g`),
    row("Fat", `${old.fat}g`, `${next.fat}g`),
  ];
}

/** True when the new numbers are the ones already in force. */
export function sameNumbers(a: GoalNumbers, b: GoalNumbers): boolean {
  return a.calMin === b.calMin && a.calMax === b.calMax && a.protein === b.protein && a.carbs === b.carbs && a.fat === b.fat;
}
