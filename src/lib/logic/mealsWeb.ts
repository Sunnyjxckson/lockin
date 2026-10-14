// Meal planning rules, part 4: recipes found on the web. Pure, no db.
//
// A model searches the web and hands back recipes as plain ingredient lists.
// Nothing it says about calories, macros or cost is used. Every number is
// worked out here from the food table, the same way the built in library is.
// An ingredient the food table does not know is flagged: the recipe is still
// usable, its numbers are marked partial, and a recipe whose calories mostly
// cannot be worked out is dropped.

import type { Ingredient, MealSlot, Recipe } from "../types";
import { cleanLine } from "./text";
import {
  derivedTags,
  findFood,
  foodKey,
  isExcluded,
  matchCount,
  normalizeUnit,
  round,
  SLOTS,
  recipeNumbers,
  type FoodIndex,
  type IngredientLine,
} from "./meals";

/** What one found recipe looks like once it has been checked and its numbers worked out. Numbers are per serving. */
export interface WebRecipe {
  name: string;
  slot: MealSlot;
  servings: number;
  /** Total minutes, or null when the page did not say. */
  minutes: number | null;
  source_url: string;
  source_name: string;
  /** Whole batch, matched to the food table where it could be. */
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  est_cost: number;
  /** True when a significant ingredient is not in the food table, so the numbers run low. */
  partial: boolean;
  /** Significant ingredients that could not be counted. */
  unknown: string[];
}

export interface WebFilters {
  dislikes?: readonly string[];
  likes?: readonly string[];
  /** Recipes already in the library, so the same one is not found twice. */
  knownNames?: readonly string[];
  knownUrls?: readonly string[];
  /** Drop recipes that take longer than this. */
  maxMinutes?: number | null;
  max?: number;
}

/** http or https only, nothing else. Returns the cleaned address or null. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > 2000) return null;
  try {
    const u = new URL(text);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** "Serious Eats" from a link when the model gave no site name. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Pull the JSON out of a model answer: bare, or inside a code fence, or with words around it. */
export function extractJson(text: string): unknown {
  const body = text.trim();
  const attempts: string[] = [body];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence) attempts.push(fence[1].trim());
  for (const open of ["[", "{"]) {
    const close = open === "[" ? "]" : "}";
    const a = body.indexOf(open);
    const b = body.lastIndexOf(close);
    if (a >= 0 && b > a) attempts.push(body.slice(a, b + 1));
  }
  for (const t of attempts) {
    try {
      return JSON.parse(t);
    } catch {
      // try the next shape
    }
  }
  return null;
}

// ---------- ingredients ----------

/**
 * Look a name up in the food table. Tries the name, then a plural or a
 * trailing "s" off, then the longest food that the name ends with ("white
 * rice" is rice, "boneless chicken breast" is chicken breast).
 */
export function resolveFood(index: FoodIndex, name: string) {
  const direct = findFood(index, name);
  if (direct) return direct;
  const k = foodKey(name);
  const single = k.endsWith("s") ? index.get(k.slice(0, -1)) : undefined;
  if (single) return single;
  const plural = index.get(`${k}s`);
  if (plural) return plural;
  let best: ReturnType<typeof findFood> = null;
  for (const food of index.values()) {
    const base = food.name.endsWith("s") ? food.name.slice(0, -1) : food.name;
    const hit = k.endsWith(` ${food.name}`) || k.endsWith(` ${base}`) || k.endsWith(` ${base}s`);
    if (hit && (!best || food.name.length > best.name.length)) best = food;
  }
  return best;
}

const SMALL_NAMES = new Set(["salt", "pepper", "black pepper", "water", "ice", "cooking spray", "kosher salt", "sea salt"]);

/** A pinch, a teaspoon, a tablespoon or less, or plain salt and water: too small to move the calories. */
export function isMinor(line: { name: string; quantity: number; unit: string }): boolean {
  const u = normalizeUnit(line.unit);
  if (SMALL_NAMES.has(foodKey(line.name))) return true;
  if (u === "pinch" || u === "dash" || u === "tsp") return true;
  if (u === "tbsp" && line.quantity <= 1) return true;
  return false;
}

/** A rough calorie guess for something not in the table, only used to judge how much is missing. */
function guessCalories(line: { quantity: number; unit: string }): number {
  const u = normalizeUnit(line.unit);
  const q = line.quantity;
  if (u === "g" || u === "oz" || u === "lb" || u === "kg") {
    const grams = u === "g" ? q : u === "oz" ? q * 28.35 : u === "lb" ? q * 453.6 : q * 1000;
    return grams * 1.5;
  }
  if (u === "ml" || u === "l" || u === "tsp" || u === "tbsp" || u === "cup" || u === "fl oz") {
    const ml = u === "ml" ? q : u === "l" ? q * 1000 : u === "tsp" ? q * 4.93 : u === "tbsp" ? q * 14.79 : u === "cup" ? q * 236.6 : q * 29.57;
    return ml * 0.8;
  }
  return q * 50;
}

export interface WebNumbers {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  est_cost: number;
  ingredients: Ingredient[];
  /** Significant ingredients that were not counted. */
  unknown: string[];
  partial: boolean;
  /** Share of the recipe's calories that could be worked out, 0 to 1. */
  covered: number;
}

