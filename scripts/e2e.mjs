// Full walkthrough in headless Chromium at phone size (390 x 844), meant for
// the production build with an empty .env:
//
//   npm run build && npm run start -- -p 3210
//   node scripts/e2e.mjs http://localhost:3210
//
// It covers every screen and the flows that cross features, with the clock
// pinned to the first challenge's dates: the day to day flows, upgrading a
// version 1 device store, ending, starting, restarting and finishing a
// challenge with the ongoing history left alone, ongoing mode, and themes
// with a contrast check. Then scripts/e2e-features.mjs walks boards, meals
// and the focus timer and the places they meet the rest of the app.
// Screenshots land in .shots/final3-*.png, and scripts/contact.mjs lays the
// main screens out on one sheet.
//
//   node scripts/e2e.mjs http://localhost:3210 --features   runs only that last part.
// Any failed check, console error or page error makes it exit non-zero.

import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { contactSheet } from "./contact.mjs";
import { runFeatures } from "./e2e-features.mjs";

const base = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const CORE = !process.argv.includes("--features");
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
  await todayReady(page);
}

// Today opens on a greeting, with the date and the day count on the line under it.
const todayReady = (page) => page.locator("[data-today]").waitFor();
const onDay = (page, text) => page.locator("[data-day-line]").filter({ hasText: `${text}.` }).waitFor();
const isDay = (page, text) => page.locator("[data-day-line]").filter({ hasText: `${text}.` }).isVisible();
const onDate = (page, date) => page.locator(`[data-today="${date}"]`).waitFor();
/** The strip of earlier days is folded under the date line until it is asked for. */
async function openStrip(page) {
  if ((await page.getByRole("tablist").count()) === 0) await page.locator("[data-day-line]").click();
  await page.getByRole("tablist").waitFor();
}
const row = (page, name) => page.getByRole("checkbox", { name, exact: false });
const dialog = (page) => page.getByRole("dialog");
const nav = (page) => page.getByRole("navigation", { name: "Main" });
const done = (page, n, of = 12) => page.getByText(`${n} of ${of}`, { exact: true }).first().waitFor();
const count = async (page) => ((await page.locator("[data-count]").textContent()) ?? "").trim();

/** Every screenshot is .shots/final3-<name>.png. A prefix other than the default names a group, as final3-<group>-<name>. */
async function shot(page, name, fullPage = false, prefix = "final-") {
  await page.waitForTimeout(350);
  const group = prefix === "final-" ? "" : prefix.replace(/^v2-/, "");
  await page.screenshot({ path: `${shots}final3-${group}${name}.png`, fullPage });
}

// ---------- device store ----------

const PREFIX = "lockin:v1:";
/** Tables that hold what the user logged or set up. A challenge starting, ending or restarting must not change them. */
const HISTORY = ["day_log", "earning", "meal", "saved_meal", "set_log", "vice_slip", "body_log", "schedule_block", "checklist_item", "target_version", "workout", "schedule_template"];

/** The raw stored JSON of each table, by table name. */
function readTables(page, tables) {
  return page.evaluate(([prefix, names]) => Object.fromEntries(names.map((t) => [t, localStorage.getItem(prefix + t) ?? "[]"])), [PREFIX, tables]);
}

function rows(page, table) {
  return page.evaluate(([prefix, t]) => JSON.parse(localStorage.getItem(prefix + t) ?? "[]"), [PREFIX, table]);
}

function sameTables(a, b) {
  return Object.keys(a).filter((t) => a[t] !== b[t]);
}

// ---------- contrast ----------

/**
 * Every piece of text on screen against the background actually behind it,
 * by the WCAG formula. See-through fills are blended down to the page color,
 * the page is taken at the brightest point of each light behind it as well as
 * plain, and a gradient fill is measured at every one of its color stops.
 * The worst of those is the ratio that counts.
 * Text inside something dimmed on purpose (a disabled control, a future day)
 * is left out. Returns the pairs that fall short.
 */
function contrastFailures(page, min) {
  return page.evaluate((minRatio) => {
    const parse = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (m) {
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
      }
      const s = /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/.exec(c);
      if (s) return [Number(s[1]) * 255, Number(s[2]) * 255, Number(s[3]) * 255, s[4] === undefined ? 1 : Number(s[4])];
      return null;
    };
    const lum = ([r, g, b]) => {
      const f = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
    const page = parse(getComputedStyle(document.body).backgroundColor) ?? [0, 0, 0, 1];
    // The page is not one color: three fixed lights sit behind everything, so
    // any text can end up over the brightest point of any of them. Each
    // candidate ground is the page there.
    const root = getComputedStyle(document.documentElement);
    const lights = ["--glow-1", "--glow-2", "--glow-3"].map((v) => parse(root.getPropertyValue(v))).filter((c) => c && c[3] > 0);
    const pages = [[page[0], page[1], page[2]], ...lights.map((l) => over(l, [page[0], page[1], page[2], 1]))];
    // Every color stop of a gradient fill (glass, the done gradient), in order.
    const stops = (image) => {
      if (!image || !image.includes("gradient")) return [];
      const out = [];
      const re = /rgba?\([^)]+\)|color\(srgb [^)]+\)/g;
      for (let m = re.exec(image); m; m = re.exec(image)) {
        const c = parse(m[0]);
        if (c) out.push(c);
      }
      return out;
    };
    /** The grounds an element's text can sit on: one per page ground, per gradient stop above it. */
    const backgroundsOf = (el) => {
      const layers = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const st = getComputedStyle(n);
        const c = parse(st.backgroundColor);
        const g = stops(st.backgroundImage);
        layers.push({ color: c && c[3] > 0 ? c : null, stops: g });
        if ((c && c[3] >= 1) || g.some((x) => x[3] >= 1)) break;
      }
      layers.reverse();
      let grounds = pages.map((p) => [...p]);
      for (const layer of layers) {
        if (layer.color) grounds = grounds.map((g) => over(layer.color, [...g, 1]));
        if (layer.stops.length > 0) grounds = grounds.flatMap((g) => layer.stops.map((s) => over(s, [...g, 1])));
        // Keep the two extremes: they are the hardest for dark and for light text.
        if (grounds.length > 2) {
          const sorted = grounds.map((g) => [lum(g), g]).sort((a, b) => a[0] - b[0]);
          grounds = [sorted[0][1], sorted[sorted.length - 1][1]];
        }
      }
      return grounds;
    };
    const dimmed = (el) => {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        if (Number(getComputedStyle(n).opacity) < 1 || n.disabled || n.getAttribute("aria-disabled") === "true") return true;
      }
      return false;
    };
    const out = [];
    let checked = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim();
      const el = node.parentElement;
      if (!text || !el || el.closest("script,style,noscript")) continue;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (box.width === 0 || box.height === 0 || style.visibility === "hidden" || style.display === "none" || dimmed(el)) continue;
      const fg = parse(style.color);
      if (!fg) continue;
      let ratio = Infinity;
      for (const bg of backgroundsOf(el)) {
        const a = lum(over(fg, [...bg, 1]));
        const b = lum(bg);
        ratio = Math.min(ratio, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
      }
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      checked += 1;
      if (ratio < (large ? 3 : minRatio)) out.push(`"${text.slice(0, 28)}" ${ratio.toFixed(2)}`);
    }
    return { checked, failed: out };
  }, min);
}

