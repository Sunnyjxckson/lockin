// Meal planning rules, part 2: the week planner. Pure and deterministic: the
// same input and seed always give the same week.
//
// A week is 7 days of breakfast, lunch, dinner and a snack. A few recipes per
// slot repeat across the week (batch cooking), which keeps the grocery list
// short. Portions are scaled per day so each day lands in its calorie range
// and reaches its protein minimum. Cost is what the week's list costs at the
// register (whole packs, pantry items left out), so sharing ingredients
// between recipes is rewarded by the math itself.

import type { DateStr, MealSlot, PlannedMeal } from "../types";
import { addDays } from "./dates";
import { findFood, isExcluded, matchCount, round, SLOTS, type DayTargets, type FoodIndex, type Macros, type RecipeLike } from "./meals";
import { listTotal, lineUsedCost, pantrySet, rollUp } from "./mealsGrocery";
import type { PackPrices } from "./mealsPricing";

export type Variety = "batch" | "balanced" | "varied";

export interface PlanPrefs {
  /** Lean toward these, on top of the saved likes. */
  boost?: string[];
  /** Leave these out, on top of the saved dislikes. */
  avoid?: string[];
  /** Pick the cheapest options for these slots. */
  cheaperSlots?: MealSlot[];
  variety?: Variety;
}

export interface PlanContext {
  recipes: readonly RecipeLike[];
  foods: FoodIndex;
  prices: PackPrices;
  /** Food names already at home. They cost nothing. */
  pantry: readonly string[];
  targets: DayTargets;
  /** A different target on some dates, for a challenge that starts or ends mid week. */
  targetsByDate?: Record<DateStr, DayTargets>;
  likes: readonly string[];
  dislikes: readonly string[];
  budget: number;
}

export interface PlanInput extends PlanContext {
  /** A Monday. */
  weekStart: DateStr;
  seed: number;
  prefs?: PlanPrefs;
}

export interface DayPlan extends Macros {
  date: DateStr;
  /** Food eaten that day at its share of each pack. */
  cost: number;
  calOk: boolean;
  proteinOk: boolean;
  ok: boolean;
  /** kcal outside the range: negative under, positive over, 0 inside. */
  calOff: number;
  /** Grams short of the protein minimum, 0 when reached. */
  proteinShort: number;
  targets: DayTargets;
}

export interface PlanSummary {
  days: DayPlan[];
  /** Estimated dollars at the register for the week's list, pantry left out. */
  cost: number;
  /** Estimated dollars of food actually eaten. */
  foodCost: number;
  budget: number;
  /** Dollars over budget, 0 when inside it. */
  overBy: number;
  allDaysOk: boolean;
  /** Distinct things to buy. */
  items: number;
}

export type PlanStatus = "ok" | "over_budget" | "targets_missed" | "no_recipes";

export interface PlanResult extends PlanSummary {
  status: PlanStatus;
  /** One plain sentence or two about what happened. Empty when all is well. */
  message: string;
  meals: PlannedMeal[];
  recipeIds: string[];
}

// ---------- seeded random ----------

/** mulberry32: small, fast, and the same on every device. */
export function rng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- one day ----------

// Portions stay near a normal plate: nobody wants half a lunch and a triple dinner.
const MAIN_PORTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SNACK_PORTIONS = [0.5, 1, 1.5, 2];

export function portionsFor(slot: MealSlot): readonly number[] {
  return slot === "snack" ? SNACK_PORTIONS : MAIN_PORTIONS;
}

function targetsOn(ctx: Pick<PlanContext, "targets" | "targetsByDate">, date: DateStr): DayTargets {
  return ctx.targetsByDate?.[date] ?? ctx.targets;
}

function miss(calories: number, protein: number, t: DayTargets): { calOff: number; proteinShort: number; penalty: number } {
  const calOff = calories < t.calMin ? calories - t.calMin : calories > t.calMax ? calories - t.calMax : 0;
  const proteinShort = Math.max(0, t.proteinMin - protein);
  return { calOff, proteinShort, penalty: Math.abs(calOff) / 10 + proteinShort * 4 };
}

/**
 * Portions for one day's recipes that land in the calorie range and reach the
 * protein minimum at the lowest cost, staying near one serving where it can.
 * Tries every combination of quarter servings (halves for a snack). When the
 * numbers cannot be hit it returns the nearest miss.
 */