/** One serving of a found recipe, from the food table only. */
export function webNumbers(lines: readonly IngredientLine[], servings: number, index: FoodIndex): WebNumbers {
  // Match names to the table first, so "chicken breasts" counts as chicken breast.
  const matched = lines.map((l) => {
    const food = resolveFood(index, l.name);
    return food ? { ...l, name: food.name } : l;
  });
  const n = recipeNumbers(matched, servings, index);
  const batchKnown = n.calories * (servings > 0 ? servings : 1);
  let missing = 0;
  const unknown: string[] = [];
  for (const line of matched) {
    const food = findFood(index, line.name);
    const counted = food ? recipeNumbers([line], 1, index).unknown.length === 0 : false;
    if (counted) continue;
    if (isMinor(line)) continue;
    missing += guessCalories(line);
    if (!unknown.includes(line.name.trim())) unknown.push(line.name.trim());
  }
  const total = batchKnown + missing;
  const covered = total > 0 ? batchKnown / total : 0;
  return {
    calories: n.calories,
    protein: n.protein,
    carbs: n.carbs,
    fat: n.fat,
    est_cost: n.est_cost,
    ingredients: n.ingredients,
    unknown,
    partial: unknown.length > 0 && covered < 0.9,
    covered,
  };
}

// ---------- checking what the model sent ----------

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function listOf(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object" && Array.isArray((v as { recipes?: unknown }).recipes)) return (v as { recipes: unknown[] }).recipes;
  return [];
}

/** One recipe from the model, or null when it is not usable. */
export function checkWebRecipe(raw: unknown, index: FoodIndex): WebRecipe | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = cleanLine(r.name, 80);
  const url = safeUrl(r.source_url);
  if (!name || !url) return null;
  const slot = SLOTS.includes(r.slot as MealSlot) ? (r.slot as MealSlot) : "dinner";
  const servingsIn = num(r.servings);
  const servings = servingsIn !== null && servingsIn >= 1 && servingsIn <= 24 ? Math.round(servingsIn * 2) / 2 : 4;
  const minutesIn = num(r.minutes);
  const minutes = minutesIn !== null && minutesIn >= 1 && minutesIn <= 720 ? Math.round(minutesIn) : null;

  const lines: IngredientLine[] = [];
  for (const item of Array.isArray(r.ingredients) ? r.ingredients : []) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    const iname = cleanLine(i.name, 60);
    const quantity = num(i.quantity);
    if (!iname || quantity === null || quantity <= 0 || quantity > 100000) continue;
    lines.push({ name: iname, quantity, unit: cleanLine(i.unit, 20), category: "other" });
  }
  if (lines.length < 2) return null;

  const steps = (Array.isArray(r.steps) ? r.steps : [])
    .map((s) => cleanLine(s, 280))
    .filter(Boolean)
    .slice(0, 14);

  const n = webNumbers(lines, servings, index);
  // Mostly unknown: the numbers would mislead more than help.
  if (n.covered < 0.5 || n.calories < 50 || n.calories > 2500) return null;

  const tags = derivedTags(lines.map((l) => ({ name: resolveFood(index, l.name)?.name ?? l.name })), index, ["web", ...(minutes !== null && minutes <= 25 ? ["quick"] : [])]);
  if (n.partial) tags.push("partial");

  return {
    name,
    slot,
    servings,
    minutes,
    source_url: url,
    source_name: cleanLine(r.source_name, 60) || hostLabel(url),
    ingredients: n.ingredients,
    steps,
    tags: [...new Set(tags)].sort(),
    calories: n.calories,
    protein: n.protein,
    carbs: n.carbs,
    fat: n.fat,
    est_cost: n.est_cost,
    partial: n.partial,
    unknown: n.unknown,
  };
}

function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Everything the model sent, checked and numbered. Drops duplicates, anything
 * already in the library, anything with a disliked food, and anything over
 * the cook time. Liked foods come first.
 */
export function cleanWebRecipes(raw: unknown, index: FoodIndex, filters: WebFilters = {}): WebRecipe[] {
  const names = new Set((filters.knownNames ?? []).map((n) => foodKey(n)));
  const urls = new Set((filters.knownUrls ?? []).map(urlKey));
  const seen = new Set<string>();
  const out: WebRecipe[] = [];
  for (const item of listOf(raw)) {
    const r = checkWebRecipe(item, index);
    if (!r) continue;
    const nk = foodKey(r.name);
    const uk = urlKey(r.source_url);
    if (names.has(nk) || urls.has(uk) || seen.has(nk) || seen.has(uk)) continue;
    if (filters.dislikes && isExcluded(r, filters.dislikes)) continue;
    if (filters.maxMinutes && r.minutes !== null && r.minutes > filters.maxMinutes) continue;
    seen.add(nk);
    seen.add(uk);
    out.push(r);
  }
  const likes = filters.likes ?? [];
  if (likes.length > 0) out.sort((a, b) => matchCount(b, likes) - matchCount(a, likes));
  return out.slice(0, filters.max ?? 12);
}

/** The recipe row to save. Source is "web", so the planner treats it like any other recipe. */
export function toRecipeRow(w: WebRecipe): Omit<Recipe, "id" | "created_at"> {
  return {
    name: w.name,
    slot: w.slot,
    ingredients: w.ingredients,
    steps: w.steps,
    servings: w.servings,
    calories: w.calories,
    protein: w.protein,
    carbs: w.carbs,
    fat: w.fat,
    est_cost: round(w.est_cost, 2),
    tags: w.tags,
    photo_url: null,
    source: "web",
    source_url: w.source_url,
    source_name: w.source_name,
    minutes: w.minutes,
  };
}