async function checkContrast(page, name, min) {
  // Colors ease from one theme to the next. Measure once they have landed.
  await page.waitForTimeout(450);
  const { checked, failed } = await contrastFailures(page, min);
  check(`${name}: all ${checked} pieces of text hold ${min} to 1`, checked > 8 && failed.length === 0, failed.slice(0, 6).join(", "));
}

function rootVar(page, name) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
}

/** Today's header has three ways out. Everything else is behind More. */
async function openMore(page, name) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await dialog(page).waitFor();
  if (name) await dialog(page).getByRole("link", { name }).click();
}

async function setBaseTheme(page, name) {
  await page.goto(`${base}/settings`);
  await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
  const radio = page.getByRole("radio", { name, exact: true });
  if ((await radio.getAttribute("aria-checked")) !== "true") {
    await radio.click();
    await page.getByText(`${name} is on`).waitFor();
  }
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
  if (tab === "Today") await todayReady(page);
  else await page.getByRole("heading", { name: tab, level: 1 }).waitFor();
}

async function closeSheet(page) {
  await page.keyboard.press("Escape");
  await dialog(page).waitFor({ state: "detached" });
}

const browser = await chromium.launch();

if (CORE) {

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
check("nothing of the app shows while locked", (await page.locator("[data-today], [data-count]").count()) === 0);
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
check("Today opens on a greeting by time of day, with the date and day 1 of 30 under it", (await page.getByRole("heading", { level: 1 }).innerText()).replace(/\s+/g, " ") === "Good morning, Sunny." && (await page.locator("[data-day-line]").innerText()).trim() === "Monday, October 5. Day 1 of 30.");
{
  const tracks = page.getByRole("group", { name: "The day in four tracks" }).getByRole("button");
  check("the day is summed up in four tracks: Body, Money, Mind, Clean", (await tracks.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim().toLowerCase()).join(" | ") === "0/6 body | $0 money | 0/2 mind | 0d clean", (await tracks.allInnerTexts()).join(" | "));
  check("the checklist is twelve tiles, each at least 44px to tap", (await page.locator("section[aria-label='Checklist'] .grid > *").count()) === 12 && (await page.locator("section[aria-label='Checklist'] .grid > *").evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 44 && e.getBoundingClientRect().width >= 44))));
}
const nowCard = page.getByRole("link", { name: "Open plan" });
const brief = (p) => p.getByRole("button", { name: /^Morning brief/ });
check("Now is Wake and Next is the workout at 5:50 AM", /Wake/.test(await nowCard.innerText()) && /Lift \+ core/.test(await nowCard.innerText()));
await brief(page).waitFor();
{
  const b = await brief(page).boundingBox();
  check("the morning brief is one folded line on Today, above Now and Next", (await brief(page).getAttribute("aria-expanded")) === "false" && b.height <= 48 && b.y < (await nowCard.boundingBox()).y && /\S/.test(await page.locator("[data-brief-line]").innerText()), JSON.stringify(b));
  // The approved first screen at 390 x 844: greeting, Now, the four tracks, then tiles clear of the tab bar.
  const bar = await nav(page).locator("ul").boundingBox();
  const tiles = await page.locator("section[aria-label='Checklist'] .grid > *").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  const tracksBox = await page.getByRole("group", { name: "The day in four tracks" }).boundingBox();
  check("the first screen holds the greeting, Now, the four tracks and two full rows of tiles above the tab bar", (await nowCard.boundingBox()).y < 320 && tracksBox.y + tracksBox.height < 520 && tiles.filter((y) => y <= bar.y).length >= 6, `now ${(await nowCard.boundingBox()).y}, tracks ${tracksBox.y}, tiles above the bar ${tiles.filter((y) => y <= bar.y).length}`);
}
check("the tab bar has five tabs and Today is lit", (await nav(page).getByRole("link").count()) === 5 && (await activeTab(page)) === "Today");
check("the day strip is folded away until the date line is tapped", (await page.getByRole("tablist").count()) === 0);
await openStrip(page);
check("the day strip shows the 30 challenge days", (await page.getByRole("tablist", { name: "Challenge days" }).getByRole("tab").count()) === 30);
await page.locator("[data-day-line]").click();
check("the workout is shown in full", (await page.getByRole("listitem").count()) >= 4);
await page.waitForTimeout(600);
const cls = await page.evaluate(() => window.__cls);
check("Today paints without layout shift", cls < 0.02, `cls ${cls}`);
await noOverflow(page, "Today");
await shot(page, "02-today-start");
await shot(page, "03-today-start-full", true);

// Open the brief in place: the first paragraph and a way to the coach. Then fold it again.
await brief(page).click();
check("a tap opens the brief in place, with a link to the coach", (await brief(page).getAttribute("aria-expanded")) === "true" && (await page.locator("#coach-brief p").count()) === 1 && (await page.locator("#coach-brief").getByRole("link", { name: /Read the rest|Open coach/ }).count()) === 1);
await shot(page, "03b-today-brief-open");
await brief(page).click();
check("the brief folds back to one line", (await brief(page).getAttribute("aria-expanded")) === "false" && (await page.locator("#coach-brief").count()) === 0);

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

await page.getByRole("button", { name: /Business move: not done/ }).click();
await dialog(page).getByText("Write what you did. Then it counts.").waitFor();
check("business move needs text before the tick", (await dialog(page).getByRole("button", { name: "Done" }).isDisabled()) && (await count(page)) === "3 of 12");
await dialog(page).getByRole("textbox", { name: /Business move/ }).fill("Emailed the cohort lead");
await dialog(page).getByRole("button", { name: "Done" }).click();
await dialog(page).waitFor({ state: "detached" });
await done(page, 4);
check("the business tile shows what was written", (await page.getByRole("button", { name: /Business move: done/ }).innerText()).includes("Emailed the cohort lead"));

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
await page.getByRole("link", { name: "No smoking: slip logged, not clean today. Open" }).getByText("Not clean").waitFor();
await done(page, 11);
check("Today: the slip makes No smoking not done, though it was ticked", (await row(page, "No smoking").count()) === 0);
await page.evaluate(() => window.scrollTo(0, 0));
await shot(page, "12-today-after-slip", true);

