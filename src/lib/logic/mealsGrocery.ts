// Meal planning rules, part 3: one grocery list for the week. Quantities are
// combined across recipes in each food's own unit, rounded up to what a store
// sells, grouped by section, and priced through a PriceSource. Pure.

import type { PlannedMeal } from "../types";
import { costOf, findFood, foodKey, normalizeUnit, round, SECTIONS, toBase, type Food, type FoodIndex, type RecipeLike, type Section } from "./meals";
import { STORES, type PackPrices, type PriceSource, type Store } from "./mealsPricing";

export interface GroceryLine {
  /** Food name, or the typed name of an ingredient that is not in the table. */
  name: string;
  section: Section;
  /** Null for an ingredient that is not in the food table. */
  food: Food | null;
  /** What the week's meals use, in `unit`. */
  need: number;
  unit: string;
  /** Packs to buy. Whole packs, or steps of a pack for food sold by weight. */
  packs: number;
  packLabel: string;
  /** For an unknown ingredient: what the needed amount costs, from the recipe. */
  ownCost: number;
}

/** Buy this many packs to cover the need. A need within 3 percent of a pack does not tip into the next one. */
export function packsFor(food: Food, need: number): number {
  if (need <= 0) return 0;
  const step = food.step && food.step > 0 ? food.step : 1;
  const raw = need / food.pack / step;
  const n = Math.ceil(raw - 0.03 / step);
  return round(Math.max(1, n) * step, 2);
}

/**
 * Every ingredient the planned meals use, summed. Each meal's portion scales
 * its recipe: 1.5 servings of a recipe that makes 4 uses 1.5 / 4 of the batch.
 */
export function rollUp(meals: readonly PlannedMeal[], recipes: ReadonlyMap<string, RecipeLike>, index: FoodIndex): GroceryLine[] {
  const known = new Map<string, { food: Food; need: number }>();
  const other = new Map<string, GroceryLine>();
  for (const meal of meals) {
    const recipe = recipes.get(meal.recipe_id);
    if (!recipe || !(meal.servings > 0)) continue;
    const share = meal.servings / (recipe.servings > 0 ? recipe.servings : 1);
    for (const ing of recipe.ingredients) {
      const food = findFood(index, ing.name);
      const base = food ? toBase(food, ing.quantity, ing.unit) : null;
      if (food && base !== null) {
        const row = known.get(food.name) ?? { food, need: 0 };
        row.need += base * share;
        known.set(food.name, row);
        continue;
      }
      const unit = normalizeUnit(ing.unit);
      const key = `${foodKey(ing.name)}|${unit}`;
      const row =
        other.get(key) ??
        ({ name: ing.name.trim(), section: "other", food: null, need: 0, unit, packs: 0, packLabel: unit, ownCost: 0 } satisfies GroceryLine);
      row.need += ing.quantity * share;
      row.ownCost += (ing.est_cost ?? 0) * share;
      other.set(key, row);
    }
  }
  const lines: GroceryLine[] = [];
  for (const { food, need } of known.values()) {
    lines.push({ name: food.name, section: food.section, food, need: round(need, 2), unit: food.base, packs: packsFor(food, need), packLabel: food.packLabel, ownCost: 0 });
  }
  for (const row of other.values()) lines.push({ ...row, need: round(row.need, 2), packs: Math.ceil(row.need - 1e-9), ownCost: round(row.ownCost, 2) });
  return lines.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.name.localeCompare(b.name));
}

/** What a line costs at the register: packs times the pack price. */
export function linePrice(line: GroceryLine, prices: PackPrices): number {
  if (!line.food) return line.ownCost;
  return round(line.packs * prices(line.food), 2);
}

/** What the food actually eaten is worth: the used share of each pack. */
export function lineUsedCost(line: GroceryLine, prices: PackPrices): number {
  if (!line.food) return line.ownCost;
  return costOf(line.food, line.need, prices(line.food));
}

export function inPantry(line: { name: string }, pantry: ReadonlySet<string> | readonly string[]): boolean {
  const key = foodKey(line.name);
  return pantry instanceof Set ? pantry.has(key) : (pantry as readonly string[]).some((p) => foodKey(p) === key);
}

export function pantrySet(names: readonly string[]): Set<string> {
  return new Set(names.map(foodKey));
}

/** Dollars at the register for the lines that are not already at home. */
export function listTotal(lines: readonly GroceryLine[], prices: PackPrices, pantry: ReadonlySet<string>): number {
  let total = 0;
  for (const l of lines) if (!pantry.has(foodKey(l.name))) total += linePrice(l, prices);
  return round(total, 2);
}

export interface StoreTotal {
  store: Store;
  total: number;
  /** How many lines are priced from a receipt, not an estimate. */
  fromReceipts: number;
  lines: number;
  /** Dollars above the cheapest store. 0 for the cheapest. */
  above: number;
}

