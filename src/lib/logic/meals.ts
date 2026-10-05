// Meal planning rules, part 1: foods, units, and what a recipe adds up to.
// Pure, no db. Every recipe number (calories, macros, estimated cost) is
// computed here from the food table, never typed by hand.
//
// All prices in this feature are estimates. Nothing here is a store's real
// shelf price until the user corrects one from a receipt.

import type { Ingredient, MealSlot, Recipe, Target } from "../types";

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type BaseUnit = "g" | "ml" | "each";

export const SECTIONS = ["produce", "meat", "dairy", "bakery", "pantry", "frozen", "spices", "other"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  produce: "Produce",
  meat: "Meat and fish",
  dairy: "Dairy and eggs",
  bakery: "Bread",
  pantry: "Pantry",
  frozen: "Frozen",
  spices: "Spices and oil",
  other: "Other",
};

/** One row of the food table. */
export interface Food {
  /** Lowercase, unique. Recipes point at foods by this name. */
  name: string;
  section: Section;
  /** The unit quantities are added up in. */
  base: BaseUnit;
  /** Per 100 g, per 100 ml, or per one, by `base`. Standard nutrition values. */
  per: Macros;
  /** Base units in one pack as sold. */
  pack: number;
  /** How a pack reads on a list: "lb", "dozen", "can". */
  packLabel: string;
  /** Estimated dollars for one pack at a mid priced store. An estimate, not a quote. */
  price: number;
  /** Smallest part of a pack you can buy. 0.25 for meat sold by weight. Default 1. */
  step?: number;
  /** Grams in a teaspoon, for a food weighed in g that recipes spoon or cup. */
  tspGrams?: number;
  /** For likes and dislikes: "chicken", "fish", "dairy". */
  tags: string[];
  /** Salt, oil, spices: assumed to be at home until the user says otherwise. */
  staple?: boolean;
}

export const SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
export const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

// ---------- units ----------

const MASS: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588, "fl oz": 29.5735 };
const SPOONS: Record<string, number> = { tsp: 1, tbsp: 3, cup: 48 };

export const UNITS = ["g", "oz", "lb", "ml", "tsp", "tbsp", "cup", "each"] as const;

export function normalizeUnit(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (u === "" || u === "ea" || u === "whole" || u === "piece" || u === "pieces") return "each";
  if (u === "grams" || u === "gram") return "g";
  if (u === "ounce" || u === "ounces") return "oz";
  if (u === "pound" || u === "pounds" || u === "lbs") return "lb";
  if (u === "teaspoon" || u === "teaspoons") return "tsp";
  if (u === "tablespoon" || u === "tablespoons") return "tbsp";
  if (u === "cups") return "cup";
  if (u === "milliliter" || u === "milliliters") return "ml";
  return u;
}

/** A quantity in the food's base unit, or null when the unit cannot be converted for that food. */
export function toBase(food: Food, quantity: number, unit: string): number | null {
  const u = normalizeUnit(unit);
  if (!Number.isFinite(quantity)) return null;
  if (food.base === "each") return u === "each" ? quantity : null;
  if (food.base === "g") {
    if (u in MASS) return quantity * MASS[u];
    if (u in SPOONS && food.tspGrams) return quantity * SPOONS[u] * food.tspGrams;
    return null;
  }
  if (u in VOLUME) return quantity * VOLUME[u];
  return null;
}

/** The units a recipe can use for a food. */
export function unitsFor(food: Food): string[] {
  if (food.base === "each") return ["each"];
  if (food.base === "ml") return ["ml", "tsp", "tbsp", "cup"];
  return food.tspGrams ? ["g", "oz", "lb", "tsp", "tbsp", "cup"] : ["g", "oz", "lb"];
}

export function round(n: number, places = 0): number {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// ---------- food lookup ----------

export type FoodIndex = Map<string, Food>;

export function indexFoods(foods: readonly Food[]): FoodIndex {
  return new Map(foods.map((f) => [f.name, f]));
}

export function foodKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findFood(index: FoodIndex, name: string): Food | null {
  return index.get(foodKey(name)) ?? null;
}

export function macrosOf(food: Food, baseQty: number): Macros {
  const k = food.base === "each" ? baseQty : baseQty / 100;
  return { calories: food.per.calories * k, protein: food.per.protein * k, carbs: food.per.carbs * k, fat: food.per.fat * k };
}

/** Dollars for a quantity at a pack price: the share of the pack that gets used. */
export function costOf(food: Food, baseQty: number, packPrice: number = food.price): number {
  return (packPrice / food.pack) * baseQty;
}

// ---------- a recipe from its ingredients ----------

/** What the user or the library writes down: a food and how much goes in the whole batch. */
export interface IngredientLine {
  name: string;
  quantity: number;
  unit: string;
  /** Only for a food that is not in the table: what this quantity costs. */
  est_cost?: number | null;
  category?: string | null;
}

export interface RecipeNumbers extends Macros {
  /** Estimated dollars for one serving. */
  est_cost: number;
  ingredients: Ingredient[];
  /** Ingredient names that are not in the food table, or whose unit does not convert. Their macros are not counted. */
  unknown: string[];
}

/**
 * One serving of a recipe from its ingredient lines. Calories are whole
 * numbers, macros one decimal, cost in cents.
 */
export function recipeNumbers(lines: readonly IngredientLine[], servings: number, index: FoodIndex): RecipeNumbers {
  const n = servings > 0 ? servings : 1;
  const sum: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let cost = 0;
  const unknown: string[] = [];
  const ingredients: Ingredient[] = [];
  for (const line of lines) {
    const unit = normalizeUnit(line.unit);
    const food = findFood(index, line.name);
    const base = food ? toBase(food, line.quantity, unit) : null;
    if (!food || base === null) {
      const own = typeof line.est_cost === "number" && Number.isFinite(line.est_cost) ? line.est_cost : 0;
      cost += own;
      unknown.push(line.name);
      ingredients.push({ name: line.name.trim(), quantity: line.quantity, unit, est_cost: round(own, 2), category: line.category ?? "other" });
      continue;
    }
    const m = macrosOf(food, base);
    sum.calories += m.calories;
    sum.protein += m.protein;
    sum.carbs += m.carbs;
    sum.fat += m.fat;
    const c = costOf(food, base);
    cost += c;
    ingredients.push({ name: food.name, quantity: line.quantity, unit, est_cost: round(c, 2), category: food.section });
  }
  return {
    calories: round(sum.calories / n),
    protein: round(sum.protein / n, 1),
    carbs: round(sum.carbs / n, 1),
    fat: round(sum.fat / n, 1),
    est_cost: round(cost / n, 2),
    ingredients,
    unknown,
  };
}

/** Tags a recipe gets from what is in it, on top of the ones written for it. */
export function derivedTags(lines: readonly { name: string }[], index: FoodIndex, own: readonly string[] = []): string[] {
  const tags = new Set(own.map((t) => t.toLowerCase()));
  let animal = false;
  for (const line of lines) {
    const food = findFood(index, line.name);
    if (!food) continue;
    for (const t of food.tags) {
      tags.add(t);
      if (t === "meat" || t === "fish" || t === "seafood") animal = true;
    }
  }
  if (!animal && lines.length > 0) tags.add("vegetarian");
  return [...tags].sort();
}

// ---------- likes and dislikes ----------

function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("oes")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
}

