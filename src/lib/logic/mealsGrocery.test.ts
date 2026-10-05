import { describe, expect, it } from "vitest";
import type { PlannedMeal } from "../types";
import { indexFoods, SECTION_LABEL, type RecipeLike } from "./meals";
import { FOODS, STAPLES } from "./mealsFoods";
import {
  budgetActual,
  buyLabel,
  compareStores,
  displayName,
  instacartItems,
  linePrice,
  linePrices,
  listAsText,
  listTotal,
  needLabel,
  packsFor,
  pantrySet,
  rollUp,
} from "./mealsGrocery";
import { libraryWithIds } from "./mealsLibrary";
import { basePrices, estimateSource, isStore, pricesAt, storeLevel, STORES, withCorrections } from "./mealsPricing";
import { cleanRequest, describeRequest, isEmptyRequest, parseRequest, toPrefs } from "./mealsRequest";

const recipes = libraryWithIds();
const foods = indexFoods(FOODS);
const food = (n: string) => foods.get(n)!;
const byId = new Map<string, RecipeLike>(recipes.map((r) => [r.id, r]));
const named = (name: string) => recipes.find((r) => r.name === name)!;
const meal = (name: string, servings: number, date = "2026-10-05"): PlannedMeal => ({ date, slot: named(name).slot, recipe_id: named(name).id, servings });
const line = (lines: ReturnType<typeof rollUp>, name: string) => lines.find((l) => l.name === name)!;

describe("packsFor", () => {
  it("rounds up to whole packs", () => {
    expect(packsFor(food("eggs"), 1)).toBe(1);
    expect(packsFor(food("eggs"), 12)).toBe(1);
    expect(packsFor(food("eggs"), 13)).toBe(2);
    expect(packsFor(food("black beans"), 600)).toBe(3);
    expect(packsFor(food("banana"), 2.5)).toBe(3);
  });
  it("sells meat by the quarter pound", () => {
    expect(packsFor(food("chicken breast"), 680)).toBe(1.5);
    expect(packsFor(food("chicken breast"), 700)).toBe(1.75);
    expect(packsFor(food("chicken breast"), 100)).toBe(0.25);
  });
  it("does not buy a second pack for a few grams", () => {
    expect(packsFor(food("pasta"), 460)).toBe(1);
    expect(packsFor(food("pasta"), 480)).toBe(2);
  });
  it("buys nothing for nothing", () => {
    expect(packsFor(food("pasta"), 0)).toBe(0);
  });
});

describe("rollUp", () => {
  // Chicken, rice and broccoli makes 4: 680 g chicken, 240 g rice, 680 g broccoli, 1 tbsp oil, 2 tbsp soy.
  // Chicken stir fry makes 4: 680 g chicken, 680 g stir fry veg, 240 g rice, 4 tbsp soy, 1 tbsp honey, 1 tbsp oil.
  const meals = [meal("Chicken, rice and broccoli", 1.5), meal("Chicken, rice and broccoli", 1.5, "2026-10-06"), meal("Chicken stir fry", 2)];
  const lines = rollUp(meals, byId, foods);

  it("combines the same food across recipes and days", () => {
    // 680 * 3/4 + 680 * 2/4
    expect(line(lines, "chicken breast").need).toBe(850);
    expect(line(lines, "rice").need).toBe(300);
    expect(line(lines, "frozen broccoli").need).toBe(510);
    expect(lines.filter((l) => l.name === "chicken breast")).toHaveLength(1);
  });

  it("converts spoons to the food's own unit before adding", () => {
    // Oil: 1 tbsp * 3/4 + 1 tbsp * 2/4 = 1.25 tbsp. Soy: 2 * 3/4 + 4 * 2/4 = 3.5 tbsp.
    expect(line(lines, "olive oil").need).toBeCloseTo(1.25 * 14.7868, 1);
    expect(line(lines, "olive oil").unit).toBe("ml");
    expect(line(lines, "soy sauce").need).toBeCloseTo(3.5 * 14.7868, 1);
    expect(line(lines, "honey").need).toBeCloseTo(10.5, 1);
  });

  it("rounds each line up to what a store sells", () => {
    expect(line(lines, "chicken breast").packs).toBe(2);
    expect(line(lines, "rice").packs).toBe(1);
    expect(line(lines, "frozen broccoli").packs).toBe(2);
    expect(buyLabel(line(lines, "chicken breast"))).toBe("2 lb");
    expect(buyLabel(line(lines, "frozen broccoli"))).toBe("2 x 12 oz bag");
    expect(buyLabel(line(lines, "rice"))).toBe("2 lb bag");
    expect(needLabel(line(lines, "chicken breast"))).toBe("850 g");
  });

  it("groups by store section in aisle order", () => {
    const sections = lines.map((l) => l.section);
    const firstOf = (s: string) => sections.indexOf(s as never);
    expect(firstOf("meat")).toBeLessThan(firstOf("pantry"));
    expect(firstOf("pantry")).toBeLessThan(firstOf("frozen"));
    expect(firstOf("frozen")).toBeLessThan(firstOf("spices"));
  });

  it("carries an ingredient that is not in the table, by name and unit", () => {
    const own: RecipeLike = {
      id: "own",
      name: "Hot chicken",
      slot: "dinner",
      servings: 2,
      calories: 300,
      protein: 40,
      carbs: 0,
      fat: 5,
      est_cost: 2,
      tags: [],
      ingredients: [
        { name: "chicken breast", quantity: 1, unit: "lb", est_cost: 2.99, category: "meat" },
        { name: "Sriracha", quantity: 2, unit: "tbsp", est_cost: 0.4, category: "other" },
      ],
    };
    const l = rollUp([{ date: "2026-10-05", slot: "dinner", recipe_id: "own", servings: 3 }], new Map([["own", own]]), foods);
    expect(line(l, "chicken breast").need).toBeCloseTo(680.39, 1);
    const s = line(l, "Sriracha");
    expect(s.food).toBeNull();
    expect(s.need).toBe(3);
    expect(s.unit).toBe("tbsp");
    expect(s.ownCost).toBe(0.6);
    expect(s.section).toBe("other");
    expect(linePrice(s, basePrices)).toBe(0.6);
  });

  it("skips meals whose recipe is gone", () => {
    expect(rollUp([{ date: "2026-10-05", slot: "dinner", recipe_id: "nope", servings: 1 }], byId, foods)).toEqual([]);
  });
});

