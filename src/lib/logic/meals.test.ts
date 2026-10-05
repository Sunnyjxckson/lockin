import { describe, expect, it } from "vitest";
import {
  amountLabel,
  dayTargets,
  DEFAULT_TARGETS,
  derivedTags,
  fraction,
  indexFoods,
  isExcluded,
  matchesTerm,
  recipeNumbers,
  round,
  SLOTS,
  toBase,
  unitsFor,
} from "./meals";
import { FOODS, STAPLES } from "./mealsFoods";
import { buildRecipe, LIBRARY, libraryWithIds, parseLines, RECIPE_DEFS } from "./mealsLibrary";

const index = indexFoods(FOODS);
const food = (name: string) => index.get(name)!;

describe("food table", () => {
  it("has unique lowercase names and sane rows", () => {
    expect(new Set(FOODS.map((f) => f.name)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      expect(f.name).toBe(f.name.toLowerCase());
      expect(f.pack).toBeGreaterThan(0);
      expect(f.price).toBeGreaterThan(0);
      expect(f.packLabel.length).toBeGreaterThan(0);
    }
  });

  it("has macros that agree with their calories (4, 4, 9 per gram)", () => {
    for (const f of FOODS) {
      // Watery produce is skipped: fiber and acids make 4, 4, 9 a poor fit there.
      if (f.per.calories < 40) continue;
      const fromMacros = f.per.protein * 4 + f.per.carbs * 4 + f.per.fat * 9;
      // Fiber and rounding move this a little. Spices are mostly fiber.
      const slack = f.section === "spices" ? 0.45 : f.section === "produce" ? 0.25 : 0.2;
      expect(Math.abs(fromMacros - f.per.calories) / f.per.calories, f.name).toBeLessThan(slack);
    }
  });

  it("treats oil, salt and spices as staples", () => {
    expect(STAPLES).toContain("olive oil");
    expect(STAPLES).toContain("salt");
    expect(STAPLES).not.toContain("chicken breast");
  });
});

describe("units", () => {
  it("converts mass to grams", () => {
    expect(toBase(food("chicken breast"), 1, "lb")).toBeCloseTo(453.592, 2);
    expect(toBase(food("chicken breast"), 8, "oz")).toBeCloseTo(226.8, 1);
    expect(toBase(food("chicken breast"), 200, "g")).toBe(200);
  });
  it("converts spoons and cups for liquids and for foods with a known density", () => {
    expect(toBase(food("olive oil"), 1, "tbsp")).toBeCloseTo(14.79, 2);
    expect(toBase(food("milk"), 1, "cup")).toBeCloseTo(236.59, 2);
    expect(toBase(food("oats"), 0.5, "cup")).toBeCloseTo(40.08, 1);
    expect(toBase(food("peanut butter"), 1, "tbsp")).toBeCloseTo(16, 0);
  });
  it("refuses a unit that makes no sense for the food", () => {
    expect(toBase(food("eggs"), 100, "g")).toBeNull();
    expect(toBase(food("chicken breast"), 1, "cup")).toBeNull();
    expect(toBase(food("milk"), 1, "lb")).toBeNull();
    expect(toBase(food("bread"), 2, "each")).toBe(2);
  });
  it("accepts long unit names", () => {
    expect(toBase(food("olive oil"), 2, "Tablespoons")).toBeCloseTo(29.57, 2);
    expect(toBase(food("eggs"), 3, "")).toBe(3);
  });
  it("lists the units a food can be written in", () => {
    expect(unitsFor(food("eggs"))).toEqual(["each"]);
    expect(unitsFor(food("milk"))).toContain("cup");
    expect(unitsFor(food("pasta"))).toEqual(["g", "oz", "lb"]);
  });
});

describe("recipe numbers", () => {
  it("adds up a recipe by hand", () => {
    // 200 g chicken breast (120 kcal, 22.5 p, 0 c, 2.6 f per 100 g, $2.99 per 454 g)
    // 2 eggs (72 kcal, 6.3 p, 0.4 c, 4.8 f each, $2.99 a dozen), 2 servings.
    const n = recipeNumbers(
      [
        { name: "Chicken Breast", quantity: 200, unit: "g" },
        { name: "eggs", quantity: 2, unit: "each" },
      ],
      2,
      index,
    );
    expect(n.calories).toBe(192); // (240 + 144) / 2
    expect(n.protein).toBe(28.8); // (45 + 12.6) / 2
    expect(n.carbs).toBe(0.4);
    expect(n.fat).toBe(7.4); // (5.2 + 9.6) / 2
    expect(n.est_cost).toBe(0.91); // (1.317 + 0.498) / 2
    expect(n.unknown).toEqual([]);
    expect(n.ingredients[0]).toEqual({ name: "chicken breast", quantity: 200, unit: "g", est_cost: 1.32, category: "meat" });
  });

  it("keeps an unknown ingredient, counts its cost, and says its macros are missing", () => {
    const n = recipeNumbers(
      [
        { name: "eggs", quantity: 2, unit: "each" },
        { name: "Sriracha", quantity: 1, unit: "tbsp", est_cost: 0.2 },
      ],
      1,
      index,
    );
    expect(n.unknown).toEqual(["Sriracha"]);
    expect(n.calories).toBe(144);
    expect(n.est_cost).toBe(0.7);
  });

  it("flags a unit that does not convert", () => {
    expect(recipeNumbers([{ name: "eggs", quantity: 100, unit: "g" }], 1, index).unknown).toEqual(["eggs"]);
  });
});

describe("the recipe library", () => {
  const recipes = LIBRARY;

  it("is big enough to live on for a month", () => {
    expect(recipes.length).toBeGreaterThanOrEqual(60);
    const count = (slot: string) => recipes.filter((r) => r.slot === slot).length;
    expect(count("breakfast")).toBeGreaterThanOrEqual(12);
    expect(count("lunch")).toBeGreaterThanOrEqual(14);
    expect(count("dinner")).toBeGreaterThanOrEqual(16);
    expect(count("snack")).toBeGreaterThanOrEqual(10);
    expect(new Set(recipes.map((r) => r.name)).size).toBe(recipes.length);
    expect(recipes.filter((r) => r.tags.includes("batch")).length).toBeGreaterThanOrEqual(25);
    expect(recipes.filter((r) => r.tags.includes("vegetarian")).length).toBeGreaterThanOrEqual(10);
  });

  it("only uses foods from the table, in units that convert", () => {
    for (const def of RECIPE_DEFS) {
      for (const line of def.lines) {
        const f = index.get(line.name);
        expect(f, `${def.name}: ${line.name}`).toBeDefined();
        expect(toBase(f!, line.quantity, line.unit), `${def.name}: ${line.name} in ${line.unit}`).not.toBeNull();
      }
    }
  });

  it("stores exactly what the ingredients add up to", () => {
    // An independent sum, written out here so a bug in recipeNumbers shows.
    for (const r of recipes) {
      let cal = 0;
      let pro = 0;
      let carb = 0;
      let fat = 0;
      let cost = 0;
      for (const ing of r.ingredients) {
        const f = index.get(ing.name)!;
        const base = toBase(f, ing.quantity, ing.unit)!;
        const k = f.base === "each" ? base : base / 100;
        cal += f.per.calories * k;
        pro += f.per.protein * k;
        carb += f.per.carbs * k;
        fat += f.per.fat * k;
        cost += (f.price / f.pack) * base;
      }
      expect(r.calories, r.name).toBe(Math.round(cal / r.servings));
      expect(Math.abs(r.protein - pro / r.servings), r.name).toBeLessThanOrEqual(0.0501);
      expect(Math.abs(r.carbs - carb / r.servings), r.name).toBeLessThanOrEqual(0.0501);
      expect(Math.abs(r.fat - fat / r.servings), r.name).toBeLessThanOrEqual(0.0501);
      expect(Math.abs(r.est_cost - cost / r.servings), r.name).toBeLessThanOrEqual(0.0051);
      // The ingredient costs shown in the recipe add up to the recipe cost too.
      const shown = r.ingredients.reduce((a, i) => a + (i.est_cost ?? 0), 0);
      expect(Math.abs(shown / r.servings - r.est_cost), r.name).toBeLessThan(0.03);
    }
  });

  it("has calories that agree with its macros", () => {
    for (const r of recipes) {
      const fromMacros = r.protein * 4 + r.carbs * 4 + r.fat * 9;
      expect(Math.abs(fromMacros - r.calories) / r.calories, r.name).toBeLessThan(0.1);
    }
  });

  it("is high protein and cheap, with real steps", () => {
    for (const r of recipes) {
      expect((r.protein * 4) / r.calories, r.name).toBeGreaterThanOrEqual(0.24);
      expect(r.est_cost, r.name).toBeLessThan(4.5);
      expect(r.steps.length, r.name).toBeGreaterThanOrEqual(1);
      expect(r.ingredients.length, r.name).toBeGreaterThanOrEqual(2);
      expect(r.source).toBe("seed");
      if (r.slot === "snack") expect(r.calories, r.name).toBeLessThan(350);
      else expect(r.calories, r.name).toBeGreaterThan(220);
    }
    const mains = recipes.filter((r) => r.slot !== "snack");
    const avg = mains.reduce((a, r) => a + r.protein, 0) / mains.length;
    expect(avg).toBeGreaterThan(40);
  });

  it("never contains an em dash, an en dash or an emoji", () => {
    const text = JSON.stringify(RECIPE_DEFS) + JSON.stringify(FOODS);
    expect(/[\u2012-\u2015]/.test(text)).toBe(false);
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  });

  it("builds the same rows every time, with ids on request", () => {
    expect(buildRecipe(RECIPE_DEFS[0])).toEqual(LIBRARY[0]);
    const ids = libraryWithIds().map((r) => r.id);
    expect(new Set(ids).size).toBe(LIBRARY.length);
    expect(SLOTS.every((s) => libraryWithIds().some((r) => r.slot === s))).toBe(true);
  });

  it("reads the ingredient shorthand", () => {
    expect(parseLines("chicken breast 680; olive oil 1 tbsp; eggs 2; bell pepper 0.5")).toEqual([
      { name: "chicken breast", quantity: 680, unit: "g" },
      { name: "olive oil", quantity: 1, unit: "tbsp" },
      { name: "eggs", quantity: 2, unit: "each" },
      { name: "bell pepper", quantity: 0.5, unit: "each" },
    ]);
    expect(() => parseLines("dragon fruit 2")).toThrow();
  });
});

describe("likes and dislikes", () => {
  const lib = libraryWithIds();
  const named = (name: string) => lib.find((r) => r.name === name)!;

  it("matches by tag, ingredient or name, whole words, plural or not", () => {
    expect(matchesTerm(named("Tuna rice bowl"), "fish")).toBe(true);
    expect(matchesTerm(named("Baked tilapia with rice and broccoli"), "Fish")).toBe(true);
    expect(matchesTerm(named("Shrimp fried rice"), "shellfish")).toBe(true);
    expect(matchesTerm(named("Egg white veggie scramble"), "eggs")).toBe(true);
    expect(matchesTerm(named("Chicken stir fry"), "chickens")).toBe(true);
    expect(matchesTerm(named("Turkey spaghetti"), "pasta")).toBe(true);
    expect(matchesTerm(named("Chicken stir fry"), "fish")).toBe(false);
    expect(matchesTerm(named("Protein shake"), "ice")).toBe(false);
    expect(matchesTerm(named("Chicken stir fry"), "")).toBe(false);
  });

  it("matches two word terms", () => {
    expect(matchesTerm(named("Protein oats"), "peanut butter")).toBe(false);
    expect(matchesTerm(named("Peanut butter banana shake"), "peanut butter")).toBe(true);
    expect(matchesTerm(named("Pork loin with sweet potatoes"), "sweet potato")).toBe(true);
    expect(matchesTerm(named("Protein oats"), "protein powder")).toBe(true);
    expect(matchesTerm(named("Chicken stir fry"), "protein powder")).toBe(false);
    expect(matchesTerm(named("Cottage cheese and apple"), "cottage cheese")).toBe(true);
    expect(matchesTerm(named("Turkey melt toast"), "cottage cheese")).toBe(false);
  });

  it("excludes on any dislike", () => {
    expect(isExcluded(named("Tilapia tacos"), ["beef", "fish"])).toBe(true);
    expect(isExcluded(named("Chicken fajitas"), ["beef", "fish"])).toBe(false);
    expect(isExcluded(named("Chicken fajitas"), [])).toBe(false);
  });

  it("derives tags from what is in the recipe", () => {
    expect(derivedTags([{ name: "tofu" }, { name: "rice" }], index, ["Batch"])).toEqual(["batch", "rice", "soy", "tofu", "vegetarian"]);
    expect(derivedTags([{ name: "canned tuna" }], index)).not.toContain("vegetarian");
    expect(named("Tofu edamame rice bowls").tags).toContain("vegetarian");
    expect(named("Chicken stir fry").tags).not.toContain("vegetarian");
  });
});

describe("targets", () => {
  it("reads the checklist targets", () => {
    expect(dayTargets({ kind: "range", min: 1900, max: 2100 }, { kind: "min", min: 180 })).toEqual(DEFAULT_TARGETS);
    expect(dayTargets({ kind: "range", min: 1700, max: 1800 }, { kind: "min", min: 200 })).toEqual({ calMin: 1700, calMax: 1800, proteinMin: 200 });
    expect(dayTargets({ kind: "max", max: 2000 }, { kind: "min", min: 150 })).toEqual({ calMin: 1800, calMax: 2000, proteinMin: 150 });
    expect(dayTargets(null, undefined)).toEqual(DEFAULT_TARGETS);
    expect(dayTargets({ kind: "check" }, { kind: "check" })).toEqual(DEFAULT_TARGETS);
  });
});

describe("display", () => {
  it("writes quarters as fractions", () => {
    expect(fraction(1)).toBe("1");
    expect(fraction(0.5)).toBe("1/2");
    expect(fraction(1.25)).toBe("1 1/4");
    expect(fraction(2.75)).toBe("2 3/4");
    expect(fraction(1.4)).toBe("1.4");
  });
  it("rounds amounts the way a cook would", () => {
    expect(amountLabel(212.4, "g")).toBe("210 g");
    expect(amountLabel(7.4, "g")).toBe("7 g");
    expect(amountLabel(1.3, "each")).toBe("1 1/2");
    expect(amountLabel(0.4, "tbsp")).toBe("1/2 tbsp");
    expect(amountLabel(1250, "ml")).toBe("1,250 ml");
    expect(round(1.005, 2)).toBe(1.01);
  });
});
