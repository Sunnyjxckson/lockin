import { describe, expect, it } from "vitest";
import chainJson from "../../data/restaurants/chains.json";
import type { PlannedMeal } from "../types";
import { directionsUrl, findOrders, isDisliked, MECKLENBURG_TAX, remainingFor, type Chain, type ChainData } from "./eatOut";
import { rollUp } from "./mealsGrocery";
import { indexFoods } from "./meals";
import { FOODS } from "./mealsFoods";
import { libraryWithIds } from "./mealsLibrary";

const chains = (chainJson as unknown as ChainData).chains;
const byId = (id: string): Chain => chains.find((c) => c.id === id)!;

describe("chain data", () => {
  it("has a source, a check date and estimated prices for every chain", () => {
    for (const c of chains) {
      expect(c.source_url).toMatch(/^https:\/\//);
      expect(c.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.price_estimate).toBe(true);
    }
  });
  it("has no dash characters", () => {
    expect(JSON.stringify(chainJson)).not.toMatch(/[‒-―−]/);
  });
});

describe("findOrders", () => {
  const remaining = { calMin: 600, calMax: 800, protein: 60 };

  it("only returns orders under the calories left, with the chain and totals", () => {
    const orders = findOrders({ remaining, slot: "dinner", chains });
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.length).toBeLessThanOrEqual(5);
    for (const o of orders) {
      expect(o.calories).toBeLessThanOrEqual(800);
      expect(o.chain.length).toBeGreaterThan(0);
      expect(o.lines.length).toBeGreaterThan(0);
    }
  });

  it("puts the highest protein first and uses several chains", () => {
    const orders = findOrders({ remaining, slot: "dinner", chains });
    expect(orders[0].protein).toBeGreaterThanOrEqual(orders[orders.length - 1].protein - 2);
    expect(new Set(orders.map((o) => o.chainId)).size).toBeGreaterThan(1);
  });

  it("prefers the cheaper order when protein is the same", () => {
    const tiny: Chain = {
      id: "x", name: "X", kind: "menu", slots: ["dinner"], source_url: "https://x.test", checked: "2026-01-01", price_estimate: true,
      items: [
        { name: "Pricey", calories: 500, protein: 40, carbs: 0, fat: 0, price: 12 },
        { name: "Cheap", calories: 500, protein: 40, carbs: 0, fat: 0, price: 8 },
      ],
    };
    const orders = findOrders({ remaining: { calMin: 400, calMax: 700, protein: 40 }, slot: "dinner", chains: [tiny] });
    expect(orders[0].title).toBe("Cheap");
  });

  it("stops rewarding protein past what is needed", () => {
    const tiny: Chain = {
      id: "x", name: "X", kind: "menu", slots: ["dinner"], source_url: "https://x.test", checked: "2026-01-01", price_estimate: true,
      items: [
        { name: "Big", calories: 600, protein: 70, carbs: 0, fat: 0, price: 14 },
        { name: "Enough", calories: 600, protein: 45, carbs: 0, fat: 0, price: 9 },
      ],
    };
    const orders = findOrders({ remaining: { calMin: 500, calMax: 700, protein: 40 }, slot: "dinner", chains: [tiny] });
    expect(orders[0].title).toBe("Enough");
  });

  it("adds Mecklenburg sales tax to the price", () => {
    const [o] = findOrders({ remaining, slot: "dinner", chains: [byId("chipotle")], limit: 1 });
    expect(o.price).toBeCloseTo(Math.round(o.subtotal * (1 + MECKLENBURG_TAX) * 100) / 100, 2);
    expect(o.price).toBeGreaterThan(o.subtotal);
  });

  it("builds a Chipotle bowl from its own components, within the topping limit", () => {
    const [o] = findOrders({ remaining: { calMin: 450, calMax: 550, protein: 60 }, slot: "lunch", chains: [byId("chipotle")], limit: 1 });
    expect(o.title).toMatch(/bowl/);
    expect(o.lines.length).toBeLessThanOrEqual(1 + 1 + 3);
    expect(o.protein).toBeGreaterThan(40);
  });

  it("never uses a disliked component", () => {
    const orders = findOrders({ remaining, slot: "dinner", chains, dislikes: ["chicken", "beans"] });
    for (const o of orders) {
      expect(o.title.toLowerCase()).not.toContain("chicken");
      expect(o.lines.join(" ").toLowerCase()).not.toContain("beans");
    }
    expect(isDisliked("Black beans", ["beans"])).toBe(true);
    expect(isDisliked("Steak", ["beans"])).toBe(false);
  });

  it("uses breakfast menu items only for breakfast", () => {
    const dinner = findOrders({ remaining: { calMin: 300, calMax: 700, protein: 25 }, slot: "dinner", chains });
    expect(dinner.some((o) => /Biscuit|Muffin|Egg White/.test(o.title))).toBe(false);
    const breakfast = findOrders({ remaining: { calMin: 300, calMax: 700, protein: 25 }, slot: "breakfast", chains });
    expect(breakfast.length).toBeGreaterThan(0);
    expect(breakfast.every((o) => o.chainId === "chick-fil-a")).toBe(true);
  });

  it("returns nothing when no calories are left or nothing fits", () => {
    expect(findOrders({ remaining: { calMin: 0, calMax: 0, protein: 40 }, slot: "dinner", chains })).toEqual([]);
    expect(findOrders({ remaining: { calMin: 0, calMax: 90, protein: 40 }, slot: "dinner", chains })).toEqual([]);
  });

  it("is the same twice", () => {
    expect(findOrders({ remaining, slot: "dinner", chains })).toEqual(findOrders({ remaining, slot: "dinner", chains }));
  });
});

describe("remainingFor", () => {
  it("takes logged food and the other planned meals off the day", () => {
    const r = remainingFor({ calMin: 1900, calMax: 2100, proteinMin: 180, eatenCalories: 700, eatenProtein: 50, plannedCalories: 600, plannedProtein: 40 });
    expect(r).toEqual({ calMin: 600, calMax: 800, protein: 90 });
  });
  it("never goes below zero", () => {
    const r = remainingFor({ calMin: 1900, calMax: 2100, proteinMin: 180, eatenCalories: 2500, eatenProtein: 200, plannedCalories: 0, plannedProtein: 0 });
    expect(r).toEqual({ calMin: 0, calMax: 0, protein: 0 });
  });
});

describe("directionsUrl", () => {
  it("is a Google Maps search for the chain near me", () => {
    expect(directionsUrl("Chick-fil-A")).toBe("https://www.google.com/maps/search/Chick-fil-A%20near%20me");
  });
});

describe("grocery list and eaten out meals", () => {
  const recipes = libraryWithIds();
  const map = new Map(recipes.map((r) => [r.id, r]));
  const index = indexFoods(FOODS);
  const dinner = recipes.find((r) => r.slot === "dinner")!;
  const meal = (extra: Partial<PlannedMeal> = {}): PlannedMeal => ({ date: "2026-10-12", slot: "dinner", recipe_id: dinner.id, servings: 1, ...extra });
  const out = { chain: "Chipotle", order: "bowl", price: 12, meal_id: "m1" };

  it("drops an eaten out meal from the list while the week is not shopped", () => {
    expect(rollUp([meal()], map, index).length).toBeGreaterThan(0);
    expect(rollUp([meal({ eaten_out: out })], map, index)).toEqual([]);
  });
  it("keeps it once the week has been shopped", () => {
    expect(rollUp([meal({ eaten_out: { ...out, shopped: true } })], map, index).length).toBeGreaterThan(0);
  });
});
