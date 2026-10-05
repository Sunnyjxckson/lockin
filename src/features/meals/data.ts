// Reads and writes for meal planning. Everything goes through the
// foundation's db. Tables: recipe, meal_plan, grocery_item, pantry_item (what
// is already at home), receipt_price (what a pack really cost at a store),
// expense, and the food fields on app_settings, including the preferred
// store.

import { db } from "@/lib/db";
import { updateSettings } from "@/lib/db/helpers";
import { addMeal } from "@/features/body/data";
import { foodKey, indexFoods, recipeNumbers, round, derivedTags, type IngredientLine, type RecipeLike } from "@/lib/logic/meals";
import { FOODS } from "@/lib/logic/mealsFoods";
import { linePrices, listTotal, pantrySet, rollUp } from "@/lib/logic/mealsGrocery";
import { LIBRARY } from "@/lib/logic/mealsLibrary";
import { DEFAULT_STORE, estimateSource, isStore, pricesAt, withCorrections, type Corrections, type PriceSource, type Store } from "@/lib/logic/mealsPricing";
import type { DateStr, Expense, GroceryItem, MealPlan, MealSlot, PantryItem, PlannedMeal, ReceiptPrice, Recipe } from "@/lib/types";

export const FOOD_INDEX = indexFoods(FOODS);

/** A planned meal. `logged` is the meal row it wrote when it was cooked. */
export type Planned = PlannedMeal;

// ---------- library ----------

let libraryReady: Promise<void> | null = null;

/** Put the built in recipes in the table once. A library recipe added in a later version is added on the next visit. */
export function ensureLibrary(): Promise<void> {
  libraryReady ??= (async () => {
    const have = new Set((await db.list("recipe")).map((r) => r.name));
    const missing = LIBRARY.filter((r) => !have.has(r.name));
    if (missing.length > 0) await db.insertMany("recipe", missing.map((r) => ({ ...r })));
  })().catch((e) => {
    libraryReady = null;
    throw e;
  });
  return libraryReady;
}

// ---------- the book: pantry, receipt prices, preferred store ----------

export interface Book {
  /** Food keys that are at home. */
  pantry: string[];
  corrections: Corrections;
  store: Store;
}

export function readBook(pantry: readonly PantryItem[], prices: readonly ReceiptPrice[], preferredStore: string | null | undefined): Book {
  const corrections: Corrections = {};
  for (const p of prices) (corrections[foodKey(p.name)] ??= {})[p.store] = p.price;
  return { pantry: pantry.map((i) => foodKey(i.name)), corrections, store: isStore(preferredStore) ? preferredStore : DEFAULT_STORE };
}

export function sourceFor(book: Book): PriceSource {
  return withCorrections(estimateSource, book.corrections);
}

export async function setAtHome(name: string, atHome: boolean): Promise<void> {
  const key = foodKey(name);
  if (atHome) await db.upsert("pantry_item", { name: key }, ["name"]);
  else await db.removeWhere("pantry_item", { name: key });
}

/** Save what a pack really cost at a store, from a receipt. Null goes back to the estimate. */
export async function setReceiptPrice(name: string, store: Store, price: number | null): Promise<void> {
  const key = foodKey(name);
  if (price === null || !(price >= 0)) await db.removeWhere("receipt_price", { name: key, store });
  else await db.upsert("receipt_price", { name: key, store, price: round(price, 2) }, ["name", "store"]);
}

export async function setPreferredStore(store: Store): Promise<void> {
  await updateSettings({ preferred_store: store });
}

// ---------- settings ----------

export function saveFoodSettings(patch: { weekly_food_budget?: number | null; food_likes?: string[]; food_dislikes?: string[] }) {
  return updateSettings(patch);
}

// ---------- plans ----------

function recipeMap(recipes: readonly RecipeLike[]): Map<string, RecipeLike> {
  return new Map(recipes.map((r) => [r.id, r]));
}

export interface SaveContext {
  recipes: readonly RecipeLike[];
  book: Book;
}

function costAt(meals: readonly PlannedMeal[], store: Store, ctx: SaveContext): number {
  const lines = rollUp(meals, recipeMap(ctx.recipes), FOOD_INDEX);
  return listTotal(lines, pricesAt(sourceFor(ctx.book), store), pantrySet(ctx.book.pantry));
}

/** Write the week and bring its grocery rows in line with it. */
export async function savePlan(weekStart: DateStr, meals: readonly Planned[], budget: number, store: Store, ctx: SaveContext): Promise<MealPlan> {
  const plan = await db.upsert(
    "meal_plan",
    { week_start: weekStart, budget, recipe_ids: [...new Set(meals.map((m) => m.recipe_id))], meals: [...meals], total_cost: costAt(meals, store, ctx), store },
    ["week_start"],
  );
  await syncGrocery(plan, ctx);
  return plan;
}

let syncing: Promise<unknown> = Promise.resolve();

/**
 * One grocery_item row per thing to buy, with the price at the chosen store
 * and at every store. Rows that are still needed keep their tick.
 *
 * Runs one at a time and reads the plan again when its turn comes. A save and
 * the screen's own keep in step check can both ask for this at once, and two
 * runs side by side each added the rows the other was adding.
 */
export function syncGrocery(plan: MealPlan, ctx: SaveContext): Promise<void> {
  const run = syncing.then(() => syncGroceryNow(plan.id, ctx));
  syncing = run.catch(() => undefined);
  return run;
}