export function solveDay(recipes: readonly RecipeLike[], t: DayTargets): number[] {
  const n = recipes.length;
  if (n === 0) return [];
  const options = recipes.map((r) => portionsFor(r.slot));
  const pick = new Array<number>(n).fill(0);
  let best: number[] = recipes.map(() => 1);
  let bestScore = Infinity;
  const walk = (i: number, cal: number, pro: number, cost: number, away: number) => {
    if (i === n) {
      const m = miss(cal, pro, t);
      const score = m.penalty * 1000 + cost * 3 + away;
      if (score < bestScore - 1e-9) {
        bestScore = score;
        best = pick.slice();
      }
      return;
    }
    const r = recipes[i];
    for (const s of options[i]) {
      pick[i] = s;
      walk(i + 1, cal + r.calories * s, pro + r.protein * s, cost + r.est_cost * s, away + (s - 1) * (s - 1) * 8);
    }
  };
  walk(0, 0, 0, 0, 0);
  return best;
}

// ---------- summary of any set of meals ----------

function byId(recipes: readonly RecipeLike[]): Map<string, RecipeLike> {
  return new Map(recipes.map((r) => [r.id, r]));
}

function weekDates(weekStart: DateStr): DateStr[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart, i));
}

/** Macros, cost and budget for a set of planned meals. The planner, a swap, and the screen all read the week through this. */
export function summarizePlan(meals: readonly PlannedMeal[], ctx: PlanContext, dates?: readonly DateStr[]): PlanSummary {
  const recipes = byId(ctx.recipes);
  const pantry = pantrySet(ctx.pantry);
  const allDates = dates ?? [...new Set(meals.map((m) => m.date))].sort();
  const days: DayPlan[] = allDates.map((date) => {
    const t = targetsOn(ctx, date);
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let cost = 0;
    for (const m of meals) {
      if (m.date !== date) continue;
      const r = recipes.get(m.recipe_id);
      if (!r) continue;
      calories += r.calories * m.servings;
      protein += r.protein * m.servings;
      carbs += r.carbs * m.servings;
      fat += r.fat * m.servings;
      cost += r.est_cost * m.servings;
    }
    const m = miss(calories, protein, t);
    return {
      date,
      calories: round(calories),
      protein: round(protein),
      carbs: round(carbs),
      fat: round(fat),
      cost: round(cost, 2),
      calOk: m.calOff === 0,
      proteinOk: m.proteinShort === 0,
      ok: m.penalty === 0,
      calOff: round(m.calOff),
      proteinShort: round(m.proteinShort),
      targets: t,
    };
  });
  const lines = rollUp(meals, recipes, ctx.foods);
  const cost = listTotal(lines, ctx.prices, pantry);
  let foodCost = 0;
  for (const l of lines) foodCost += lineUsedCost(l, ctx.prices);
  return {
    days,
    cost,
    foodCost: round(foodCost, 2),
    budget: ctx.budget,
    overBy: round(Math.max(0, cost - ctx.budget), 2),
    allDaysOk: days.length > 0 && days.every((d) => d.ok),
    items: lines.filter((l) => !pantry.has(l.name)).length,
  };
}

// ---------- choosing recipes ----------

/** Which of a slot's recipes each weekday eats. Runs of the same dish are the batch. */
const ROTATION: Record<Variety, Record<MealSlot, number[]>> = {
  batch: {
    breakfast: [0, 0, 0, 0, 0, 0, 0],
    lunch: [0, 0, 0, 0, 1, 1, 1],
    dinner: [0, 0, 0, 1, 1, 1, 1],
    snack: [0, 0, 0, 0, 0, 0, 0],
  },
  balanced: {
    breakfast: [0, 0, 0, 0, 1, 1, 1],
    lunch: [0, 0, 0, 1, 1, 1, 1],
    dinner: [0, 0, 1, 1, 2, 2, 0],
    snack: [0, 1, 0, 1, 0, 1, 0],
  },
  varied: {
    breakfast: [0, 0, 1, 1, 2, 2, 0],
    lunch: [0, 0, 1, 1, 2, 2, 2],
    dinner: [0, 0, 1, 1, 2, 2, 3],
    snack: [0, 1, 2, 0, 1, 2, 0],
  },
};

function countFor(variety: Variety, slot: MealSlot): number {
  return Math.max(...ROTATION[variety][slot]) + 1;
}

type Picks = Record<MealSlot, RecipeLike[]>;

