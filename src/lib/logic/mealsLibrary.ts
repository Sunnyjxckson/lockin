// The recipe library: cheap, high protein, simple, batch friendly. Enough to
// eat from for a month on a cut. Each recipe lists what goes in the whole
// batch. Calories, macros and estimated cost per serving are computed from
// the food table (mealsFoods.ts), never typed here.

import type { MealSlot, Recipe } from "../types";
import { derivedTags, indexFoods, recipeNumbers, type Food, type IngredientLine } from "./meals";
import { FOODS } from "./mealsFoods";

export interface RecipeDef {
  slot: MealSlot;
  name: string;
  /** How many servings the batch below makes. */
  servings: number;
  lines: IngredientLine[];
  steps: string[];
  tags: string[];
}

/** "chicken breast 680; olive oil 1 tbsp; eggs 2". No unit means the food's own unit (g, ml or each). */
export function parseLines(text: string, foods: readonly Food[] = FOODS): IngredientLine[] {
  const index = indexFoods(foods);
  return text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(.+?)\s+(\d+(?:\.\d+)?)(?:\s+([a-z ]+))?$/.exec(part);
      if (!m) throw new Error(`Cannot read ingredient "${part}"`);
      const food = index.get(m[1]);
      if (!food) throw new Error(`"${m[1]}" is not in the food table`);
      return { name: food.name, quantity: Number(m[2]), unit: m[3] ?? food.base };
    });
}

function r(slot: MealSlot, name: string, servings: number, lines: string, steps: string[], tags = ""): RecipeDef {
  return { slot, name, servings, lines: parseLines(lines), steps, tags: tags.split(" ").filter(Boolean) };
}

