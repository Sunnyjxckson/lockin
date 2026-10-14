// Writes for the food onboarding and the food goal. Everything goes through
// the foundation's db and helpers.

import { db } from "@/lib/db";
import { getItemByKey, setItemTarget, updateSettings } from "@/lib/db/helpers";
import { cleanTerms, cleanCookMinutes } from "@/lib/logic/mealsOnboarding";
import { foodKey } from "@/lib/logic/meals";
import { STAPLES } from "@/lib/logic/mealsFoods";
import { rebalanceDay, type PlanContext } from "@/lib/logic/mealsPlanner";
import { addDays, dateRange } from "@/lib/logic/dates";
import type { FoodGoal, GoalNumbers } from "@/lib/logic/goal";
import type { DateStr, MealPlan } from "@/lib/types";
import { isStore } from "@/lib/logic/mealsPricing";
import { savePlan, setAtHome, type SaveContext } from "./data";

const STAPLE_KEYS = new Set(STAPLES.map(foodKey));

/** Pantry names that are not the seeded staples: what the onboarding shows as chips. */
export function pantryChips(pantryKeys: readonly string[]): string[] {
  return pantryKeys.filter((k) => !STAPLE_KEYS.has(k));
}

export interface OnboardingValues {
  likes: string[];
  dislikes: string[];
  budget: number | null;
  cookMinutes: number;
  /** What is at home beyond the staples. */
  pantry: string[];
}

/** Save the answers. Marks the questions done. Pantry chips that were taken off are removed again. */
export async function saveOnboarding(v: OnboardingValues, previousPantry: readonly string[]): Promise<void> {
  const patch: Parameters<typeof updateSettings>[0] = {
    food_likes: cleanTerms(v.likes),
    food_dislikes: cleanTerms(v.dislikes),
    cook_minutes: cleanCookMinutes(v.cookMinutes),
    food_onboarded: true,
  };
  if (v.budget !== null && v.budget > 0) patch.weekly_food_budget = v.budget;
  await updateSettings(patch);
  const next = new Set(cleanTerms(v.pantry).map(foodKey));
  const before = new Set(previousPantry.map(foodKey));
  for (const k of next) if (!before.has(k)) await setAtHome(k, true);
  for (const k of before) if (!next.has(k)) await setAtHome(k, false);
}

/** Mark the questions done without answering them. */
export async function skipOnboarding(): Promise<void> {
  await updateSettings({ food_onboarded: true });
}

export interface ApplyGoalInput {
  goal: FoodGoal;
  next: GoalNumbers;
  today: DateStr;
  /** The weeks that have a plan with days from today on. */
  plans: readonly MealPlan[];
  /** Builds the planner context for a week, with the new targets on every date from today on. */
  contextFor: (plan: MealPlan, targets: GoalNumbers) => PlanContext;
  saveContext: SaveContext;
}

/**
 * Save the goal from today forward and re-portion the plan's remaining days.
 * Targets are versioned by date, so past days keep what they were scored on.
 */
export async function applyGoal(input: ApplyGoalInput): Promise<void> {
  const { goal, next, today } = input;
  const cal = await getItemByKey("calories");
  const pro = await getItemByKey("protein");
  if (cal) await setItemTarget(cal.id, { kind: "range", min: next.calMin, max: next.calMax }, today);
  if (pro) await setItemTarget(pro.id, { kind: "min", min: next.protein }, today);
  await updateSettings({ carbs_target: next.carbs, fat_target: next.fat, goal });

  for (const plan of input.plans) {
    const fresh = (await db.get("meal_plan", plan.id)) ?? plan;
    const days = dateRange(fresh.week_start, addDays(fresh.week_start, 6)).filter((d) => d >= today);
    if (days.length === 0) continue;
    const ctx = input.contextFor(fresh, next);
    let meals = fresh.meals;
    for (const d of days) meals = rebalanceDay(meals, d, ctx);
    const store = isStore(fresh.store) ? fresh.store : input.saveContext.book.store;
    await savePlan(fresh.week_start, meals, fresh.budget, store, input.saveContext);
  }
}