await openTab(page, "Record");
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
await todayReady(page);
await done(page, 12);
check("removing the slip makes the day clean again on Today", (await row(page, "No smoking").getAttribute("aria-checked")) === "true");

// ---------- Progress: the full day ----------
console.log("Progress");
await openTab(page, "Record");
await page.getByText("Streaks").first().waitFor();
check("Progress: day 1 is full once every daily item is done", /full|locked/i.test((await cell1.getAttribute("aria-label")) ?? ""), (await cell1.getAttribute("aria-label")) ?? "");
check("Progress: one day locked in", /1\s*Locked in/i.test((await page.locator("main").innerText()).replace(/\s+/g, " ")));
await shot(page, "15-progress", true);
await cell1.click();
await dialog(page).waitFor();
await shot(page, "16-progress-day-sheet");
await dialog(page).getByRole("link", { name: /Today|Open|Edit/ }).first().click();
await onDay(page, "Day 1 of 30");
check("the day sheet links to Today on that date", page.url().endsWith("/today"));

await page.goto(`${base}/progress`);
await page.getByRole("link", { name: /Share/ }).click();
await page.getByRole("heading", { name: "Share card", level: 1 }).waitFor();
await page.getByRole("button", { name: /Save image/ }).waitFor();
check("Share card opens, keeps Record lit and has a way back", (await activeTab(page)) === "Record" && (await page.getByRole("link", { name: "Back" }).count()) === 1);
await page.waitForTimeout(600);
await shot(page, "17-share-card", true);
{
  // Save image: the card comes out as a real PNG file.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Save image/ }).click()]);
  const file = `${shots}final3-17b-share-card-export.png`;
  await download.saveAs(file);
  const bytes = readFileSync(file);
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  check("Save image exports the share card as a PNG", png && /\.png$/.test(download.suggestedFilename()) && width >= 1000 && height >= 1000 && bytes.length > 20_000, `${download.suggestedFilename()} ${width}x${height}, ${bytes.length} bytes`);
  // The card is drawn in the look that is on: its corner is the page color, not white or empty.
  const corner = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    return [...g.getImageData(img.width - 6, img.height - 6, 1, 1).data];
  }, `data:image/png;base64,${bytes.toString("base64")}`);
  check("the exported card is painted, in the dark look", corner[3] === 255 && corner[0] < 60 && corner[1] < 60 && corner[2] < 70, corner.join(","));
}
await page.getByRole("link", { name: "Back" }).click();
await page.getByRole("heading", { name: "Record", level: 1 }).waitFor();

// ---------- Schedule: edit a block, Now and Next follow ----------
console.log("Schedule and Today");
await openTab(page, "Plan");
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

// ---------- Plan: the timeline by touch ----------
console.log("Plan: errand, touch drag, resize, tap a gap");
{
  const block = (name) => page.locator(`[data-block][data-name="${name}"]`).first();
  const label = async (name) => (await block(name).getAttribute("aria-label")) ?? "";
  const morning = async () => Object.fromEntries(await page.locator("[data-block]").evaluateAll((els) => els.map((e) => [e.dataset.name, e.getAttribute("aria-label")])));
  // Real touch input through the browser, so the timeline sees pointer events of type touch.
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const centerOf = async (locator) => {
    await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(250);
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
  };
  const slide = async (x, y, dy, steps = 8) => {
    for (let i = 1; i <= steps; i += 1) {
      await touch("touchMove", x, y + (dy * i) / steps);
      await page.waitForTimeout(30);
    }
  };

  // The 9:00 errand, on Thursday, when the morning runs up to a 10:00 class:
  // the flexible block in its way is cut short, fixed ones stay put.
  await page.getByRole("tab", { name: "Thu 8", exact: true }).click();
  await page.getByText("Thursday, Oct 8").first().waitFor();
  await block("Home, shower, eat").waitFor();
  const before = await morning();
  const errand = page.locator('[data-block][data-name="Clock-in errand"]');
  await page.getByRole("switch", { name: "9:00 clock-in errand" }).click();
  await errand.waitFor();
  await page.waitForTimeout(1200);
  const withErrand = await morning();
  const shifted = Object.keys(before).filter((n) => withErrand[n] !== before[n]);
  check(
    "the errand toggle puts a fixed hour at 9:00 AM and the flexible morning block gives way to it",
    /^Clock-in errand, 9:00 AM to 10:00 AM, fixed/.test(withErrand["Clock-in errand"] ?? "") && shifted.includes("Home, shower, eat") && / to 9:00 AM/.test(withErrand["Home, shower, eat"]) && withErrand.Class === before.Class && withErrand["Lift + core"] === before["Lift + core"],
    JSON.stringify({ errand: withErrand["Clock-in errand"], shifted: shifted.map((n) => `${before[n]} -> ${withErrand[n]}`) }),
  );
  check("the errand row shows its hour", /9:00 AM to 10:00 AM/.test(await page.locator("main").innerText()));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "18b-plan-errand", true);
  await page.getByRole("switch", { name: "9:00 clock-in errand" }).click();
  await errand.waitFor({ state: "detached" });
  await page.waitForTimeout(1200);
  const restored = await morning();
  check("switching the errand off puts the morning back", JSON.stringify(restored) === JSON.stringify(before), JSON.stringify(Object.keys(before).filter((n) => restored[n] !== before[n]).map((n) => `${before[n]} -> ${restored[n]}`)));
  await page.getByRole("tab", { name: "Mon 5, today", exact: true }).click();
  await block("Lift heavy").waitFor();

  // A quick swipe over a block scrolls the page and moves nothing.
  {
    const { x, y } = await centerOf(block("Basketball"));
    const was = await label("Basketball");
    await touch("touchStart", x, y);
    await slide(x, y, -70, 5);
    await touch("touchEnd", x, y - 70);
    await page.waitForTimeout(300);
    check("a swipe across a block is a scroll, not a drag", (await label("Basketball")) === was && (await dialog(page).count()) === 0, await label("Basketball"));
  }

  // Hold, then drag: the block moves by the distance dragged, snapped to 5 minutes. 1.3px is a minute.
  {
    const { x, y } = await centerOf(block("Basketball"));
    check("Basketball starts at 5:00 PM", /^Basketball, 5:00 PM to 7:00 PM/.test(await label("Basketball")), await label("Basketball"));
    await touch("touchStart", x, y);
    await page.waitForTimeout(420);
    await slide(x, y, -39);
    await shot(page, "18c-plan-dragging");
    await touch("touchEnd", x, y - 39);
    await page.waitForFunction(() => /4:30 PM to 6:30 PM/.test(document.querySelector('[data-block][data-name="Basketball"]')?.getAttribute("aria-label") ?? ""), null, { timeout: 5000 }).catch(() => null);
    check("touch: hold and drag moves a block half an hour earlier", /^Basketball, 4:30 PM to 6:30 PM/.test(await label("Basketball")), await label("Basketball"));
    check("the drag did not open the block", (await dialog(page).count()) === 0);
  }

  // The grip at the bottom edge resizes without a hold.
  {
    const grip = page.locator(`[data-grip="${await block("Basketball").getAttribute("data-block")}"]`);
    const { x, y } = await centerOf(grip);
    await touch("touchStart", x, y);
    await page.waitForTimeout(80);
    await slide(x, y, 26);
    await touch("touchEnd", x, y + 26);
    await page.waitForFunction(() => /4:30 PM to 6:50 PM/.test(document.querySelector('[data-block][data-name="Basketball"]')?.getAttribute("aria-label") ?? ""), null, { timeout: 5000 }).catch(() => null);
    check("touch: dragging the grip makes the block 20 minutes longer", /^Basketball, 4:30 PM to 6:50 PM/.test(await label("Basketball")), await label("Basketball"));
    await page.waitForTimeout(400);
    await noOverflow(page, "Plan after a drag");
  }

  // Tap an empty spot: the add sheet opens on that time.
  {
    const basket = await centerOf(block("Basketball"));
    // 4:00 PM to 4:30 PM is open now. Aim at 4:15 PM, a quarter hour above the block's top edge.
    const tapY = basket.box.y - 15 * 1.3 + 4;
    await page.touchscreen.tap(basket.x, tapY);
    await dialog(page).waitFor();
    const slot = await dialog(page).locator("[data-slot]").innerText();
    check("tapping a gap opens Add to the day at the time tapped", (await dialog(page).getByRole("heading", { name: "Add to the day" }).count()) === 1 && /4:(00|15) PM/.test(slot), slot.replace(/\s+/g, " "));
    await dialog(page).getByRole("textbox", { name: "What" }).fill("Call home");
    await dialog(page).getByRole("button", { name: "15m" }).click();
    await shot(page, "20b-add-at-gap-sheet");
    await dialog(page).getByRole("button", { name: /^Add at 4:(00|15) PM/ }).click();
    await dialog(page).waitFor({ state: "detached" });
    await block("Call home").waitFor();
    check("the new block lands in the gap", /^Call home, 4:(00|15) PM to 4:(15|30) PM/.test(await label("Call home")), await label("Call home"));
  }
  await cdp.detach();
}

