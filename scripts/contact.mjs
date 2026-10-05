// One image of the main screens side by side, for a look at the whole app at
// a glance: .shots/final3-contact.png. It lays out the phone size screenshots
// the walkthrough saved as .shots/final3-main-<name>.png, so run that first:
//
//   node scripts/e2e.mjs http://localhost:3210
//   node scripts/contact.mjs
//
// The walkthrough also calls this itself at the end of a full run.

import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const shots = new URL("../.shots/", import.meta.url).pathname;
const SCREENS = [
  ["lock", "Lock"],
  ["today", "Today"],
  ["plan", "Plan"],
  ["money", "Money"],
  ["body", "Body"],
  ["record", "Record"],
  ["coach", "Coach"],
  ["vices", "Vices"],
  ["meals", "Meals"],
  ["focus", "Focus"],
  ["boards", "Boards"],
  ["settings", "Settings"],
];

export async function contactSheet(browser) {
  const missing = SCREENS.filter(([name]) => !existsSync(`${shots}final3-main-${name}.png`)).map(([name]) => name);
  if (missing.length > 0) throw new Error(`No screenshot for: ${missing.join(", ")}. Run the walkthrough first.`);
  const own = !browser;
  const b = browser ?? (await chromium.launch());
  // Each screen at its real size, 390 x 844 CSS pixels, six to a row.
  const page = await b.newPage({ viewport: { width: 6 * 390 + 7 * 36, height: 2 * (844 + 64) + 3 * 36 }, deviceScaleFactor: 1 });
  const cells = SCREENS.map(([name, label]) => {
    const data = readFileSync(`${shots}final3-main-${name}.png`).toString("base64");
    return `<figure><figcaption>${label}</figcaption><img src="data:image/png;base64,${data}" width="390" height="844" alt="${label}"></figure>`;
  }).join("");
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; padding: 36px; background: #161517; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    main { display: grid; grid-template-columns: repeat(6, 390px); gap: 36px; }
    figure { margin: 0; }
    figcaption { height: 64px; display: flex; align-items: center; color: #f4efe8; font-size: 28px; letter-spacing: -0.01em; }
    img { display: block; border-radius: 28px; outline: 1px solid #2b2731; }
  </style></head><body><main>${cells}</main></body></html>`);
  await page.screenshot({ path: `${shots}final3-contact.png`, fullPage: true });
  await page.close();
  if (own) await b.close();
  return `${shots}final3-contact.png`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(await contactSheet());
}