function mealsFrom(picks: Picks, weekStart: DateStr, variety: Variety, ctx: PlanContext, cache: Map<string, number[]>): PlannedMeal[] {
  const dates = weekDates(weekStart);
  const out: PlannedMeal[] = [];
  dates.forEach((date, i) => {
    const day = SLOTS.map((slot) => picks[slot][ROTATION[variety][slot][i] % picks[slot].length]);
    const t = targetsOn(ctx, date);
    const key = `${day.map((r) => r.id).join("|")}|${t.calMin}|${t.calMax}|${t.proteinMin}`;
    let portions = cache.get(key);
    if (!portions) {
      portions = solveDay(day, t);
      cache.set(key, portions);
    }
    day.forEach((r, j) => out.push({ date, slot: r.slot, recipe_id: r.id, servings: portions![j] }));
  });
  return out;
}

function sharedFoods(r: RecipeLike, chosen: ReadonlySet<string>, pantry: ReadonlySet<string>): number {
  let n = 0;
  for (const i of r.ingredients) if (chosen.has(i.name) && !pantry.has(i.name)) n += 1;
  return n;
}

interface Scored {
  meals: PlannedMeal[];
  picks: Picks;
  summary: PlanSummary;
  penalty: number;
  like: number;
  /** Dollars of food in the slots the user asked to make cheaper. */
  cheapSlots: number;
}

function totalPenalty(s: PlanSummary): number {
  return s.days.reduce((a, d) => a + Math.abs(d.calOff) / 10 + d.proteinShort * 4, 0);
}

/** Lower is better. Feasible and inside budget first, then liked, then cheap. */
function better(a: Scored, b: Scored | null, budget: number): boolean {
  if (!b) return true;
  const tier = (s: Scored) => (s.penalty > 0 ? 2 : s.summary.cost > budget + 0.004 ? 1 : 0);
  const ta = tier(a);
  const tb = tier(b);
  if (ta !== tb) return ta < tb;
  if (ta === 2) return a.penalty !== b.penalty ? a.penalty < b.penalty : a.summary.cost < b.summary.cost;
  if (ta === 1) return a.summary.cost < b.summary.cost;
  const value = (s: Scored) => s.like * 4 - (s.summary.cost / Math.max(1, budget)) * 10 - s.summary.items * 0.1 - s.cheapSlots * 0.6;
  return value(a) > value(b) + 1e-9;
}

const SLOT_WORD: Record<MealSlot, string> = { breakfast: "breakfasts", lunch: "lunches", dinner: "dinners", snack: "snacks" };

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build a week. Tries many seeded combinations of recipes, scales each day's
 * portions, prices the week's grocery list, and keeps the best: every day on
 * target and inside the budget if that exists, leaning toward likes. When no
 * such week exists it says why and returns the closest one:
 *   over_budget: the cheapest week found that hits the targets, and its cost
 *   targets_missed: the week that comes nearest the targets
 *   no_recipes: a slot has nothing left after dislikes
 */