await openTab(page, "Today");
check("Today's Next follows the edited block", /Lift heavy/.test(await nowCard.innerText()), await nowCard.innerText());
await page.goto(`${base}/settings/schedule`);
await page.getByRole("heading", { name: "Weekly plan", level: 1 }).waitFor();
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
await todayReady(page);

// ---------- Reminders ----------
console.log("Reminders");
await page.goto(`${base}/reminders`);
await page.getByRole("heading", { name: "Reminders", level: 1 }).waitFor();
await page.getByText("VAPID_PRIVATE_KEY").waitFor();
check("Reminders shows the not set up state and what to set", (await page.getByText("VAPID_PRIVATE_KEY").count()) === 1 && (await page.getByText("CRON_SECRET").count()) === 1);
check("Reminders has a way back", (await page.getByRole("link", { name: "Back" }).count()) === 1);
await noOverflow(page, "Reminders");
await shot(page, "26-reminders", true);

// ---------- More: the screens that are not tabs ----------
console.log("More, Boards, Meals, Focus");
await page.goto(`${base}/today`);
await todayReady(page);
await openMore(page);
check("More lists Focus, Meals, Boards and Settings", (await dialog(page).getByRole("link").allInnerTexts()).map((t) => t.split("\n")[0]).join(",") === "Focus,Meals,Boards,Settings");
await shot(page, "26b-more-sheet");
await closeSheet(page);
for (const [name, lit, backTo] of [
  ["Boards", "Today", null],
  ["Meals", "Body", "Body"],
  ["Focus", "Plan", "Plan"],
]) {
  await page.goto(`${base}/today`);
  await todayReady(page);
  await openMore(page, name);
  await page.getByRole("heading", { name, level: 1 }).waitFor();
  check(`${name} opens from More, lights ${lit} and has an empty state`, (await activeTab(page)) === lit && (await (name === "Meals" ? page.getByText(/^No plan for the week of/) : page.getByRole("heading", { level: 3 })).count()) === 1);
  await noOverflow(page, name);
  await page.getByRole("link", { name: "Back" }).click();
  if (backTo) await page.getByRole("heading", { name: backTo, level: 1 }).waitFor();
  else await todayReady(page);
}
await page.goto(`${base}/body`);
await page.getByRole("link", { name: "Meal plan" }).click();
await page.getByRole("heading", { name: "Meals", level: 1 }).waitFor();
await page.goto(`${base}/schedule`);
await page.getByRole("link", { name: "Focus timer" }).click();
await page.getByRole("heading", { name: "Focus", level: 1 }).waitFor();
check("Meals opens from Body and Focus opens from Plan", true);

// ---------- Settings ----------
console.log("Settings");
await page.goto(`${base}/today`);
await openMore(page, "Settings");
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

