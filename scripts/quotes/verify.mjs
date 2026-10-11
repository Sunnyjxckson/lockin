#!/usr/bin/env node
// Verify quote picks word for word against the segmented source texts.
//
// Usage: node scripts/quotes/verify.mjs [writer-slug] [file]
// Exits non-zero if any pick fails, so a picker can loop on it.

import path from 'node:path';
import { verifyPick, listPickFiles, readPicks, PICKS } from './lib.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let writerArg = args[0];
let fileArg = args[1];
// Allow "verify.mjs path/to/file.json" with a single argument that is a file.
if (writerArg && /\.json$/.test(writerArg) && !fileArg) {
  fileArg = writerArg;
  writerArg = undefined;
}

let files;
try {
  files = listPickFiles(writerArg, fileArg);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
if (!files.length) {
  console.log(`no pick files found under ${path.relative(process.cwd(), PICKS) || PICKS}`);
  process.exit(0);
}

const totals = new Map();
let failed = 0;
let passed = 0;
for (const { writer, file } of files) {
  const rel = path.relative(process.cwd(), file);
  const t = totals.get(writer) || { pass: 0, fail: 0, files: 0 };
  t.files++;
  totals.set(writer, t);
  const { picks, error } = readPicks(file);
  if (error) {
    console.log(`FAIL ${rel}: ${error}`);
    t.fail++;
    failed++;
    continue;
  }
  picks.forEach((pick, i) => {
    const r = verifyPick(writer, pick);
    if (r.ok) {
      t.pass++;
      passed++;
      return;
    }
    t.fail++;
    failed++;
    const head = String(pick && pick.text ? pick.text : '').replace(/\s+/g, ' ').slice(0, 60);
    console.log(`FAIL ${rel} #${i + 1} [${pick?.work} / ${pick?.location}] "${head}"`);
    for (const e of r.errors) console.log(`     - ${e}`);
  });
}
console.log('');
for (const [w, t] of totals) console.log(`${w}: ${t.pass} pass, ${t.fail} fail (${t.files} file${t.files === 1 ? '' : 's'})`);
console.log(`total: ${passed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
