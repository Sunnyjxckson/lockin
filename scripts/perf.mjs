// What the first load of Today costs on a phone. Run against the production
// build: node scripts/perf.mjs http://localhost:3210
//
// It loads /today cold on a throttled connection (about a mid 4G phone:
// 1.6 Mbps down, 150 ms latency, CPU slowed four times), creates a passcode,
// and reports: bytes of script, style and font over the wire, when the first
// text was painted and whether the app's typeface was ready by then, layout
// shift, and every element that uses a backdrop blur. It exits non-zero when
// a budget is broken. The walkthrough runs the same measure.

import { chromium } from "playwright";

export const BUDGET = {
  /** Script over the wire for the lock screen and Today together, in KB. */
  scriptKB: 340,
  styleKB: 30,
  fontKB: 60,
  /** Cumulative layout shift from the first paint to Today settled. */
  cls: 0.02,
};

export async function measureFirstLoad(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: "America/New_York" });
  await ctx.addInitScript(() => {
    window.__cls = 0;
    window.__firstText = null;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
    // The moment text first shows, and whether the typeface was there for it.
    const look = () => {
      if (window.__firstText) return;
      const body = document.body;
      if (body && body.innerText.trim().length > 0) {
        // next/font also registers a metric matched local fallback face. Only the real one counts.
        const faces = [...document.fonts].filter((f) => /grotesk/i.test(f.family) && !/fallback/i.test(f.family));
        window.__firstText = { at: Math.round(performance.now()), fontReady: faces.length > 0 && faces.every((f) => f.status === "loaded"), faces: faces.map((f) => `${f.family} ${f.status}`) };
        return;
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const types = new Map();
  const bytes = { Script: 0, Stylesheet: 0, Font: 0, Document: 0, Other: 0 };
  const files = [];
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, [e.type, e.response.url, e.response.headers["content-encoding"] ?? e.response.headers["Content-Encoding"] ?? "none"]));
  cdp.on("Network.loadingFinished", (e) => {
    const [type, url, enc] = types.get(e.requestId) ?? ["Other", "", "none"];
    const key = type in bytes ? type : "Other";
    bytes[key] += e.encodedDataLength;
    files.push({ type, kb: Math.round(e.encodedDataLength / 102.4) / 10, enc, url: url.replace(/^https?:\/\/[^/]+/, "") });
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-08T12:30:00Z") });
  const t0 = Date.now();
  await page.goto(`${base}/today`);
  await page.getByText("Create a passcode").waitFor();
  const lockAt = Date.now() - t0;
  for (const d of "13791379") {
    await page.getByRole("button", { name: d, exact: true }).click();
    if (d === "9") await page.waitForTimeout(350);
  }
  await page.locator("[data-today]").waitFor();
  await page.locator("[data-count]").waitFor();
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => ({
    cls: window.__cls,
    firstText: window.__firstText,
    blur: [...document.querySelectorAll("*")]
      .filter((el) => {
        const s = getComputedStyle(el);
        return (s.backdropFilter && s.backdropFilter !== "none") || (s.webkitBackdropFilter && s.webkitBackdropFilter !== "none");
      })
      .map((el) => `${el.tagName.toLowerCase()}${el.closest("nav[aria-label=Main]") ? " in the tab bar" : ""}`),
    filterBlur: [...document.querySelectorAll("*")].filter((el) => /blur\(/.test(getComputedStyle(el).filter)).length,
    fontPreloads: [...document.querySelectorAll('link[rel="preload"][as="font"]')].length,
    display: [...document.fonts].filter((f) => /grotesk/i.test(f.family) && !/fallback/i.test(f.family)).map((f) => f.display),
  }));
  await ctx.close();
  const kb = (n) => Math.round(n / 102.4) / 10;
  return {
    scriptKB: kb(bytes.Script),
    styleKB: kb(bytes.Stylesheet),
    fontKB: kb(bytes.Font),
    documentKB: kb(bytes.Document),
    lockScreenMs: lockAt,
    ...seen,
    errors,
    files: files.filter((f) => f.kb >= 1).sort((a, b) => b.kb - a.kb),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.argv[2] ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const r = await measureFirstLoad(browser, base);
  await browser.close();
  console.log(JSON.stringify(r, null, 2));
  const over = [
    r.scriptKB > BUDGET.scriptKB && `script ${r.scriptKB} KB over ${BUDGET.scriptKB}`,
    r.styleKB > BUDGET.styleKB && `style ${r.styleKB} KB over ${BUDGET.styleKB}`,
    r.fontKB > BUDGET.fontKB && `font ${r.fontKB} KB over ${BUDGET.fontKB}`,
    r.cls > BUDGET.cls && `layout shift ${r.cls}`,
    !r.firstText?.fontReady && "text was painted before the typeface was ready",
    r.blur.some((b) => !b.includes("tab bar")) && `backdrop blur outside the tab bar: ${r.blur.join(", ")}`,
  ].filter(Boolean);
  for (const o of over) console.log(`OVER BUDGET: ${o}`);
  process.exit(over.length === 0 ? 0 : 1);
}