// =====================================================================
// Upgrading a version 1 device store. Version 1 had one fixed challenge row
// and no ongoing history fields. Put the store back in that shape, with
// everything logged above still in it, and load the app again.
// =====================================================================
console.log("Upgrade from a version 1 store");
{
  const NEW_TABLES = ["mood_log", "motivation", "board", "board_item", "theme", "recipe", "meal_plan", "grocery_item", "expense", "focus_session"];
  await page.evaluate(
    ([prefix, newTables]) => {
      const strip = (table, fields) => {
        const list = JSON.parse(localStorage.getItem(prefix + table) ?? "[]");
        for (const r of list) for (const f of fields) delete r[f];
        localStorage.setItem(prefix + table, JSON.stringify(list));
      };
      strip("challenge", ["name", "status", "ended_on", "rules", "restart_of"]);
      strip("app_settings", ["history_start", "daily_floor", "weekly_food_budget", "food_likes", "food_dislikes", "focus_goal_minutes"]);
      for (const t of newTables) localStorage.removeItem(prefix + t);
    },
    [PREFIX, NEW_TABLES],
  );
  const v1 = await readTables(page, HISTORY);
  const oldChallenge = (await rows(page, "challenge"))[0];
  check("the store is in the version 1 shape", !("status" in oldChallenge) && !("history_start" in (await rows(page, "app_settings"))[0]) && (await rows(page, "day_log")).length >= 13);

  await page.goto(`${base}/today`);
  await onDay(page, "Day 1 of 30");
  await done(page, 12);
  const c = (await rows(page, "challenge"))[0];
  check(
    "the one challenge became the first, active challenge with its dates and money target",
    (await rows(page, "challenge")).length === 1 && c.id === oldChallenge.id && c.status === "active" && c.start_date === "2026-10-05" && c.length_days === 30 && c.money_target === 1000 && c.ended_on === null && c.rules === null,
    JSON.stringify(c),
  );
  const settings = (await rows(page, "app_settings"))[0];
  check("the ongoing history opens on the challenge start, with the floor carried over", settings.history_start === "2026-10-05" && settings.daily_floor === 100, JSON.stringify(settings));
  const changed = sameTables(v1, await readTables(page, HISTORY));
  check("nothing that was logged or set up changed in the upgrade", changed.length === 0, changed.join(", "));
  check("Today still shows day 1 fully done after the upgrade", (await count(page)) === "12 of 12" && (await row(page, "Workout").getAttribute("aria-checked")) === "true");
  await openTab(page, "Money");
  await page.getByText("$860 to go by Oct 14").waitFor();
  check("Money still shows the running total after the upgrade", true);
  await openTab(page, "Record");
  await page.getByText("Streaks").first().waitFor();
  check("Progress still shows day 1 as full after the upgrade", /full|locked/i.test((await page.getByRole("button", { name: /^Day 1\b/ }).first().getAttribute("aria-label")) ?? ""));
  await page.reload();
  await page.getByText("Streaks").first().waitFor();
  check("a second load changes nothing more", sameTables(v1, await readTables(page, HISTORY)).length === 0 && JSON.stringify((await rows(page, "challenge"))[0]) === JSON.stringify(c));
}

const state = await ctx.storageState();
await ctx.close();

// =====================================================================
// Day 2. Tuesday Oct 6, 9:00 AM New York.
// =====================================================================
console.log("Day 2: yesterday keeps its score");
async function at(iso, path = "/today", from = state, date = null) {
  const c = await browser.newContext({ ...device, storageState: from });
  const p = await c.newPage();
  watch(p);
  await p.clock.install({ time: new Date(iso) });
  await p.goto(`${base}${path}`);
  await (date ? onDate(p, date) : todayReady(p));
  return { c, p };
}

let s = await at("2026-10-06T13:00:00Z");
check("the next morning opens on day 2, empty", await isDay(s.p, "Day 2 of 30"));
await done(s.p, 0);
await brief(s.p).waitFor();
check("a new day has its own brief, folded to one line", (await brief(s.p).getAttribute("aria-expanded")) === "false" && /\S/.test(await s.p.locator("[data-brief-line]").innerText()));
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
await onDay(s.p, "Day 1 of 30");
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
await openStrip(s.p);
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
// Ongoing mode and challenges. Thursday Oct 8, 9:00 AM: day 4 of the first
// challenge. Day 1 is fully logged, days 2 and 3 are empty.
// =====================================================================
console.log("Ending a challenge: ongoing history unchanged");
const main1 = (p) => p.locator("main").innerText().then((t) => t.replace(/\s+/g, " "));
async function openChallengeSettings(p) {
  await p.goto(`${base}/settings/challenge`);
  await p.getByRole("heading", { name: "Challenge", level: 1 }).waitFor();
  await p.getByText("Past challenges").waitFor();
}

s = await at("2026-10-08T13:00:00Z");
check("day 4 of the first challenge", await isDay(s.p, "Day 4 of 30"));
await setBaseTheme(s.p, "Aubergine");
// Both modes in both base themes, for the eye: .shots/v2-core-*.png
async function looks(p, mode) {
  for (const [theme, label, min] of [
    ["dark", "Aubergine", 4.5],
    ["contrast", "High contrast", 7],
  ]) {
    await setBaseTheme(p, label);
    await p.evaluate(() => window.scrollTo(0, 0));
    await checkContrast(p, `Settings, ${mode}, ${label}`, min);
    await shot(p, `${mode}-${theme}-settings`, false, "v2-core-");
    await p.goto(`${base}/today`);
    await todayReady(p);
    await p.locator("[data-count]").waitFor();
    await p.waitForTimeout(400);
    await checkContrast(p, `Today, ${mode}, ${label}`, min);
    await noOverflow(p, `Today, ${mode}, ${label}`);
    await shot(p, `${mode}-${theme}-today`, false, "v2-core-");
    await shot(p, `${mode}-${theme}-today-full`, true, "v2-core-");
    await p.goto(`${base}/progress`);
    await p.getByText("Streaks").first().waitFor();
    await p.waitForTimeout(300);
    await checkContrast(p, `Progress, ${mode}, ${label}`, min);
    await noOverflow(p, `Progress, ${mode}, ${label}`);
    await shot(p, `${mode}-${theme}-progress`, false, "v2-core-");
    await shot(p, `${mode}-${theme}-progress-full`, true, "v2-core-");
  }
  await setBaseTheme(p, "Aubergine");
}
await looks(s.p, "challenge");

await openChallengeSettings(s.p);
check("Settings shows the running challenge and its day", /Running 30 day lock in Day 4 of 30/i.test(await main1(s.p)), (await main1(s.p)).slice(0, 200));
await shot(s.p, "challenge-settings", true, "v2-core-");
const beforeEnd = await readTables(s.p, HISTORY);
const logsBefore = (await rows(s.p, "day_log")).length;
await s.p.getByRole("button", { name: "End early" }).click();
await dialog(s.p).waitFor();
await shot(s.p, "challenge-end-sheet", false, "v2-core-");
await dialog(s.p).getByRole("button", { name: "End challenge" }).click();
await s.p.getByText("Challenge ended. Ongoing from here.").waitFor();
await dialog(s.p).waitFor({ state: "detached" });
await s.p.locator("main").getByText("Ongoing", { exact: true }).first().waitFor();
let all = await rows(s.p, "challenge");
check("the challenge is kept as ended on the day it stopped", all.length === 1 && all[0].status === "ended" && all[0].ended_on === "2026-10-08", JSON.stringify(all));
let diff = sameTables(beforeEnd, await readTables(s.p, HISTORY));
check("ending the challenge changed nothing in the ongoing history", diff.length === 0 && (await rows(s.p, "day_log")).length === logsBefore, diff.join(", "));
check("Settings is in ongoing mode and lists the past challenge", /Mode Ongoing/i.test(await main1(s.p)) && /30 day lock in Ended early · Oct 5 to Oct 8/.test(await main1(s.p)), (await main1(s.p)).slice(0, 300));
await shot(s.p, "ongoing-challenge-settings", true, "v2-core-");

