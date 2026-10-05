"use client";

import { useEffect, useMemo, useRef } from "react";
import { useChecklist, useList, useMode, useSettings } from "@/lib/db/hooks";
import { addDays, weekStart } from "@/lib/logic/dates";
import { dayTargets, DEFAULT_TARGETS, type DayTargets } from "@/lib/logic/meals";
import { rollUp, pantrySet, type GroceryLine } from "@/lib/logic/mealsGrocery";
import { summarizePlan, type PlanContext, type PlanSummary } from "@/lib/logic/mealsPlanner";
import { pricesAt, isStore, type PriceSource, type Store } from "@/lib/logic/mealsPricing";
import { targetOn } from "@/lib/logic/targets";
import type { DateStr, Expense, GroceryItem, MealPlan, Recipe } from "@/lib/types";
import { listTotal } from "@/lib/logic/mealsGrocery";
import { ensureLibrary, FOOD_INDEX, readBook, sourceFor, syncGrocery, type Book, type Planned } from "./data";

export type WeekChoice = "this" | "next";

// Which week the meals screens are on. Kept for the visit, so the grocery
// list opens on the week you were looking at. A reload goes back to this week.
let chosenWeek: WeekChoice = "this";
export function currentWeek(): WeekChoice {
  return chosenWeek;
}
export function rememberWeek(week: WeekChoice): void {
  chosenWeek = week;
}

export interface MealsState {
  loading: boolean;
  today: DateStr;
  weekStart: DateStr;
  dates: DateStr[];
  budget: number | null;
  likes: string[];
  dislikes: string[];
  recipes: Recipe[];
  recipeById: Map<string, Recipe>;
  book: Book;
  source: PriceSource;
  /** The store the week is priced at. */
  store: Store;
  plan: MealPlan | null;
  meals: Planned[];
  /** Today's targets, challenge rules included. */
  targets: DayTargets;
  /** Planner input for this week at this store, minus seed and prefs. */
  ctx: PlanContext;
  summary: PlanSummary | null;
  lines: GroceryLine[];
  pantry: Set<string>;
  rows: GroceryItem[];
  /** Grocery spend recorded against this week's plan or dated inside the week. */
  shops: Expense[];
  spent: number;
  /** True while a challenge with its own food rules covers part of the week. */
  challengeName: string | null;
}

/** Everything the meals screens read, for one week. */
export function useMeals(week: WeekChoice): MealsState {
  const mode = useMode();
  const settings = useSettings();
  const checklist = useChecklist();
  const recipes = useList("recipe", { orderBy: "name" });
  const plans = useList("meal_plan");
  const items = useList("grocery_item");
  const pantryRows = useList("pantry_item", { orderBy: "name" });
  const priceRows = useList("receipt_price");
  const expenses = useList("expense", { orderBy: "date" });

  useEffect(() => {
    void ensureLibrary().catch(() => undefined);
  }, []);

  const today = mode.today;
  const modeLoading = mode.loading;
  const challenge = mode.challenge;
  const settingsData = settings.data;
  const settingsLoading = settings.loading;
  const checklistData = checklist.data;
  const checklistLoading = checklist.loading;
  const recipesData = recipes.data;
  const recipesLoading = recipes.loading;
  const plansData = plans.data;
  const plansLoading = plans.loading;
  const itemsData = items.data;
  const itemsLoading = items.loading;
  const expensesData = expenses.data;
  const pantryData = pantryRows.data;
  const priceData = priceRows.data;
  const bookLoading = pantryRows.loading || priceRows.loading;
  const start = week === "next" ? addDays(weekStart(today), 7) : weekStart(today);

  return useMemo(() => {
    const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
    const book = readBook(pantryData, priceData, settingsData?.preferred_store);
    const source = sourceFor(book);
    const plan = plansData.find((p) => p.week_start === start) ?? null;
    const store: Store = isStore(plan?.store) ? plan.store : book.store;

    const cal = checklistData.items.find((i) => i.key === "calories");
    const pro = checklistData.items.find((i) => i.key === "protein");
    const on = (date: DateStr): DayTargets =>
      cal || pro ? dayTargets(cal ? targetOn(cal, checklistData.versions, date) : null, pro ? targetOn(pro, checklistData.versions, date) : null) : DEFAULT_TARGETS;
    const targets = on(today >= start && today <= dates[6] ? today : start);
    const targetsByDate: Record<DateStr, DayTargets> = {};
    for (const d of dates) targetsByDate[d] = on(d);

    const likes = settingsData?.food_likes ?? [];
    const dislikes = settingsData?.food_dislikes ?? [];
    const budget = settingsData?.weekly_food_budget ?? null;
    const recipeById = new Map(recipesData.map((r) => [r.id, r]));
    const ctx: PlanContext = {
      recipes: recipesData,
      foods: FOOD_INDEX,
      prices: pricesAt(source, store),
      pantry: book.pantry,
      targets,
      targetsByDate,
      likes,
      dislikes,
      budget: plan?.budget ?? budget ?? 0,
    };
    const meals: Planned[] = plan?.meals ?? [];
    const pantry = pantrySet(book.pantry);
    const shops = expensesData.filter((e) => e.category === "groceries" && (plan ? e.plan_id === plan.id : false));
    const c = challenge;
    return {
      loading: modeLoading || settingsLoading || recipesLoading || plansLoading || itemsLoading || bookLoading || checklistLoading || recipesData.length === 0,
      today,
      weekStart: start,
      dates,
      budget,
      likes,
      dislikes,
      recipes: recipesData,
      recipeById,
      book,
      source,
      store,
      plan,
      meals,
      targets,
      ctx,
      summary: plan && meals.length > 0 ? summarizePlan(meals, ctx, dates) : null,
      lines: plan ? rollUp(meals, recipeById, FOOD_INDEX) : [],
      pantry,
      rows: plan ? itemsData.filter((i) => i.plan_id === plan.id) : [],
      shops,
      spent: shops.reduce((a, e) => a + e.amount, 0),
      challengeName: c && c.rules?.some((r) => r.item_id === cal?.id || r.item_id === pro?.id) ? c.name : null,
    };
  }, [start, today, modeLoading, challenge, settingsData, settingsLoading, checklistData, checklistLoading, recipesData, recipesLoading, plansData, plansLoading, itemsData, itemsLoading, expensesData, pantryData, priceData, bookLoading]);
}

/**
 * The saved grocery rows and the saved week total follow the plan. They go
 * stale when something outside the plan moves: a receipt price, the pantry,
 * an edited recipe. This writes them again when the live numbers differ.
 */
export function useKeepInStep(m: MealsState): void {
  const working = useRef(false);
  const { plan, lines, rows, pantry, ctx, recipes, book, loading } = m;
  useEffect(() => {
    if (loading || !plan || working.current) return;
    const total = listTotal(lines, ctx.prices, pantry);
    const stale = Math.abs(total - plan.total_cost) > 0.004 || rows.length !== lines.length || rows.some((r) => r.store !== m.store);
    if (!stale) return;
    working.current = true;
    void syncGrocery(plan, { recipes, book })
      .catch(() => undefined)
      .finally(() => {
        working.current = false;
      });
  }, [loading, plan, lines, rows, pantry, ctx, recipes, book, m.store]);
}
