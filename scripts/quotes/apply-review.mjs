#!/usr/bin/env node
// Apply the second reader's review files (scripts/quotes/review/*.json) to the
// pick files. A drop removes the pick, a fix replaces its plain line or tags.
// Shakespeare keeps picks the reviewer only called plot-bound or flat: the
// well-known lines live there. Safety and duplicate drops always apply.
//
// Usage: node scripts/quotes/apply-review.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');
const ALWAYS = /contempt|death|suicide|self-harm|slur|racial|dup/i;

const writerOf = (name) => name.replace(/\.json$/, '').replace(/-[ab]$/, '');
let dropped = 0, fixed = 0, kept = 0, missed = 0;

for (const name of fs.readdirSync(path.join(here, 'review')).filter((f) => f.endsWith('.json')).sort()) {
  const writer = writerOf(name);
  const entries = JSON.parse(fs.readFileSync(path.join(here, 'review', name), 'utf8'));
  const byFile = new Map();
  for (const e of entries) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(e);
  }
  for (const [file, list] of byFile) {
    const p = path.join(here, 'picks', writer, file);
    let picks = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const e of list) {
      const start = e.text_start.trim();
      const i = picks.findIndex((q) => q.text.startsWith(start) || q.text.replace(/\s+/g, ' ').startsWith(start.replace(/\s+/g, ' ')));
      if (i < 0) { missed++; console.log(`no match: ${writer}/${file} ${start.slice(0, 50)}`); continue; }
      if (e.action === 'drop') {
        if (writer === 'shakespeare' && !ALWAYS.test(e.reason || '')) { kept++; continue; }
        picks.splice(i, 1); dropped++;
      } else if (e.action === 'fix') {
        for (const k of ['plain', 'themes', 'moments']) if (e[k] !== undefined) picks[i][k] = e[k];
        fixed++;
      }
    }
    if (!dry) fs.writeFileSync(p, JSON.stringify(picks, null, 2) + '\n');
  }
}
console.log(`dropped ${dropped}, fixed ${fixed}, kept against review ${kept}, unmatched ${missed}`);