describe("pricing", () => {
  const meals = [meal("Chicken, rice and broccoli", 4), meal("Protein oats", 2), meal("Boiled eggs and string cheese", 3)];
  const lines = rollUp(meals, byId, foods);
  const pantry = pantrySet(STAPLES);

  it("prices whole packs and leaves the pantry out", () => {
    expect(linePrice(line(lines, "chicken breast"), basePrices)).toBe(4.49); // 1.5 lb at 2.99
    const total = listTotal(lines, basePrices, pantry);
    const everything = listTotal(lines, basePrices, new Set());
    expect(everything).toBeGreaterThan(total);
    expect(listTotal(lines, basePrices, pantrySet([...STAPLES, "Whey Protein"]))).toBeCloseTo(total - 15.99, 2);
  });

  it("estimates each store from the table and its price level", () => {
    expect(STORES).toEqual(["Aldi", "Walmart", "Food Lion", "Harris Teeter", "Publix"]);
    expect(estimateSource.estimated).toBe(true);
    expect(estimateSource.quote(food("chicken breast"), "Food Lion")).toEqual({ price: 2.99, source: "estimate" });
    expect(estimateSource.quote(food("chicken breast"), "Aldi")).toEqual({ price: 2.69, source: "estimate" });
    expect(storeLevel("Aldi", "pantry")).toBeLessThan(storeLevel("Walmart", "pantry"));
    expect(storeLevel("Harris Teeter", "meat")).toBeGreaterThan(1);
    expect(isStore("Aldi")).toBe(true);
    expect(isStore("Costco")).toBe(false);
  });

  it("compares the same list across the five stores, cheapest first", () => {
    const c = compareStores(lines, estimateSource, pantry);
    expect(c.map((s) => s.store)).toEqual(["Aldi", "Walmart", "Food Lion", "Publix", "Harris Teeter"]);
    expect(c[0].above).toBe(0);
    expect(c[4].above).toBeCloseTo(c[4].total - c[0].total, 2);
    expect(c.every((s) => s.fromReceipts === 0)).toBe(true);
    expect(c[0].total).toBe(listTotal(lines, pricesAt(estimateSource, "Aldi"), pantry));
    expect(c[0].lines).toBe(lines.filter((l) => !pantry.has(l.name)).length);
  });

  it("prefers a receipt price over the estimate, only at that store", () => {
    const source = withCorrections(estimateSource, { "chicken breast": { Publix: 1.99 }, "whey protein": { Publix: 9.99 } });
    expect(source.quote(food("chicken breast"), "Publix")).toEqual({ price: 1.99, source: "receipt" });
    expect(source.quote(food("chicken breast"), "Aldi").source).toBe("estimate");
    const c = compareStores(lines, source, pantry);
    const publix = c.find((s) => s.store === "Publix")!;
    expect(publix.fromReceipts).toBe(2);
    // Two real prices are enough to move Publix up the ranking.
    expect(c.findIndex((s) => s.store === "Publix")).toBeLessThan(3);
    const prices = linePrices(line(lines, "chicken breast"), source);
    expect(prices.Publix).toBe(2.99); // 1.5 lb at 1.99
    expect(Object.keys(prices)).toEqual([...STORES]);
  });

  it("ignores a bad correction", () => {
    const source = withCorrections(estimateSource, { "chicken breast": { Aldi: Number.NaN } });
    expect(source.quote(food("chicken breast"), "Aldi").source).toBe("estimate");
  });
});

