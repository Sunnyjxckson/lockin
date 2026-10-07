// The second half of the walkthrough: mood boards and the look they set,
// meal planning on a budget, the focus timer, and where each of them meets
// Today and Money. Called from scripts/e2e.mjs with its helpers, or alone
// with `node scripts/e2e.mjs <url> --features`.
//
// Same rules as the first half: production build, empty .env, 390 x 844, the
// clock pinned to the first challenge's dates, and any console error fails
// the run. Set PLAN=1 to print the planned week as text.

const NOON_DAY_1 = "2026-10-05T16:00:00Z"; // Monday Oct 5, 12:00 PM New York

/** The app going to the background and coming back, as the page sees it. */
function setHidden(page, hidden) {
  return page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/** A 600 x 800 image in soft pastel blocks, as PNG bytes, drawn in the page. */
async function pastelImage(page) {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 800;
    const g = c.getContext("2d");
    const blocks = [
      ["#f6dfe8", 0, 0, 600, 360],
      ["#cfe6dc", 0, 360, 330, 250],
      ["#f3e3b4", 330, 360, 270, 250],
      ["#b9c7e6", 0, 610, 600, 120],
      ["#5d5470", 0, 730, 600, 70],
    ];
    for (const [color, x, y, w, h] of blocks) {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    }
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

const money = (text) => Number((/\$([\d,]+(?:\.\d+)?)/.exec(text) ?? [])[1]?.replace(/,/g, "") ?? NaN);
const clockSeconds = (text) => {
  const parts = text.replace(/[^\d:]/g, "").split(":").map(Number);
  return parts.reduce((n, p) => n * 60 + p, 0);
};

export async function runFeatures(h) {
  const { browser, base, device, check, watch, shot, rows, dialog, row, createPasscode, checkContrast, rootVar, noOverflow, openMore, closeSheet, PREFIX } = h;
  const toastSays = (page, text) => page.getByText(text).first().waitFor();
  const onDay = (page, text) => page.locator("[data-day-line]").filter({ hasText: `${text}.` }).waitFor();
  const heading = (page, name) => page.getByRole("heading", { name, level: 1 }).waitFor();
  const timer = (page) => page.locator("[data-timer]").first();
  const clockText = (page) => page.locator("[data-clock]").first().innerText();

  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  watch(page);
  await page.clock.install({ time: new Date(NOON_DAY_1) });
  await page.goto(`${base}/today`);
  await createPasscode(page);

  // =====================================================================
  // Meals: budget, a built week, swap, portion, groceries, cooking.
  // =====================================================================
  console.log("Meals: setting up and building a week");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Body" }).click();
  await heading(page, "Body");
  await page.getByRole("link", { name: "Meal plan" }).click();
  await heading(page, "Meals");
  await page.getByText(/No plan for the week of Oct 5/).waitFor();
  check("Meals opens from Body with a real empty state and the Body tab lit", (await page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]').innerText()) === "Body");
  check("the setup form takes its daily targets from the checklist", (await page.getByText("1,900 to 2,100 kcal, 180g protein or more").count()) >= 1);
  check("the pantry starts with the staples, in its own table", (await rows(page, "pantry_item")).length === 10 && (await rows(page, "meal_plan")).length === 0, JSON.stringify((await rows(page, "meal_plan")).map((p) => p.week_start)));
  await noOverflow(page, "Meals, empty");
  await shot(page, "f-meals-01-empty", true);

  await page.getByRole("textbox", { name: "Weekly food budget" }).fill("70");
  await page.getByRole("button", { name: "Build the week" }).click();
  await toastSays(page, "Week built");
  await page.locator("[data-plan-cost]").waitFor();
  const recipes = await rows(page, "recipe");
  const byId = new Map(recipes.map((r) => [r.id, r]));
  let plan = (await rows(page, "meal_plan"))[0];
  const dayOf = (p, date) => {
    const meals = p.meals.filter((m) => m.date === date);
    return {
      meals,
      calories: meals.reduce((n, m) => n + byId.get(m.recipe_id).calories * m.servings, 0),
      protein: meals.reduce((n, m) => n + byId.get(m.recipe_id).protein * m.servings, 0),
    };
  };
  const dates = [...new Set(plan.meals.map((m) => m.date))].sort();
  if (process.env.PLAN) {
    for (const d of dates) {
      const day = dayOf(plan, d);
      console.log(`    ${d}  ${Math.round(day.calories)} kcal, ${Math.round(day.protein)}g`);
      for (const m of day.meals) console.log(`      ${m.slot.padEnd(9)} ${String(m.servings).padEnd(5)} ${byId.get(m.recipe_id).name}`);
    }
    for (const g of await rows(page, "grocery_item")) console.log(`    buy ${String(g.quantity).padEnd(5)} ${String(g.unit).padEnd(16)} ${g.name.padEnd(22)} $${g.price}  ${JSON.stringify(g.prices)}`);
  }
  check("one plan row for the week, 7 days from today's Monday, three meals or more a day", (await rows(page, "meal_plan")).length === 1 && plan.week_start === "2026-10-05" && dates.length === 7 && dates.every((d) => dayOf(plan, d).meals.length >= 3), `${dates.length} days`);
  check(
    "every day lands on 1,900 to 2,100 kcal and 180g protein or more",
    dates.every((d) => {
      const day = dayOf(plan, d);
      return day.calories >= 1899.5 && day.calories <= 2100.5 && day.protein >= 179.5;
    }),
    dates.map((d) => `${Math.round(dayOf(plan, d).calories)}/${Math.round(dayOf(plan, d).protein)}`).join(" "),
  );
  check("portions are in quarters between a half and three servings", plan.meals.every((m) => m.servings >= 0.5 && m.servings <= 3 && Number.isInteger(m.servings * 4)), JSON.stringify([...new Set(plan.meals.map((m) => m.servings))]));
  const costCard = await page.locator("[data-plan-cost]").innerText();
  check("the week is under the $70 budget and the running total says so, as an estimate", plan.total_cost > 20 && plan.total_cost <= 70 && /under budget/.test(costCard) && /est\./i.test(costCard) && money(costCard) === plan.total_cost, `${plan.total_cost} ${costCard.slice(0, 80)}`);
  check("the plan says its prices are estimates for the store", /Estimated prices, not Aldi's shelf prices/.test(costCard));
  await noOverflow(page, "Meals, planned");
  await shot(page, "f-meals-02-week", true);
  {
    // The week at a glance: each day's calories and protein sit beside its meals.
    const shown = await page.locator("section[aria-label='The week'] li").evaluateAll((els) => els.map((li) => [li.querySelector("[data-day-kcal]")?.textContent.trim(), li.querySelector("[data-day-protein]")?.textContent.trim()]));
    const want = dates.map((d) => [Math.round(dayOf(plan, d).calories).toLocaleString("en-US"), `${Math.round(dayOf(plan, d).protein)}g`]);
    check("the week view shows each day's calories and protein total", JSON.stringify(shown) === JSON.stringify(want), JSON.stringify(shown));
    // A meal with one long word must not drop a letter onto a line of its own.
    const long = recipes.find((r) => r.name === "Chicken quesadillas");
    await page.evaluate(
      ([prefix, id]) => {
        const plans = JSON.parse(localStorage.getItem(prefix + "meal_plan"));
        window.__keptPlan = localStorage.getItem(prefix + "meal_plan");
        plans[0].meals[1].recipe_id = id;
        localStorage.setItem(prefix + "meal_plan", JSON.stringify(plans));
      },
      [PREFIX, long.id],
    );
    const kept = await page.evaluate(() => window.__keptPlan);
    await page.reload();
    await page.locator("[data-plan-cost]").waitFor();
    const cell = page.locator("[data-meal-cell]", { hasText: "Chicken quesadillas" }).first();
    await cell.waitFor();
    // Lines of the name as laid out: the text of each visual line.
    const lines = await cell.locator("span").first().evaluate((el) => {
      const node = el.firstChild;
      const out = [];
      let top = null;
      const range = document.createRange();
      for (let i = 0; i < node.length; i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getClientRects()[0];
        if (!r) continue;
        if (top === null || Math.abs(r.top - top) > 3) {
          out.push("");
          top = r.top;
        }
        out[out.length - 1] += node.data[i];
      }
      return out.map((l) => l.trim()).filter(Boolean);
    });
    check("a long word in the week grid is not broken one letter down", lines.every((l) => l.replace(/-$/, "").length >= 3) && lines.join("").replace(/-/g, "").includes("quesadillas"), JSON.stringify(lines));
    await shot(page, "f-meals-02b-long-word");
    await page.evaluate(([prefix, raw]) => localStorage.setItem(prefix + "meal_plan", raw), [PREFIX, kept]);
    await page.reload();
    await page.locator("[data-plan-cost]").waitFor();
  }

  // ---------- swap ----------
  console.log("Meals: swap, portion");
  const today = "2026-10-05";
  const before = dayOf(plan, today);
  const dinner = before.meals.find((m) => m.slot === "dinner");
  await page.getByRole("button", { name: new RegExp(byId.get(dinner.recipe_id).name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  await dialog(page).waitFor();
  await shot(page, "f-meals-03-meal-sheet");
  check("a planned meal opens with its recipe, ingredients and steps", (await dialog(page).getByRole("heading", { name: /^Ingredients/ }).count()) === 1 && (await dialog(page).getByRole("heading", { name: "Steps" }).count()) === 1 && (await dialog(page).getByRole("listitem").count()) >= 4);
  await dialog(page).getByRole("button", { name: "Swap" }).click();
  await dialog(page).getByRole("list", { name: "Alternatives" }).waitFor();
  const option = dialog(page).getByRole("list", { name: "Alternatives" }).getByRole("button").first();
  const optionName = (await option.locator("span span").first().innerText()).trim();
  await option.click();
  await dialog(page).locator("[data-swap-effect]").waitFor();
  check("picking an alternative shows what it does to the day and the week before it is confirmed", /Day:.*kcal.*protein/s.test(await dialog(page).locator("[data-swap-effect]").innerText()) && /Week:.*\$/s.test(await dialog(page).locator("[data-swap-effect]").innerText()));
  await shot(page, "f-meals-04-swap");
  await dialog(page).getByRole("button", { name: "Confirm swap" }).click();
  await toastSays(page, `Swapped to ${optionName}`);
  await dialog(page).waitFor({ state: "detached" });
  plan = (await rows(page, "meal_plan"))[0];
  const swapped = dayOf(plan, today);
  check("the swap replaces the meal and the day still hits its numbers", byId.get(swapped.meals.find((m) => m.slot === "dinner").recipe_id).name === optionName && swapped.calories >= 1899.5 && swapped.calories <= 2100.5 && swapped.protein >= 179.5, `${Math.round(swapped.calories)}/${Math.round(swapped.protein)}`);
  check("the week total and the grocery rows follow the swap", Math.abs(money(await page.locator("[data-plan-cost]").innerText()) - plan.total_cost) < 0.005 && (await rows(page, "grocery_item")).every((g) => g.plan_id === plan.id));

  // ---------- portion by hand ----------
  const lunch = swapped.meals.find((m) => m.slot === "lunch");
  const lunchRecipe = byId.get(lunch.recipe_id);
  await page.getByRole("button", { name: new RegExp(lunchRecipe.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  await dialog(page).locator("[data-portion]").waitFor();
  const dayBefore = await dialog(page).locator("[data-portion-day]").innerText();
  const weekBefore = money(await dialog(page).locator("[data-portion-week]").innerText());
  check("the sheet shows the planned portion with the day and week it belongs to", Math.abs(weekBefore - plan.total_cost) < 0.005 && dayBefore.includes(`${Math.round(swapped.calories).toLocaleString("en-US")} kcal`), `${dayBefore} ${weekBefore}`);
  await dialog(page).getByRole("button", { name: "Larger portion" }).click();
  await dialog(page).getByRole("button", { name: "Larger portion" }).click();
  await dialog(page).getByRole("button", { name: "Save portion" }).waitFor();
  const dayAfter = await dialog(page).locator("[data-portion-day]").innerText();
  const want = Math.round(swapped.calories + lunchRecipe.calories * 0.5);
  check("the day's macros follow each tap, before anything is saved", dayAfter !== dayBefore && dayAfter.includes(`${want.toLocaleString("en-US")} kcal`) && (await rows(page, "meal_plan"))[0].meals.find((m) => m.date === today && m.slot === "lunch").servings === lunch.servings, `${dayBefore} -> ${dayAfter}, want ${want}`);
  // Keep going until the week's packs change, so the cost is seen to move too.
  let weekNow = money(await dialog(page).locator("[data-portion-week]").innerText());
  for (let i = 0; i < 8 && Math.abs(weekNow - weekBefore) < 0.005; i += 1) {
    await dialog(page).getByRole("button", { name: "Larger portion" }).click();
    weekNow = money(await dialog(page).locator("[data-portion-week]").innerText());
  }
  check("the week's cost follows too, once the bigger portion needs another pack", weekNow > weekBefore, `${weekBefore} -> ${weekNow}`);
  await shot(page, "f-meals-05-portion");
  const portionText = await dialog(page).locator("[data-portion-value]").innerText();
  await dialog(page).getByRole("button", { name: "Save portion" }).click();
  await toastSays(page, /Portion set to/);
  plan = (await rows(page, "meal_plan"))[0];
  const newServings = plan.meals.find((m) => m.date === today && m.slot === "lunch").servings;
  check("saving writes the portion, the week total and the grocery list", newServings > lunch.servings && Math.abs(plan.total_cost - weekNow) < 0.005 && portionText.includes(String(Math.floor(newServings))), `${lunch.servings} -> ${newServings}, ${plan.total_cost}`);
  // Put it back to what the planner chose, the same way.
  for (let s = newServings; s > lunch.servings + 0.001; s -= 0.25) await dialog(page).getByRole("button", { name: "Smaller portion" }).click();
  await dialog(page).getByRole("button", { name: "Save portion" }).click();
  await toastSays(page, /Portion set to/);
  await closeSheet(page);
  plan = (await rows(page, "meal_plan"))[0];
  check("a portion can be put back", plan.meals.find((m) => m.date === today && m.slot === "lunch").servings === lunch.servings);

  // ---------- grocery list ----------
  console.log("Meals: grocery list, stores, the shop");
  await page.getByRole("link", { name: /Grocery list/ }).click();
  await heading(page, "Grocery list");
  await page.locator("[data-store-compare]").waitFor();
  const grocery = await rows(page, "grocery_item");
  const pantry = new Set((await rows(page, "pantry_item")).map((p) => p.name));
  const toBuy = grocery.filter((g) => !pantry.has(g.name));
  const sum = (store) => Math.round(toBuy.reduce((n, g) => n + (g.prices?.[store] ?? 0), 0) * 100) / 100;
  const compare = await page.locator("[data-store-compare]").innerText();
  const stores = ["Aldi", "Walmart", "Food Lion", "Harris Teeter", "Publix"];
  check("the same list is priced at five stores", stores.every((s) => compare.includes(s)));
  const shown = Object.fromEntries(await Promise.all(stores.map(async (s) => [s, money(await page.locator("[data-store-compare] li", { hasText: s }).innerText())])));
  check("each store's total is the sum of its rows", stores.every((s) => Math.abs(shown[s] - sum(s)) < 0.011), JSON.stringify(shown) + " vs " + JSON.stringify(Object.fromEntries(stores.map((s) => [s, sum(s)]))));
  check("the store total is the plan's total, and the cheapest store is named", Math.abs(shown.Aldi - plan.total_cost) < 0.011 && /Cheapest: Aldi/.test(compare), `${shown.Aldi} vs ${plan.total_cost}`);
  check("every total is marked as an estimate, with a note saying so", (await page.locator("[data-store-compare] li", { hasText: "est." }).count()) === 5 && /Estimated prices, not any store's shelf prices/.test(compare));
  check("quantities are combined: one row per food", new Set(grocery.map((g) => g.name)).size === grocery.length && (await page.getByText(`0 of ${toBuy.length}`).count()) === 1, `${grocery.length} rows, ${toBuy.length} to buy`);
  check("with no Instacart key the list can be copied, and the screen says what to set", (await page.locator("[data-instacart-off]").count()) === 1 && (await page.getByRole("button", { name: "Copy list" }).count()) === 1);
  await noOverflow(page, "Grocery list");
  await shot(page, "f-meals-06-grocery", true);

  const first = toBuy[0];
  await page.getByRole("checkbox", { name: new RegExp(`^${first.name}$`, "i") }).click();
  await page.getByText(`1 of ${toBuy.length}`).waitFor();
  check("ticking an item counts it in the cart", (await rows(page, "grocery_item")).find((g) => g.id === first.id).bought === true);

  await page.getByRole("button", { name: "Done shopping, record it" }).click();
  await dialog(page).waitFor();
  await dialog(page).getByRole("textbox", { name: "Receipt total" }).fill("58.40");
  await shot(page, "f-meals-07-shop-sheet");
  await dialog(page).getByRole("button", { name: "Record spend" }).click();
  await toastSays(page, "$58.40 recorded. It shows on Money as groceries.");
  await dialog(page).waitFor({ state: "detached" });
  const expense = (await rows(page, "expense"))[0];
  check("the shop is one expense row linked to the plan", (await rows(page, "expense")).length === 1 && expense.amount === 58.4 && expense.category === "groceries" && expense.plan_id === plan.id && expense.date === today, JSON.stringify(expense));
  check("the list shows budget, estimate and spent, and what is left", /\$70\.00/.test(await page.locator("[data-budget-actual]").innerText()) && /\$58\.40/.test(await page.locator("[data-budget-actual]").innerText()) && /\$11\.60 of the budget left/.test(await page.locator("[data-budget-actual]").innerText()), await page.locator("[data-budget-actual]").innerText());
  await page.goto(`${base}/money`);
  await heading(page, "Money");
  await page.getByText("Groceries this week").waitFor();
  check("Money shows the groceries spend for the week", /\$58\.40/.test(await page.getByRole("link", { name: /Groceries this week/ }).innerText()));
  await shot(page, "f-meals-08-money-groceries", true);

  // ---------- cook and log ----------
  console.log("Meals: cook and log, Today");
  await page.goto(`${base}/meals`);
  await page.locator("[data-plan-cost]").waitFor();
  check("the plan card shows what was spent against the budget", /Spent so far: \$58\.40/.test(await page.locator("[data-plan-cost]").innerText()));
  const breakfast = dayOf(plan, today).meals.find((m) => m.slot === "breakfast");
  const bRecipe = byId.get(breakfast.recipe_id);
  await page.getByRole("button", { name: new RegExp(bRecipe.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  await dialog(page).getByRole("button", { name: "Cooked, log it" }).click();
  const kcal = Math.round(bRecipe.calories * breakfast.servings);
  const protein = Math.round(bRecipe.protein * breakfast.servings * 10) / 10;
  await toastSays(page, new RegExp(`Logged ${kcal.toLocaleString("en-US")} kcal and ${Math.round(protein)}g protein`));
  await dialog(page).waitFor({ state: "detached" });
  const meal = (await rows(page, "meal"))[0];
  plan = (await rows(page, "meal_plan"))[0];
  check("cooking writes one meal row with the portion's numbers, and the plan remembers it", (await rows(page, "meal")).length === 1 && meal.calories === kcal && meal.name === bRecipe.name && plan.meals.find((m) => m.date === today && m.slot === "breakfast").logged === meal.id, JSON.stringify(meal));
  await page.getByText(", logged").first().waitFor();
  await shot(page, "f-meals-09-logged", false);
  await page.goto(`${base}/today`);
  await onDay(page, "Day 1 of 30");
  await page.getByRole("link", { name: new RegExp(`Calories: ${kcal.toLocaleString("en-US")}`) }).waitFor();
  check("Today shows the cooked meal's calories and protein on their rows", (await page.getByRole("link", { name: new RegExp(`Protein: (${String(protein).replace(".", "\\.")}|${Math.round(protein)})g from meals`) }).count()) === 1, String(protein));
  await shot(page, "f-meals-10-today", true);

  // ---------- recipes ----------
  await page.goto(`${base}/meals/recipes`);
  await heading(page, "Recipes");
  await page.getByText(/\d+ recipes\. Numbers are per serving\./).waitFor();
  await noOverflow(page, "Recipes");
  await shot(page, "f-meals-11-recipes", true);

  // ---------- a budget that cannot work ----------
  console.log("Meals: a budget that cannot work");
  await page.goto(`${base}/meals`);
  await page.locator("[data-plan-cost]").waitFor();
  await page.getByRole("radio", { name: "Next week" }).click();
  await page.getByText(/No plan for the week of Oct 12/).waitFor();
  await page.getByRole("textbox", { name: "Weekly food budget" }).fill("15");
  await page.getByRole("button", { name: "Build the week" }).click();
  await page.locator("[data-plan-notice]").waitFor();
  const notice = await page.locator("[data-plan-notice]").innerText();
  check("$15 a week gets a plain message: not enough, the cheapest week and what to raise it to", /\$15 a week is not enough to reach 180g protein/.test(notice) && /The cheapest week found costs about \$\d+\.\d\d, which is \$\d+\.\d\d over/.test(notice) && /Raise the budget to about \$\d+,/.test(notice), notice);
  check("the nearest week is still shown, marked over budget", /over budget/.test(await page.locator("[data-plan-cost]").innerText()));
  await shot(page, "f-meals-12-infeasible", false);
  await page.getByRole("radio", { name: "This week" }).click();
  await page.getByText("Spent so far").waitFor();
  check("this week's plan is untouched by next week's", (await rows(page, "meal_plan")).find((p) => p.week_start === "2026-10-05").budget === 70);

  // =====================================================================
  // Focus: start, pause, reload, finish, the goal, by hand, leaving.
  // =====================================================================
  console.log("Focus: the timer");
  await page.goto(`${base}/today`);
  await onDay(page, "Day 1 of 30");
  const study = row(page, "Study or homework block");
  const studyId = (await rows(page, "checklist_item")).find((i) => i.key === "study").id;
  check("the Study tile on Today carries a Focus button and is not ticked", (await study.getAttribute("aria-checked")) === "false" && (await page.getByRole("link", { name: "Open the focus timer" }).count()) === 1);
  {
    const a = await study.boundingBox();
    const b = await page.getByRole("link", { name: "Open the focus timer" }).boundingBox();
    check("the button sits in the tile's top right corner, inside it, with a 44px tap target", b.height >= 44 && b.width >= 44 && b.y >= a.y - 1 && b.y + b.height <= a.y + a.height + 1 && b.x >= a.x && Math.abs(b.x + b.width - (a.x + a.width)) <= 1, JSON.stringify([a, b]));
  }
  await page.getByRole("link", { name: "Open the focus timer" }).click();
  await heading(page, "Focus");
  await timer(page).waitFor();
  check("Focus opens idle with the Plan tab lit", (await timer(page).getAttribute("data-timer")) === "idle" && (await page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]').innerText()) === "Plan");
  await noOverflow(page, "Focus");
  await shot(page, "f-focus-01-idle", true);

  await page.getByRole("radio", { name: "25", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator('[data-timer="live"]').waitFor();
  let session = (await rows(page, "focus_session"))[0];
  check("starting writes a running row that carries its own state", session.end === null && session.live && session.live.planned_seconds === 1500 && session.planned_minutes === 25 && session.date === today, JSON.stringify(session));
  await page.clock.fastForward("05:00");
  await page.waitForFunction(() => /^(19:5\d|20:00)$/.test(document.querySelector("[data-clock]")?.textContent ?? ""));
  check("five minutes in, the countdown reads about 20:00", true);
  await shot(page, "f-focus-02-running");
  // Focus mode: the timer alone on a full screen layer that keeps the page lights.
  await page.getByRole("button", { name: "Open focus mode" }).click();
  await page.getByRole("dialog", { name: "Focus mode" }).waitFor();
  await page.waitForTimeout(400);
  check("focus mode covers the screen and keeps the lights, not a flat panel", await page.locator("[data-focus-view]").evaluate((el) => getComputedStyle(el).backgroundImage.includes("radial-gradient") && el.getBoundingClientRect().height >= window.innerHeight));
  await checkContrast(page, "Focus mode, Aubergine", 4.5);
  await shot(page, "f-focus-02b-focus-mode");
  await page.getByRole("button", { name: "Exit" }).click();
  await page.getByRole("dialog", { name: "Focus mode" }).waitFor({ state: "detached" });

  // Pause: the number on screen at the tap is the number that stays.
  await page.waitForTimeout(700);
  const atTap = await clockText(page);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.locator('[data-timer="paused"]').waitFor();
  const seen = new Set([await clockText(page)]);
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(400);
    seen.add(await clockText(page));
  }
  check("the clock does not move after pause, not even one second", seen.size === 1 && seen.has(atTap), `${atTap} then ${[...seen].join(", ")}`);
  await page.clock.fastForward("02:00");
  check("two minutes paused changes nothing on the clock", (await clockText(page)) === atTap);
  session = (await rows(page, "focus_session"))[0];
  check("the pause is on the row, not only on this device", session.live.pauses.length === 1 && session.live.pauses[0].to === null, JSON.stringify(session.live));
  await shot(page, "f-focus-03-paused");
  await page.getByRole("button", { name: "Resume" }).click();
  await page.locator('[data-timer="live"]').waitFor();

  // Reload mid session.
  const beforeReload = clockSeconds(await clockText(page));
  await page.reload();
  await page.locator('[data-timer="live"]').waitFor();
  const afterReload = clockSeconds(await clockText(page));
  check("a reload mid session keeps the clock, pause taken out", beforeReload - afterReload >= 0 && beforeReload - afterReload <= 4, `${beforeReload} -> ${afterReload}`);
  // Another device: nothing saved on it, only the row.
  await page.evaluate(() => localStorage.removeItem("lockin:pref:focus:live"));
  await page.reload();
  await page.locator('[data-timer="live"]').waitFor();
  const elsewhere = clockSeconds(await clockText(page));
  check("with this device's copy gone the row alone gives the same clock, as another device would see it", afterReload - elsewhere >= 0 && afterReload - elsewhere <= 4 && /paused/.test(await timer(page).innerText()), `${afterReload} -> ${elsewhere}: ${await timer(page).innerText()}`);

  // The running clock on Today.
  await page.goto(`${base}/today`);
  await page.locator("[data-focus-running]").waitFor();
  check("while it runs, the Study row shows the clock", /^\d+:\d\d$/.test((await page.locator("[data-focus-running]").innerText()).trim()));
  await shot(page, "f-focus-04-today-running");
  await page.locator("[data-focus-running]").click();
  await page.locator('[data-timer="live"]').waitFor();

  await page.clock.fastForward("20:10");
  await page.locator('[data-timer="over"]').waitFor();
  check("the countdown ends on Time is up and offers to keep going", (await page.getByRole("button", { name: "Keep going" }).count()) === 1);
  await page.getByRole("button", { name: "Finish" }).click();
  await toastSays(page, /25m of focus logged/);
  session = (await rows(page, "focus_session"))[0];
  check("finishing logs 25 focused minutes with the clock time, the countdown and no leftover state", session.minutes === 25 && session.end !== null && session.live === null && session.completed === true && session.planned_minutes === 25 && session.clock_minutes === 27 && session.away_count === 0, JSON.stringify(session));
  check("nothing about the session is left in device prefs but the settings", await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("lockin:pref:focus:")).every((k) => !/meta|business_goal/.test(k) && (k !== "lockin:pref:focus:live" || localStorage.getItem(k) === null))));
  check("25 of 60 minutes: the goal is not reached and Study is not ticked", /35m to go/.test(await page.locator("[data-today-total]").innerText()) && !(await rows(page, "day_log")).some((l) => l.checked && l.date === today && l.item_id === studyId));

  // ---------- by hand, and the goal ----------
  console.log("Focus: by hand, the goal, Today");
  await page.getByRole("button", { name: "Log focus time by hand" }).click();
  await dialog(page).waitFor();
  await dialog(page).getByRole("textbox", { name: "Minutes" }).fill("35");
  await shot(page, "f-focus-05-manual-sheet");
  await dialog(page).getByRole("button", { name: "Log it" }).click();
  await toastSays(page, "Focus time logged");
  await dialog(page).waitFor({ state: "detached" });
  await page.getByText("Goal reached. Study is ticked on today's checklist.").waitFor();
  const manual = (await rows(page, "focus_session")).find((r) => r.source === "manual");
  check("time logged by hand is its own row, with no clock numbers", manual.minutes === 35 && manual.clock_minutes === null && manual.completed === false && manual.live === null, JSON.stringify(manual));
  await shot(page, "f-focus-06-goal-reached", true);
  await page.goto(`${base}/today`);
  await onDay(page, "Day 1 of 30");
  await page.waitForFunction(() => document.querySelector('[role="checkbox"][aria-checked="true"]') !== null);
  check("reaching the goal ticks Study on Today", (await row(page, "Study or homework block").getAttribute("aria-checked")) === "true");
  await shot(page, "f-focus-07-today-ticked", true);

  // ---------- leaving and coming back ----------
  console.log("Focus: leaving the app");
  await page.goto(`${base}/focus`);
  await timer(page).waitFor();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator('[data-timer="live"]').waitFor();
  await page.clock.fastForward("06:00");
  // Leave from another screen: the watcher is mounted for the whole app.
  await page.goto(`${base}/money`);
  await heading(page, "Money");
  await setHidden(page, true);
  await page.clock.fastForward("04:00");
  await setHidden(page, false);
  await page.goto(`${base}/focus`);
  await page.locator("[data-away]").waitFor();
  check("leaving the app from any screen is noticed, and the time away is put to the user", /Gone for 4m/.test(await page.locator("[data-away]").innerText()), await page.locator("[data-away]").innerText());
  check("the time away is off the clock", Math.abs(clockSeconds(await clockText(page)) - 360) <= 6, await clockText(page));
  await shot(page, "f-focus-08-away");
  await page.getByRole("button", { name: "Leave it off" }).click();
  await page.locator("[data-away]").waitFor({ state: "detached" });
  await page.clock.fastForward("02:00");
  await page.getByRole("button", { name: "Finish" }).click();
  await toastSays(page, /8m of focus logged, away 1 time/);
  const left = (await rows(page, "focus_session")).find((r) => r.away_count > 0);
  check("the record is on the session: left once, 4 minutes away, 12 on the wall clock, 8 logged", !!left && left.away_count === 1 && left.away_minutes === 4 && left.clock_minutes === 12 && left.minutes === 8, JSON.stringify(left));
  await page.getByText("left the app 1 time, 4m away").waitFor();
  check("the session list says so", true);
  await shot(page, "f-focus-09-sessions", true);

  // ---------- business log ----------
  await page.getByRole("link", { name: /Business log/ }).click();
  await heading(page, "Business log");
  await page.getByRole("button", { name: "Set a goal" }).click();
  await page.getByRole("textbox").first().fill("Sign three paying clients by December");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Change" }).waitFor();
  check("the business goal is saved in settings, not on the device", (await rows(page, "app_settings"))[0].business_goal === "Sign three paying clients by December" && (await page.evaluate(() => localStorage.getItem("lockin:pref:focus:business_goal"))) === null);
  await noOverflow(page, "Business log");
  await shot(page, "f-focus-10-business", true);

  // =====================================================================
  // Boards: a board, an image, a color, its palette as the app's look.
  // =====================================================================
  console.log("Boards");
  await page.goto(`${base}/today`);
  await onDay(page, "Day 1 of 30");
  check("with no board, Today has no board row", (await page.getByText("What this is for").count()) === 0);
  await openMore(page, "Boards");
  await heading(page, "Boards");
  await page.getByText("No boards yet").waitFor();
  await shot(page, "f-boards-01-empty");
  await page.getByRole("button", { name: "Start a board" }).click();
  await dialog(page).getByRole("textbox", { name: "Name" }).fill("The body");
  await shot(page, "f-boards-02-new-sheet");
  await dialog(page).getByRole("button", { name: "Create board" }).click();
  await toastSays(page, "Board created");
  await page.getByRole("link", { name: "The body, 0 pieces" }).click();
  await heading(page, "The body");
  await page.getByText("Nothing here yet").waitFor();
  await shot(page, "f-boards-03-empty-board");

  const png = await pastelImage(page);
  await page.getByRole("button", { name: "Add the first piece" }).click();
  await dialog(page).waitFor();
  await shot(page, "f-boards-04-add-sheet");
  await dialog(page).locator('input[aria-label="Choose photos"]').setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: png });
  await toastSays(page, "Added to the board");
  let pieces = await rows(page, "board_item");
  check("an image lands on the board with its shape and its palette on the row", pieces.length === 1 && pieces[0].kind === "image" && Math.abs(pieces[0].aspect - 0.75) < 0.01 && pieces[0].palette.length >= 3 && String(pieces[0].image_url).startsWith("idb:"), JSON.stringify(pieces[0]));
  check("the shape is not kept in device prefs", (await page.evaluate(() => localStorage.getItem("lockin:pref:board-aspects"))) === null);

  await page.getByRole("button", { name: "Add to board" }).click();
  await dialog(page).getByRole("button", { name: /Color/ }).click();
  await dialog(page).getByRole("textbox", { name: "Hex code" }).fill("5d5470");
  await dialog(page).getByRole("textbox", { name: "Name" }).fill("Ink");
  await shot(page, "f-boards-05-color-sheet");
  await dialog(page).getByRole("button", { name: "Keep color" }).click();
  await toastSays(page, "Color kept");
  await dialog(page).waitFor({ state: "detached" });
  pieces = await rows(page, "board_item");
  check("a color is kept as a swatch", pieces.length === 2 && pieces[1].kind === "color" && pieces[1].color === "#5d5470" && pieces[1].note === "Ink");
  await page.getByText("2 pieces").first().waitFor();
  await noOverflow(page, "Board");
  await shot(page, "f-boards-06-board", true);
  // One piece, full screen.
  await page.getByRole("list", { name: "Pieces on this board" }).or(page.locator('[aria-label="Pieces on this board"]')).first().getByRole("button").first().click();
  await page.locator("[data-layer]").waitFor();
  await page.waitForTimeout(400);
  check("a piece opens on a full screen layer that keeps the lights", await page.locator("[data-layer]").evaluate((el) => getComputedStyle(el).backgroundImage.includes("radial-gradient")));
  await checkContrast(page, "Board piece, Aubergine", 4.5);
  await shot(page, "f-boards-06b-piece");
  await page.keyboard.press("Escape");
  await page.locator("[data-layer]").waitFor({ state: "detached" });

  // Pull the palette: the board's colors, sorted, become choices for the look.
  await page.getByRole("button", { name: "Set the app's look from this board" }).click();
  const studio = page.getByRole("dialog", { name: "Set the app's look" });
  await studio.waitFor();
  const swatches = await studio.getByRole("radiogroup", { name: "Background" }).getByRole("radio").count();
  check("the palette pulled from the board is offered for each role", swatches >= 4 && (await studio.getByRole("radiogroup", { name: "Accent" }).getByRole("radio").count()) === swatches, `${swatches} choices`);
  check("the studio says every pair of text passes before it is applied", /Every piece of text passes the contrast standard/.test(await studio.innerText()));
  await checkContrast(page, "Look studio, Aubergine", 4.5);
  await shot(page, "f-boards-07-look-studio");
  await studio.getByRole("button", { name: "Apply to the app" }).click();
  await toastSays(page, "The app now wears The body");
  const theme = (await rows(page, "theme")).find((t) => t.active);
  const board = (await rows(page, "board"))[0];
  const worn = await rootVar(page, "--bg");
  check("applying saves the theme against the board and repaints the app", theme.board_id === board.id && theme.palette && worn !== "#0d0b10" && worn === (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())), JSON.stringify(theme));
  await page.getByText("The app is wearing this board").waitFor();
  await shot(page, "f-boards-08-board-worn", true);

  // Today under the board's look.
  await page.goto(`${base}/today`);
  await onDay(page, "Day 1 of 30");
  await page.getByText("What this is for").waitFor();
  await page.waitForTimeout(400);
  await checkContrast(page, "Today under the board's palette", 4.5);
  {
    const entry = await page.getByRole("button", { name: "Open The body full screen" }).boundingBox();
    const list = await row(page, "In bed on time").boundingBox();
    const workout = await page.getByText("Today's workout").boundingBox();
    check("the board row sits under the checklist and the workout, out of the way of the check-off", entry.y > list.y && entry.y > workout.y, `${entry.y} ${list.y} ${workout.y}`);
  }
  await noOverflow(page, "Today under the board's palette");
  await shot(page, "f-boards-09-today-worn", true);
  await shot(page, "f-boards-09b-today-worn-fold");
  await page.getByRole("button", { name: "Open The body full screen" }).click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "f-boards-10-full-screen");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // ---------- every screen, in every look ----------
  // A day with something on every screen: half the checklist, earnings over
  // three days, a weigh-in, a logged set and one slip, on top of the meal
  // plan, the focus sessions and the board made above.
  await page.evaluate(
    ([prefix, day]) => {
      const read = (t) => JSON.parse(localStorage.getItem(prefix + t) ?? "[]");
      const write = (t, list) => localStorage.setItem(prefix + t, JSON.stringify(list));
      const at = `${day}T15:41:00.000Z`;
      const items = read("checklist_item").filter((i) => i.active && !i.archived);
      const logs = read("day_log");
      const ticked = new Set(["wake", "workout", "core", "vice_drinking", "vice_masturbation"]);
      for (const i of items) {
        if (i.cadence !== "daily" || !ticked.has(i.key) || logs.some((l) => l.date === day && l.item_id === i.id)) continue;
        logs.push({ id: `tour-${i.id}`, created_at: at, date: day, item_id: i.id, value: null, checked: true, text: null, completed_at: `${day}T09:41:00.000Z`, slips: 0 });
      }
      const earned = items.find((i) => i.key === "earned");
      logs.push({ id: "tour-earned", created_at: at, date: day, item_id: earned.id, value: 40, checked: true, text: null, completed_at: at, slips: 0 });
      const smoke = items.find((i) => i.key === "vice_smoking");
      logs.push({ id: "tour-smoke", created_at: at, date: day, item_id: smoke.id, value: null, checked: false, text: null, completed_at: null, slips: 1 });
      write("day_log", logs);
      write("vice_slip", [...read("vice_slip"), { id: "tour-slip", created_at: at, item_id: smoke.id, date: day, time: "10:20", trigger: "stressed", amount: null }]);
      write("earning", [...read("earning"), { id: "tour-e1", created_at: at, date: day, amount: 40, app: "DoorDash", hours: 2, screenshot_url: null }]);
      write("body_log", [...read("body_log"), { id: "tour-w1", created_at: at, date: day, weight: 182.4, photo_url: null }]);
    },
    [PREFIX, today],
  );
  const viceId = (await rows(page, "checklist_item")).find((i) => i.key === "vice_smoking").id;
  const boardId = (await rows(page, "board"))[0].id;
  // [path, text to wait for, name, on the contact sheet as]
  const SCREENS = [
    ["/today", "Today's workout", "today", "Today"],
    ["/schedule", "9:00 clock-in errand", "plan", "Plan"],
    ["/money", "Groceries this week", "money", "Money"],
    ["/body", "Meals", "body", "Body"],
    ["/body", "Weigh-ins", "body-weight", null, () => page.getByRole("radio", { name: "Weight" }).click()],
    ["/body/workout", "Bench press", "workout-log", null],
    ["/progress", "Streaks", "record", "Record"],
    ["/progress/card", "Save image", "share-card", null],
    ["/coach", "voice", "coach", "Coach"],
    ["/coach/notes", "Flags", "coach-notes", null],
    ["/vices", "Library", "vices", "Vices"],
    [`/vices/${viceId}`, "Pattern", "vice-detail", null],
    ["/meals", "Spent so far", "meals", "Meals"],
    ["/meals/grocery", "Same list, five stores", "grocery", null],
    ["/meals/recipes", "Numbers are per serving", "recipes", null],
    ["/focus", "Sessions", "focus", "Focus"],
    ["/focus/business", "The goal", "business", null],
    ["/boards", "The body", "boards", "Boards"],
    [`/boards/${boardId}`, "2 pieces", "board", null],
    ["/reminders", "Still to come today", "reminders", null],
    ["/settings", "Your days", "settings", "Settings"],
    ["/settings/checklist", "Items", "settings-checklist", null],
    ["/settings/schedule", "What each weekday starts from", "settings-weekly-plan", null],
    ["/settings/workouts", "Kind of day", "settings-workouts", null],
    ["/settings/challenge", "Past challenges", "settings-challenge", null],
    ["/settings/challenge/new", "New challenge", "settings-new-challenge", null],
    ["/settings/reminders", "Quiet hours", "settings-reminders", null],
    ["/settings/coach", "Check-ins", "settings-coach", null],
  ];
  /** Put a theme row in force, as the boards screen and the theme picker do, and load it. */
  const wear = async (theme) => {
    await page.evaluate(
      ([prefix, t]) => {
        const list = JSON.parse(localStorage.getItem(prefix + "theme") ?? "[]").map((r) => ({ ...r, active: false }));
        if (t) list.push({ id: `tour-${Date.now()}`, created_at: new Date().toJSON(), name: null, base: t.base, palette: t.palette ?? null, accent: t.palette?.accent ?? null, board_id: null, active: true });
        localStorage.setItem(prefix + "theme", JSON.stringify(list));
        localStorage.removeItem("lockin:pref:theme");
      },
      [PREFIX, theme],
    );
  };
  const tour = async (label, min, { main = false } = {}) => {
    const slug = label.replace(/\s+/g, "-");
    for (const [path, wait, name, title, then] of SCREENS) {
      await page.goto(`${base}${path}`);
      await page.locator("main").first().waitFor();
      if (then) await then();
      await page.getByText(wait).first().waitFor();
      await page.waitForTimeout(300);
      await checkContrast(page, `${name}, ${label}`, min);
      await noOverflow(page, `${name}, ${label}`);
      // Real blur is for the tab bar alone. A card or a row that blurs costs a phone a frame on every scroll.
      const blurred = await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => (getComputedStyle(el).backdropFilter ?? "none") !== "none" && !el.closest("nav[aria-label=Main]")).map((el) => el.className.toString().slice(0, 40)));
      if (blurred.length > 0 || main) check(`${name}: no backdrop blur outside the tab bar`, blurred.length === 0, blurred.join(" | "));
      if (main) {
        // The default look is the one the owner reviews: the first screen at phone size, and the whole page.
        await page.evaluate(() => window.scrollTo(0, 0));
        if (title) await shot(page, `main-${name}`);
        await shot(page, `screen-${name}`, true);
      } else if (title) await shot(page, `f-look-${slug}-${name}`, true);
    }
    // The lock screen, in the same look.
    await page.goto(`${base}/settings`);
    await page.getByRole("button", { name: /Lock now/ }).click();
    await page.getByText("Enter passcode").waitFor();
    await page.waitForTimeout(300);
    await checkContrast(page, `lock, ${label}`, min);
    await shot(page, main ? "main-lock" : `f-look-${slug}-lock`);
    for (const d of "1379") await page.getByRole("button", { name: d, exact: true }).click();
    await heading(page, "Settings");
  };
  console.log("Every screen under the board's look");
  await tour("board palette", 4.5);

  // Back to the base, from Boards.
  await page.goto(`${base}/boards`);
  await page.getByText("The look of the app").waitFor();
  await page.getByRole("button", { name: "Back to base" }).click();
  await toastSays(page, "Back to Aubergine");
  check("Back to base drops the palette everywhere", (await rootVar(page, "--bg")) === "#0d0b10" && (await rows(page, "theme")).filter((t) => t.active && t.palette).length === 0);
  console.log("Every screen in Aubergine, the default look");
  await tour("Aubergine", 4.5, { main: true });

  // The major sheets in the default look, measured the same way.
  console.log("Sheets in the default look");
  {
    const sheet = async (name, open) => {
      await open();
      await dialog(page).waitFor();
      await page.waitForTimeout(400);
      await checkContrast(page, `${name} sheet, Aubergine`, 4.5);
      await shot(page, `sheet-${name}`);
      await closeSheet(page);
    };
    await page.goto(`${base}/today`);
    await onDay(page, "Day 1 of 30");
    await sheet("more", () => page.getByRole("button", { name: "More", exact: true }).click());
    await sheet("slip", () => page.getByRole("button", { name: "Log a slip" }).click());
    await page.goto(`${base}/money`);
    await heading(page, "Money");
    await sheet("add-earnings", () => page.getByRole("button", { name: "Add earnings" }).last().click());
    await page.goto(`${base}/body`);
    await heading(page, "Body");
    await sheet("meal", () => page.getByRole("button", { name: "Add by hand" }).click());
    await page.goto(`${base}/schedule`);
    await heading(page, "Plan");
    await sheet("block", () => page.getByRole("button", { name: /Lift \+ core/ }).first().click());
    await sheet("add-block", () => page.getByRole("button", { name: "Add a block" }).click());
    await page.goto(`${base}/progress`);
    await page.getByText("Streaks").first().waitFor();
    await sheet("day", () => page.getByRole("button", { name: /^Day 1\b/ }).first().click());
    await page.goto(`${base}/meals`);
    await page.locator("[data-plan-cost]").waitFor();
    await sheet("planned-meal", () => page.locator("[data-meal-cell]").first().click());
    await page.goto(`${base}/focus`);
    await timer(page).waitFor();
    await sheet("focus-by-hand", () => page.getByRole("button", { name: "Log focus time by hand" }).click());
  }

  await page.goto(`${base}/settings`);
  await heading(page, "Settings");
  await page.getByRole("radio", { name: "High contrast" }).click();
  await page.getByText("High contrast is on").waitFor();
  console.log("Every screen in high contrast");
  await tour("high contrast", 7);
  await page.goto(`${base}/today`);
  await onDay(page, "Day 1 of 30");
  await page.waitForTimeout(300);
  await checkContrast(page, "Today with everything on it, high contrast", 7);
  await shot(page, "f-look-high-contrast-today", true);

  // Two palettes a board could set, on the Aubergine base: one light, one dark.
  for (const [label, palette] of [
    ["light palette", { background: "#f3ead8", text: "#3b3226", accent: "#b4532a" }],
    ["dark palette", { background: "#0b1410", accent: "#7ad6a8" }],
  ]) {
    console.log(`Every screen under a ${label}`);
    await wear({ base: "dark", palette });
    await tour(label, 4.5);
  }
  await wear(null);
  await ctx.close();

  // =====================================================================
  // A timer left running overnight.
  // =====================================================================
  console.log("Focus: left running overnight");
  {
    const c = await browser.newContext(device);
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date("2026-10-06T02:00:00Z") }); // Monday Oct 5, 10:00 PM
    await p.goto(`${base}/today`);
    await createPasscode(p, "2468");
    await p.goto(`${base}/focus`);
    await p.locator("[data-timer]").first().waitFor();
    await p.getByRole("button", { name: "Start", exact: true }).click();
    await p.locator('[data-timer="live"]').waitFor();
    await p.clock.fastForward("20:00");
    await setHidden(p, true);
    await p.clock.fastForward("08:30:00");
    await setHidden(p, false);
    await p.reload();
    await p.locator("[data-stale]").waitFor();
    const stale = await p.locator("[data-stale]").innerText();
    check("eight and a half hours later the timer is not believed: it asks what really happened", /Timer left running/i.test(stale) && /on the clock for 8h 50m/.test(stale) && /You left the app after 20m/.test(stale), stale);
    check("it offers the 20 minutes before the phone was put down, not the night", (await p.getByRole("button", { name: "Log 20m" }).count()) === 1 && (await p.locator('[data-timer="live"]').count()) === 0);
    await shot(p, "f-focus-11-overnight");
    await p.getByRole("button", { name: "Log 20m" }).click();
    await p.getByText("20m of focus logged").first().waitFor();
    const night = (await rows(p, "focus_session"))[0];
    check("the session counts toward the evening it began, 20 minutes, and is not marked completed", night.date === "2026-10-05" && night.minutes === 20 && night.live === null && night.completed === false && night.end !== null, JSON.stringify(night));
    check("the next morning's total starts at zero", /^0m/.test((await p.locator("[data-today-total]").innerText()).trim()), await p.locator("[data-today-total]").innerText());
    await shot(p, "f-focus-12-morning-after", true);
    await c.close();
  }

  // =====================================================================
  // The floor a challenge sets, and a brief that follows the challenge.
  // =====================================================================
  console.log("Challenge floor and the morning brief");
  {
    const c = await browser.newContext(device);
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date(NOON_DAY_1) });
    await p.goto(`${base}/today`);
    await createPasscode(p, "2468");
    const brief = p.getByRole("button", { name: /^Morning brief/ });
    await brief.waitFor();
    // Today shows the brief's first sentence, and its first paragraph once opened. The money line is in the note itself and on the coach screen.
    await p.waitForFunction(([prefix]) => JSON.parse(localStorage.getItem(prefix + "coach_note") ?? "[]").some((n) => n.kind === "morning" && /\$0 of \$1,000/.test(n.body)), [PREFIX]);
    check("Today shows the brief as one line that says what today holds", (await brief.getAttribute("aria-expanded")) === "false" && /Upper A at 6:30 AM/.test(await p.locator("[data-brief-line]").innerText()), await p.locator("[data-brief-line]").innerText());
    await brief.click();
    check("opened, it shows the brief's opening paragraph and a way to the rest", (await p.locator("#coach-brief p").count()) === 1 && (await p.locator("#coach-brief").getByRole("link", { name: /Read the rest/ }).count()) === 1);
    await brief.click();
    const first = (await rows(p, "coach_note")).find((n) => n.kind === "morning");
    check("the morning brief quotes the challenge's money target and records what it was written from", /\$1,000/.test(first.body) && typeof first.basis === "string" && first.basis.includes("1000"), JSON.stringify(first));

    // The running challenge holds Earned today to $150.
    await p.evaluate(
      ([prefix]) => {
        const items = JSON.parse(localStorage.getItem(prefix + "checklist_item"));
        const earned = items.find((i) => i.key === "earned");
        const rows = JSON.parse(localStorage.getItem(prefix + "challenge")).map((r) => (r.status === "active" ? { ...r, rules: [...items.filter((i) => i.active && i.cadence === "daily" && i.key !== "earned").map((i) => ({ item_id: i.id, target: null })), { item_id: earned.id, target: { kind: "min", min: 150 } }] } : r));
        localStorage.setItem(prefix + "challenge", JSON.stringify(rows));
      },
      [PREFIX],
    );
    await p.goto(`${base}/money`);
    await p.getByRole("heading", { name: "Money", level: 1 }).waitFor();
    await p.getByText("of $150").first().waitFor();
    check("a challenge target on Earned today is the floor Money shows while it runs", (await p.getByText("of $150").count()) >= 1 && (await rows(p, "app_settings"))[0].daily_floor === 100);
    await shot(p, "f-core-01-money-challenge-floor", true);
    await p.goto(`${base}/reminders`);
    await p.getByText(/Only if still under \$150/).waitFor();
    check("the earnings nudge uses the same floor", true);
    await p.goto(`${base}/today`);
    await onDay(p, "Day 1 of 30");
    await p.waitForFunction(([prefix]) => JSON.parse(localStorage.getItem(prefix + "coach_note") ?? "[]").some((n) => n.kind === "morning" && /\$150/.test(n.body)), [PREFIX]);
    check("the brief is written again with the new floor", true);

    // End the challenge at noon: the brief must stop quoting its target.
    await p.goto(`${base}/settings/challenge`);
    await p.getByRole("button", { name: "End early" }).click();
    await p.getByRole("dialog").getByRole("button", { name: /^End/ }).click();
    await p.getByText(/No challenge running|Ongoing/i).first().waitFor();
    await p.goto(`${base}/today`);
    await brief.waitFor();
    await p.waitForFunction(([prefix]) => JSON.parse(localStorage.getItem(prefix + "coach_note") ?? "[]").some((n) => n.kind === "morning" && !/\$1,000/.test(n.body) && /Floor is \$100/.test(n.body)), [PREFIX]);
    const briefs = (await rows(p, "coach_note")).filter((n) => n.kind === "morning");
    check("ending the challenge that day rewrites the brief: no money target, the settings floor is back", briefs.length === 1 && !/\$1,000/.test(briefs[0].body) && briefs[0].basis.startsWith("none|100"), JSON.stringify(briefs));
    await p.waitForFunction(() => !/\$1,000/.test(document.querySelector("[data-brief-line]")?.textContent ?? "$1,000"));
    await brief.click();
    check("Today shows the rewritten brief", !/\$1,000/.test(await p.locator("#coach-brief").innerText()), await p.locator("#coach-brief").innerText());
    await shot(p, "f-core-02-brief-after-ending");
    await p.goto(`${base}/money`);
    await p.getByText("Floor $100").waitFor();
    check("and Money is back on the $100 floor", true);
    await c.close();
  }
}
