import { describe, expect, it } from "vitest";
import { DEFAULT_TARGETS, indexFoods, isExcluded, matchCount, type RecipeLike } from "./meals";
import { FOODS, STAPLES } from "./mealsFoods";
import { rollUp, listTotal, pantrySet } from "./mealsGrocery";
import { libraryWithIds } from "./mealsLibrary";
import { applySwap, planWeek, portionsFor, rebalanceDay, rng, solveDay, summarizePlan, swapOptions, type PlanInput } from "./mealsPlanner";
import { basePrices, estimateSource, pricesAt } from "./mealsPricing";

const recipes = libraryWithIds();
const foods = indexFoods(FOODS);
const byId = new Map<string, RecipeLike>(recipes.map((r) => [r.id, r]));
const named = (name: string) => recipes.find((r) => r.name === name)!;
const WEEK = "2026-10-05";

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    recipes,
    foods,
    prices: basePrices,
    pantry: [...STAPLES],
    targets: DEFAULT_TARGETS,
    likes: [],
    dislikes: [],
    budget: 80,
    weekStart: WEEK,
    seed: 7,
    ...over,
  };
}

describe("rng", () => {
  it("is the same for the same seed and different for another", () => {
    const a = rng(42);
    const b = rng(42);
    const c = rng(43);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect([c(), c(), c()]).not.toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("solveDay", () => {
  const day = [named("Protein oats"), named("Chicken, rice and broccoli"), named("Chicken stir fry"), named("Protein shake")];

  it("scales portions into the calorie range and over the protein minimum", () => {
    const s = solveDay(day, DEFAULT_TARGETS);
    const cal = day.reduce((a, r, i) => a + r.calories * s[i], 0);
    const pro = day.reduce((a, r, i) => a + r.protein * s[i], 0);
    expect(cal).toBeGreaterThanOrEqual(1900);
    expect(cal).toBeLessThanOrEqual(2100);
    expect(pro).toBeGreaterThanOrEqual(180);
    s.forEach((x, i) => expect(portionsFor(day[i].slot)).toContain(x));
  });

  it("follows tighter targets", () => {
    const t = { calMin: 1800, calMax: 1900, proteinMin: 185 };
    const s = solveDay(day, t);
    const cal = day.reduce((a, r, i) => a + r.calories * s[i], 0);
    const pro = day.reduce((a, r, i) => a + r.protein * s[i], 0);
    expect(cal).toBeGreaterThanOrEqual(1800);
    expect(cal).toBeLessThanOrEqual(1900);
    expect(pro).toBeGreaterThanOrEqual(185);
  });

  it("returns the nearest miss when the numbers cannot be hit", () => {
    const low = [named("Peanut butter banana rice cakes"), named("Turkey spaghetti"), named("Peanut tofu noodles"), named("Protein oat bites")];
    const s = solveDay(low, { calMin: 1500, calMax: 1600, proteinMin: 260 });
    const cal = low.reduce((a, r, i) => a + r.calories * s[i], 0);
    const pro = low.reduce((a, r, i) => a + r.protein * s[i], 0);
    expect(pro).toBeLessThan(260);
    expect(cal).toBeGreaterThan(1400);
    expect(s).toHaveLength(4);
  });

  it("handles an empty day", () => {
    expect(solveDay([], DEFAULT_TARGETS)).toEqual([]);
  });
});

describe("planWeek", () => {
  const plan = planWeek(input());

  it("fills 7 days with 4 meals each, Monday to Sunday", () => {
    expect(plan.status).toBe("ok");
    expect(plan.message).toBe("");
    expect(plan.meals).toHaveLength(28);
    expect(plan.days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    for (const d of plan.days) {
      const slots = plan.meals.filter((m) => m.date === d.date).map((m) => m.slot);
      expect(slots).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    }
  });

  it("hits the calorie range and protein minimum every day", () => {
    for (const d of plan.days) {
      expect(d.calories, d.date).toBeGreaterThanOrEqual(1900);
      expect(d.calories, d.date).toBeLessThanOrEqual(2100);
      expect(d.protein, d.date).toBeGreaterThanOrEqual(180);
      expect(d.ok).toBe(true);
    }
    expect(plan.allDaysOk).toBe(true);
  });

  it("stays inside the budget, and the cost is the grocery list's cost", () => {
    expect(plan.cost).toBeLessThanOrEqual(80);
    expect(plan.overBy).toBe(0);
    const lines = rollUp(plan.meals, byId, foods);
    expect(plan.cost).toBe(listTotal(lines, basePrices, pantrySet(STAPLES)));
    // Whole packs cost at least what the food eaten is worth, pantry aside.
    expect(plan.foodCost).toBeGreaterThan(30);
  });

  it("keeps each meal's recipe and a real portion", () => {
    for (const m of plan.meals) {
      const r = byId.get(m.recipe_id)!;
      expect(r.slot).toBe(m.slot);
      expect(portionsFor(m.slot)).toContain(m.servings);
    }
    expect([...plan.recipeIds].sort()).toEqual([...new Set(plan.meals.map((m) => m.recipe_id))].sort());
  });

  it("batch cooks: a handful of recipes cover the week and the list stays short", () => {
    expect(plan.recipeIds.length).toBeLessThanOrEqual(9);
    expect(plan.items).toBeLessThanOrEqual(28);
    const dinners = plan.meals.filter((m) => m.slot === "dinner").map((m) => m.recipe_id);
    expect(new Set(dinners).size).toBeLessThanOrEqual(3);
  });

  it("is deterministic for a seed, and another seed can give another week", () => {
    expect(planWeek(input())).toEqual(plan);
    const others = [1, 2, 3, 4, 5].map((seed) => planWeek(input({ seed, budget: 110 })).recipeIds.join());
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  it("never plans a disliked ingredient", () => {
    const dislikes = ["fish", "whey", "pork"];
    const p = planWeek(input({ dislikes, budget: 120 }));
    expect(p.status).toBe("ok");
    for (const id of p.recipeIds) expect(isExcluded(byId.get(id)!, dislikes), byId.get(id)!.name).toBe(false);
  });

  it("leans toward likes when the budget allows", () => {
    const likes = ["turkey"];
    const withLikes = planWeek(input({ likes, budget: 120 }));
    const without = planWeek(input({ budget: 120 }));
    const count = (p: typeof plan) => p.meals.filter((m) => matchCount(byId.get(m.recipe_id)!, likes) > 0).length;
    expect(withLikes.status).toBe("ok");
    expect(count(withLikes)).toBeGreaterThan(count(without));
    expect(count(withLikes)).toBeGreaterThanOrEqual(6);
  });

  it("takes extra asks: boost, avoid, cheaper slots, variety", () => {
    const p = planWeek(input({ budget: 120, prefs: { avoid: ["chicken"], boost: ["beef"], variety: "varied" } }));
    expect(p.status).toBe("ok");
    for (const id of p.recipeIds) expect(isExcluded(byId.get(id)!, ["chicken"])).toBe(false);
    expect(p.recipeIds.some((id) => matchCount(byId.get(id)!, ["beef"]) > 0)).toBe(true);
    expect(new Set(p.meals.filter((m) => m.slot === "dinner").map((m) => m.recipe_id)).size).toBe(4);

    const batch = planWeek(input({ budget: 120, prefs: { variety: "batch" } }));
    expect(new Set(batch.meals.filter((m) => m.slot === "breakfast").map((m) => m.recipe_id)).size).toBe(1);

    const cost = (p2: typeof plan, slot: string) => p2.meals.filter((m) => m.slot === slot).reduce((a, m) => a + byId.get(m.recipe_id)!.est_cost * m.servings, 0);
    const cheap = planWeek(input({ budget: 120, prefs: { cheaperSlots: ["breakfast"] } }));
    const normal = planWeek(input({ budget: 120 }));
    expect(cost(cheap, "breakfast")).toBeLessThanOrEqual(cost(normal, "breakfast"));
  });

  it("costs less when more is already at home", () => {
    const stocked = planWeek(input({ pantry: [...STAPLES, "whey protein", "rice", "oats"], budget: 60 }));
    expect(stocked.status).toBe("ok");
    expect(stocked.cost).toBeLessThanOrEqual(60);
  });

  it("is cheaper at a discount store's estimated prices", () => {
    const aldi = planWeek(input({ prices: pricesAt(estimateSource, "Aldi"), budget: 40 }));
    const teeter = planWeek(input({ prices: pricesAt(estimateSource, "Harris Teeter"), budget: 40 }));
    expect(aldi.cost).toBeLessThan(teeter.cost);
  });

  it("uses a date's own targets when a challenge changes them mid week", () => {
    const tight = { calMin: 1700, calMax: 1800, proteinMin: 190 };
    const p = planWeek(input({ budget: 120, targetsByDate: { "2026-10-08": tight, "2026-10-09": tight } }));
    expect(p.status).toBe("ok");
    const thu = p.days.find((d) => d.date === "2026-10-08")!;
    expect(thu.calories).toBeGreaterThanOrEqual(1700);
    expect(thu.calories).toBeLessThanOrEqual(1800);
    expect(thu.protein).toBeGreaterThanOrEqual(190);
    expect(p.days[0].calories).toBeGreaterThanOrEqual(1900);
  });
});

describe("planWeek when it cannot be done", () => {
  it("says plainly that the budget is too low, and shows the cheapest week that hits the numbers and its cost", () => {
    const p = planWeek(input({ budget: 30 }));
    expect(p.status).toBe("over_budget");
    expect(p.meals).toHaveLength(28);
    expect(p.allDaysOk).toBe(true);
    for (const d of p.days) expect(d.protein).toBeGreaterThanOrEqual(180);
    expect(p.cost).toBeGreaterThan(30);
    expect(p.overBy).toBeCloseTo(p.cost - 30, 2);
    expect(p.message).toContain("$30.00 a week is not enough");
    expect(p.message).toContain("180g protein");
    expect(p.message).toContain(`$${p.cost.toFixed(2)}`);
    expect(p.message).toContain("estimated");
    expect(/[\u2012-\u2015]/.test(p.message)).toBe(false);
  });

  it("finds about the same floor whatever the seed, and a budget at that floor works", () => {
    const costs = [1, 2, 3].map((seed) => planWeek(input({ budget: 30, seed })).cost);
    const low = Math.min(...costs);
    for (const c of costs) expect(c).toBeLessThan(low * 1.08);
    const ok = planWeek(input({ budget: Math.ceil(low) + 1, seed: 1 }));
    expect(ok.status).toBe("ok");
    expect(ok.cost).toBeLessThanOrEqual(Math.ceil(low) + 1);
  }, 30_000);

  it("says when the targets themselves are out of reach, and returns the nearest week", () => {
    const p = planWeek(input({ budget: 200, targets: { calMin: 1200, calMax: 1300, proteinMin: 260 } }));
    expect(p.status).toBe("targets_missed");
    expect(p.meals).toHaveLength(28);
    expect(p.allDaysOk).toBe(false);
    expect(p.message).toContain("cannot hit your numbers");
    expect(p.message).toContain(`$${p.cost.toFixed(2)}`);
    expect(p.days.some((d) => d.proteinShort > 0 || d.calOff !== 0)).toBe(true);
  });

  it("says which slot has nothing left after dislikes", () => {
    const few = [named("Protein oats"), named("Chicken stir fry"), named("Chicken, rice and broccoli"), named("Protein shake")];
    const p = planWeek(input({ recipes: few, dislikes: ["whey"] }));
    expect(p.status).toBe("no_recipes");
    expect(p.meals).toEqual([]);
    expect(p.message).toContain("breakfasts and snacks");
    expect(p.days).toHaveLength(7);
  });

  it("still plans from a tiny library", () => {
    const few = [named("Protein oats"), named("Chicken stir fry"), named("Chicken, rice and broccoli"), named("Protein shake")];
    const p = planWeek(input({ recipes: few, budget: 150 }));
    expect(p.meals).toHaveLength(28);
    expect(p.recipeIds).toHaveLength(4);
    expect(p.status).toBe("ok");
  });
});

describe("summarizePlan", () => {
  it("adds up days, cost and budget for any meals", () => {
    const oats = named("Protein oats");
    const meals = [
      { date: WEEK, slot: "breakfast" as const, recipe_id: oats.id, servings: 2 },
      { date: WEEK, slot: "snack" as const, recipe_id: "gone", servings: 1 },
    ];
    const s = summarizePlan(meals, input({ budget: 5 }));
    expect(s.days).toHaveLength(1);
    expect(s.days[0].calories).toBe(oats.calories * 2);
    expect(s.days[0].protein).toBe(Math.round(oats.protein * 2));
    expect(s.days[0].ok).toBe(false);
    expect(s.days[0].calOff).toBe(oats.calories * 2 - 1900);
    expect(s.days[0].cost).toBeCloseTo(oats.est_cost * 2, 2);
    // Whole packs: oats, whey, milk, a banana. Cinnamon is in the pantry.
    expect(s.items).toBe(4);
    expect(s.cost).toBe(3.99 + 15.99 + 2.29 + 0.25);
    expect(s.overBy).toBeCloseTo(s.cost - 5, 2);
    expect(s.foodCost).toBeLessThan(s.cost);
  });
});

describe("swapping a meal", () => {
  const plan = planWeek(input({ budget: 100 }));
  const ctx = input({ budget: 100 });
  const date = "2026-10-07";
  const before = summarizePlan(plan.meals, ctx);

  it("offers every other recipe for the slot, best fit first, with the effect on the day and the week", () => {
    const options = swapOptions(plan.meals, date, "dinner", "day", ctx);
    const current = plan.meals.find((m) => m.date === date && m.slot === "dinner")!;
    expect(options.length).toBe(recipes.filter((r) => r.slot === "dinner").length - 1);
    expect(options.every((o) => o.recipe.slot === "dinner" && o.recipe.id !== current.recipe_id)).toBe(true);
    const first = options[0];
    expect(first.day.ok).toBe(true);
    expect(first.costDelta).toBeCloseTo(first.weekCost - before.cost, 2);
    expect(first.days).toBe(1);
    // Ranked: an option that keeps the day on target never comes after one that does not.
    const firstMiss = options.findIndex((o) => !o.day.ok);
    if (firstMiss >= 0) expect(options.slice(firstMiss).every((o) => !o.day.ok || o.overBudget)).toBe(true);
    // In budget before over budget among the on target ones.
    const okOnes = options.filter((o) => o.day.ok);
    const firstOver = okOnes.findIndex((o) => o.overBudget);
    if (firstOver >= 0) expect(okOnes.slice(firstOver).every((o) => o.overBudget)).toBe(true);
  });

  it("re-scales that day's portions after the swap and leaves other days alone", () => {
    const options = swapOptions(plan.meals, date, "dinner", "day", ctx);
    const pick = options.find((o) => o.day.ok)!;
    const next = applySwap(plan.meals, date, "dinner", pick.recipe.id, "day", ctx);
    expect(next).toEqual(pick.meals);
    const s = summarizePlan(next, ctx);
    const day = s.days.find((d) => d.date === date)!;
    expect(day.calories).toBeGreaterThanOrEqual(1900);
    expect(day.calories).toBeLessThanOrEqual(2100);
    expect(day.protein).toBeGreaterThanOrEqual(180);
    expect(next.filter((m) => m.date !== date)).toEqual(plan.meals.filter((m) => m.date !== date));
    expect(next.find((m) => m.date === date && m.slot === "dinner")!.recipe_id).toBe(pick.recipe.id);
    expect(s.cost).toBe(pick.weekCost);
  });

  it("can swap every day the dish repeats", () => {
    const current = plan.meals.find((m) => m.date === date && m.slot === "dinner")!;
    const repeats = plan.meals.filter((m) => m.slot === "dinner" && m.recipe_id === current.recipe_id).length;
    const options = swapOptions(plan.meals, date, "dinner", "week", ctx);
    expect(options[0].days).toBe(repeats);
    expect(options[0].meals.some((m) => m.slot === "dinner" && m.recipe_id === current.recipe_id)).toBe(false);
    for (const d of summarizePlan(options[0].meals, ctx).days) expect(d.ok).toBe(true);
  });

  it("leaves dislikes out of the options and marks likes", () => {
    const c = input({ budget: 100, dislikes: ["beef"], likes: ["tofu"] });
    const options = swapOptions(plan.meals, date, "dinner", "day", c);
    expect(options.some((o) => matchCount(o.recipe, ["beef"]) > 0)).toBe(false);
    expect(options.find((o) => o.recipe.name === "Peanut tofu noodles")!.liked).toBe(true);
  });

  it("flags an option that pushes the week over budget", () => {
    const tight = input({ budget: before.cost });
    const options = swapOptions(plan.meals, date, "dinner", "day", tight);
    expect(options.some((o) => o.overBudget && o.costDelta > 0)).toBe(true);
    expect(options.filter((o) => !o.overBudget).every((o) => o.costDelta <= 0.004)).toBe(true);
  });

  it("rebalances a day by hand edited portions", () => {
    const broken = plan.meals.map((m) => (m.date === date ? { ...m, servings: 0.5 } : m));
    expect(summarizePlan(broken, ctx).days.find((d) => d.date === date)!.ok).toBe(false);
    const fixed = rebalanceDay(broken, date, ctx);
    expect(summarizePlan(fixed, ctx).days.find((d) => d.date === date)!.ok).toBe(true);
  });

  it("does nothing for a slot that is not planned", () => {
    expect(applySwap([], date, "dinner", "x", "day", ctx)).toEqual([]);
    expect(swapOptions([], date, "dinner", "day", ctx)).toEqual([]);
  });
});