export interface Matchable {
  name: string;
  tags: readonly string[];
  ingredients: readonly { name: string }[];
}

/**
 * Does a like or dislike apply to this recipe? It matches a tag, an
 * ingredient, or the recipe name, whole words only, plural or not: "egg"
 * matches "egg whites", "fish" matches anything tagged fish, "rice" does not
 * match "price".
 */
export function matchesTerm(recipe: Matchable, term: string): boolean {
  const want = words(term);
  if (want.length === 0) return false;
  const has = (text: string) => {
    const w = words(text);
    for (let i = 0; i + want.length <= w.length; i += 1) {
      if (want.every((x, j) => w[i + j] === x)) return true;
    }
    return false;
  };
  // Tags are single words, so a two word term matches when every word is a tag.
  const tagWords = new Set(recipe.tags.flatMap(words));
  return want.every((x) => tagWords.has(x)) || recipe.ingredients.some((i) => has(i.name)) || has(recipe.name);
}

export function matchCount(recipe: Matchable, terms: readonly string[]): number {
  return terms.filter((t) => matchesTerm(recipe, t)).length;
}

export function isExcluded(recipe: Matchable, dislikes: readonly string[]): boolean {
  return dislikes.some((t) => matchesTerm(recipe, t));
}

// ---------- targets ----------

export interface DayTargets {
  calMin: number;
  calMax: number;
  proteinMin: number;
}

export const DEFAULT_TARGETS: DayTargets = { calMin: 1900, calMax: 2100, proteinMin: 180 };

/** The planner's numbers for a day from the Calories and Protein checklist targets, challenge rules included. */
export function dayTargets(calories: Target | null | undefined, protein: Target | null | undefined): DayTargets {
  const out = { ...DEFAULT_TARGETS };
  if (calories?.kind === "range" && calories.max > 0) {
    out.calMin = Math.min(calories.min, calories.max);
    out.calMax = Math.max(calories.min, calories.max);
  } else if (calories?.kind === "max" && calories.max > 0) {
    out.calMax = calories.max;
    out.calMin = Math.max(0, calories.max - 200);
  } else if (calories?.kind === "min" && calories.min > 0) {
    out.calMin = calories.min;
    out.calMax = calories.min + 200;
  }
  if (protein?.kind === "min" && protein.min > 0) out.proteinMin = protein.min;
  else if (protein?.kind === "range" && protein.min > 0) out.proteinMin = protein.min;
  return out;
}

export function describeTargets(t: DayTargets): string {
  return `${t.calMin.toLocaleString("en-US")} to ${t.calMax.toLocaleString("en-US")} kcal, ${t.proteinMin}g protein or more`;
}

// ---------- display ----------

export function dollars(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 1.25 reads "1 1/4", 0.5 reads "1/2". Quarters only, anything else one decimal. */
export function fraction(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const part = round(n - whole, 2);
  const f = part === 0.25 ? "1/4" : part === 0.5 ? "1/2" : part === 0.75 ? "3/4" : null;
  if (part === 0) return String(whole);
  if (!f) return String(round(n, 1));
  return whole === 0 ? f : `${whole} ${f}`;
}

export function servingsLabel(n: number): string {
  return `${fraction(n)} ${n === 1 ? "serving" : "servings"}`;
}

/** An ingredient amount for the cook: grams to the nearest 5, spoons and cups in quarters, counts in halves. */
export function amountLabel(quantity: number, unit: string): string {
  const u = normalizeUnit(unit);
  if (u === "g" || u === "ml") {
    const q = quantity >= 20 ? Math.round(quantity / 5) * 5 : Math.max(1, Math.round(quantity));
    return `${q.toLocaleString("en-US")} ${u}`;
  }
  if (u === "each") return fraction(Math.max(0.5, Math.round(quantity * 2) / 2));
  const q = Math.max(0.25, Math.round(quantity * 4) / 4);
  return `${fraction(q)} ${u}`;
}

export type RecipeLike = Pick<Recipe, "id" | "name" | "slot" | "ingredients" | "servings" | "calories" | "protein" | "carbs" | "fat" | "est_cost" | "tags">;
