#!/usr/bin/env node
// Build the app data files from verified picks. Only picks that pass verify are emitted.
//
// Usage: node scripts/quotes/build.mjs [--out dir]
// Writes <writer>.json, <writer>.context.json and index.json (default dir: scripts/quotes/out/).
// Also emits the manual "laws" writer from manual/laws.json, last.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HERE } from './net.mjs';
import { writers, verifyPick, listPickFiles, readPicks, loadWork } from './lib.mjs';
import { THEMES, MOMENTS } from './vocab.mjs';

const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const outDir = path.resolve(oi >= 0 ? argv[oi + 1] : path.join(HERE, 'out'));

let meta = { writers: {}, works: {} };
const metaFile = path.join(HERE, 'meta.json');
if (fs.existsSync(metaFile)) meta = { writers: {}, works: {}, ...JSON.parse(fs.readFileSync(metaFile, 'utf8')) };

// Replace em/en dashes (and double hyphens) so the app never shows them.
function noDashes(s) {
  const re = /\s*(?:[\u2014\u2013]+-*|-+[\u2014\u2013]+|--+)\s*/g;
  return s.replace(re, (m, offset, str) => {
    const before = str.slice(0, offset).replace(/\s+$/, '');
    const after = str.slice(offset + m.length);
    if (!before) return '';
    if (!after.trim()) return '';
    if (/[,;:.?!]$/.test(before)) return ' ';
    return ', ';
  });
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function tokens(norm) {
  return new Set(norm.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean));
}

function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

function contextFor(seg, start, end) {
  const CAP = 1200;
  const text = seg.text;
  // Paragraph boundaries in the original text.
  const paras = [];
  let pos = 0;
  for (const p of text.split('\n\n')) {
    paras.push({ s: pos, e: pos + p.length });
    pos += p.length + 2;
  }
  const pi = paras.findIndex((p) => start >= p.s && start < p.e + 1);
  const idx = pi < 0 ? 0 : pi;
  let lo = Math.max(0, idx - 1);
  let hi = Math.min(paras.length - 1, idx + 1);
  const len = () => paras[hi].e - paras[lo].s;
  // Drop neighbours (farthest from the quote first) until it fits.
  while (len() > CAP && (lo < idx || hi > idx)) {
    const loLen = idx - lo > 0 ? paras[lo].e - paras[lo].s : -1;
    const hiLen = hi - idx > 0 ? paras[hi].e - paras[hi].s : -1;
    if (loLen >= hiLen) lo++;
    else hi--;
  }
  let s = paras[lo].s;
  let e = paras[hi].e;
  if (e - s > CAP) {
    // The quote paragraph alone is too long: window around the quote, snapped to sentence edges.
    const pad = Math.max(0, Math.floor((CAP - (end - start)) / 2));
    let ws = Math.max(s, start - pad);
    let we = Math.min(e, end + pad);
    if (ws > s) {
      const k = text.slice(ws, start).search(/[.?!]["'”’)]*\s+[A-Z"“]/);
      if (k >= 0) ws = ws + k + text.slice(ws + k).search(/\s/) + 1;
      else {
        const sp = text.indexOf(' ', ws);
        if (sp >= 0 && sp < start) ws = sp + 1;
      }
    }
    if (we < e) {
      const tail = text.slice(end, we);
      const k = Math.max(tail.lastIndexOf('. '), tail.lastIndexOf('? '), tail.lastIndexOf('! '));
      if (k >= 0) we = end + k + 1;
      else {
        const sp = text.lastIndexOf(' ', we);
        if (sp > end) we = sp;
      }
    }
    s = ws;
    e = we;
  }
  return noDashes(text.slice(s, e).replace(/[ \t]+\n/g, '\n'));
}