/** The same list priced at every store, cheapest first. */
export function compareStores(lines: readonly GroceryLine[], source: PriceSource, pantry: ReadonlySet<string>): StoreTotal[] {
  const buy = lines.filter((l) => !pantry.has(foodKey(l.name)));
  const out = STORES.map((store) => {
    let total = 0;
    let fromReceipts = 0;
    for (const l of buy) {
      if (!l.food) {
        total += l.ownCost;
        continue;
      }
      const q = source.quote(l.food, store);
      total += l.packs * q.price;
      if (q.source !== "estimate") fromReceipts += 1;
    }
    return { store, total: round(total, 2), fromReceipts, lines: buy.length, above: 0 };
  }).sort((a, b) => a.total - b.total || STORES.indexOf(a.store) - STORES.indexOf(b.store));
  const low = out[0]?.total ?? 0;
  return out.map((s) => ({ ...s, above: round(s.total - low, 2) }));
}

/** Every store's price for one line, for the grocery_item row. */
export function linePrices(line: GroceryLine, source: PriceSource): Record<string, number> {
  const out: Record<string, number> = {};
  for (const store of STORES) out[store] = line.food ? round(line.packs * source.quote(line.food, store).price, 2) : line.ownCost;
  return out;
}

// ---------- how a line reads ----------

function plural(label: string, n: number): string {
  if (n === 1) return label;
  if (/^\d/.test(label) || label === "each" || label === "lb") return label;
  if (label === "dozen") return "dozen";
  if (label.endsWith("x")) return `${label}es`;
  return `${label}s`;
}

function num(n: number): string {
  return String(round(n, 2));
}

/** "2 lb", "1 dozen", "3 cans", "2 x 12 oz bag". */
export function buyLabel(line: GroceryLine): string {
  if (!line.food) return `${num(line.need)} ${line.unit === "each" ? "" : line.unit}`.trim();
  const n = line.packs;
  const label = line.packLabel;
  if (label === "each") return num(n);
  if (/^\d/.test(label)) return n === 1 ? label : `${num(n)} x ${label}`;
  return `${num(n)} ${plural(label, n)}`;
}

/** What the recipes use, in kitchen terms: "680 g", "8", "1.4 L". */
export function needLabel(line: GroceryLine): string {
  if (line.unit === "each") return `${num(round(line.need, 1))}`;
  if (line.unit === "g" || line.unit === "ml") {
    const n = line.need;
    if (n >= 1000) return `${round(n / 1000, 2)} ${line.unit === "g" ? "kg" : "L"}`;
    return `${Math.round(n)} ${line.unit}`;
  }
  return `${num(line.need)} ${line.unit}`;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function displayName(name: string): string {
  return titleCase(name.replace(/^frozen /, "")) + (name.startsWith("frozen ") ? ", frozen" : "");
}

/** The list as plain text, to copy or share. Sections as headings, one item per line. */
export function listAsText(lines: readonly GroceryLine[], pantry: ReadonlySet<string>, title: string, labels: Record<Section, string>): string {
  const out: string[] = [title];
  let section: Section | null = null;
  for (const l of lines) {
    if (pantry.has(foodKey(l.name))) continue;
    if (l.section !== section) {
      section = l.section;
      out.push("", labels[section]);
    }
    out.push(`[ ] ${displayName(l.name)}, ${buyLabel(l)}`);
  }
  return out.join("\n");
}

// ---------- Instacart ----------

export interface InstacartLineItem {
  name: string;
  quantity: number;
  unit: string;
  display_text: string;
}

/**
 * Line items for Instacart's "create shopping list page" call. Weights go as
 * grams or milliliters of what the recipes need, counts as each, so Instacart
 * matches a product size itself.
 */
export function instacartItems(lines: readonly GroceryLine[], pantry: ReadonlySet<string>): InstacartLineItem[] {
  return lines
    .filter((l) => !pantry.has(foodKey(l.name)) && l.need > 0)
    .map((l) => {
      const unit = l.unit === "g" ? "gram" : l.unit === "ml" ? "milliliter" : l.unit === "each" ? "each" : l.unit;
      const quantity = l.unit === "each" ? Math.ceil(l.need - 1e-9) : Math.ceil(l.need);
      return { name: l.name, quantity, unit, display_text: `${displayName(l.name)}, ${buyLabel(l)}` };
    });
}

// ---------- budget against actual ----------

export interface BudgetActual {
  budget: number;
  estimated: number;
  spent: number;
  /** Positive: under budget. */
  left: number;
  over: boolean;
  /** spent minus estimated, once something is spent. */
  offEstimate: number | null;
}

export function budgetActual(budget: number, estimated: number, spent: number): BudgetActual {
  return {
    budget,
    estimated: round(estimated, 2),
    spent: round(spent, 2),
    left: round(budget - spent, 2),
    over: spent > budget + 0.004,
    offEstimate: spent > 0 ? round(spent - estimated, 2) : null,
  };
}
