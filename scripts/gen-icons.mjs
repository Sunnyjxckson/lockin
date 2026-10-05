// Draws the app icons into public/icons with headless Chromium.
// Run: node scripts/gen-icons.mjs
import { chromium } from "playwright";

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#09090a"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <circle cx="256" cy="256" r="150" fill="none" stroke="#262629" stroke-width="44"/>
    <path d="M256 106a150 150 0 1 1 -129.9 75" fill="none" stroke="#c8f73a" stroke-width="44" stroke-linecap="round"/>
  </g>
</svg>`;

const badge = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <path d="M48 14a34 34 0 1 1 -29.4 17" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
</svg>`;

const jobs = [
  ["icon-192.png", mark(0), 192, false],
  ["icon-512.png", mark(0), 512, false],
  ["icon-maskable-512.png", mark(0.22), 512, false],
  ["apple-touch-icon.png", mark(0.06), 180, false],
  ["badge-96.png", badge, 96, true],
];

const browser = await chromium.launch();
for (const [name, svg, size, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:${transparent ? "transparent" : "#09090a"}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: transparent });
  await page.close();
}
await browser.close();
console.log("icons written");