export const RECIPE_DEFS: readonly RecipeDef[] = [
  // ---------- breakfast ----------
  r("breakfast", "Egg white veggie scramble", 1, "egg whites 250; eggs 1; spinach 60; bell pepper 0.5; cheddar 20; bread 1; olive oil 1 tsp; salt 0.25 tsp", [
    "Dice the pepper. Cook it in the oil over medium heat for 2 minutes, then wilt the spinach in.",
    "Whisk the egg and egg whites with the salt, pour in, and stir until just set.",
    "Fold in the cheddar. Eat with the toast.",
  ], "quick"),
  r("breakfast", "Protein oats", 1, "oats 50; whey protein 30; milk 240; banana 0.5; cinnamon 0.5 tsp", [
    "Microwave the oats with the milk for 2 minutes, stirring halfway.",
    "Let it cool for a minute, then stir in the protein powder and cinnamon. Add a splash of water if it is thick.",
    "Slice the banana on top.",
  ], "quick"),
  r("breakfast", "Overnight protein oats", 4, "oats 200; greek yogurt 600; milk 480; whey protein 90; frozen berries 300", [
    "Stir the oats, yogurt, milk and protein powder together in a big bowl until smooth.",
    "Split into 4 jars or containers and top each with berries.",
    "Refrigerate overnight. They keep 4 days. Eat cold.",
  ], "batch nocook"),
  r("breakfast", "Greek yogurt berry bowl", 1, "greek yogurt 350; frozen berries 100; oats 25; honey 1 tsp", [
    "Thaw the berries in the microwave for 30 seconds.",
    "Spoon the yogurt into a bowl, top with berries and dry oats, and drizzle the honey.",
  ], "quick nocook"),
  r("breakfast", "Freezer breakfast burritos", 6, "eggs 6; egg whites 500; ground turkey 454; black beans 250; cheddar 80; flour tortillas 6; salsa 150; chili powder 2 tsp; salt 0.5 tsp", [
    "Brown the turkey with the chili powder and salt. Stir in the drained beans and set aside.",
    "Scramble the eggs and egg whites in the same pan until just set.",
    "Fill each tortilla with turkey, eggs, cheddar and salsa. Roll tight.",
    "Wrap in foil and freeze. Reheat from frozen: 2 minutes in the microwave, turning once.",
  ], "batch freezer"),
  r("breakfast", "Cottage cheese tomato toast", 1, "bread 2; cottage cheese 250; tomato 1; black pepper 0.25 tsp; eggs 1", [
    "Toast the bread. Fry or boil the egg.",
    "Pile the cottage cheese on the toast, top with sliced tomato and pepper, and eat the egg on the side.",
  ], "quick"),
  r("breakfast", "Banana protein pancakes", 1, "oats 50; egg whites 150; banana 1; whey protein 20; cinnamon 0.5 tsp; greek yogurt 100", [
    "Blend the oats, egg whites, banana, protein powder and cinnamon until smooth.",
    "Cook 3 or 4 small pancakes in a nonstick pan over medium heat, about 2 minutes a side.",
    "Top with the yogurt.",
  ], "quick"),
  r("breakfast", "Egg and turkey muffin sandwiches", 4, "english muffins 4; eggs 4; egg whites 200; deli turkey 170; cheddar 60", [
    "Whisk the eggs and egg whites, pour into a greased baking dish, and bake at 375F for 15 minutes. Cut into 4 squares.",
    "Split the muffins. Stack each with an egg square, turkey and cheddar.",
    "Wrap and refrigerate up to 4 days, or freeze. Reheat for 60 to 90 seconds.",
  ], "batch freezer"),
  r("breakfast", "Turkey potato hash", 4, "ground turkey 454; potatoes 600; onion 150; bell pepper 2; eggs 4; paprika 2 tsp; olive oil 1 tbsp; salt 0.75 tsp", [
    "Dice the potatoes small. Cook them in the oil over medium high heat for 10 minutes, stirring now and then.",
    "Add the diced onion and peppers, then the turkey, paprika and salt. Cook until the turkey is browned and the potatoes are soft.",
    "Portion into 4. Fry an egg to put on top when you eat it.",
  ], "batch"),
  r("breakfast", "Peanut butter banana shake", 1, "whey protein 40; milk 360; banana 1; peanut butter 16; oats 20", [
    "Blend everything with a handful of ice until smooth.",
  ], "quick nocook"),
  r("breakfast", "Spinach egg bake squares", 6, "eggs 8; egg whites 500; spinach 150; cottage cheese 300; cheddar 80; onion 100; salt 0.5 tsp; black pepper 0.5 tsp", [
    "Heat the oven to 375F. Chop the spinach and onion.",
    "Whisk everything together and pour into a greased 9 by 13 dish.",
    "Bake 30 to 35 minutes until set in the middle. Cut into 6 squares.",
    "Keeps 5 days in the fridge. Reheat for 60 seconds.",
  ], "batch"),
  r("breakfast", "Savory oats with eggs", 1, "oats 50; chicken broth 240; eggs 2; egg whites 100; spinach 40; parmesan 10", [
    "Simmer the oats in the broth for 4 minutes. Stir in the spinach.",
    "Scramble the eggs and egg whites in a small pan.",
    "Put the eggs on the oats and finish with the parmesan.",
  ], "quick"),
  r("breakfast", "Peanut butter yogurt bowl", 1, "greek yogurt 300; whey protein 20; peanut butter 16; banana 0.5", [
    "Stir the protein powder into the yogurt until smooth.",
    "Top with the peanut butter and sliced banana.",
  ], "quick nocook"),
  r("breakfast", "Tofu scramble tacos", 2, "tofu 600; spinach 80; bell pepper 1; salsa 120; corn tortillas 4; cumin 1 tsp; olive oil 2 tsp; salt 0.5 tsp", [
    "Press the tofu dry with a towel and crumble it.",
    "Cook the diced pepper in the oil for 2 minutes. Add the tofu, cumin and salt and cook 5 minutes until it starts to brown.",
    "Wilt the spinach in. Serve in warm tortillas with salsa.",
  ], "quick"),
  r("breakfast", "Egg and edamame rice bowl", 1, "rice 60; eggs 2; egg whites 150; soy sauce 2 tsp; edamame 60", [
    "Cook the rice, or use rice left from a batch.",
    "Microwave the edamame for a minute. Scramble the eggs and egg whites.",
    "Bowl it up and splash the soy sauce over.",
  ], "quick"),
  r("breakfast", "Berry protein smoothie", 1, "whey protein 35; greek yogurt 200; frozen berries 150; milk 240; spinach 30", [
    "Blend everything until smooth. Add water if it is too thick.",
  ], "quick nocook"),

  // ---------- lunch ----------
  r("lunch", "Chicken, rice and broccoli", 4, "chicken breast 680; rice 240; frozen broccoli 680; olive oil 1 tbsp; garlic powder 2 tsp; soy sauce 2 tbsp; salt 0.5 tsp", [
    "Start the rice. Heat the oven to 425F.",
    "Cut the chicken into chunks, toss with the oil, garlic powder and salt, and bake on a sheet pan for 18 minutes.",
    "Steam the broccoli in the microwave.",
    "Split into 4 containers and splash with soy sauce.",
  ], "batch"),
  r("lunch", "Turkey taco bowls", 4, "ground turkey 680; rice 200; black beans 250; salsa 240; frozen corn 200; romaine 200; chili powder 1 tbsp; cumin 2 tsp; salt 0.5 tsp", [
    "Start the rice.",
    "Brown the turkey with the chili powder, cumin and salt. Stir in the drained beans and the corn until hot.",
    "Split rice and turkey into 4 containers. Add shredded romaine and salsa when you eat.",
  ], "batch"),
  r("lunch", "Tuna rice bowl", 1, "canned tuna 226; rice 60; edamame 80; soy sauce 1 tbsp; cucumber 0.5", [
    "Cook the rice, or use rice left from a batch. Microwave the edamame for a minute.",
    "Drain the tuna and dice the cucumber.",
    "Bowl it up and add the soy sauce.",
  ], "quick"),
  r("lunch", "Tuna salad sandwich and an apple", 1, "canned tuna 226; greek yogurt 60; bread 2; romaine 40; tomato 0.5; black pepper 0.25 tsp; apple 1", [
    "Drain the tuna and mix it with the yogurt and pepper.",
    "Build the sandwich with romaine and tomato. Eat the apple with it.",
  ], "quick nocook"),
  r("lunch", "Chicken burrito bowls", 4, "chicken thighs 680; rice 200; black beans 500; salsa 240; bell pepper 2; onion 150; chili powder 1 tbsp; cumin 2 tsp; lime 1; olive oil 2 tsp; salt 0.5 tsp", [
    "Start the rice.",
    "Slice the chicken, peppers and onion. Cook the chicken in the oil with the spices and salt for 6 minutes, then add the vegetables for 4 more.",
    "Warm the drained beans.",
    "Split into 4 containers. Squeeze the lime over and top with salsa.",
  ], "batch"),
  r("lunch", "Chicken salad wraps", 4, "chicken breast 600; greek yogurt 200; flour tortillas 4; romaine 200; tomato 2; parmesan 30; garlic powder 1 tsp; salt 0.5 tsp", [
    "Simmer the chicken in salted water for 15 minutes, then shred it with two forks.",
    "Mix the chicken with the yogurt, parmesan and garlic powder.",
    "Keep the filling in the fridge. Roll it in a tortilla with romaine and tomato when you eat.",
  ], "batch"),
  r("lunch", "Chicken lentil soup", 6, "lentils 300; chicken breast 500; carrots 300; onion 200; diced tomatoes 411; chicken broth 1400; spinach 150; cumin 2 tsp; salt 1 tsp", [
    "Dice the onion and carrots. Put everything but the spinach in a big pot.",
    "Simmer 30 minutes until the lentils are soft and the chicken is cooked through.",
    "Lift the chicken out, shred it, and stir it back in with the spinach.",
    "Keeps 5 days in the fridge and freezes well.",
  ], "batch freezer"),
  r("lunch", "Turkey bean chili", 6, "ground turkey 908; black beans 500; diced tomatoes 822; onion 200; bell pepper 2; chicken broth 480; chili powder 2 tbsp; cumin 1 tbsp; salt 1 tsp", [
    "Brown the turkey with the diced onion and peppers in a big pot.",
    "Add the spices, salt, tomatoes, drained beans and broth.",
    "Simmer 25 minutes. Keeps 5 days in the fridge and freezes well.",
  ], "batch freezer"),
  r("lunch", "Chicken fried rice", 4, "rice 240; chicken breast 500; eggs 4; frozen mixed vegetables 340; soy sauce 3 tbsp; olive oil 1 tbsp", [
    "Cook the rice and let it cool. Day old rice works best.",
    "Dice the chicken and cook it in half the oil until done. Set aside.",
    "Scramble the eggs in the rest of the oil, add the vegetables, then the rice, chicken and soy sauce. Fry 4 minutes.",
  ], "batch"),
  r("lunch", "Chicken pasta salad", 4, "pasta 250; chicken breast 600; greek yogurt 200; cucumber 1; tomato 2; parmesan 30; italian seasoning 2 tsp; salt 0.5 tsp", [
    "Boil the pasta. Simmer or bake the chicken until cooked through, then dice it.",
    "Mix the yogurt, parmesan, italian seasoning and salt into a dressing.",
    "Toss everything together with the diced cucumber and tomato. Eat cold. Keeps 4 days.",
  ], "batch"),
  r("lunch", "Turkey sandwich with cottage cheese", 1, "bread 2; deli turkey 120; cheddar 20; romaine 40; tomato 0.5; cottage cheese 200", [
    "Build the sandwich with the turkey, cheddar, romaine and tomato.",
    "Eat the cottage cheese on the side.",
  ], "quick nocook"),
  r("lunch", "Chickpea tuna salad", 2, "chickpeas 250; canned tuna 339; cucumber 1; tomato 2; onion 40; olive oil 1 tbsp; lime 1; salt 0.25 tsp", [
    "Drain the chickpeas and tuna. Dice the cucumber, tomato and onion.",
    "Toss everything with the oil, lime juice and salt. Keeps 2 days.",
  ], "quick nocook"),
  r("lunch", "Sweet potato turkey skillet", 4, "ground turkey 680; sweet potatoes 700; black beans 250; spinach 150; chili powder 2 tsp; cumin 1 tsp; olive oil 1 tbsp; salt 0.75 tsp", [
    "Dice the sweet potatoes small. Cook in the oil with a splash of water, covered, for 8 minutes.",
    "Add the turkey, spices and salt and brown it.",
    "Stir in the drained beans and the spinach until the spinach wilts. Split into 4.",
  ], "batch"),
  r("lunch", "Salsa chicken and rice", 5, "chicken breast 900; salsa 454; rice 300; frozen corn 250; cumin 2 tsp; salt 0.5 tsp", [
    "Put the chicken, salsa, cumin and salt in a pot or slow cooker. Simmer covered 25 minutes, or slow cook 4 hours on high.",
    "Shred the chicken into the sauce and stir in the corn.",
    "Cook the rice. Split into 5 containers.",
  ], "batch freezer"),
  r("lunch", "Tofu edamame rice bowls", 3, "tofu 794; rice 180; frozen stir fry vegetables 340; edamame 150; soy sauce 3 tbsp; olive oil 1 tbsp", [
    "Start the rice. Press the tofu dry and cube it.",
    "Brown the tofu in the oil for 8 minutes, turning. Add the vegetables, edamame and soy sauce and cook 4 minutes.",
    "Split over rice into 3 containers.",
  ], "batch"),
  r("lunch", "Cottage cheese snack plate", 1, "cottage cheese 300; deli turkey 85; rice cakes 3; cucumber 0.5; apple 1", [
    "Slice the cucumber and apple.",
    "Plate everything. Nothing to cook.",
  ], "quick nocook"),
  r("lunch", "Chicken quesadillas", 2, "chicken breast 340; flour tortillas 2; mozzarella 80; bell pepper 1; salsa 100; greek yogurt 100; chili powder 1 tsp", [
    "Dice the chicken and pepper and cook them with the chili powder until the chicken is done.",
    "Fill half of each tortilla with chicken and mozzarella, fold, and crisp in a dry pan 2 minutes a side.",
    "Eat with the salsa and yogurt.",
  ], "quick"),

  // ---------- dinner ----------
  r("dinner", "Sheet pan chicken thighs and potatoes", 4, "chicken thighs 800; potatoes 800; frozen green beans 340; olive oil 1 tbsp; paprika 2 tsp; garlic powder 2 tsp; salt 1 tsp", [
    "Heat the oven to 425F. Cut the potatoes into chunks.",
    "Toss the chicken and potatoes with the oil, spices and salt on a sheet pan. Roast 20 minutes.",
    "Add the green beans and roast 10 more.",
  ], "batch"),
  r("dinner", "Turkey spaghetti", 5, "ground turkey 680; pasta 340; marinara 680; onion 150; parmesan 40; italian seasoning 2 tsp", [
    "Boil the pasta.",
    "Brown the turkey with the diced onion and italian seasoning. Add the marinara and simmer 10 minutes.",
    "Toss with the pasta. Parmesan on top.",
  ], "batch freezer"),
  r("dinner", "Chicken stir fry", 4, "chicken breast 680; frozen stir fry vegetables 680; rice 240; soy sauce 4 tbsp; honey 1 tbsp; olive oil 1 tbsp; garlic powder 1 tsp", [
    "Start the rice.",
    "Slice the chicken thin and cook it in the oil over high heat for 5 minutes.",
    "Add the vegetables, soy sauce, honey and garlic powder. Cook 4 minutes until glossy.",
  ], "batch"),
  r("dinner", "Egg roll bowls", 4, "ground turkey 680; coleslaw mix 794; carrots 150; eggs 2; rice 160; soy sauce 4 tbsp; garlic powder 1 tsp", [
    "Start the rice.",
    "Brown the turkey in a big pan. Add the coleslaw mix, grated carrots, soy sauce and garlic powder and cook 5 minutes.",
    "Push everything aside, scramble the eggs in the gap, and stir them through.",
  ], "batch"),
  r("dinner", "Baked tilapia with rice and broccoli", 3, "tilapia 600; rice 180; frozen broccoli 510; olive oil 1 tbsp; lime 1; paprika 1 tsp; salt 0.5 tsp", [
    "Start the rice. Heat the oven to 400F.",
    "Rub the fish with the oil, paprika and salt. Bake 12 minutes.",
    "Steam the broccoli. Squeeze the lime over the fish.",
  ], "quick"),
  r("dinner", "Tilapia tacos", 3, "tilapia 500; corn tortillas 9; coleslaw mix 200; greek yogurt 120; salsa 150; lime 1; chili powder 2 tsp; olive oil 2 tsp; salt 0.5 tsp", [
    "Season the fish with chili powder and salt. Cook in the oil 3 minutes a side, then flake it.",
    "Mix the yogurt with the lime juice and toss it with the coleslaw mix.",
    "Warm the tortillas. Fill with fish, slaw and salsa.",
  ], "quick"),
  r("dinner", "Beef taco skillet", 4, "ground beef 680; black beans 250; rice 200; diced tomatoes 411; frozen corn 200; cheddar 60; chili powder 1 tbsp; cumin 2 tsp; salt 0.5 tsp", [
    "Brown the beef with the spices and salt in a deep pan. Drain the fat.",
    "Add the dry rice, tomatoes, drained beans, corn and 2 cups of water. Cover and simmer 18 minutes.",
    "Melt the cheddar on top.",
  ], "batch"),
  r("dinner", "Pork loin with sweet potatoes", 4, "pork loin 700; sweet potatoes 800; frozen green beans 340; olive oil 1 tbsp; paprika 2 tsp; garlic powder 2 tsp; salt 1 tsp", [
    "Heat the oven to 400F. Rub the pork with half the oil, the spices and salt.",
    "Cube the sweet potatoes, toss with the rest of the oil, and roast beside the pork for 30 minutes.",
    "Rest the pork 5 minutes before slicing. Microwave the green beans.",
  ], "batch"),
  r("dinner", "Chicken fajitas", 4, "chicken breast 680; bell pepper 3; onion 250; flour tortillas 8; salsa 200; greek yogurt 150; chili powder 1 tbsp; cumin 2 tsp; olive oil 1 tbsp; lime 1", [
    "Slice the chicken, peppers and onion into strips.",
    "Cook the chicken in the oil with the spices over high heat for 5 minutes. Add the vegetables for 5 more.",
    "Squeeze the lime over. Serve in tortillas with salsa and yogurt.",
  ], "batch"),
  r("dinner", "Shrimp fried rice", 3, "shrimp 454; rice 210; frozen mixed vegetables 340; eggs 2; soy sauce 3 tbsp; olive oil 1 tbsp", [
    "Cook the rice and let it cool.",
    "Cook the thawed shrimp in half the oil for 3 minutes. Set aside.",
    "Scramble the eggs in the rest of the oil, add the vegetables, rice, shrimp and soy sauce. Fry 4 minutes.",
  ], "quick"),
  r("dinner", "Chicken parmesan bake", 4, "chicken breast 700; marinara 400; mozzarella 120; parmesan 30; pasta 240; frozen broccoli 340; italian seasoning 2 tsp", [
    "Heat the oven to 400F. Lay the chicken in a baking dish and season it.",
    "Cover with the marinara and cheeses. Bake 25 minutes.",
    "Boil the pasta and steam the broccoli while it bakes.",
  ], "batch"),
  r("dinner", "One pot chicken and rice", 5, "chicken thighs 900; rice 350; chicken broth 800; frozen mixed vegetables 340; onion 150; garlic powder 2 tsp; paprika 2 tsp; salt 1 tsp", [
    "Season the chicken with the spices and salt. Brown it in a deep pot 3 minutes a side.",
    "Add the diced onion, dry rice and broth. Cover and simmer 18 minutes.",
    "Stir in the vegetables, cover, and rest 5 minutes.",
  ], "batch"),
  r("dinner", "Turkey meatballs with potatoes", 4, "ground turkey 680; oats 40; eggs 1; marinara 340; potatoes 700; frozen broccoli 340; parmesan 20; italian seasoning 2 tsp; salt 0.75 tsp", [
    "Heat the oven to 425F. Cube the potatoes and start roasting them on a sheet pan.",
    "Mix the turkey, oats, egg, italian seasoning and salt. Roll into 16 balls and add them to the pan. Bake 18 minutes.",
    "Warm the marinara and steam the broccoli. Parmesan on top.",
  ], "batch freezer"),
  r("dinner", "Lentil tomato stew with eggs", 4, "lentils 320; diced tomatoes 822; onion 200; spinach 200; eggs 8; rice 120; greek yogurt 400; cumin 2 tsp; paprika 2 tsp; salt 1 tsp", [
    "Simmer the lentils with the diced onion, tomatoes, spices, salt and 3 cups of water for 25 minutes.",
    "Cook the rice. Stir the spinach into the stew.",
    "Crack the eggs into the stew, cover, and cook 5 minutes. Serve over rice with the yogurt.",
  ], "batch"),
  r("dinner", "Honey soy chicken thighs", 4, "chicken thighs 800; honey 2 tbsp; soy sauce 4 tbsp; rice 240; frozen broccoli 680; garlic powder 2 tsp", [
    "Heat the oven to 425F. Start the rice.",
    "Toss the chicken with the honey, soy sauce and garlic powder. Bake 22 minutes, spooning the sauce over once.",
    "Steam the broccoli.",
  ], "batch"),
  r("dinner", "Turkey burgers with potato wedges", 4, "ground turkey 680; english muffins 4; potatoes 800; romaine 80; tomato 1; cheddar 60; olive oil 1 tbsp; garlic powder 1 tsp; salt 1 tsp", [
    "Heat the oven to 425F. Cut the potatoes into wedges, toss with the oil and half the salt, and roast 30 minutes.",
    "Mix the turkey with the garlic powder and the rest of the salt. Shape 4 patties and cook 5 minutes a side.",
    "Melt the cheddar on top. Serve on toasted muffins with romaine and tomato.",
  ], "batch"),
  r("dinner", "Beef and broccoli rice bowls", 4, "ground beef 680; frozen broccoli 680; rice 240; soy sauce 4 tbsp; honey 1 tbsp; garlic powder 2 tsp", [
    "Start the rice.",
    "Brown the beef and drain the fat.",
    "Add the broccoli, soy sauce, honey and garlic powder. Cover and cook 5 minutes.",
  ], "batch"),
  r("dinner", "Chicken tortilla soup", 5, "chicken breast 700; black beans 500; frozen corn 300; diced tomatoes 822; chicken broth 946; onion 150; corn tortillas 5; lime 1; chili powder 1 tbsp; cumin 2 tsp; salt 1 tsp", [
    "Put everything but the tortillas and lime in a pot. Simmer 25 minutes.",
    "Lift the chicken out, shred it, and stir it back in.",
    "Cut the tortillas into strips and crisp them in a dry pan. Top the soup with them and a squeeze of lime.",
  ], "batch freezer"),
  r("dinner", "Peanut tofu noodles", 3, "tofu 794; pasta 240; frozen stir fry vegetables 680; soy sauce 4 tbsp; peanut butter 48; honey 1 tbsp; lime 1; olive oil 2 tsp", [
    "Boil the pasta. Press the tofu dry and cube it.",
    "Brown the tofu in the oil for 8 minutes. Add the vegetables and cook 4 minutes.",
    "Whisk the peanut butter, soy sauce, honey, lime juice and a splash of pasta water. Toss everything together.",
  ], "batch"),
  r("dinner", "Stuffed pepper skillet", 4, "ground turkey 680; bell pepper 4; rice 200; diced tomatoes 411; mozzarella 100; onion 150; italian seasoning 2 tsp; salt 0.75 tsp", [
    "Brown the turkey with the diced onion and peppers.",
    "Add the dry rice, tomatoes, italian seasoning, salt and 2 cups of water. Cover and simmer 18 minutes.",
    "Melt the mozzarella on top.",
  ], "batch"),

  // ---------- snacks ----------
  r("snack", "Protein shake", 1, "whey protein 31; milk 300", [
    "Shake the protein powder with the milk and ice.",
  ], "quick nocook"),
  r("snack", "Greek yogurt with berries and honey", 1, "greek yogurt 250; frozen berries 80; honey 2 tsp", [
    "Thaw the berries for 30 seconds in the microwave.",
    "Top the yogurt with the berries and honey.",
  ], "quick nocook"),
  r("snack", "Cottage cheese and apple", 1, "cottage cheese 226; apple 1; cinnamon 0.25 tsp", [
    "Slice the apple. Eat it with the cottage cheese and a shake of cinnamon.",
  ], "quick nocook"),
  r("snack", "Boiled eggs and string cheese", 3, "eggs 6; string cheese 3; salt 0.25 tsp", [
    "Boil the eggs for 10 minutes, then cool them in ice water.",
    "Keep them in the shell in the fridge up to a week. A snack is 2 eggs and a string cheese.",
  ], "batch"),
  r("snack", "Tuna rice cakes", 1, "canned tuna 113; greek yogurt 30; rice cakes 2; black pepper 0.25 tsp", [
    "Drain the tuna and mix it with the yogurt and pepper.",
    "Pile it on the rice cakes.",
  ], "quick nocook"),
  r("snack", "Peanut butter banana rice cakes", 1, "rice cakes 2; peanut butter 16; banana 0.5; greek yogurt 150", [
    "Spread the peanut butter on the rice cakes and top with sliced banana.",
    "Eat the yogurt on the side.",
  ], "quick nocook"),
  r("snack", "Turkey and cheese roll ups", 1, "deli turkey 100; string cheese 2; cucumber 0.5", [
    "Wrap the turkey around the string cheese. Slice the cucumber to go with it.",
  ], "quick nocook"),
  r("snack", "Edamame bowl", 1, "edamame 200; soy sauce 1 tsp; salt 0.25 tsp", [
    "Microwave the edamame for 2 minutes.",
    "Toss with the soy sauce and salt.",
  ], "quick"),
  r("snack", "Protein yogurt dip with apple", 1, "greek yogurt 200; whey protein 15; peanut butter 8; apple 1", [
    "Stir the protein powder and peanut butter into the yogurt.",
    "Slice the apple and dip.",
  ], "quick nocook"),
  r("snack", "Roasted chickpeas and yogurt", 4, "chickpeas 500; olive oil 1 tbsp; paprika 2 tsp; garlic powder 1 tsp; salt 0.5 tsp; greek yogurt 600", [
    "Heat the oven to 425F. Drain the chickpeas and pat them very dry.",
    "Toss with the oil, spices and salt and roast 25 minutes, shaking once.",
    "Keep in an open jar for 3 days. A snack is a quarter of them with a small bowl of yogurt.",
  ], "batch"),
  r("snack", "Cottage cheese with veggies", 1, "cottage cheese 226; carrots 100; cucumber 0.5; garlic powder 0.25 tsp; black pepper 0.25 tsp", [
    "Stir the garlic powder and pepper into the cottage cheese.",
    "Cut the carrots and cucumber into sticks and dip.",
  ], "quick nocook"),
  r("snack", "Protein oat bites", 8, "oats 160; whey protein 120; peanut butter 96; honey 40; milk 80", [
    "Mix everything in a bowl until it holds together. Add a little more milk if it is crumbly.",
    "Roll into 16 balls. Chill for an hour.",
    "Keeps a week in the fridge. A snack is 2 bites.",
  ], "batch nocook"),
  r("snack", "Cinnamon protein pudding", 1, "greek yogurt 250; whey protein 20; cinnamon 0.5 tsp", [
    "Stir the protein powder and cinnamon into the yogurt until thick and smooth.",
  ], "quick nocook"),
  r("snack", "Turkey melt toast", 1, "bread 1; deli turkey 85; mozzarella 20", [
    "Top the bread with the turkey and mozzarella.",
    "Toast or broil until the cheese melts.",
  ], "quick"),
];

export type SeedRecipe = Omit<Recipe, "id" | "created_at">;

/** A recipe row from a definition, with every number computed from the food table. */
export function buildRecipe(def: RecipeDef, foods: readonly Food[] = FOODS): SeedRecipe {
  const index = indexFoods(foods);
  const n = recipeNumbers(def.lines, def.servings, index);
  return {
    name: def.name,
    slot: def.slot,
    ingredients: n.ingredients,
    steps: def.steps,
    servings: def.servings,
    calories: n.calories,
    protein: n.protein,
    carbs: n.carbs,
    fat: n.fat,
    est_cost: n.est_cost,
    tags: derivedTags(def.lines, index, def.tags),
    photo_url: null,
    source: "seed",
  };
}

/** The library as rows ready to insert. */
export const LIBRARY: readonly SeedRecipe[] = RECIPE_DEFS.map((d) => buildRecipe(d));

/** The library with stable ids, for tests and for planning before anything is saved. */
export function libraryWithIds(): Recipe[] {
  return LIBRARY.map((r, i) => ({ ...r, id: `lib${String(i + 1).padStart(2, "0")}`, created_at: "2026-01-01T00:00:00.000Z" }));
}