// ---------- ongoing mode on Today ----------
console.log("Ongoing mode: Today, Money, Progress, Coach");
await s.p.goto(`${base}/today`);
await onDate(s.p, "2026-10-08");
check("Today shows a plain date in ongoing mode, with no day count", (await s.p.getByText(/Day \d+ of \d+/).count()) === 0 && (await s.p.locator("[data-day-line]").innerText()).startsWith("Thursday, October 8."));
check("Today shows consistency over time beside the date", (await s.p.locator("[data-consistency]").innerText()) === "1 of 3 days locked in", await s.p.locator("[data-consistency]").innerText());
await openStrip(s.p);
check("the strip shows recent days by date", (await s.p.getByRole("tablist", { name: "Recent days" }).getByRole("tab").count()) === 4);
await row(s.p, "Workout").click();
await done(s.p, 1);
check("the checklist works the same with no challenge", (await row(s.p, "Workout").getAttribute("aria-checked")) === "true");
await row(s.p, "Workout").click();
await done(s.p, 0);
await s.p.getByRole("tab", { name: "Monday, Oct 5", exact: true }).click();
await onDate(s.p, "2026-10-05");
await done(s.p, 12);
check("a day logged during the challenge is still there, fully done, under its date", (await row(s.p, "Workout").getAttribute("aria-checked")) === "true");
await s.p.getByRole("button", { name: "Back to today" }).or(s.p.getByRole("tab", { name: "Thursday, Oct 8, today", exact: true })).first().click();
await onDate(s.p, "2026-10-08");

await openTab(s.p, "Money");
await s.p.getByText("Earned so far").waitFor();
check("Money keeps the earnings and the floor, with no target outside a challenge", /Earned so far \$ ?140/i.test(await main1(s.p)) && /Floor \$100/i.test(await main1(s.p)) && (await s.p.getByRole("link", { name: "Start a challenge" }).count()) === 1, (await main1(s.p)).slice(0, 200));
await shot(s.p, "ongoing-money", true, "v2-core-");

await openTab(s.p, "Record");
await s.p.getByText("Over time").waitFor();
let text = await main1(s.p);
check("Progress leads with full days over the days so far, not a day count", /Days locked in 1 of 3/i.test(text) && !/Day \d+ of 30/i.test(text), text.slice(0, 200));
check("Progress has no challenge grid in ongoing mode", (await s.p.getByRole("button", { name: /^Day \d+,/ }).count()) === 0);
const oct5 = s.p.getByRole("button", { name: /^Monday, Oct 5, locked in, 12 of 12 done/ });
check("the week view shows Oct 5 as full", (await oct5.count()) === 1);
await s.p.getByRole("radio", { name: "Months" }).click();
await s.p.getByText("October 2026").waitFor();
check("the month view shows the month as a calendar", (await s.p.getByRole("button", { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), Oct \d+/ }).count()) === 31);
await s.p.getByRole("button", { name: /^Monday, Oct 5, locked in/ }).click();
await dialog(s.p).waitFor();
check("a day opens by its date", (await dialog(s.p).getByRole("heading", { name: "Oct 5" }).count()) === 1);
await closeSheet(s.p);
await s.p.getByRole("button", { name: /30 day lock in/ }).click();
await s.p.getByRole("heading", { name: "30 day lock in", level: 1 }).waitFor();
text = await main1(s.p);
check("a past challenge can be opened with its grid and record", /Past challenge · Ended early/i.test(text) && /Oct 5 to Oct 8, 4 of 30 days/.test(text) && /full|locked/i.test((await s.p.getByRole("button", { name: /^Day 1\b/ }).first().getAttribute("aria-label")) ?? ""), text.slice(0, 200));
await shot(s.p, "past-challenge", true, "v2-core-");
await s.p.getByRole("button", { name: "Back to record" }).click();
await s.p.getByRole("heading", { name: "Record", level: 1 }).waitFor();
await s.p.getByRole("link", { name: /Share/ }).click();
await s.p.getByRole("button", { name: /Save image/ }).waitFor();
await s.p.waitForTimeout(600);
check("the share card speaks of days locked in, not a day count", /1 of 3 days locked in/.test((await s.p.getByRole("img", { name: /Progress card/ }).getAttribute("aria-label")) ?? ""), (await s.p.getByRole("img", { name: /Progress card/ }).getAttribute("aria-label")) ?? "");
await shot(s.p, "ongoing-share-card", true, "v2-core-");
await s.p.goto(`${base}/coach`);
await s.p.getByRole("heading", { name: "Coach", level: 1 }).waitFor();
await s.p.getByText("Written by rules from your data").first().waitFor();
text = await main1(s.p);
check("the coach writes a brief in ongoing mode and has no day count", /Thursday, Oct 8/.test(text) && !/Day \d+ of \d+/i.test(text), text.slice(0, 200));
await s.p.goto(`${base}/vices`);
await s.p.getByRole("heading", { name: "Vices", level: 1 }).waitFor();
await s.p.goto(`${base}/body`);
await s.p.getByRole("radio", { name: "Weight" }).click();
await s.p.getByText("182.4").first().waitFor();
await s.p.goto(`${base}/schedule`);
await s.p.getByRole("heading", { name: "Plan", level: 1 }).waitFor();
check("Vices, Body and Plan open in ongoing mode", !/Day \d+ of \d+/i.test(await main1(s.p)));

await looks(s.p, "ongoing");

