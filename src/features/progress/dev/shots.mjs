// Dev only. Screenshots of the Progress screens at phone size, first on a
// fresh day 1 and then with demo data, plus the exported card PNGs.
//
//   node src/features/progress/dev/shots.mjs http://localhost:3104

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { fillDemo } from "./demo-data.mjs";

const base = process.argv[2] ?? "http://localhost:3104";
const out = new URL("../../../../.shots/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: "America/New_York", acceptDownloads: true };

const browser = await chromium.launch();
const ctx = await browser.newContext(device);
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

const tap = async (d) => page.getByRole("button", { name: d, exact: true }).click();
const shot = (name, fullPage = true) => page.screenshot({ path: `${out}progress-${name}.png`, fullPage });
const settle = () => page.waitForTimeout(900);

async function saveCard(name) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Save/ }).click()]);
  await dl.saveAs(`${out}progress-${name}.png`);
  console.log("card", name, dl.suggestedFilename());
}

await page.goto(`${base}/today`);
await page.getByText("Create a passcode").waitFor();
for (const d of "1379") await tap(d);
await page.getByText("Enter it again").waitFor();
for (const d of "1379") await tap(d);
await page.getByRole("heading", { name: /Day \d+/ }).waitFor();

// Day 1, nothing logged.
await page.goto(`${base}/progress`);
await page.getByRole("heading", { name: "Progress", level: 1 }).waitFor();
await settle();
await shot("01-day1-empty");
await page.goto(`${base}/progress/card`);
await settle();
await shot("02-card-day1");
await saveCard("card-export-day1");

// Two and a half weeks of mixed data.
console.log(await page.evaluate(fillDemo, { day: 17 }));
await page.goto(`${base}/progress`);
await page.getByRole("heading", { name: "Progress", level: 1 }).waitFor();
await settle();
await shot("03-filled");
await shot("04-filled-top", false);
await page.getByRole("button", { name: /^Day 6,/ }).click();
await settle();
await shot("05-day-sheet-partial", false);
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /^Day 9,/ }).click();
await settle();
await shot("06-day-sheet-missed", false);
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /^Day 17,/ }).click();
await settle();
await shot("07-day-sheet-today", false);
await page.keyboard.press("Escape");

await page.goto(`${base}/progress/card`);
await settle();
await shot("08-card");
await saveCard("card-export");
await page.getByRole("switch", { name: "Show first photo" }).click();
await settle();
await saveCard("card-export-one-photo");
await page.getByRole("switch", { name: "Show latest photo" }).click();
await settle();
await shot("09-card-photos");
await saveCard("card-export-photos");

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no console errors");
await browser.close();