export function planWeek(input: PlanInput): PlanResult {
  const variety = input.prefs?.variety ?? "balanced";
  const dislikes = [...input.dislikes, ...(input.prefs?.avoid ?? [])];
  const likes = [...input.likes, ...(input.prefs?.boost ?? [])];
  const cheaper = new Set(input.prefs?.cheaperSlots ?? []);
  const pantry = pantrySet(input.pantry);
  const ctx: PlanContext = input;
  const dates = weekDates(input.weekStart);

  const pools = {} as Record<MealSlot, RecipeLike[]>;
  const empty: MealSlot[] = [];
  for (const slot of SLOTS) {
    pools[slot] = input.recipes.filter((r) => r.slot === slot && !isExcluded(r, dislikes)).sort((a, b) => a.id.localeCompare(b.id));
    if (pools[slot].length === 0) empty.push(slot);
  }
  if (empty.length > 0) {
    const s = summarizePlan([], ctx, dates);
    const what = empty.map((e) => SLOT_WORD[e]).join(" and ");
    return {
      ...s,
      status: "no_recipes",
      message: `No ${what} are left after your dislikes. Remove a dislike or add a recipe, then build again.`,
      meals: [],
      recipeIds: [],
    };
  }

  const likeOf = new Map<string, number>();
  for (const r of input.recipes) likeOf.set(r.id, matchCount(r, likes));
  /** Dollars per 30 g of protein with pantry items free: the planner's idea of cheap. */
  const leanCost = new Map<string, number>();
  for (const r of input.recipes) {
    let cost = 0;
    for (const i of r.ingredients) {
      const food = findFood(input.foods, i.name);
      if (food && pantry.has(food.name)) continue;
      cost += i.est_cost ?? 0;
    }
    const perServing = cost / (r.servings > 0 ? r.servings : 1);
    leanCost.set(r.id, (perServing / Math.max(5, r.protein)) * 30);
  }

  const costOfRecipe = new Map(input.recipes.map((r) => [r.id, r.est_cost]));
  const cache = new Map<string, number[]>();
  const random = rng(input.seed);

  const score = (picks: Picks): Scored => {
    const meals = mealsFrom(picks, input.weekStart, variety, ctx, cache);
    const summary = summarizePlan(meals, ctx, dates);
    let like = 0;
    let cheapSlots = 0;
    for (const m of meals) {
      like += likeOf.get(m.recipe_id) ?? 0;
      if (cheaper.has(m.slot)) cheapSlots += (costOfRecipe.get(m.recipe_id) ?? 0) * m.servings;
    }
    return { meals, picks, summary, penalty: totalPenalty(summary), like: like / 28, cheapSlots };
  };

  const choose = (costWeight: number, jitter: number): Picks => {
    const picks = {} as Picks;
    const chosenFoods = new Set<string>();
    for (const slot of SLOTS) {
      const want = Math.min(countFor(variety, slot), pools[slot].length);
      const w = cheaper.has(slot) ? costWeight * 3 + 2 : costWeight;
      const taken: RecipeLike[] = [];
      const left = pools[slot].slice();
      while (taken.length < want) {
        let bestIndex = 0;
        let bestValue = -Infinity;
        left.forEach((r, i) => {
          const density = (r.protein * 4) / Math.max(1, r.calories);
          const value =
            density * 6 +
            (likeOf.get(r.id) ?? 0) * 2.5 -
            (leanCost.get(r.id) ?? 0) * w +
            sharedFoods(r, chosenFoods, pantry) * 0.35 +
            random() * jitter;
          if (value > bestValue) {
            bestValue = value;
            bestIndex = i;
          }
        });
        const [r] = left.splice(bestIndex, 1);
        taken.push(r);
        for (const i of r.ingredients) chosenFoods.add(i.name);
      }
      picks[slot] = taken;
    }
    return picks;
  };

  const tried: Scored[] = [];
  const ATTEMPTS = 140;
  for (let k = 0; k < ATTEMPTS; k += 1) {
    // The first few runs are plain greedy at rising cost pressure, so a tight
    // budget always gets an honest cheapest try. The rest explore.
    const costWeight = k < 6 ? k * 0.8 : random() * 3;
    const jitter = k < 6 ? 0 : 1 + random() * 3;
    tried.push(score(choose(costWeight, jitter)));
  }
  tried.sort((a, b) => (better(a, b, input.budget) ? -1 : better(b, a, input.budget) ? 1 : 0));
  let winner = tried[0];

  // Over budget or off target: take the best few starts and walk each one
  // downhill a recipe at a time until no single change helps, so "cannot be
  // done" is not a guess from a handful of tries.
  if (winner.penalty > 0 || winner.summary.cost > input.budget + 0.004) {
    const starts: Scored[] = [];
    const seen = new Set<string>();
    for (const s of tried) {
      const key = SLOTS.map((slot) => s.picks[slot].map((r) => r.id).join(",")).join("/");
      if (seen.has(key)) continue;
      seen.add(key);
      starts.push(s);
      if (starts.length === 3) break;
    }
    for (const start of starts) {
      let at = start;
      let improved = true;
      let guard = 0;
      while (improved && guard < 12) {
        improved = false;
        guard += 1;
        for (const slot of SLOTS) {
          for (let i = 0; i < at.picks[slot].length; i += 1) {
            for (const alt of pools[slot]) {
              if (at.picks[slot].some((r) => r.id === alt.id)) continue;
              const picks = { ...at.picks, [slot]: at.picks[slot].map((r, j) => (j === i ? alt : r)) } as Picks;
              const s = score(picks);
              if (better(s, at, input.budget)) {
                at = s;
                improved = true;
              }
            }
          }
        }
      }
      if (better(at, winner, input.budget)) winner = at;
    }
  }

  const { summary, meals } = winner;
  const t = input.targets;
  const range = `${t.calMin.toLocaleString("en-US")} to ${t.calMax.toLocaleString("en-US")} kcal`;
  let status: PlanStatus = "ok";
  let message = "";
  if (winner.penalty > 0) {
    status = "targets_missed";
    const off = summary.days.filter((d) => !d.ok).length;
    const short = Math.max(...summary.days.map((d) => d.proteinShort));
    const why = short > 0 ? `The closest it gets is ${short}g short of ${t.proteinMin}g protein inside ${range}.` : `The closest it gets is outside ${range} on ${off} of 7 days.`;
    message = `These recipes cannot hit your numbers every day. ${why} This is the nearest week, at about ${money(summary.cost)}.`;
  } else if (summary.cost > input.budget + 0.004) {
    status = "over_budget";
    message = `${money(input.budget)} a week is not enough to reach ${t.proteinMin}g protein and ${range} every day at these estimated prices. The cheapest week found costs about ${money(summary.cost)}, which is ${money(summary.overBy)} over. Raise the budget to about ${money(Math.ceil(summary.cost))}, or mark what you already have at home.`;
  }
  return { ...summary, status, message, meals, recipeIds: [...new Set(meals.map((m) => m.recipe_id))] };
}

