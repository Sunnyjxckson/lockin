import { describe, expect, it } from "vitest";
import { indexFoods } from "./meals";
import { FOODS } from "./mealsFoods";
import { cleanWebRecipes, extractJson, isMinor, safeUrl, toRecipeRow, webNumbers } from "./mealsWeb";

const index = indexFoods(FOODS);

function recipe(over: Record<string, unknown> = {}) {
  return {
    name: "Chicken and rice bowl",
    slot: "dinner",
    servings: 4,
    minutes: 30,
    source_url: "https://example.com/chicken-rice",
    source_name: "Example Kitchen",
    ingredients: [
      { name: "chicken breast", quantity: 680, unit: "g" },
      { name: "rice", quantity: 300, unit: "g" },
      { name: "olive oil", quantity: 1, unit: "tbsp" },
    ],
    steps: ["Cook the rice.", "Sear the chicken.", "Serve."],
    ...over,
  };
}

describe("safeUrl", () => {
  it("keeps http and https only", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,hi")).toBeNull();
    expect(safeUrl("ftp://example.com")).toBeNull();
    expect(safeUrl("https://user:pw@example.com")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl(5)).toBeNull();
  });
});

describe("extractJson", () => {
  it("reads bare, fenced and wrapped json", () => {
    expect(extractJson('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(extractJson('Here:\n```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
    expect(extractJson('Sure. [{"a":2}] Enjoy.')).toEqual([{ a: 2 }]);
    expect(extractJson("nothing")).toBeNull();
  });
});

describe("webNumbers", () => {
  it("works out per serving numbers from the food table, not from the model", () => {
    const n = webNumbers(recipe().ingredients, 4, index);
    expect(n.unknown).toEqual([]);
    expect(n.partial).toBe(false);
    expect(n.calories).toBeGreaterThan(300);
    expect(n.protein).toBeGreaterThan(30);
    expect(n.est_cost).toBeGreaterThan(0);
  });

  it("matches a described food to the table", () => {
    const n = webNumbers([{ name: "boneless skinless chicken breast", quantity: 680, unit: "g" }, { name: "white rice", quantity: 300, unit: "g" }, { name: "extra virgin olive oil", quantity: 1, unit: "tbsp" }], 4, index);
    expect(n.unknown).toEqual([]);
    expect(n.ingredients.map((i) => i.name)).toEqual(["chicken breast", "rice", "olive oil"]);
  });

  it("matches a plural to the food", () => {
    const n = webNumbers([{ name: "chicken breasts", quantity: 680, unit: "g" }, { name: "rice", quantity: 300, unit: "g" }], 4, index);
    expect(n.unknown).toEqual([]);
    expect(n.ingredients[0].name).toBe("chicken breast");
  });

  it("flags an unknown ingredient and marks the numbers partial when it matters", () => {
    const n = webNumbers([...recipe().ingredients, { name: "dragonfruit puree", quantity: 250, unit: "g" }], 4, index);
    expect(n.unknown).toEqual(["dragonfruit puree"]);
    expect(n.partial).toBe(true);
    expect(n.covered).toBeLessThan(0.9);
  });

  it("does not flag a pinch of something it does not know", () => {
    const n = webNumbers([...recipe().ingredients, { name: "sumac", quantity: 1, unit: "tsp" }, { name: "salt", quantity: 1, unit: "tsp" }], 4, index);
    expect(n.unknown).toEqual([]);
    expect(n.partial).toBe(false);
  });

  it("treats a unit that does not convert as unknown", () => {
    const n = webNumbers([{ name: "chicken breast", quantity: 2, unit: "each" }, { name: "rice", quantity: 300, unit: "g" }], 2, index);
    expect(n.unknown).toEqual(["chicken breast"]);
  });
});

describe("isMinor", () => {
  it("is small spoons and plain salt and water", () => {
    expect(isMinor({ name: "x", quantity: 2, unit: "tsp" })).toBe(true);
    expect(isMinor({ name: "x", quantity: 1, unit: "tbsp" })).toBe(true);
    expect(isMinor({ name: "x", quantity: 3, unit: "tbsp" })).toBe(false);
    expect(isMinor({ name: "Water", quantity: 2, unit: "cup" })).toBe(true);
    expect(isMinor({ name: "x", quantity: 200, unit: "g" })).toBe(false);
  });
});

describe("cleanWebRecipes", () => {
  it("keeps a good recipe and ignores any numbers the model sent", () => {
    const out = cleanWebRecipes([recipe({ calories: 1, protein: 999, est_cost: 0.01 })], index);
    expect(out).toHaveLength(1);
    expect(out[0].calories).toBeGreaterThan(100);
    expect(out[0].protein).toBeLessThan(200);
    expect(out[0].est_cost).toBeGreaterThan(0.5);
    expect(out[0].source_name).toBe("Example Kitchen");
    expect(out[0].tags).toContain("web");
  });

  it("accepts {recipes: [...]}", () => {
    expect(cleanWebRecipes({ recipes: [recipe()] }, index)).toHaveLength(1);
  });

  it("drops a recipe with no safe link or too few ingredients", () => {
    expect(cleanWebRecipes([recipe({ source_url: "javascript:x" })], index)).toHaveLength(0);
    expect(cleanWebRecipes([recipe({ source_url: undefined })], index)).toHaveLength(0);
    expect(cleanWebRecipes([recipe({ ingredients: [{ name: "chicken breast", quantity: 100, unit: "g" }] })], index)).toHaveLength(0);
  });

  it("drops a recipe whose calories mostly cannot be worked out", () => {
    const bad = recipe({
      ingredients: [
        { name: "dragonfruit puree", quantity: 600, unit: "g" },
        { name: "mystery grain", quantity: 400, unit: "g" },
        { name: "olive oil", quantity: 1, unit: "tbsp" },
      ],
    });
    expect(cleanWebRecipes([bad], index)).toHaveLength(0);
  });

  it("keeps a partly known recipe and marks it partial", () => {
    const part = recipe({ ingredients: [...recipe().ingredients, { name: "dragonfruit puree", quantity: 250, unit: "g" }] });
    const out = cleanWebRecipes([part], index);
    expect(out).toHaveLength(1);
    expect(out[0].partial).toBe(true);
    expect(out[0].unknown).toEqual(["dragonfruit puree"]);
    expect(out[0].tags).toContain("partial");
  });

  it("leaves out dislikes, long cook times, library duplicates and repeats", () => {
    expect(cleanWebRecipes([recipe()], index, { dislikes: ["chicken"] })).toHaveLength(0);
    expect(cleanWebRecipes([recipe({ minutes: 90 })], index, { maxMinutes: 30 })).toHaveLength(0);
    expect(cleanWebRecipes([recipe({ minutes: null })], index, { maxMinutes: 30 })).toHaveLength(1);
    expect(cleanWebRecipes([recipe()], index, { knownNames: ["chicken and rice bowl"] })).toHaveLength(0);
    expect(cleanWebRecipes([recipe()], index, { knownUrls: ["https://www.example.com/chicken-rice/"] })).toHaveLength(0);
    expect(cleanWebRecipes([recipe(), recipe({ name: "Other name" })], index)).toHaveLength(1);
  });

  it("puts liked foods first and respects max", () => {
    const eggs = recipe({
      name: "Egg scramble",
      slot: "breakfast",
      source_url: "https://example.com/eggs",
      ingredients: [{ name: "eggs", quantity: 6, unit: "each" }, { name: "milk", quantity: 100, unit: "ml" }],
    });
    const out = cleanWebRecipes([recipe(), eggs], index, { likes: ["egg"] });
    expect(out[0].name).toBe("Egg scramble");
    expect(cleanWebRecipes([recipe(), eggs], index, { max: 1 })).toHaveLength(1);
  });

  it("strips dashes from model words and falls back for slot, servings and site name", () => {
    const out = cleanWebRecipes([recipe({ name: `Rice ${String.fromCharCode(0x2014)} and chicken`, slot: "brunch", servings: 0, source_name: "" })], index);
    expect(out[0].name).not.toMatch(/[\u2013\u2014]/);
    expect(out[0].slot).toBe("dinner");
    expect(out[0].servings).toBe(4);
    expect(out[0].source_name).toBe("example.com");
  });
});

describe("toRecipeRow", () => {
  it("saves as a web recipe with its link", () => {
    const row = toRecipeRow(cleanWebRecipes([recipe()], index)[0]);
    expect(row.source).toBe("web");
    expect(row.source_url).toBe("https://example.com/chicken-rice");
    expect(row.minutes).toBe(30);
  });
});
