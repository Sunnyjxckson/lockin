// Screenshots of Today and Money in every look, for the eye. Run it against
// the dev server or a production build:
//
//   node scripts/look.mjs http://localhost:3000            every state below
//   node scripts/look.mjs http://localhost:3000 /body /progress
//       only those paths, in the default look, high contrast and under two
//       board palettes, on a day with data. Use this while restyling a screen.
//
// It writes .shots/redesign-<state>-<screen>.png at 390 x 844 (and a full page
// copy with "-full"). The clock is pinned to Thursday Oct 8, 2026, 8:30 AM in
// New York: day 4 of the seeded challenge.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const paths = args.filter((a) => a.startsWith("/"));
const shots = new URL("../.shots/", import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const PREFIX = "lockin:v1:";
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: "America/New_York" };
const NOW = "2026-10-08T12:30:00Z";
const TODAY = "2026-10-08";

const PALETTES = {
  forest: { base: "dark", palette: { background: "#0b1410", accent: "#7ad6a8" } },
  sand: { base: "dark", palette: { background: "#f3ead8", text: "#3b3226", accent: "#b4532a" } },
};

const browser = await chromium.launch();
const errors = [];

async function open() {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} (${page.url()})`));
  page.on("pageerror", (e) => errors.push(`${e.message} (${page.url()})`));
  await page.clock.install({ time: new Date(NOW) });
  await page.goto(`${base}/today`);
  await page.getByText("Create a passcode").waitFor();
  for (const d of "1379") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByText("Enter it again").waitFor();
  for (const d of "1379") await page.getByRole("button", { name: d, exact: true }).click();
  await page.locator("[data-today]").waitFor();
  return { ctx, page };
}

/** Change the device store, then load a path. `edit` runs in the page with (prefix, today). */
async function store(page, edit, arg) {
  await page.evaluate(
    ([prefix, today, fn, a]) => {
      const read = (t) => JSON.parse(localStorage.getItem(prefix + t) ?? "[]");
      const write = (t, rows) => localStorage.setItem(prefix + t, JSON.stringify(rows));
      new Function("read", "write", "today", "arg", `(${fn})(read, write, today, arg)`)(read, write, today, a);
    },
    [PREFIX, TODAY, edit.toString(), arg ?? null],
  );
}

async function go(page, path) {
  await page.goto(`${base}${path}`);
  await page.locator("main").first().waitFor();
  await page.waitForTimeout(900);
}

async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}redesign-${name}.png` });
  await page.screenshot({ path: `${shots}redesign-${name}-full.png`, fullPage: true });
  console.log(`  .shots/redesign-${name}.png`);
}

// ---------- edits to the store ----------

function fillDay(read, write, today, how) {
  const items = read("checklist_item").filter((i) => i.active && !i.archived);
  const at = `${today}T09:41:00.000Z`;
  const values = how === "full" ? { calories: 2000, protein: 190, earned: 140 } : { calories: 1240, protein: 112, earned: 40 };
  const ticked = how === "full" ? null : new Set(["wake", "workout", "core", "vice_smoking", "vice_drinking", "vice_masturbation"]);
  const logs = read("day_log").filter((l) => l.date !== today);
  for (const i of items) {
    if (i.cadence !== "daily") continue;
    const number = i.key in values;
    if (!number && ticked && !ticked.has(i.key)) continue;
    logs.push({ id: `look-${i.id}`, created_at: at, date: today, item_id: i.id, value: number ? values[i.key] : null, checked: true, text: i.key === "business" ? "Emailed the cohort lead" : null, completed_at: at, slips: 0 });
  }
  write("day_log", logs);
  const earned = how === "full" ? [["DoorDash", 80, 3.5], ["Uber Eats", 60, 2.5]] : [["DoorDash", 40, 2]];
  const before = [
    ["Uber Eats", 62, 3.1, -1],
    ["Instacart", 38, 2.5, -2],
  ];
  const day = (n) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  write("earning", [
    ...earned.map(([app, amount, hours], n) => ({ id: `look-e${n}`, created_at: at, date: today, amount, app, hours, screenshot_url: null })),
    ...before.map(([app, amount, hours, n]) => ({ id: `look-b${n}`, created_at: `${day(n)}T20:00:00.000Z`, date: day(n), amount, app, hours, screenshot_url: null })),
  ]);
}

function setTheme(read, write, today, theme) {
  const rows = read("theme").map((r) => ({ ...r, active: false }));
  if (theme) rows.push({ id: `look-${Date.now()}`, created_at: new Date().toJSON(), name: null, base: theme.base, palette: theme.palette ?? null, accent: theme.palette?.accent ?? null, board_id: null, active: true });
  write("theme", rows);
  localStorage.removeItem("lockin:pref:theme");
}

function endChallenge(read, write, today) {
  write("challenge", read("challenge").map((c) => (c.status === "active" ? { ...c, status: "ended", ended_on: today } : c)));
}

function slip(read, write, today) {
  const smoke = read("checklist_item").find((i) => i.key === "vice_smoking");
  write("day_log", read("day_log").map((l) => (l.date === today && l.item_id === smoke.id ? { ...l, slips: 1 } : l)));
  write("vice_slip", [...read("vice_slip"), { id: "look-slip", created_at: `${today}T09:00:00.000Z`, item_id: smoke.id, date: today, time: "05:00", trigger: "stressed", amount: null }]);
}

// ---------- the walk ----------

const { ctx, page } = await open();

if (paths.length > 0) {
  await store(page, fillDay, "half");
  for (const [look, theme] of [["default", null], ["contrast", { base: "contrast" }], ...Object.entries(PALETTES)]) {
    await store(page, setTheme, theme);
    for (const path of paths) {
      await go(page, path);
      await shot(page, `${look}${path.replace(/\//g, "-")}`);
    }
  }
} else {
  console.log("Challenge mode, default look");
  await go(page, "/today");
  await shot(page, "empty-today");
  await go(page, "/money");
  await shot(page, "empty-money");

  await store(page, fillDay, "half");
  await go(page, "/today");
  await shot(page, "half-today");
  await go(page, "/money");
  await shot(page, "half-money");

  await store(page, slip);
  await go(page, "/today");
  await shot(page, "slip-today");

  await store(page, fillDay, "full");
  await go(page, "/today");
  await shot(page, "full-today");
  await go(page, "/money");
  await shot(page, "full-money");

  await store(page, fillDay, "half");
  for (const [look, theme] of [["contrast", { base: "contrast" }], ...Object.entries(PALETTES)]) {
    console.log(look);
    await store(page, setTheme, theme);
    await go(page, "/today");
    await shot(page, `${look}-today`);
    await go(page, "/money");
    await shot(page, `${look}-money`);
  }
  await store(page, setTheme, null);

  console.log("Ongoing mode");
  await store(page, endChallenge);
  await go(page, "/today");
  await shot(page, "ongoing-today");
  await go(page, "/money");
  await shot(page, "ongoing-money");

  console.log("The other screens, as they stand");
  for (const path of ["/schedule", "/body", "/progress", "/settings", "/coach", "/vices", "/focus", "/meals", "/boards"]) {
    await go(page, path);
    await shot(page, `other${path.replace(/\//g, "-")}`);
  }
}

await ctx.close();
await browser.close();
if (errors.length > 0) {
  console.log(`\n${errors.length} console errors`);
  for (const e of [...new Set(errors)]) console.log(`  - ${e}`);
  process.exit(1);
}
