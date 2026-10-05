// Click-through check in headless Chromium at phone size.
// Start the app first (npm run dev, or npm run start), then:
//   node scripts/e2e.mjs [baseUrl]
// Screenshots land in .shots/. Exits non-zero on the first failed check.

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
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
}

async function typeCode(page, code) {
  for (const d of code) await page.getByRole("button", { name: d, exact: true }).click();
}

const row = (page, name) => page.getByRole("checkbox", { name, exact: false });
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${shots}${name}.png`, fullPage });

const browser = await chromium.launch();

// ---------- 1. first run ----------
console.log("First run and passcode");
const ctx = await browser.newContext(device);
const page = await ctx.newPage();
watch(page);
await page.goto(`${base}/`);
await page.getByText("Create a passcode").waitFor();
check("root redirects to /today behind the lock screen", page.url().endsWith("/today"));
check("nothing of the app is visible while locked", (await page.getByText("Checklist").count()) === 0);
await shot(page, "01-lock-create");
await typeCode(page, "1379");
await page.getByText("Enter it again").waitFor();
await typeCode(page, "1370");
await page.getByText("Those did not match").waitFor();
check("mismatched confirmation is refused", true);
await typeCode(page, "1379");
await page.getByText("Enter it again").waitFor();
await typeCode(page, "1379");
await page.getByRole("heading", { name: /Day \d+/ }).waitFor();
check("passcode created and app opens on Today", true);

// ---------- 2. Today ----------
console.log("Today");
check("header shows day of 30", await page.getByText("of 30").isVisible());
check("Now and Next card renders", (await page.getByText("Next", { exact: true }).count()) === 1);
check("12 daily items listed", (await page.getByText("0 of 12").count()) === 1);
check("tab bar has five tabs", (await page.getByRole("navigation", { name: "Main" }).getByRole("link").count()) === 5);
check("workout shown in full", (await page.getByRole("listitem").count()) >= 4);
await page.waitForTimeout(400);
await shot(page, "02-today-empty");

await row(page, "Workout").click();
await page.getByText("1 of 12").waitFor();
check("tapping an item checks it off", (await row(page, "Workout").getAttribute("aria-checked")) === "true");
await row(page, "Core").click();
await row(page, "No smoking").click();
await row(page, "No drinking").click();
await page.getByText("4 of 12").waitFor();
check("percent follows the checklist", await page.getByRole("progressbar", { name: "Checklist done" }).getAttribute("aria-valuenow") === "33");

await row(page, "No drinking").click();
await page.getByText("3 of 12").waitFor();
check("tapping again unchecks", true);
await row(page, "No drinking").click();

const protein = page.getByRole("textbox", { name: "Protein" });
await protein.fill("185");
await protein.press("Enter");
await page.getByText("5 of 12").waitFor();
check("a number at or over the minimum counts", true);

const calories = page.getByRole("textbox", { name: "Calories" });
await calories.fill("1500");
await calories.press("Enter");
await page.waitForTimeout(300);
check("a number outside the range does not count", (await page.getByText("5 of 12").count()) === 1);
await calories.fill("2,050");
await calories.press("Enter");
await page.getByText("6 of 12").waitFor();
check("a number inside the range counts", true);

const earned = page.getByRole("textbox", { name: "Earned today" });
await earned.fill("42.50");
await earned.press("Enter");
await page.waitForTimeout(300);
check("earned under the floor does not count", (await page.getByText("6 of 12").count()) === 1);

await row(page, "Business move").click();
await page.getByText("Write what you did first").waitFor();
check("business move needs text before the tick", (await page.getByText("6 of 12").count()) === 1);
await page.getByRole("textbox", { name: /Business move/ }).fill("Emailed the cohort lead");
await row(page, "Business move").click();
await page.getByText("7 of 12").waitFor();
check("business move counts with text and tick", true);

await row(page, "Talk to one girl").click();
await page.getByText("1 of 2").waitFor();
check("weekly item checks off without changing the day count", (await page.getByText("7 of 12").count()) === 1);
await page.waitForTimeout(3000);
check("toast clears itself", (await page.getByRole("status").count()) === 0);
check("inline number text is the large size", (await protein.evaluate((el) => getComputedStyle(el).fontSize)) === "19px");
await shot(page, "03-today-progress");
await shot(page, "04-today-full-page", true);

// ---------- 3. Settings: change a target ----------
console.log("Settings");
await page.getByRole("link", { name: "Settings" }).click();
await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
await shot(page, "05-settings");
await page.getByRole("link", { name: /Checklist/ }).click();
await page.getByRole("heading", { name: "Checklist", level: 1 }).waitFor();
await page.waitForTimeout(300);
await shot(page, "06-settings-checklist");
await page.getByRole("button", { name: /^Protein/ }).click();
await page.getByRole("heading", { name: "Edit item" }).waitFor();
const atLeast = page.getByRole("textbox", { name: "At least" });
check("editor shows the current target", (await atLeast.inputValue()) === "180");
await atLeast.fill("200");
await page.waitForTimeout(250);
await shot(page, "07-settings-edit-item");
await page.getByRole("button", { name: "Save" }).click();
await page.getByText("200g or more").waitFor();
check("target change saved", true);

// add, reorder, remove
await page.getByRole("button", { name: "Add item" }).click();
await page.getByRole("textbox", { name: "Name", exact: true }).fill("Read 20 pages");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("button", { name: /^Read 20 pages/ }).waitFor();
check("item added", true);
await page.getByRole("button", { name: "Move Read 20 pages up" }).click();
await page.waitForTimeout(300);
const names = await page.locator("ul li button:first-child span:first-child").allTextContents();
check("item reordered", names.indexOf("Read 20 pages") === names.length - 2, names.join("|"));
await page.getByRole("button", { name: /^No masturbation/ }).click();
await page.getByRole("textbox", { name: "Name", exact: true }).fill("No porn or masturbation");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("button", { name: /^No porn or masturbation/ }).waitFor();
check("item renamed", true);
await page.getByRole("button", { name: /^In bed on time/ }).click();
await page.getByRole("button", { name: "Remove" }).click();
await page.waitForTimeout(300);
check("item removed", (await page.getByRole("button", { name: /^In bed on time/ }).count()) === 0);

await page.goto(`${base}/today`);
await page.getByRole("heading", { name: /Day \d+/ }).waitFor();
await page.getByText("of 12").waitFor();
check("Today shows the new target", (await page.getByText("200g or more").count()) === 1);
check("185g no longer meets 200g, so protein reopened", (await page.getByText("6 of 12").count()) === 1);
check("added and renamed items show on Today", (await row(page, "Read 20 pages").count()) === 1 && (await row(page, "No porn or masturbation").count()) === 1);
check("removed item is gone from Today", (await row(page, "In bed on time").count()) === 0);

// ---------- 4. persistence ----------
console.log("Persistence");
await page.reload();
await page.getByRole("heading", { name: /Day \d+/ }).waitFor();
await page.getByText("6 of 12").waitFor();
check("stays unlocked after reload", true);
check("ticks persisted", (await row(page, "Workout").getAttribute("aria-checked")) === "true");
check("numbers persisted", (await page.getByRole("textbox", { name: "Protein" }).inputValue()) === "185" && (await page.getByRole("textbox", { name: "Calories" }).inputValue()) === "2050");
check("text persisted", (await page.getByRole("textbox", { name: /Business move/ }).inputValue()) === "Emailed the cohort lead");
check("weekly tick persisted", (await page.getByText("1 of 2").count()) === 1);

// ---------- 5. other settings screens ----------
console.log("Schedule, workouts, challenge, reminders");
await page.goto(`${base}/settings/schedule`);
await page.getByRole("heading", { name: "Schedule", level: 1 }).waitFor();
await page.getByRole("radio", { name: "T" }).first().click();
await page.getByRole("button", { name: /^Class/ }).click();
await page.getByRole("textbox", { name: "Name", exact: true }).fill("Class: finance");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("button", { name: /^Class: finance/ }).waitFor();
check("template block edited", true);
await page.getByRole("button", { name: "Add block" }).click();
await page.getByRole("textbox", { name: "Name", exact: true }).fill("TV");
await page.getByLabel("Start").fill("21:00");
await page.getByLabel("End").fill("22:00");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("button", { name: /^TV/ }).waitFor();
check("template block added", (await page.getByText("9 blocks").count()) === 1);
await page.waitForTimeout(300);
await shot(page, "08-settings-schedule");
await page.getByRole("button", { name: /^TV/ }).click();
await page.getByRole("button", { name: "Delete" }).click();
await page.getByText("8 blocks").waitFor();
check("template block deleted", true);

await page.goto(`${base}/settings/workouts`);
await page.getByRole("heading", { name: "Workouts", level: 1 }).waitFor();
await page.getByRole("radio", { name: "M" }).click();
await page.getByRole("button", { name: /^Bench press/ }).click();
await page.getByRole("textbox", { name: "Exercise" }).fill("Incline bench press");
await page.getByRole("textbox", { name: "Sets" }).fill("5");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("button", { name: /^Incline bench press/ }).waitFor();
check("exercise swapped with new sets", (await page.getByText("5 x 6 to 8").count()) === 1);
await page.getByRole("radio", { name: "W" }).click();
await page.getByRole("radio", { name: "Lift" }).click();
await page.getByText("Lift days: Mon, Tue, Wed, Thu, Fri").waitFor();
check("lift days can be changed", true);
await page.waitForTimeout(300);
await shot(page, "09-settings-workouts", true);

await page.goto(`${base}/settings/reminders`);
await page.getByRole("heading", { name: "Reminders", level: 1 }).waitFor();
await page.getByRole("switch", { name: "Earnings nudge" }).click();
await page.getByLabel("Wake time").fill("05:30");
await page.waitForTimeout(300);
await shot(page, "10-settings-reminders", true);
await page.reload();
await page.getByRole("switch", { name: "Earnings nudge" }).waitFor();
check("reminder switch persisted", (await page.getByRole("switch", { name: "Earnings nudge" }).getAttribute("aria-checked")) === "false");
check("reminder time persisted", (await page.getByLabel("Wake time").inputValue()) === "05:30");

await page.goto(`${base}/settings/challenge`);
await page.getByRole("heading", { name: "Challenge", level: 1 }).waitFor();
check("challenge defaults shown", (await page.getByLabel("Start date").inputValue()) === "2026-10-05" && (await page.getByRole("textbox", { name: "Target" }).inputValue()) === "1000");
await page.getByRole("textbox", { name: "Daily floor" }).fill("120");
await page.getByRole("button", { name: "Save" }).click();
await page.getByText("Challenge saved").waitFor();
await shot(page, "11-settings-challenge");
await page.goto(`${base}/today`);
await page.getByText("$120 or more").waitFor();
check("daily floor change reaches the Earned today target", true);

// ---------- 6. tabs and stubs ----------
console.log("Navigation");
for (const [tab, title] of [["Schedule", "Schedule"], ["Money", "Money"], ["Body", "Body"], ["Progress", "Progress"]]) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: tab }).click();
  await page.getByRole("heading", { name: title, level: 1 }).waitFor();
}
check("all four other tabs open with an empty state", true);
await shot(page, "12-stub-progress");
await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" }).click();
for (const name of ["Coach", "Vices"]) {
  await page.getByRole("link", { name }).click();
  await page.getByRole("heading", { name, level: 1 }).waitFor();
  await page.getByRole("link", { name: "Back" }).click();
  await page.getByRole("heading", { name: /Day \d+/ }).waitFor();
}
check("Coach and Vices open from Today's header and go back", true);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check("no horizontal overflow at 390px", !overflow);

// ---------- 7. lock ----------
console.log("Lock");
await page.goto(`${base}/settings`);
await page.getByRole("button", { name: /Lock now/ }).click();
await page.getByText("Enter passcode").waitFor();
check("Lock now shows the lock screen", (await page.getByText("Settings").count()) === 0);
await typeCode(page, "0000");
await page.getByText("Wrong passcode.").waitFor();
check("wrong passcode is refused", true);
await shot(page, "13-lock-wrong");
await typeCode(page, "1379");
await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
check("right passcode opens the app", true);

const state = await ctx.storageState();
await ctx.close();

// ---------- 8. next day: backfill and the noon lock ----------
console.log("Edit lock (clock moved forward)");
async function at(iso) {
  const c = await browser.newContext({ ...device, storageState: state });
  const p = await c.newPage();
  watch(p);
  await p.clock.install({ time: new Date(iso) });
  await p.goto(`${base}/today`);
  await p.getByRole("heading", { name: /Day \d+/ }).waitFor();
  await p.getByText(/of 12/).first().waitFor();
  return { c, p };
}

// Oct 6, 9:00 AM New York: day 1 is still open until noon.
let s = await at("2026-10-06T13:00:00Z");
check("next morning opens on day 2", await s.p.getByRole("heading", { name: "Day 2 of 30", exact: true }).isVisible());
check("day 2 starts empty", (await s.p.getByText("0 of 12").count()) === 1);
await s.p.getByRole("tab", { name: "Day 1", exact: true }).click();
await s.p.getByRole("heading", { name: "Day 1 of 30", exact: true }).waitFor();
await s.p.getByText("Open until Oct 6, 12:00 PM").waitFor();
check("day 1 is open until noon the next day", true);
check("day 1 shows the target changed on day 1", (await s.p.getByText("200g or more").count()) === 1);
await row(s.p, "Study or homework block").click();
await s.p.getByText("7 of 12").waitFor();
check("yesterday can be edited before noon", true);
await s.p.waitForTimeout(400);
await shot(s.p, "14-backfill-yesterday");
await s.c.close();

// Oct 6, 12:30 PM New York: day 1 is locked.
s = await at("2026-10-06T16:30:00Z");
await s.p.getByRole("tab", { name: "Day 1", exact: true }).click();
await s.p.getByText("Locked. Days close at noon the next day.").waitFor();
check("day 1 locks at noon the next day", await row(s.p, "Workout").isDisabled());
check("locked day still shows its data", (await row(s.p, "Workout").getAttribute("aria-checked")) === "true");
await shot(s.p, "15-locked-day");
await s.c.close();

// ---------- 9. backfill on a late first install ----------
console.log("Backfill after installing on day 3");
{
  const c = await browser.newContext(device);
  const p = await c.newPage();
  watch(p);
  await p.clock.install({ time: new Date("2026-10-07T23:00:00Z") });
  await p.goto(`${base}/today`);
  await p.getByText("Create a passcode").waitFor();
  await typeCode(p, "2468");
  await p.getByText("Enter it again").waitFor();
  await typeCode(p, "2468");
  await p.getByRole("heading", { name: "Day 3 of 30", exact: true }).waitFor();
  await p.getByRole("tab", { name: "Day 1", exact: true }).click();
  await p.getByRole("heading", { name: "Day 1 of 30", exact: true }).waitFor();
  await row(p, "Workout").click();
  await p.getByText("1 of 12").waitFor();
  check("days 1 and 2 can be backfilled on install day", true);
  await row(p, "Up by 5:45").click();
  await p.getByText("2 of 12").waitFor();
  check("a backfilled wake check counts on trust", true);
  await p.getByRole("tab", { name: "Day 3, today", exact: true }).click();
  await p.getByRole("heading", { name: "Day 3 of 30", exact: true }).waitFor();
  await row(p, "Up by 5:45").click();
  await p.getByText("Checked after the cutoff. Does not count.").waitFor();
  check("a same day wake check after 6:00 does not count", (await p.getByText("0 of 12").count()) === 1);
  await p.waitForTimeout(400);
  await shot(p, "16-late-wake-check");
  await c.close();
}

// ---------- 10. the whole day ----------
console.log("Full day");
{
  const c = await browser.newContext(device);
  const p = await c.newPage();
  watch(p);
  await p.clock.install({ time: new Date("2026-10-05T09:50:00Z") });
  await p.goto(`${base}/today`);
  await typeCode(p, "2468");
  await p.getByText("Enter it again").waitFor();
  await typeCode(p, "2468");
  await p.getByRole("heading", { name: "Day 1 of 30", exact: true }).waitFor();
  await p.getByText("0 of 12").waitFor();
  check("at 5:50 AM Now is Wake and Next is the workout", (await p.getByRole("link", { name: "Open schedule" }).innerText()).replace(/\s+/g, " ").includes("Wake 40m left") && (await p.getByText("Lift + core").count()) === 1);
  for (const name of ["Up by 5:45", "Workout", "Core", "No smoking", "No drinking", "No masturbation", "Study or homework block", "In bed on time"]) {
    await row(p, name).click();
  }
  for (const [name, v] of [["Calories", "2000"], ["Protein", "190"], ["Earned today", "140"]]) {
    const f = p.getByRole("textbox", { name });
    await f.fill(v);
    await f.press("Enter");
  }
  await p.getByRole("textbox", { name: /Business move/ }).fill("Signed the school deal");
  await row(p, "Business move").click();
  await p.getByText("12 of 12").waitFor();
  await p.getByText("Day locked in").waitFor();
  check("wake check before 6:00 counts and the day reaches 100%", await p.getByRole("progressbar", { name: "Checklist done" }).getAttribute("aria-valuenow") === "100");
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(1200);
  await shot(p, "17-day-complete");
  await shot(p, "18-day-complete-full", true);
  await c.close();
}

// ---------- 11. design system page and photo storage ----------
console.log("Components and photo storage");
{
  const c = await browser.newContext(device);
  const p = await c.newPage();
  watch(p);
  await p.goto(`${base}/dev/ui`);
  await p.getByRole("heading", { name: "Components" }).waitFor();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8Dwn4EAYCKkYKQoAAD3TAIOSXQ8yQAAAABJRU5ErkJggg==",
    "base64",
  );
  await p.getByTestId("photo-input").setInputFiles({ name: "t.png", mimeType: "image/png", buffer: png });
  await p.getByTestId("photo-img").waitFor();
  const ref = await p.getByTestId("photo-ref").textContent();
  const src = await p.getByTestId("photo-img").getAttribute("src");
  check("photo stored in IndexedDB and read back as a data URL", !!ref?.startsWith("idb:") && !!src?.startsWith("data:image/"));
  await p.getByRole("button", { name: "Open sheet" }).click();
  await p.getByRole("dialog").waitFor();
  await p.waitForTimeout(450);
  await shot(p, "19-sheet");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(100);
  check("sheet closes on Escape", (await p.getByRole("dialog").count()) === 0);
  await shot(p, "20-components", true);
  await c.close();
}

await browser.close();
console.log(`\n${passed} checks passed, ${problems.length} problems`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length === 0 ? 0 : 1);