async function syncGroceryNow(planId: string, ctx: SaveContext): Promise<void> {
  const plan = await db.get("meal_plan", planId);
  if (!plan) return;
  const source = sourceFor(ctx.book);
  const store = isStore(plan.store) ? plan.store : ctx.book.store;
  const lines = rollUp(plan.meals, recipeMap(ctx.recipes), FOOD_INDEX);
  const rows = await db.list("grocery_item", { eq: { plan_id: plan.id } });
  const byName = new Map<string, GroceryItem>();
  for (const r of rows) {
    // A second row for the same food is left over from an older build. One is enough.
    if (byName.has(foodKey(r.name))) await db.remove("grocery_item", r.id);
    else byName.set(foodKey(r.name), r);
  }
  const keep = new Set<string>();
  for (const line of lines) {
    const key = foodKey(line.name);
    keep.add(key);
    const prices = linePrices(line, source);
    const next = { name: line.name, quantity: line.packs, unit: line.packLabel, category: line.section, store, price: prices[store] ?? null, prices };
    const row = byName.get(key);
    if (!row) await db.insert("grocery_item", { plan_id: plan.id, ...next, bought: false });
    else if (row.quantity !== next.quantity || row.price !== next.price || row.store !== store || JSON.stringify(row.prices) !== JSON.stringify(prices)) {
      // More to buy than was ticked off: the tick no longer holds.
      await db.update("grocery_item", row.id, { ...next, bought: row.bought && next.quantity <= row.quantity });
    }
  }
  for (const [key, r] of byName) if (!keep.has(key)) await db.remove("grocery_item", r.id);
  const total = costAt(plan.meals, store, ctx);
  if (plan.total_cost !== total) await db.update("meal_plan", plan.id, { total_cost: total });
}

export async function setPlanStore(plan: MealPlan, store: Store, ctx: SaveContext): Promise<void> {
  await setPreferredStore(store);
  const next = await db.update("meal_plan", plan.id, { store });
  await syncGrocery(next, { ...ctx, book: { ...ctx.book, store } });
}

export async function setBought(row: GroceryItem, bought: boolean): Promise<void> {
  await db.update("grocery_item", row.id, { bought });
}

export async function removePlan(plan: MealPlan): Promise<void> {
  await db.removeWhere("grocery_item", { plan_id: plan.id });
  await db.remove("meal_plan", plan.id);
}

// ---------- cooking ----------

/**
 * "Cooked, log it": write the meal through Body's own path (addMeal), which
 * also pushes the day's calories and protein to the checklist for Today.
 */
export async function logCooked(plan: MealPlan, date: DateStr, slot: MealSlot, recipe: RecipeLike): Promise<void> {
  const meals = plan.meals;
  const at = meals.findIndex((m) => m.date === date && m.slot === slot);
  if (at < 0) return;
  const s = meals[at].servings;
  const meal = await addMeal(date, {
    name: recipe.name,
    calories: round(recipe.calories * s),
    protein: round(recipe.protein * s, 1),
    carbs: round(recipe.carbs * s, 1),
    fat: round(recipe.fat * s, 1),
  });
  await db.update("meal_plan", plan.id, { meals: meals.map((m, i) => (i === at ? { ...m, logged: meal.id } : m)) });
}

// ---------- money ----------

/** A shop is done: one expense row, category groceries, linked to the plan. Money reads these. */
export function recordShop(plan: MealPlan, input: { date: DateStr; amount: number; store: string | null; note?: string | null }): Promise<Expense> {
  return db.insert("expense", { date: input.date, amount: round(input.amount, 2), category: "groceries", note: input.note?.trim() || null, store: input.store, plan_id: plan.id });
}

export function removeShop(expense: Expense): Promise<void> {
  return db.remove("expense", expense.id);
}

// ---------- recipes ----------

export interface RecipeInput {
  name: string;
  slot: MealSlot;
  servings: number;
  lines: IngredientLine[];
  steps: string[];
  /** Per serving, used only when an ingredient is not in the food table. */
  manual?: { calories: number; protein: number; carbs: number; fat: number } | null;
}

/** The row for a recipe as typed, numbers computed from the food table. */
export function recipeRow(input: RecipeInput): Omit<Recipe, "id" | "created_at" | "source" | "photo_url"> {
  const n = recipeNumbers(input.lines, input.servings, FOOD_INDEX);
  const m = n.unknown.length > 0 && input.manual ? input.manual : n;
  return {
    name: input.name.trim(),
    slot: input.slot,
    servings: input.servings > 0 ? input.servings : 1,
    ingredients: n.ingredients,
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    calories: round(m.calories),
    protein: round(m.protein, 1),
    carbs: round(m.carbs, 1),
    fat: round(m.fat, 1),
    est_cost: n.est_cost,
    tags: derivedTags(input.lines, FOOD_INDEX),
  };
}

export async function saveRecipe(input: RecipeInput, existing?: Recipe | null): Promise<Recipe> {
  const row = recipeRow(input);
  if (existing) {
    // Keep the tags a library recipe came with (batch, quick) beside the derived ones.
    const kept = existing.tags.filter((t) => ["batch", "quick", "freezer", "nocook"].includes(t));
    return db.update("recipe", existing.id, { ...row, tags: [...new Set([...row.tags, ...kept])].sort() });
  }
  return db.insert("recipe", { ...row, photo_url: null, source: "user" });
}

export async function deleteRecipe(recipe: Recipe): Promise<void> {
  await db.remove("recipe", recipe.id);
}
