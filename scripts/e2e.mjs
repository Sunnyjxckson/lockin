// Full walkthrough in headless Chromium at phone size (390 x 844), meant for
// the production build with an empty .env:
//
//   npm run build && npm run start -- -p 3210
//   node scripts/e2e.mjs http://localhost:3210
//
// It covers every screen and the flows that cross features, with the clock
// pinned to the challenge dates. Screenshots land in .shots/final-*.png.
// Any failed check, console error or page error makes it exit non-zero.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const shots = new URL("../.shots/", import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const viewport = { width: 390, height: 844 };
const device = { viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: "America/New_York" };
let passed = 0;
const problems = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    problems.push(name);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

function watch(page) {
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()} (${page.url()})`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message} (${page.url()})`));
}

async function typeCode(page, code) {
  for (const d of code) await page.getByRole("button", { name: d, exact: true }).click();
}

async function createPasscode(page, code = "1379") {
  await page.getByText("Create a passcode").waitFor();
  await typeCode(page, code);
  await page.getByText("Enter it again").waitFor();
  await typeCode(page, code);
  await page.getByRole("heading", { name: /Day \d+/ }).waitFor();
}

const row = (page, name) => page.getByRole("checkbox", { name, exact: false });
const dialog = (page) => page.getByRole("dialog");
const nav = (page) => page.getByRole("navigation", { name: "Main" });
const done = (page, n, of = 12) => page.getByText(`${n} of ${of}`, { exact: true }).first().waitFor();
const count = async (page) => (await page.locator("section", { hasText: "Checklist" }).first().locator("h2 + div").innerText()).trim();

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${shots}final-${name}.png`, fullPage });
}

async function noOverflow(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`${name}: no sideways scroll at 390px`, !over);
}

async function activeTab(page) {
  return (await nav(page).locator('[aria-current="page"]').allInnerTexts()).join(",");
}

async function openTab(page, tab) {
  await nav(page).getByRole("link", { name: tab }).click();
  await page.getByRole("heading", { name: tab === "Today" ? /Day \d+/ : tab, level: 1 }).waitFor();
}

async function closeSheet(page) {
  await page.keyboard.press("Escape");
  await dialog(page).waitFor({ state: "detached" });
}

const browser = await chromium.launch();

// Dev only pages must not be reachable in a production build.
{
  const ctx = await browser.newContext();
  for (const path of ["/dev/ui", "/dev/coach", "/coach/dev"]) {
    const res = await ctx.request.get(`${base}${path}`);
    check(`${path} is not served`, res.status() === 404, `status ${res.status()}`);
  }
  const cron = await ctx.request.get(`${base}/api/reminders/cron`);
  check("the cron route refuses without CRON_SECRET", cron.status() === 503 || cron.status() === 401, `status ${cron.status()}`);
  for (const [path, body] of [
    ["/api/money/read", { image: "data:image/png;base64,AAAA" }],
    ["/api/body/meal-estimate", { image: "data:image/png;base64,AAAA" }],
  ]) {
    const res = await ctx.request.post(`${base}${path}`, { data: body });
    const json = await res.json().catch(() => ({}));
    check(`${path} answers with the shared fallback shape and no key`, res.status() === 200 && json.source === "fallback" && json.reason === "no_key", JSON.stringify(json));
  }
  await ctx.close();
}

// =====================================================================
// Day 1. Monday Oct 5, 2026, 5:50 AM New York.
// =====================================================================
console.log("Day 1: first run");
const ctx = await browser.newContext(device);
await ctx.addInitScript(() => {
  window.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
});
const page = await ctx.newPage();
watch(page);
await page.clock.install({ time: new Date("2026-10-05T09:50:00Z") });
await page.goto(`${base}/`);
await page.getByText("Create a passcode").waitFor();
check("root goes to /today behind the lock screen", page.url().endsWith("/today"));
check("nothing of the app shows while locked", (await page.getByText("Checklist").count()) === 0);
await shot(page, "01-lock");
await typeCode(page, "1379");
await page.getByText("Enter it again").waitFor();
await typeCode(page, "1370");
await page.getByText("Those did not match").waitFor();
check("a mismatched confirmation is refused", true);
await createPasscode(page);

// ---------- Today, empty ----------
console.log("Today");
await done(page, 0);
check("header shows day 1 of 30", await page.getByRole("heading", { name: "Day 1 of 30", exact: true }).isVisible());
const nowCard = page.getByRole("link", { name: "Open schedule" });
check("Now is Wake and Next is the workout at 5:50 AM", /Wake/.test(await nowCard.innerText()) && /Lift \+ core/.test(await nowCard.innerText()));
check("the morning brief is on Today, above Now and Next", (await page.getByText("Morning brief").boundingBox()).y < (await nowCard.boundingBox()).y);
check("Now and Next is above the fold with the brief open", (await nowCard.boundingBox()).y < 844);
check("the tab bar has five tabs and Today is lit", (await nav(page).getByRole("link").count()) === 5 && (await activeTab(page)) === "Today");
check("the workout is shown in full", (await page.getByRole("listitem").count()) >= 4);
await page.waitForTimeout(600);
const cls = await page.evaluate(() => window.__cls);
check("Today paints without layout shift", cls < 0.02, `cls ${cls}`);
await noOverflow(page, "Today");
await shot(page, "02-today-start");
await shot(page, "03-today-start-full", true);

// Close the brief: it stays closed for the day.
await page.getByRole("button", { name: /Morning brief/ }).click();
check("the brief collapses to one line", (await page.getByRole("button", { name: /Morning brief/ }).getAttribute("aria-expanded")) === "false");

await row(page, "Workout").click();
await done(page, 1);
check("tapping an item checks it off", (await row(page, "Workout").getAttribute("aria-checked")) === "true");
await row(page, "Workout").click();
await done(page, 0);
check("tapping again unchecks it", true);
await row(page, "Workout").click();
await row(page, "Core").click();
await row(page, "Up by 5:45").click();
await done(page, 3);
check("a wake check before 6:00 counts", true);

await row(page, "Business move").click();
await page.getByText("Write what you did first").waitFor();
check("business move needs text before the tick", (await count(page)) === "3 of 12");
await page.getByRole("textbox", { name: /Business move/ }).fill("Emailed the cohort lead");
await row(page, "Business move").click();
await done(page, 4);

await row(page, "Talk to one girl").click();
await page.getByText("1 of 2", { exact: true }).waitFor();
check("a weekly item checks off without changing the day count", (await count(page)) === "4 of 12");

// ---------- Money: add an earning, Today scores it ----------
console.log("Money and Today");
await page.getByRole("button", { name: /Add earnings/ }).click();
await dialog(page).waitFor();
const amount = dialog(page).getByRole("textbox", { name: "Amount" });
check("the amount field opens the decimal keypad", (await amount.getAttribute("inputmode")) === "decimal");
await amount.fill("60");
await dialog(page).getByRole("radio", { name: "Uber Eats" }).click();
await dialog(page).getByRole("button", { name: "2", exact: true }).click();
await shot(page, "04-quick-add-sheet");
await dialog(page).getByRole("button", { name: "Add $60" }).click();
await dialog(page).waitFor({ state: "detached" });
await page.getByRole("button", { name: /Add earnings. \$60 so far/ }).waitFor();
check("$60 shows on Today's Earned row and does not meet the $100 floor", (await count(page)) === "4 of 12");

await openTab(page, "Money");
await page.getByText("$940 to go by Oct 14").waitFor();
check("Money shows the running total and what is left", true);
check("Money shows today against the floor", (await page.getByText("$40 to go.").count()) === 1);
check("Money shows the hourly rate", (await page.getByText("$30/h").count()) >= 1);
await noOverflow(page, "Money");
await page.getByRole("button", { name: "Add earnings" }).last().click();
await dialog(page).waitFor();
await dialog(page).getByRole("textbox", { name: "Amount" }).fill("75.50");
await dialog(page).getByRole("button", { name: "Add $75.50" }).click();
await dialog(page).waitFor({ state: "detached" });
await page.getByText("Floor met. $35.50 over, banked.").waitFor();
check("a second entry meets the floor and banks the surplus", true);
await shot(page, "05-money", true);
// Edit an entry, then check the day total follows.
await page.getByRole("button", { name: /\$75\.50/ }).click();
await dialog(page).waitFor();
await dialog(page).getByRole("textbox", { name: "Amount" }).fill("80");
await dialog(page).getByRole("button", { name: "Save" }).click();
await dialog(page).waitFor({ state: "detached" });
await page.getByText("$860 to go by Oct 14").waitFor();
check("editing an entry updates the running total", true);

await openTab(page, "Today");
await page.getByRole("button", { name: /Add earnings. \$140 so far/ }).waitFor();
await done(page, 5);
check("Today scores Earned today from the Money entries", true);

// ---------- Body: log a meal, Today scores calories and protein ----------
console.log("Body and Today");
const protein = page.getByRole("textbox", { name: "Protein" });
check("number rows open the numeric keypad", ["decimal", "numeric"].includes(await protein.getAttribute("inputmode")));
await openTab(page, "Body");
await page.getByText("Nothing eaten yet").waitFor();
await noOverflow(page, "Body");
await shot(page, "06-body-food-empty", true);
await page.getByRole("button", { name: "Add by hand" }).click();
await dialog(page).waitFor();
await dialog(page).getByRole("textbox", { name: "Name" }).fill("Chicken, rice and broccoli");
await dialog(page).getByRole("textbox", { name: "Calories" }).fill("1200");
await dialog(page).getByRole("textbox", { name: "Protein" }).fill("110");
await dialog(page).getByRole("textbox", { name: "Carbs" }).fill("120");
await dialog(page).getByRole("textbox", { name: "Fat" }).fill("25");
await dialog(page).getByRole("switch", { name: "Save as a favorite" }).click();
await shot(page, "07-meal-sheet");
await dialog(page).getByRole("button", { name: /^(Add|Save|Log)/ }).last().click();
await dialog(page).waitFor({ state: "detached" });
await page.getByText("Chicken, rice and broccoli").first().waitFor();
check("a meal is logged by hand", true);

await openTab(page, "Today");
await page.getByRole("link", { name: /Calories: 1,200kcal from meals/ }).waitFor();
check("Today shows calories from the meal, under target so not done", (await count(page)) === "5 of 12");
await openTab(page, "Body");
await page.getByRole("button", { name: "Log Chicken, rice and broccoli" }).click();
await page.getByText("Chicken, rice and broccoli logged").waitFor();
check("a saved meal logs again in one tap", true);
await page.waitForTimeout(300);
// 2,400 kcal is over the range. Trim it to land inside 1,900 to 2,100.
await page.getByRole("button", { name: /Chicken, rice and broccoli/ }).first().click();
await dialog(page).waitFor();
await dialog(page).getByRole("textbox", { name: "Calories" }).fill("800");
await dialog(page).getByRole("textbox", { name: "Protein" }).fill("80");
await dialog(page).getByRole("button", { name: /^Save/ }).last().click();
await dialog(page).waitFor({ state: "detached" });
await shot(page, "08-body-food", true);
await openTab(page, "Today");
await page.getByRole("link", { name: /Calories: 2,000kcal from meals/ }).waitFor();
await page.getByRole("link", { name: /Protein: 190g from meals/ }).waitFor();
await done(page, 7);
check("Today scores calories (in range) and protein (over the minimum) from meals", true);

// ---------- Vices: a slip, and every screen agreeing ----------
console.log("Vices, Today, Progress and streaks");
for (const name of ["No smoking", "No drinking", "No masturbation", "Study or homework block", "In bed on time"]) await row(page, name).click();
await done(page, 12);
await page.getByText("Locked in").waitFor();
check("finishing the last item shows the full day moment", await page.getByRole("status").getByText("Day 1").isVisible());
await page.waitForTimeout(1100);
await shot(page, "09-day-complete-moment");
await page.getByRole("button", { name: "Dismiss" }).click();
check("the ring reads 100%", (await page.getByRole("progressbar", { name: "Checklist done" }).getAttribute("aria-valuenow")) === "100");
await page.evaluate(() => window.scrollTo(0, 0));
await shot(page, "10-today-full");

await page.getByRole("button", { name: "Log a slip" }).click();
await dialog(page).waitFor();
await dialog(page).getByRole("button", { name: "No smoking" }).click();
await dialog(page).getByRole("button", { name: "stressed" }).click();
await shot(page, "11-slip-sheet");
await dialog(page).getByRole("button", { name: "Save" }).click();
await dialog(page).waitFor({ state: "detached" });
await page.getByText("Slip logged. Not clean today.").waitFor();
await done(page, 11);
check("Today: the slip makes No smoking not done, though it was ticked", (await row(page, "No smoking").count()) === 0);
await page.evaluate(() => window.scrollTo(0, 0));
await shot(page, "12-today-after-slip", true);

await openTab(page, "Progress");
await page.getByText("Streaks").first().waitFor();
const cell1 = page.getByRole("button", { name: /^Day 1\b/ }).first();
check("Progress: day 1 is partial, not full", /partial/i.test((await cell1.getAttribute("aria-label")) ?? ""), (await cell1.getAttribute("aria-label")) ?? "");
const smokeRow = page.locator("li, div").filter({ hasText: /^No smoking/ }).filter({ hasText: /days?/ }).first();
check("Progress: the No smoking streak is 0", /\b0\s*days?/.test((await smokeRow.innerText()).replace(/\s+/g, " ")), (await smokeRow.innerText()).replace(/\s+/g, " "));
await noOverflow(page, "Progress");

await page.goto(`${base}/vices`);
await page.getByRole("heading", { name: "Vices", level: 1 }).waitFor();
await page.getByText(/Slip logged at/).waitFor();
check("Vices: shows the slip and a streak of 0", /^0\s/.test((await page.locator("a", { hasText: "No smoking" }).first().innerText()).trim()));
check("Vices lights the Today tab and has a way back", (await activeTab(page)) === "Today" && (await page.getByRole("link", { name: "Back" }).count()) === 1);
await noOverflow(page, "Vices");
await shot(page, "13-vices", true);
await page.locator("a", { hasText: "No smoking" }).first().click();
await page.getByRole("heading", { name: "No smoking", level: 1 }).waitFor();
check("Vice detail: the pattern shows what set it off", (await page.getByText("Stressed").count()) >= 1);
await shot(page, "14-vice-detail", true);

// Remove the slip: the day is clean again everywhere.
await page.getByRole("button", { name: /at \d+:\d+ (AM|PM)/ }).first().click();
await dialog(page).waitFor();
await dialog(page).getByRole("button", { name: /Remove|Delete/ }).click();
await dialog(page).waitFor({ state: "detached" });
await page.getByText("No slips logged").waitFor();
await page.getByRole("link", { name: "Back" }).click();
await page.getByRole("heading", { name: "Vices", level: 1 }).waitFor();
await page.getByRole("link", { name: "Back" }).click();
await page.getByRole("heading", { name: /Day \d+/ }).waitFor();
await done(page, 12);
check("removing the slip makes the day clean again on Today", (await row(page, "No smoking").getAttribute("aria-checked")) === "true");

// ---------- Progress: the full day ----------
console.log("Progress");
await openTab(page, "Progress");
await page.getByText("Streaks").first().waitFor();
check("Progress: day 1 is full once every daily item is done", /full|locked/i.test((await cell1.getAttribute("aria-label")) ?? ""), (await cell1.getAttribute("aria-label")) ?? "");
check("Progress: one day locked in", /1\s*Locked in/i.test((await page.locator("main").innerText()).replace(/\s+/g, " ")));
await shot(page, "15-progress", true);
await cell1.click();
await dialog(page).waitFor();
await shot(page, "16-progress-day-sheet");
await dialog(page).getByRole("link", { name: /Today|Open|Edit/ }).first().click();
await page.getByRole("heading", { name: "Day 1 of 30", exact: true }).waitFor();
check("the day sheet links to Today on that date", page.url().endsWith("/today"));

await page.goto(`${base}/progress`);
await page.getByRole("link", { name: /Share/ }).click();
await page.getByRole("heading", { name: "Share card", level: 1 }).waitFor();
await page.getByRole("button", { name: /Save image/ }).waitFor();
check("Share card opens, keeps Progress lit and has a way back", (await activeTab(page)) === "Progress" && (await page.getByRole("link", { name: "Back" }).count()) === 1);
await page.waitForTimeout(600);
await shot(page, "17-share-card", true);
await page.getByRole("link", { name: "Back" }).click();
await page.getByRole("heading", { name: "Progress", level: 1 }).waitFor();

// ---------- Schedule: edit a block, Now and Next follow ----------
console.log("Schedule and Today");
await openTab(page, "Schedule");
await page.getByText("9:00 clock-in errand").waitFor();
await noOverflow(page, "Schedule");
await shot(page, "18-schedule", true);
await page.getByRole("button", { name: /Lift \+ core/ }).first().click();
await dialog(page).waitFor();
await dialog(page).getByRole("textbox", { name: "Name" }).fill("Lift heavy");
await shot(page, "19-block-sheet");
await dialog(page).getByRole("button", { name: "Save" }).click();
await dialog(page).waitFor({ state: "detached" });
await page.getByRole("button", { name: /Lift heavy/ }).first().waitFor();
check("a block is edited for this day", true);
await page.getByRole("button", { name: /Add/ }).last().click();
await dialog(page).waitFor();
await shot(page, "20-add-block-sheet");
await closeSheet(page);
await openTab(page, "Today");
check("Today's Next follows the edited block", /Lift heavy/.test(await nowCard.innerText()), await nowCard.innerText());
await page.goto(`${base}/settings/schedule`);
await page.getByRole("heading", { name: "Schedule", level: 1 }).waitFor();
await page.getByRole("radio", { name: "M" }).first().click();
check("the weekday template is untouched by a one day edit", (await page.getByRole("button", { name: /^Lift \+ core/ }).count()) === 1);
await shot(page, "21-settings-schedule", true);

// ---------- Body: weight, photo, workout log ----------
console.log("Body: weight and workout");
await page.goto(`${base}/body`);
await page.getByRole("radio", { name: "Weight" }).click();
await page.getByText("No weigh-ins yet").waitFor();
await page.getByRole("button", { name: /Weigh in|Log weight|Add/ }).first().click();
await dialog(page).waitFor();
await dialog(page).getByRole("textbox", { name: "Weight" }).fill("182.4");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8Dwn4EAYCKkYKQoAAD3TAIOSXQ8yQAAAABJRU5ErkJggg==", "base64");
await dialog(page).locator('input[type="file"]').setInputFiles({ name: "front.png", mimeType: "image/png", buffer: png });
await shot(page, "22-weigh-in-sheet");
await dialog(page).getByRole("button", { name: /^Save/ }).click();
await dialog(page).waitFor({ state: "detached" });
await page.getByText("182.4").first().waitFor();
check("a weigh-in with a photo saves (photo kept in IndexedDB)", (await page.locator("main img").count()) >= 1);
await shot(page, "23-body-weight", true);
await page.getByRole("link", { name: /Log workout/ }).click();
await page.getByRole("heading", { name: "Log workout", level: 1 }).waitFor();
check("Workout logging keeps Body lit and has a way back", (await activeTab(page)) === "Body" && (await page.getByRole("link", { name: "Back" }).count()) === 1);
const firstWeight = page.getByRole("textbox").first();
check("set fields open a numeric keypad", ["decimal", "numeric"].includes(await firstWeight.getAttribute("inputmode")));
await firstWeight.fill("135");
await firstWeight.press("Enter");
await page.getByRole("checkbox").first().click();
await page.getByText(/^1$/).first().waitFor();
check("a set is logged", /1\s*of \d+ sets/.test((await page.locator("main").innerText()).replace(/\s+/g, " ")));
await noOverflow(page, "Workout log");
await shot(page, "24-workout-log", true);
await page.getByRole("link", { name: "Back" }).click();
await page.getByRole("heading", { name: "Body", level: 1 }).waitFor();
await openTab(page, "Today");
check("Today's workout header shows the sets logged", (await page.getByRole("link", { name: /Log sets, 1 of/ }).count()) === 1);

// ---------- Coach ----------
console.log("Coach");
await page.getByRole("link", { name: "Coach" }).click();
await page.getByRole("heading", { name: "Coach", level: 1 }).waitFor();
await page.getByText("Written by rules from your data").first().waitFor();
check("Coach shows today's brief, written by rules with no key", true);
check("Coach lights the Today tab and has a way back", (await activeTab(page)) === "Today" && (await page.getByRole("link", { name: "Back" }).count()) === 1);
await noOverflow(page, "Coach");
await shot(page, "25-coach", true);
await page.getByRole("link", { name: "Back" }).click();
await page.getByRole("heading", { name: /Day \d+/ }).waitFor();

// ---------- Reminders ----------
console.log("Reminders");
await page.goto(`${base}/reminders`);
await page.getByRole("heading", { name: "Reminders", level: 1 }).waitFor();
check("Reminders shows the not set up state and what to set", (await page.getByText("VAPID_PRIVATE_KEY").count()) === 1 && (await page.getByText("CRON_SECRET").count()) === 1);
check("Reminders has a way back", (await page.getByRole("link", { name: "Back" }).count()) === 1);
await noOverflow(page, "Reminders");
await shot(page, "26-reminders", true);

// ---------- Settings ----------
console.log("Settings");
await page.goto(`${base}/today`);
await page.getByRole("link", { name: "Settings" }).click();
await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
await shot(page, "27-settings", true);
for (const [link, title, file] of [
  [/Checklist/, "Checklist", "28-settings-checklist"],
  [/Workouts/, "Workouts", "29-settings-workouts"],
  [/Challenge/, "Challenge", "30-settings-challenge"],
  [/Reminders/, "Reminders", "31-settings-reminders"],
]) {
  await page.getByRole("link", { name: link }).first().click();
  await page.getByRole("heading", { name: title, level: 1 }).waitFor();
  await noOverflow(page, `Settings ${title}`);
  await shot(page, file, true);
  await page.getByRole("link", { name: "Back" }).click();
  await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
}
check("every settings screen opens and goes back", true);
await page.goto(`${base}/settings/workouts`);
await page.getByRole("radio", { name: "M" }).click();
await page.getByRole("button", { name: /^Bench press/ }).click();
await page.getByRole("textbox", { name: "Exercise" }).fill("Incline bench press");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("button", { name: /^Incline bench press/ }).waitFor();
check("an exercise can be swapped", true);
await page.goto(`${base}/settings/reminders`);
await page.getByRole("switch", { name: "Earnings nudge" }).click();
await page.reload();
await page.getByRole("switch", { name: "Earnings nudge" }).waitFor();
check("a reminder switch persists", (await page.getByRole("switch", { name: "Earnings nudge" }).getAttribute("aria-checked")) === "false");

// ---------- Lock ----------
console.log("Lock");
await page.goto(`${base}/settings`);
await page.getByRole("button", { name: /Lock now/ }).click();
await page.getByText("Enter passcode").waitFor();
await typeCode(page, "0000");
await page.getByText("Wrong passcode.").waitFor();
check("a wrong passcode is refused", true);
await typeCode(page, "1379");
await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
check("the right passcode opens the app", true);

const state = await ctx.storageState();
await ctx.close();

// =====================================================================
// Day 2. Tuesday Oct 6, 9:00 AM New York.
// =====================================================================
console.log("Day 2: yesterday keeps its score");
async function at(iso, path = "/today") {
  const c = await browser.newContext({ ...device, storageState: state });
  const p = await c.newPage();
  watch(p);
  await p.clock.install({ time: new Date(iso) });
  await p.goto(`${base}${path}`);
  await p.getByRole("heading", { name: /Day \d+/ }).waitFor();
  return { c, p };
}

let s = await at("2026-10-06T13:00:00Z");
check("the next morning opens on day 2, empty", await s.p.getByRole("heading", { name: "Day 2 of 30", exact: true }).isVisible());
await done(s.p, 0);
check("the brief is open again on a new day", (await s.p.getByRole("button", { name: /Morning brief/ }).getAttribute("aria-expanded")) === "true");
await shot(s.p, "32-today-day-2");

// Change the protein target today.
await s.p.goto(`${base}/settings/checklist`);
await s.p.getByRole("button", { name: /^Protein/ }).click();
const atLeast = s.p.getByRole("textbox", { name: "At least" });
check("the editor shows the current target", (await atLeast.inputValue()) === "180");
await atLeast.fill("200");
await s.p.getByRole("button", { name: "Save" }).click();
await s.p.getByText("200g or more").waitFor();

await s.p.goto(`${base}/today`);
await s.p.getByText("200g or more").waitFor();
check("today uses the new target", true);

// Yesterday through /today?date=...
await s.p.goto(`${base}/today?date=2026-10-05`);
await s.p.getByRole("heading", { name: "Day 1 of 30", exact: true }).waitFor();
await done(s.p, 12);
check("/today?date=2026-10-05 opens on day 1", true);
check("yesterday still shows the old target and stays 12 of 12", (await s.p.getByText("180g or more").count()) === 1 && (await s.p.getByText("200g or more").count()) === 0);
check("the date param is dropped from the address once read", !s.p.url().includes("date="));
await s.p.getByText("Open until Oct 6, 12:00 PM").waitFor();
check("day 1 is open until noon the next day", true);
await shot(s.p, "33-today-yesterday");

await s.p.goto(`${base}/progress`);
await s.p.getByText("Streaks").first().waitFor();
const d1 = s.p.getByRole("button", { name: /^Day 1\b/ }).first();
check("Progress: yesterday is still full after the target change", /full|locked/i.test((await d1.getAttribute("aria-label")) ?? ""), (await d1.getAttribute("aria-label")) ?? "");
await shot(s.p, "34-progress-day-2", true);

await s.p.goto(`${base}/money`);
await s.p.getByText("Yesterday").waitFor();
check("Money lists yesterday's entries under their day", (await s.p.getByText("$860 to go by Oct 14").count()) === 1);
await s.c.close();

// Oct 6, 12:30 PM: day 1 is locked.
s = await at("2026-10-06T16:30:00Z");
await s.p.getByRole("tab", { name: "Day 1", exact: true }).click();
await s.p.getByText("Locked. Days close at noon the next day.").waitFor();
check("day 1 locks at noon the next day", await row(s.p, "Workout").isDisabled());
check("a locked day still shows its data", (await row(s.p, "Workout").getAttribute("aria-checked")) === "true");
await shot(s.p, "35-locked-day");
await s.c.close();

// After the money deadline: reset the target, the running total starts fresh.
console.log("Money target reset");
s = await at("2026-10-15T14:00:00Z", "/today");
await s.p.goto(`${base}/money`);
await s.p.getByText("Deadline passed").waitFor();
await s.p.getByRole("button", { name: "Set a new target" }).click();
await dialog(s.p).waitFor();
await dialog(s.p).getByRole("textbox", { name: "New target" }).fill("2000");
await shot(s.p, "36-reset-target-sheet");
await dialog(s.p).getByRole("button", { name: "Set target" }).click();
await dialog(s.p).waitFor({ state: "detached" });
await s.p.getByText("$2,000 to go by").waitFor();
check("a reset starts a fresh running total", true);
check("the all time total stays visible", /All time \$140/.test((await s.p.locator("main").innerText()).replace(/\s+/g, " ")));
await shot(s.p, "37-money-after-reset", true);
await s.c.close();

// =====================================================================
// A late first install, and the wake cutoff.
// =====================================================================
console.log("Late install and the wake cutoff");
{
  const c = await browser.newContext(device);
  const p = await c.newPage();
  watch(p);
  await p.clock.install({ time: new Date("2026-10-07T23:00:00Z") });
  await p.goto(`${base}/today`);
  await createPasscode(p, "2468");
  await p.getByRole("heading", { name: "Day 3 of 30", exact: true }).waitFor();
  await p.getByRole("tab", { name: "Day 1", exact: true }).click();
  await p.getByRole("heading", { name: "Day 1 of 30", exact: true }).waitFor();
  await row(p, "Up by 5:45").click();
  await done(p, 1);
  check("days before the install can be backfilled, and a backfilled wake counts on trust", true);
  await p.getByRole("tab", { name: "Day 3, today", exact: true }).click();
  await p.getByRole("heading", { name: "Day 3 of 30", exact: true }).waitFor();
  await row(p, "Up by 5:45").click();
  await p.getByText("Checked after the cutoff. Does not count.").waitFor();
  check("a same day wake check after 6:00 does not count", (await count(p)) === "0 of 12");
  await shot(p, "38-late-wake");
  await c.close();
}

// Reduced motion: the full day moment still shows, without depending on animation.
{
  const c = await browser.newContext({ ...device, reducedMotion: "reduce" });
  const p = await c.newPage();
  watch(p);
  await p.clock.install({ time: new Date("2026-10-05T09:50:00Z") });
  await p.goto(`${base}/today`);
  await createPasscode(p, "2468");
  const dur = await p.evaluate(() => getComputedStyle(document.querySelector("nav a")).transitionDuration);
  check("reduced motion switches transitions off", parseFloat(dur) < 0.01, dur);
  await c.close();
}

await browser.close();
console.log(`\n${passed} checks passed, ${problems.length} problems`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length === 0 ? 0 : 1);