const files = listPickFiles(undefined, undefined);
const byWriter = new Map();
let failedPicks = 0;
let totalPicks = 0;
for (const { writer, file } of files) {
  const { picks, error } = readPicks(file);
  const rel = path.relative(process.cwd(), file);
  if (error) {
    console.log(`skip ${rel}: ${error}`);
    continue;
  }
  picks.forEach((pick, i) => {
    totalPicks++;
    const r = verifyPick(writer, pick);
    if (!r.ok) {
      failedPicks++;
      console.log(`skip ${rel} #${i + 1}: ${r.errors[0]}`);
      return;
    }
    if (!byWriter.has(writer)) byWriter.set(writer, []);
    byWriter.get(writer).push({ pick, m: r.match });
  });
}

fs.mkdirSync(outDir, { recursive: true });
const index = { total: 0, writers: [] };
let dropped = 0;

for (const w of writers) {
  const items = byWriter.get(w.slug);
  if (!items || !items.length) continue;
  const workOrder = new Map(w.works.map((x, i) => [x.slug, i]));
  items.sort(
    (a, b) =>
      workOrder.get(a.m.work) - workOrder.get(b.m.work) || a.m.segIndex - b.m.segIndex || a.m.start - b.m.start,
  );
  // Dedup in source order, keeping the first.
  const kept = [];
  for (const it of items) {
    const tk = tokens(it.m.norm);
    let why = null;
    for (const k of kept) {
      const sameSeg = k.m.work === it.m.work && k.m.segIndex === it.m.segIndex;
      if (k.m.norm === it.m.norm) why = 'exact duplicate';
      else if (sameSeg && (k.m.norm.includes(it.m.norm) || it.m.norm.includes(k.m.norm))) why = 'contained in another quote in the same segment';
      else if (sameSeg && it.m.start < k.m.end && k.m.start < it.m.end) why = 'overlaps another quote in the same segment';
      else if (!sameSeg && jaccard(tk, k.tk) >= 0.85) why = 'near duplicate of a quote in another segment';
      if (why) {
        console.log(`drop ${w.slug} ${it.m.work} / ${it.m.location}: "${it.m.text.slice(0, 50).replace(/\n/g, ' ')}..." (${why}; kept ${k.m.location})`);
        dropped++;
        break;
      }
    }
    if (!why) kept.push({ ...it, tk });
  }

  const quotes = [];
  const context = {};
  const ids = new Set();
  const counts = new Map();
  for (const it of kept) {
    const doc = loadWork(w.slug, it.m.work);
    const seg = doc.segments[it.m.segIndex];
    const hash = crypto.createHash('sha1').update(it.m.norm).digest('hex').slice(0, 6);
    let id = `${w.slug}-${it.m.work}-${slugify(seg.location)}-${hash}`;
    for (let n = 2; ids.has(id); n++) id = `${w.slug}-${it.m.work}-${slugify(seg.location)}-${hash}-${n}`;
    ids.add(id);
    const text = noDashes(it.m.text);
    quotes.push({
      id,
      text,
      work: it.m.work,
      location: seg.location,
      plain: it.pick.plain.trim(),
      themes: it.pick.themes,
      moments: it.pick.moments,
    });
    context[id] = contextFor(seg, it.m.start, it.m.end);
    counts.set(it.m.work, (counts.get(it.m.work) || 0) + 1);
  }

  const wm = meta.writers[w.slug] || {};
  const usedWorks = w.works.filter((x) => counts.has(x.slug));
  const outDoc = {
    writer: { slug: w.slug, name: w.name, years: w.years, bio: wm.bio || '' },
    works: usedWorks.map((x) => ({
      slug: x.slug,
      title: x.title,
      translator: x.translator,
      year: x.year,
      source_url: x.source_url,
      note: (meta.works[`${w.slug}/${x.slug}`] || {}).note || '',
    })),
    quotes,
  };
  const dashCheck = JSON.stringify([outDoc, context]);
  if (/[\u2014\u2013]/.test(dashCheck)) throw new Error(`em or en dash left in ${w.slug} output`);
  fs.writeFileSync(path.join(outDir, `${w.slug}.json`), JSON.stringify(outDoc, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, `${w.slug}.context.json`), JSON.stringify(context, null, 2) + '\n');
  index.total += quotes.length;
  index.writers.push({
    slug: w.slug,
    name: w.name,
    count: quotes.length,
    works: usedWorks.map((x) => ({ slug: x.slug, title: x.title, count: counts.get(x.slug) })),
  });
}
// Manual section: named laws and maxims have no single source text, so they come from manual/laws.json
// (hand-checked against a cited source) and are emitted as one more writer after the manifest order.
function loadLaws() {
  const file = path.join(HERE, 'manual', 'laws.json');
  if (!fs.existsSync(file)) return null;
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('manual/laws.json must be an array');
  const dash = /[—–]/;
  const seenIds = new Set();
  const quotes = [];
  const context = {};
  rows.forEach((r, i) => {
    const label = `manual/laws.json #${i + 1} (${r && r.name})`;
    const bad = (why) => { throw new Error(`${label}: ${why}`); };
    for (const k of ['name', 'text', 'by', 'year', 'source', 'source_url', 'plain']) {
      if (typeof r[k] !== 'string' || !r[k].trim()) bad(`missing or empty "${k}"`);
      if (dash.test(r[k])) bad(`em or en dash in "${k}"`);
    }
    if (r.origin !== undefined && (typeof r.origin !== 'string' || !r.origin.trim() || dash.test(r.origin))) bad('"origin" must be a non-empty string without em or en dashes');
    if (!/^https:\/\//.test(r.source_url)) bad('"source_url" must be an https URL');
    if (r.text.length > 320) bad(`"text" is ${r.text.length} characters, a law is a sentence or two`);
    if (r.plain.length > 140) bad(`"plain" is ${r.plain.length} characters, max 140`);
    for (const [k, vocab] of [['themes', THEMES], ['moments', MOMENTS]]) {
      if (!Array.isArray(r[k]) || r[k].length < 1 || r[k].length > 3) bad(`"${k}" needs 1 to 3 values`);
      for (const v of r[k]) if (!vocab.includes(v)) bad(`"${k}" value "${v}" is not in vocab.mjs`);
    }
    const id = `laws-${slugify(r.name.replace(/['’]/g, ''))}`;
    if (seenIds.has(id)) bad(`duplicate id ${id}`);
    seenIds.add(id);
    quotes.push({
      id,
      text: r.text.trim(),
      work: 'laws',
      location: r.name.trim(),
      plain: r.plain.trim(),
      themes: r.themes,
      moments: r.moments,
      by: r.by.trim(),
      year: r.year.trim(),
      source: r.source.trim(),
      source_url: r.source_url.trim(),
    });
    if (r.origin) context[id] = r.origin.trim();
  });
  const wm = meta.writers.laws || {};
  const doc = {
    writer: { slug: 'laws', name: 'Laws and maxims', years: '', bio: wm.bio || 'Named laws, razors and maxims, each checked against a cited source.' },
    works: [{ slug: 'laws', title: 'Laws and maxims', translator: '', year: '', source_url: '', note: (meta.works['laws/laws'] || {}).note || '' }],
    quotes,
  };
  return { doc, context };
}

const laws = loadLaws();
if (laws) {
  const dashCheck = JSON.stringify([laws.doc, laws.context]);
  if (/[—–]/.test(dashCheck)) throw new Error('em or en dash left in laws output');
  fs.writeFileSync(path.join(outDir, 'laws.json'), JSON.stringify(laws.doc, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'laws.context.json'), JSON.stringify(laws.context, null, 2) + '\n');
  index.total += laws.doc.quotes.length;
  index.writers.push({
    slug: 'laws',
    name: 'Laws and maxims',
    count: laws.doc.quotes.length,
    works: [{ slug: 'laws', title: 'Laws and maxims', count: laws.doc.quotes.length }],
  });
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(
  `\n${totalPicks} picks read, ${failedPicks} failed verification (skipped), ${dropped} dropped as duplicates, ${index.total} quotes written to ${path.relative(process.cwd(), outDir) || outDir}`,
);