// ---------- start a new challenge with its own rules ----------
console.log("Starting a new challenge");
await openChallengeSettings(s.p);
await s.p.getByRole("link", { name: "Start a challenge" }).click();
await s.p.getByRole("heading", { name: "New challenge", level: 1 }).waitFor();
check("a challenge cannot start without a name", await s.p.getByRole("button", { name: "Start challenge" }).isDisabled());
await s.p.getByRole("textbox", { name: "Name" }).fill("Strict diet");
await s.p.getByRole("radio", { name: "14", exact: true }).click();
await s.p.getByText("Ends Wednesday, Oct 21.").waitFor();
await s.p.getByRole("radio", { name: "Pick items" }).click();
check("picking items with none picked is refused", await s.p.getByRole("button", { name: "Start challenge" }).isDisabled());
await s.p.getByRole("checkbox", { name: "Calories", exact: true }).click();
await s.p.getByRole("textbox", { name: "Calories: from" }).fill("1500");
await s.p.getByRole("textbox", { name: "Calories: to" }).fill("1700");
await s.p.getByRole("checkbox", { name: "Workout", exact: true }).click();
await noOverflow(s.p, "New challenge");
await shot(s.p, "new-challenge", true, "v2-core-");
const beforeStart = await readTables(s.p, HISTORY);
await s.p.getByRole("button", { name: "Start challenge" }).click();
await onDay(s.p, "Day 1 of 14");
all = await rows(s.p, "challenge");
check("there are two challenges now, one ended and one active", all.length === 2 && all.filter((c) => c.status === "active").length === 1 && all.find((c) => c.status === "active").name === "Strict diet", JSON.stringify(all.map((c) => [c.name, c.status])));
diff = sameTables(beforeStart, await readTables(s.p, HISTORY));
check("starting a challenge changed nothing in the ongoing history", diff.length === 0, diff.join(", "));
check("Today counts the challenge's own items beside the whole checklist", /Strict diet: 0 of 2/.test(await main1(s.p)) && (await count(s.p)) === "0 of 12");
check("the challenge's calorie target is the one in force today", (await s.p.getByText("1,500 to 1,700").count()) === 1 && (await s.p.getByText("1,900 to 2,100").count()) === 0);
await row(s.p, "Workout").click();
await done(s.p, 1);
check("ticking a challenge item moves both counts", /Strict diet: 1 of 2/.test(await main1(s.p)));
await shot(s.p, "new-challenge-today", false, "v2-core-");
await s.p.goto(`${base}/today?date=2026-10-07`);
await onDate(s.p, "2026-10-07");
check("a day before the new challenge keeps a plain date and its own target", (await s.p.getByText("1,900 to 2,100").count()) === 1 && (await s.p.getByText("1,500 to 1,700").count()) === 0);
await s.p.goto(`${base}/progress`);
await s.p.getByText("Streaks").first().waitFor();
const newDay1 = s.p.getByRole("button", { name: /^Day 1,/ }).first();
check("Progress shows the new challenge's 14 day grid, scored by its two items", (await s.p.getByRole("button", { name: /^Day \d+,/ }).count()) === 14 && /partial, 1 of 2 done/.test((await newDay1.getAttribute("aria-label")) ?? ""), (await newDay1.getAttribute("aria-label")) ?? "");
text = await main1(s.p);
check("Progress keeps the ongoing view under the challenge, and the past challenge", /Ongoing Never resets/i.test(text) && /Over time/i.test(text) && /Past challenges/i.test(text));
await s.p.goto(`${base}/money`);
await s.p.getByText("This challenge has no money target.").waitFor();
check("a challenge without a money target shows the floor only", (await s.p.getByRole("button", { name: "Set a target" }).count()) === 1);
const afterStart = await s.c.storageState();
await s.c.close();

// ---------- restart ----------
console.log("Restarting a challenge");
s = await at("2026-10-09T13:00:00Z", "/today", afterStart);
check("the next morning is day 2 of the new challenge", await isDay(s.p, "Day 2 of 14"));
const beforeRestart = await readTables(s.p, HISTORY);
await openChallengeSettings(s.p);
await s.p.getByRole("button", { name: "Restart" }).click();
await dialog(s.p).waitFor();
await dialog(s.p).getByRole("button", { name: "Restart today" }).click();
await s.p.getByText("Restarted. Today is day 1.").waitFor();
await dialog(s.p).waitFor({ state: "detached" });
all = await rows(s.p, "challenge");
const active = all.find((c) => c.status === "active");
check(
  "the old run is kept as abandoned and the same challenge starts again today",
  all.length === 3 && all.filter((c) => c.status === "active").length === 1 && active.start_date === "2026-10-09" && active.name === "Strict diet" && active.length_days === 14 && Array.isArray(active.rules) && active.rules.length === 2 && all.some((c) => c.status === "abandoned" && c.ended_on === "2026-10-08" && c.id === active.restart_of),
  JSON.stringify(all.map((c) => [c.name, c.status, c.start_date, c.ended_on])),
);
diff = sameTables(beforeRestart, await readTables(s.p, HISTORY));
check("restarting changed nothing in the ongoing history", diff.length === 0, diff.join(", "));
check("Settings shows day 1 again and two past challenges", /Running Strict diet Day 1 of 14/i.test(await main1(s.p)) && /Restarted · Oct 8 to Oct 8/.test(await main1(s.p)) && /Ended early · Oct 5 to Oct 8/.test(await main1(s.p)), (await main1(s.p)).slice(0, 300));
await s.p.goto(`${base}/today`);
await onDay(s.p, "Day 1 of 14");
await openStrip(s.p);
check("Today is day 1 again, and yesterday is still on the strip to finish off", (await s.p.getByRole("tab", { name: "Thursday, Oct 8", exact: true }).count()) === 1);
await s.p.getByRole("tab", { name: "Thursday, Oct 8", exact: true }).click();
await onDate(s.p, "2026-10-08");
check("yesterday's tick survived the restart", (await row(s.p, "Workout").getAttribute("aria-checked")) === "true");
await s.p.goto(`${base}/progress`);
await s.p.getByText("Streaks").first().waitFor();
const workoutStreak = s.p.locator("li").filter({ hasText: /^Workout/ }).filter({ hasText: /days?/ }).first();
check("a streak runs across the restart: Workout is at 1 day from yesterday", /\b1\s*day\b/.test((await workoutStreak.innerText()).replace(/\s+/g, " ")), (await workoutStreak.innerText()).replace(/\s+/g, " "));
const afterRestart = await s.c.storageState();
await s.c.close();

