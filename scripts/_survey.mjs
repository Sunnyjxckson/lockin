import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3210";
const out = new URL("../.shots/survey/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, timezoneId: "America/New_York" };
const browser = await chromium.launch();
const ctx = await browser.newContext(device);
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.clock.install({ time: new Date(process.argv[3] ?? "2026-10-06T14:10:00Z") });
await page.goto(`${base}/today`);
await page.getByText("Create a passcode").waitFor();
for (let i = 0; i < 2; i++) { for (const d of "1379") await page.getByRole("button", { name: d, exact: true }).click(); await page.waitForTimeout(300); }
await page.getByRole("heading", { name: /Day \d+/ }).waitFor();
const only = process.argv[4]?.split(",");
const routes = ["today", "schedule", "money", "body", "body/workout", "progress", "progress/card", "coach", "vices", "reminders", "settings", "settings/checklist", "settings/schedule", "settings/workouts", "settings/challenge", "settings/reminders"];
for (const r of routes) {
  if (only && !only.includes(r)) continue;
  await page.goto(`${base}/${r}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}${r.replace("/", "-")}.png`, fullPage: process.argv[5] !== "fold" });
}
await browser.close();
