// Builds src/data/quotes-short.json: a small, bundled set of short quotes for
// the two places that cannot load the writer files. Philosophy drops (the
// notification job on the server picks from it, and so does the app) and the
// coach (candidate lines for a chat reply).
//
//   node scripts/quotes/short.mjs          write the file
//   node scripts/quotes/short.mjs --check  fail when the file is out of step with the writer files
//
// A quote is in when it is one line of at most 140 characters with no straight
// double quote (the coach sets a quote off in quote marks). Each writer gives
// at most PER_WRITER, spaced evenly through the writer's quotes. The laws are
// left out: they are sayings, and a drop is a quote from a writer.

import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../../src/data/quotes/", import.meta.url);
const out = new URL("../../src/data/quotes-short.json", import.meta.url);
const MAX_CHARS = 140;
const PER_WRITER = 70;

const index = JSON.parse(readFileSync(new URL("index.json", dir), "utf8"));

function build() {
  const names = {};
  const quotes = [];
  for (const w of index.writers) {
    if (w.slug === "laws") continue;
    const file = JSON.parse(readFileSync(new URL(`${w.slug}.json`, dir), "utf8"));
    names[w.slug] = w.name;
    const ok = file.quotes.filter((q) => q.text.length <= MAX_CHARS && !q.text.includes("\n") && !q.text.includes('"') && q.moments.length > 0);
    const take = Math.min(PER_WRITER, ok.length);
    for (let i = 0; i < take; i++) {
      const q = ok[Math.floor((i * ok.length) / take)];
      quotes.push({ id: q.id, w: w.slug, t: q.text, m: q.moments });
    }
  }
  return { names, quotes };
}

const next = build();
const json = JSON.stringify(next) + "\n";

if (process.argv.includes("--check")) {
  let have;
  try {
    have = readFileSync(out, "utf8");
  } catch {
    console.error("quotes-short.json is missing. Run node scripts/quotes/short.mjs");
    process.exit(1);
  }
  const bad = [];
  const pool = JSON.parse(have);
  for (const q of pool.quotes) {
    const file = JSON.parse(readFileSync(new URL(`${q.w}.json`, dir), "utf8"));
    const real = file.quotes.find((x) => x.id === q.id);
    if (!real || real.text !== q.t) bad.push(q.id);
  }
  if (bad.length) {
    console.error(`${bad.length} quotes in quotes-short.json no longer match the writer files: ${bad.slice(0, 5).join(", ")}`);
    process.exit(1);
  }
  console.log(`quotes-short.json: ${pool.quotes.length} quotes, all word for word from the writer files`);
} else {
  writeFileSync(out, json);
  const moments = {};
  for (const q of next.quotes) for (const m of q.m) moments[m] = (moments[m] ?? 0) + 1;
  console.log(`wrote ${next.quotes.length} quotes, ${(json.length / 1024).toFixed(0)} KB`, moments);
}