// ---------- finishing: the challenge runs out ----------
console.log("Finishing a challenge");
s = await at("2026-10-23T13:00:00Z", "/today", afterRestart, "2026-10-23");
await s.p.getByText("Challenge done").waitFor();
check("once the last day has passed Today is back to a plain date and offers to close the challenge", /Strict diet: all 14 days are behind you/.test(await main1(s.p)));
await shot(s.p, "challenge-done-card", false, "v2-core-");
const beforeFinish = await readTables(s.p, HISTORY);
await s.p.getByRole("button", { name: "Finish challenge" }).click();
await s.p.getByRole("dialog", { name: "Challenge complete" }).waitFor();
check("finishing shows the finish moment with the challenge's name and record", /Strict diet/.test(await dialog(s.p).innerText()) && /of 14 days locked in/.test(await dialog(s.p).innerText()), await dialog(s.p).innerText());
await s.p.waitForTimeout(1200);
await shot(s.p, "challenge-complete-moment", false, "v2-core-");
await s.p.getByRole("button", { name: "Keep going" }).click();
await s.p.getByRole("dialog", { name: "Challenge complete" }).waitFor({ state: "detached" });
all = await rows(s.p, "challenge");
check("the challenge is marked succeeded on its last day", all.filter((c) => c.status === "active").length === 0 && all.some((c) => c.status === "succeeded" && c.ended_on === "2026-10-22"), JSON.stringify(all.map((c) => [c.status, c.ended_on])));
diff = sameTables(beforeFinish, await readTables(s.p, HISTORY));
check("finishing changed nothing in the ongoing history", diff.length === 0, diff.join(", "));
check("the done card is gone and Today carries on in ongoing mode", (await s.p.getByText("Challenge done").count()) === 0 && (await s.p.locator("[data-consistency]").count()) === 1);
await openChallengeSettings(s.p);
check("Settings lists three past challenges, one finished", /Finished · Oct 9 to Oct 22/.test(await main1(s.p)) && (await s.p.getByRole("button", { name: /^Run .* again$/ }).count()) === 3);
await s.p.getByRole("button", { name: "Run 30 day lock in again" }).click();
await dialog(s.p).getByRole("button", { name: "Start today" }).click();
await s.p.getByText("Started. Today is day 1.").waitFor();
await dialog(s.p).waitFor({ state: "detached" });
check("a past challenge can be run again from the list", /Running 30 day lock in Day 1 of 30/i.test(await main1(s.p)), (await main1(s.p)).slice(0, 200));
await s.c.close();

// =====================================================================
// Themes: switching the base, the saved theme before first paint, and a
// palette on top.
// =====================================================================
console.log("Themes");
s = await at("2026-10-06T13:00:00Z");
await s.p.goto(`${base}/settings`);
await s.p.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
check("the default theme is Aubergine", (await rootVar(s.p, "--bg")) === "#0d0b10" && (await s.p.getByRole("radio", { name: "Aubergine" }).getAttribute("aria-checked")) === "true");
await s.p.getByRole("radio", { name: "High contrast" }).click();
await s.p.getByText("High contrast is on").waitFor();
check("switching the base theme repaints the page from data", (await rootVar(s.p, "--bg")) === "#000000" && (await rootVar(s.p, "--ink")) === "#ffffff" && (await s.p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(0, 0, 0)");
check("the choice is stored in the theme table", (await rows(s.p, "theme")).filter((r) => r.active && r.base === "contrast").length === 1, JSON.stringify(await rows(s.p, "theme")));
await s.p.reload();
await s.p.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
check("the theme survives a reload", (await rootVar(s.p, "--bg")) === "#000000" && (await s.p.getByRole("radio", { name: "High contrast" }).getAttribute("aria-checked")) === "true");
{
  // No scripts from the app at all: only the inline script in <head> can have set the theme.
  const bare = await s.c.newPage();
  await bare.route("**/_next/static/**/*.js", (r) => r.abort());
  await bare.goto(`${base}/today`, { waitUntil: "load" });
  const seen = await bare.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
    body: getComputedStyle(document.body).backgroundColor,
    theme: document.documentElement.dataset.theme,
  }));
  check("the saved theme is on the page before the app's scripts run, so there is no flash", seen.bg === "#000000" && seen.body === "rgb(0, 0, 0)" && seen.theme === "contrast", JSON.stringify(seen));
  await bare.close();
}

// A palette on top of the base, as a board will set it. Written as the theme
// row the boards screen will write, then read back by the app on load. The
// palette is deliberately bad: mid gray text on a light page, a pale accent.
await s.p.evaluate(
  ([prefix]) => {
    const rows = JSON.parse(localStorage.getItem(prefix + "theme") ?? "[]").map((r) => ({ ...r, active: false }));
    rows.push({ id: "from-board", created_at: new Date().toJSON(), name: "Sand", base: "dark", palette: { background: "#f3ead8", text: "#b9ad98", muted: "#d8cdb8", accent: "#f0d27a" }, accent: "#f0d27a", board_id: null, active: true });
    localStorage.setItem(prefix + "theme", JSON.stringify(rows));
  },
  [PREFIX],
);
await s.p.goto(`${base}/today`);
await todayReady(s.p);
await s.p.locator("[data-count]").waitFor();
await s.p.waitForTimeout(400);
check("a palette becomes the theme: the page takes its background", (await rootVar(s.p, "--bg")) === "#f3ead8" && (await s.p.evaluate(() => document.documentElement.style.colorScheme)) === "light", await rootVar(s.p, "--bg"));
check("unreadable palette colors are adjusted, not used as given", (await rootVar(s.p, "--ink")) !== "#b9ad98" && (await rootVar(s.p, "--accent")) !== "#f0d27a");
await checkContrast(s.p, "Today with a light palette", 4.5);
await shot(s.p, "palette-light-today", false, "v2-core-");
await s.p.goto(`${base}/progress`);
await s.p.getByText("Streaks").first().waitFor();
await checkContrast(s.p, "Progress with a light palette", 4.5);
await shot(s.p, "palette-light-progress", true, "v2-core-");
await s.p.goto(`${base}/settings`);
await s.p.getByText("Your palette is on top").waitFor();
await checkContrast(s.p, "Settings with a light palette", 4.5);
await shot(s.p, "palette-light-settings", true, "v2-core-");
await s.p.getByRole("button", { name: "Reset", exact: true }).click();
await s.p.getByText("Back to the base theme").waitFor();
check("reset drops the palette and goes back to the base", (await rootVar(s.p, "--bg")) === "#0d0b10" && (await s.p.getByText("Your palette is on top").count()) === 0);
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
  await onDay(p, "Day 3 of 30");
  await openStrip(p);
  await p.getByRole("tab", { name: "Day 1", exact: true }).click();
  await onDay(p, "Day 1 of 30");
  await row(p, "Up by 5:45").click();
  await done(p, 1);
  check("days before the install can be backfilled, and a backfilled wake counts on trust", true);
  await p.getByRole("tab", { name: "Day 3, today", exact: true }).click();
  await onDay(p, "Day 3 of 30");
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

}

await runFeatures({ browser, base, device, check, watch, shot, rows, dialog, nav, row, done, count, createPasscode, checkContrast, rootVar, noOverflow, openMore, closeSheet, PREFIX });

// The main screens on one sheet, from the screenshots just taken.
try {
  console.log(`Contact sheet: ${await contactSheet(browser)}`);
} catch (e) {
  check("the contact sheet is built", false, e.message);
}

await browser.close();
console.log(`\n${passed} checks passed, ${problems.length} problems`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length === 0 ? 0 : 1);