// ---------- editing a plan ----------

/** Re-scale one day's portions around the recipes it has now. Other days are untouched. */
export function rebalanceDay(meals: readonly PlannedMeal[], date: DateStr, ctx: PlanContext): PlannedMeal[] {
  const recipes = byId(ctx.recipes);
  const day = meals.filter((m) => m.date === date && recipes.has(m.recipe_id));
  if (day.length === 0) return meals.slice();
  const portions = solveDay(
    day.map((m) => recipes.get(m.recipe_id)!),
    targetsOn(ctx, date),
  );
  const next = new Map(day.map((m, i) => [m, portions[i]]));
  return meals.map((m) => (next.has(m) ? { ...m, servings: next.get(m)! } : m));
}

export type SwapScope = "day" | "week";

/** Put another recipe in a slot, on one day or on every day that slot has the same dish, then re-scale those days. */
export function applySwap(meals: readonly PlannedMeal[], date: DateStr, slot: MealSlot, recipeId: string, scope: SwapScope, ctx: PlanContext): PlannedMeal[] {
  const current = meals.find((m) => m.date === date && m.slot === slot);
  if (!current) return meals.slice();
  const touched = new Set<DateStr>();
  let next = meals.map((m) => {
    const hit = m.slot === slot && (scope === "week" ? m.recipe_id === current.recipe_id : m.date === date);
    if (!hit) return m;
    touched.add(m.date);
    // Keep anything else stored on the meal except that it was cooked: it is a different dish now.
    return { date: m.date, slot: m.slot, recipe_id: recipeId, servings: m.servings };
  });
  for (const d of touched) next = rebalanceDay(next, d, ctx);
  return next;
}

export interface SwapOption {
  recipe: RecipeLike;
  meals: PlannedMeal[];
  /** The swapped day after its portions are re-scaled. */
  day: DayPlan;
  /** The new portion of the new dish on that day. */
  servings: number;
  weekCost: number;
  /** Dollars the week's list moves by. Negative is cheaper. */
  costDelta: number;
  overBudget: boolean;
  liked: boolean;
  /** How many days change. */
  days: number;
}

/**
 * Every other recipe that could go in a slot, best fit first: the day still
 * hits its numbers, the week stays inside budget, liked dishes, then cheapest.
 * Each option carries the whole week as it would be, so the screen shows the
 * effect before anything is saved.
 */
export function swapOptions(meals: readonly PlannedMeal[], date: DateStr, slot: MealSlot, scope: SwapScope, ctx: PlanContext): SwapOption[] {
  const current = meals.find((m) => m.date === date && m.slot === slot);
  const dates = [...new Set(meals.map((m) => m.date))].sort();
  const before = summarizePlan(meals, ctx, dates);
  const out: SwapOption[] = [];
  for (const recipe of ctx.recipes) {
    if (recipe.slot !== slot || recipe.id === current?.recipe_id || isExcluded(recipe, ctx.dislikes)) continue;
    const next = applySwap(meals, date, slot, recipe.id, scope, ctx);
    const s = summarizePlan(next, ctx, dates);
    const day = s.days.find((d) => d.date === date);
    if (!day) continue;
    out.push({
      recipe,
      meals: next,
      day,
      servings: next.find((m) => m.date === date && m.slot === slot)?.servings ?? 1,
      weekCost: s.cost,
      costDelta: round(s.cost - before.cost, 2),
      overBudget: s.cost > ctx.budget + 0.004,
      liked: matchCount(recipe, ctx.likes) > 0,
      days: next.filter((m, i) => m.recipe_id !== meals[i].recipe_id).length,
    });
  }
  const rank = (o: SwapOption) => (o.day.ok ? 0 : 2) + (o.overBudget ? 1 : 0);
  const off = (o: SwapOption) => Math.abs(o.day.calOff) / 10 + o.day.proteinShort * 4;
  return out.sort(
    (a, b) => rank(a) - rank(b) || off(a) - off(b) || Number(b.liked) - Number(a.liked) || a.costDelta - b.costDelta || a.recipe.name.localeCompare(b.recipe.name),
  );
}
