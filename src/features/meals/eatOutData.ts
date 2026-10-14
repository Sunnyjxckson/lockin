// Reads and writes for "Eat out": log the meal through Body's addMeal, write
// an eating_out expense, and mark the planned meal as eaten out. Undo takes
// all three back.

import { db } from "@/lib/db";
import { addMeal, deleteMeal } from "@/features/body/data";
import { mealName, type EatOutOrder } from "@/lib/logic/eatOut";
import { round } from "@/lib/logic/meals";
import type { DateStr, MealPlan, MealSlot } from "@/lib/types";
import { syncGrocery, type SaveContext } from "./data";

/** Eat this order for a planned meal. The grocery list drops the meal's ingredients unless the week is already shopped. */
export async function eatOut(plan: MealPlan, date: DateStr, slot: MealSlot, order: EatOutOrder, ctx: SaveContext): Promise<void> {
  const fresh = (await db.get("meal_plan", plan.id)) ?? plan;
  const at = fresh.meals.findIndex((m) => m.date === date && m.slot === slot);
  if (at < 0) return;
  const name = mealName(order);
  const meal = await addMeal(date, { name, calories: order.calories, protein: order.protein, carbs: order.carbs, fat: order.fat });
  let expenseId: string | undefined;
  if (order.price > 0) {
    const expense = await db.insert("expense", { date, amount: round(order.price, 2), category: "eating_out", note: order.title, store: order.chain, plan_id: fresh.id });
    expenseId = expense.id;
  }
  const shopped = (await db.list("expense", { eq: { plan_id: fresh.id, category: "groceries" } })).length > 0;
  const next = fresh.meals.map((m, i) =>
    i === at ? { ...m, logged: meal.id, eaten_out: { chain: order.chain, order: order.title, price: round(order.price, 2), meal_id: meal.id, expense_id: expenseId, shopped } } : m,
  );
  const saved = await db.update("meal_plan", fresh.id, { meals: next });
  await syncGrocery(saved, ctx);
}

/** Take an eat out back: the meal row, the expense row and the mark on the plan. */
export async function undoEatOut(plan: MealPlan, date: DateStr, slot: MealSlot, ctx: SaveContext): Promise<void> {
  const fresh = (await db.get("meal_plan", plan.id)) ?? plan;
  const at = fresh.meals.findIndex((m) => m.date === date && m.slot === slot);
  const out = at >= 0 ? fresh.meals[at].eaten_out : null;
  if (!out) return;
  const meal = await db.get("meal", out.meal_id);
  if (meal) await deleteMeal(meal);
  if (out.expense_id) await db.remove("expense", out.expense_id).catch(() => undefined);
  const next = fresh.meals.map((m, i) => (i === at ? { ...m, logged: null, eaten_out: null } : m));
  const saved = await db.update("meal_plan", fresh.id, { meals: next });
  await syncGrocery(saved, ctx);
}