describe("list as text and for Instacart", () => {
  const lines = rollUp([meal("Chicken, rice and broccoli", 4), meal("Boiled eggs and string cheese", 3)], byId, foods);
  const pantry = pantrySet(STAPLES);

  it("writes a plain checklist by section without pantry items", () => {
    const text = listAsText(lines, pantry, "Groceries, week of Oct 5", SECTION_LABEL);
    expect(text.split("\n")[0]).toBe("Groceries, week of Oct 5");
    expect(text).toContain("Meat and fish\n[ ] Chicken breast, 1.5 lb");
    expect(text).toContain("[ ] Eggs, 1 dozen");
    expect(text).toContain("[ ] Broccoli, frozen, 2 x 12 oz bag");
    expect(text).not.toContain("Olive oil");
    expect(/[\u2012-\u2015]/.test(text)).toBe(false);
  });

  it("builds Instacart line items in units Instacart knows", () => {
    const items = instacartItems(lines, pantry);
    expect(items.find((i) => i.name === "chicken breast")).toEqual({ name: "chicken breast", quantity: 680, unit: "gram", display_text: "Chicken breast, 1.5 lb" });
    expect(items.find((i) => i.name === "eggs")).toMatchObject({ quantity: 6, unit: "each" });
    expect(items.some((i) => i.name === "salt")).toBe(false);
  });

  it("names things for a list", () => {
    expect(displayName("frozen green beans")).toBe("Green beans, frozen");
    expect(displayName("greek yogurt")).toBe("Greek yogurt");
  });
});

describe("budget against actual", () => {
  it("shows what is left, and how far the estimate was off", () => {
    expect(budgetActual(60, 54.2, 0)).toEqual({ budget: 60, estimated: 54.2, spent: 0, left: 60, over: false, offEstimate: null });
    expect(budgetActual(60, 54.2, 57.13)).toEqual({ budget: 60, estimated: 54.2, spent: 57.13, left: 2.87, over: false, offEstimate: 2.93 });
    expect(budgetActual(60, 54.2, 66)).toMatchObject({ left: -6, over: true });
  });
});

describe("a plan request in plain words", () => {
  it("reads more, no and cheaper", () => {
    const r = parseRequest("More chicken, no fish, cheaper breakfasts", recipes);
    expect(r).toEqual({ boost: ["chicken"], avoid: ["fish"], cheaperSlots: ["breakfast"], budget: null, variety: null, unknown: [] });
    expect(toPrefs(r)).toEqual({ boost: ["chicken"], avoid: ["fish"], cheaperSlots: ["breakfast"] });
    expect(describeRequest(r)).toBe("More chicken. No fish. Cheaper breakfasts.");
  });

  it("reads other phrasings", () => {
    expect(parseRequest("I don't like tofu or tuna and I love turkey", recipes)).toMatchObject({ avoid: ["tofu", "tuna"], boost: ["turkey"] });
    expect(parseRequest("skip the eggs. extra beef please", recipes)).toMatchObject({ avoid: ["eggs"], boost: ["beef"] });
    expect(parseRequest("cheaper", recipes).cheaperSlots).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(parseRequest("cheap lunches and dinners", recipes).cheaperSlots).toEqual(["lunch", "dinner"]);
    expect(parseRequest("keep it under $55, more variety", recipes)).toMatchObject({ budget: 55, variety: "varied" });
    expect(parseRequest("less cooking", recipes).variety).toBe("batch");
  });

  it("reports words that match nothing and never invents a food", () => {
    const r = parseRequest("more lobster, no chicken", recipes);
    expect(r.boost).toEqual([]);
    expect(r.unknown).toEqual(["lobster"]);
    expect(r.avoid).toEqual(["chicken"]);
    expect(describeRequest(r)).toContain("Nothing in the library matches lobster.");
  });

  it("is empty for small talk", () => {
    expect(isEmptyRequest(parseRequest("hello there", recipes))).toBe(true);
    expect(isEmptyRequest(parseRequest("", recipes))).toBe(true);
  });

  it("lets avoid win over boost", () => {
    expect(parseRequest("more fish, no fish", recipes)).toMatchObject({ boost: [], avoid: ["fish"] });
  });

  it("keeps only usable parts of a model's answer", () => {
    const r = cleanRequest({ boost: ["Chicken", "unicorn", 7], avoid: ["fish"], cheaper_slots: ["breakfast", "brunch"], budget: 54.6, variety: "wild", extra: "x" }, recipes);
    expect(r).toEqual({ boost: ["chicken"], avoid: ["fish"], cheaperSlots: ["breakfast"], budget: 55, variety: null, unknown: ["unicorn"] });
    expect(cleanRequest(null, recipes)).toEqual({ boost: [], avoid: [], cheaperSlots: [], budget: null, variety: null, unknown: [] });
    expect(cleanRequest({ budget: -4 }, recipes).budget).toBeNull();
  });
});
