// The food table behind every recipe number. Nutrition is per 100 g, per
// 100 ml or per one, from standard reference values (USDA FoodData Central,
// raw or as sold). Prices are ESTIMATES of a typical pack at a mid priced
// grocery store in the Southeast, written in 2026. They are not any store's
// shelf price. Store by store estimates are derived in mealsPricing.ts.

import type { BaseUnit, Food, Section } from "./meals";

type Row = [
  name: string,
  section: Section,
  base: BaseUnit,
  macros: [calories: number, protein: number, carbs: number, fat: number],
  pack: number,
  packLabel: string,
  price: number,
  tags: string,
  extra?: Partial<Pick<Food, "step" | "tspGrams" | "staple">>,
];

const ROWS: Row[] = [
  // Meat, fish, eggs
  ["chicken breast", "meat", "g", [120, 22.5, 0, 2.6], 454, "lb", 2.99, "chicken meat poultry", { step: 0.25 }],
  ["chicken thighs", "meat", "g", [121, 19.7, 0, 4.1], 454, "lb", 2.49, "chicken meat poultry", { step: 0.25 }],
  ["ground turkey", "meat", "g", [150, 18.7, 0, 8.3], 454, "lb", 4.49, "turkey meat poultry"],
  ["ground beef", "meat", "g", [176, 20, 0, 10], 454, "lb", 5.99, "beef meat"],
  ["pork loin", "meat", "g", [143, 21.4, 0, 5.7], 454, "lb", 2.79, "pork meat", { step: 0.25 }],
  ["deli turkey", "meat", "g", [106, 17, 3.5, 2], 255, "9 oz pack", 3.99, "turkey meat poultry deli"],
  ["canned tuna", "pantry", "g", [86, 19.4, 0, 1], 113, "can", 1.0, "tuna fish seafood"],
  ["tilapia", "frozen", "g", [96, 20.1, 0, 1.7], 454, "lb", 4.49, "tilapia fish seafood"],
  ["shrimp", "frozen", "g", [85, 20.1, 0, 0.5], 340, "12 oz bag", 5.99, "shrimp shellfish seafood"],
  ["eggs", "dairy", "each", [72, 6.3, 0.4, 4.8], 12, "dozen", 2.99, "egg"],
  ["egg whites", "dairy", "g", [52, 10.9, 0.7, 0.2], 454, "16 oz carton", 3.49, "egg", { tspGrams: 5.06 }],
  // Dairy
  ["greek yogurt", "dairy", "g", [59, 10.3, 3.6, 0.4], 907, "32 oz tub", 4.49, "yogurt dairy", { tspGrams: 5.1 }],
  ["cottage cheese", "dairy", "g", [81, 10.4, 4.8, 2.3], 680, "24 oz tub", 3.49, "cottage cheese dairy", { tspGrams: 4.7 }],
  ["milk", "dairy", "ml", [43, 3.4, 5, 1], 1893, "half gallon", 2.29, "milk dairy"],
  ["cheddar", "dairy", "g", [403, 23, 3, 33], 227, "8 oz bag", 2.49, "cheese dairy", { tspGrams: 2.35 }],
  ["mozzarella", "dairy", "g", [300, 24, 4, 20], 227, "8 oz bag", 2.49, "cheese dairy", { tspGrams: 2.35 }],
  ["parmesan", "dairy", "g", [420, 30, 12, 28], 227, "8 oz shaker", 3.49, "cheese dairy", { tspGrams: 1.67 }],
  ["string cheese", "dairy", "each", [80, 7, 1, 6], 12, "12 pack", 3.79, "cheese dairy"],
  ["whey protein", "pantry", "g", [387, 77, 10, 5], 454, "1 lb tub", 15.99, "protein powder whey dairy", { tspGrams: 2.6 }],
  ["tofu", "produce", "g", [99, 11, 2.2, 5.5], 397, "14 oz block", 1.99, "tofu soy"],
  // Grains, bread, starch
  ["rice", "pantry", "g", [365, 7.1, 80, 0.7], 907, "2 lb bag", 1.89, "rice", { tspGrams: 3.85 }],
  ["oats", "pantry", "g", [379, 13.2, 67.7, 6.5], 1190, "42 oz canister", 3.99, "oats oatmeal", { tspGrams: 1.67 }],
  ["pasta", "pantry", "g", [371, 13, 74.7, 1.5], 454, "1 lb box", 1.19, "pasta gluten"],
  ["bread", "bakery", "each", [80, 4, 14, 1], 20, "loaf", 2.29, "bread gluten"],
  ["english muffins", "bakery", "each", [130, 5, 25, 1], 6, "6 pack", 1.79, "bread gluten"],
  ["flour tortillas", "bakery", "each", [140, 4, 24, 3.5], 10, "10 pack", 2.29, "tortilla gluten"],
  ["corn tortillas", "bakery", "each", [52, 1.4, 10.7, 0.7], 30, "30 pack", 2.29, "tortilla"],
  ["rice cakes", "pantry", "each", [35, 0.7, 7.3, 0.3], 14, "bag", 2.49, "rice cake"],
  ["potatoes", "produce", "g", [79, 2.1, 18, 0.1], 2268, "5 lb bag", 3.49, "potato"],
  ["sweet potatoes", "produce", "g", [86, 1.6, 20.1, 0.1], 454, "lb", 1.19, "sweet potato", { step: 0.25 }],
  // Beans and jars
  ["black beans", "pantry", "g", [91, 6, 16.6, 0.3], 250, "can", 0.85, "beans"],
  ["chickpeas", "pantry", "g", [139, 7, 22.5, 2.6], 250, "can", 0.89, "chickpeas beans"],
  ["lentils", "pantry", "g", [352, 24.6, 63.4, 1.1], 454, "1 lb bag", 1.69, "lentils"],
  ["peanut butter", "pantry", "g", [588, 25, 20, 50], 454, "16 oz jar", 2.29, "peanut butter peanuts nuts", { tspGrams: 5.33 }],
  ["diced tomatoes", "pantry", "g", [17, 0.8, 3.9, 0.1], 411, "can", 0.89, "tomato"],
  ["marinara", "pantry", "g", [50, 1.4, 8, 1.5], 680, "24 oz jar", 1.99, "tomato sauce marinara"],
  ["salsa", "pantry", "g", [29, 1.4, 6.6, 0.2], 454, "16 oz jar", 2.19, "salsa", { tspGrams: 5.4 }],
  ["chicken broth", "pantry", "ml", [4, 0.5, 0.4, 0.1], 946, "32 oz carton", 1.49, "broth"],
  ["honey", "pantry", "g", [304, 0.3, 82.4, 0], 340, "12 oz bottle", 3.49, "honey", { tspGrams: 7 }],
  // Produce
  ["banana", "produce", "each", [105, 1.3, 27, 0.4], 1, "each", 0.25, "banana fruit"],
  ["apple", "produce", "each", [95, 0.5, 25, 0.3], 1, "each", 0.6, "apple fruit"],
  ["lime", "produce", "each", [20, 0.5, 7, 0.1], 1, "each", 0.35, "lime"],
  ["onion", "produce", "g", [40, 1.1, 9.3, 0.1], 1361, "3 lb bag", 2.99, "onion"],
  ["bell pepper", "produce", "each", [30, 1.3, 7, 0.3], 1, "each", 0.89, "pepper bell pepper"],
  ["carrots", "produce", "g", [41, 0.9, 9.6, 0.2], 907, "2 lb bag", 1.69, "carrot"],
  ["spinach", "produce", "g", [23, 2.9, 3.6, 0.4], 227, "8 oz bag", 2.29, "spinach greens"],
  ["romaine", "produce", "g", [17, 1.2, 3.3, 0.3], 340, "head", 1.99, "lettuce greens salad"],
  ["coleslaw mix", "produce", "g", [25, 1.3, 5.8, 0.1], 397, "14 oz bag", 1.79, "cabbage"],
  ["tomato", "produce", "each", [22, 1.1, 4.8, 0.2], 1, "each", 0.5, "tomato"],
  ["cucumber", "produce", "each", [45, 2, 11, 0.3], 1, "each", 0.69, "cucumber"],
  // Frozen
  ["frozen broccoli", "frozen", "g", [26, 2.8, 4.8, 0.3], 340, "12 oz bag", 1.19, "broccoli"],
  ["frozen mixed vegetables", "frozen", "g", [64, 3.3, 13.5, 0.5], 340, "12 oz bag", 1.19, "mixed vegetables"],
  ["frozen stir fry vegetables", "frozen", "g", [35, 2, 6.5, 0.3], 340, "12 oz bag", 1.69, "stir fry vegetables"],
  ["frozen green beans", "frozen", "g", [33, 1.8, 7.5, 0.2], 340, "12 oz bag", 1.19, "green beans"],
  ["frozen corn", "frozen", "g", [88, 3, 20.7, 0.8], 340, "12 oz bag", 1.19, "corn"],
  ["frozen berries", "frozen", "g", [48, 0.7, 12, 0.3], 340, "12 oz bag", 2.99, "berries fruit"],
  ["edamame", "frozen", "g", [121, 11.9, 8.9, 5.2], 340, "12 oz bag", 2.49, "edamame soy"],
  // Staples: assumed to be at home until the user says otherwise
  ["olive oil", "spices", "ml", [813, 0, 0, 92], 500, "bottle", 5.49, "oil", { staple: true }],
  ["soy sauce", "spices", "ml", [60, 9, 6, 0], 296, "bottle", 1.99, "soy sauce soy", { staple: true }],
  ["salt", "spices", "g", [0, 0, 0, 0], 737, "canister", 0.99, "", { staple: true, tspGrams: 6 }],
  ["black pepper", "spices", "g", [251, 10.4, 64, 3.3], 85, "tin", 2.99, "", { staple: true, tspGrams: 2.3 }],
  ["garlic powder", "spices", "g", [331, 16.6, 72.7, 0.7], 88, "jar", 1.49, "garlic", { staple: true, tspGrams: 3.1 }],
  ["chili powder", "spices", "g", [282, 13.5, 49.7, 14.3], 71, "jar", 1.49, "chili spicy", { staple: true, tspGrams: 2.7 }],
  ["cumin", "spices", "g", [375, 17.8, 44.2, 22.3], 57, "jar", 1.49, "", { staple: true, tspGrams: 2.1 }],
  ["paprika", "spices", "g", [282, 14.1, 54, 12.9], 60, "jar", 1.49, "", { staple: true, tspGrams: 2.3 }],
  ["italian seasoning", "spices", "g", [265, 9, 68.9, 4.3], 21, "jar", 1.49, "", { staple: true, tspGrams: 1 }],
  ["cinnamon", "spices", "g", [247, 4, 80.6, 1.2], 67, "jar", 1.49, "cinnamon", { staple: true, tspGrams: 2.6 }],
];

export const FOODS: readonly Food[] = ROWS.map(([name, section, base, m, pack, packLabel, price, tags, extra]) => ({
  name,
  section,
  base,
  per: { calories: m[0], protein: m[1], carbs: m[2], fat: m[3] },
  pack,
  packLabel,
  price,
  tags: tags.split(" ").filter(Boolean),
  ...extra,
}));

/** Foods that count as already at home on a first plan. */
export const STAPLES: readonly string[] = FOODS.filter((f) => f.staple).map((f) => f.name);
