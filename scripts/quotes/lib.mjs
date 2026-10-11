// Shared logic for verify.mjs and build.mjs: text normalisation, work loading, pick verification.

import fs from 'node:fs';
import path from 'node:path';
import { HERE } from './net.mjs';
import { writers, findWriter } from './sources.mjs';
import { THEMES, MOMENTS } from './vocab.mjs';

export const TEXTS = path.join(HERE, 'texts');
export const PICKS = path.join(HERE, 'picks');

const PARA = '¶';
const DASH = '\u2014';
const isDashChar = (c) => c === '\u2014' || c === '\u2013' || c === '-';
const isWs = (c) => /\s/.test(c);

// Normalise for matching and keep a map from normalised index to original index.
// Allowed: whitespace collapse, curly vs straight quotes, dash variants, italic underscores.
export function normalizeWithMap(s) {
  const toks = [];
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '_') {
      i++;
      continue;
    }
    if (isWs(c)) {
      let j = i;
      let nl = 0;
      while (j < n && isWs(s[j])) {
        if (s[j] === '\n') nl++;
        j++;
      }
      toks.push([nl >= 2 ? PARA : ' ', i]);
      i = j;
      continue;
    }
    if (isDashChar(c)) {
      let j = i;
      let long = false;
      while (j < n && isDashChar(s[j])) {
        if (s[j] !== '-') long = true;
        j++;
      }
      const spaced = j - i === 1 && i > 0 && isWs(s[i - 1]) && j < n && isWs(s[j]);
      if (long || j - i >= 2 || spaced) toks.push([DASH, i]);
      else toks.push(['-', i]);
      i = j;
      continue;
    }
    let ch = c;
    if (c === '‘' || c === '’' || c === 'ʼ') ch = "'";
    else if (c === '“' || c === '”') ch = '"';
    toks.push([ch, i]);
    i++;
  }
  // Remove spaces next to dashes and paragraph marks, collapse runs, trim.
  const out = [];
  const map = [];
  for (const [ch, idx] of toks) {
    const last = out[out.length - 1];
    if (ch === ' ') {
      if (last === undefined || last === ' ' || last === DASH || last === PARA) continue;
    } else if (ch === DASH || ch === PARA) {
      if (last === ' ') {
        out.pop();
        map.pop();
      }
      if (ch === PARA && last === PARA) continue;
    }
    out.push(ch);
    map.push(idx);
  }
  if (out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
  }
  return { norm: out.join(''), map };
}

export const normText = (s) => normalizeWithMap(s).norm;

const workCache = new Map();

export function loadWork(writerSlug, workSlug) {
  const key = `${writerSlug}/${workSlug}`;
  if (workCache.has(key)) return workCache.get(key);
  const f = path.join(TEXTS, writerSlug, workSlug + '.json');
  if (!fs.existsSync(f)) {
    workCache.set(key, null);
    return null;
  }
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const meta = findWriter(writerSlug)?.works.find((w) => w.slug === workSlug);
  doc.verse = !!meta?.verse;
  doc.segments.forEach((s, i) => {
    s.index = i;
    let cache = null;
    Object.defineProperty(s, 'nm', {
      enumerable: false,
      get() {
        if (!cache) cache = normalizeWithMap(s.text);
        return cache;
      },
    });
  });
  workCache.set(key, doc);
  return doc;
}

export function workSlugs(writerSlug) {
  const w = findWriter(writerSlug);
  return w ? w.works.map((x) => x.slug) : [];
}

const ABBREV = new Set(['mr', 'mrs', 'dr', 'st', 'cf', 'etc', 'viz', 'vs', 'no', 'sr', 'jr', 'mt', 'ch', 'vol', 'p', 'pp', 'sc', 'lib', 'ib', 'ed']);

export function countSentences(norm) {
  let count = 0;
  const re = /[.?!]+["')\]]*(?=\s|$)/g;
  let m;
  while ((m = re.exec(norm))) {
    const before = norm.slice(0, m.index);
    const word = (/([A-Za-z]+)$/.exec(before) || [])[1] || '';
    const after = norm.slice(m.index + m[0].length).trimStart();
    if (m[0][0] === '.' && (word.length === 1 || ABBREV.has(word.toLowerCase())) && after) continue;
    count++;
  }
  return count;
}

function sentenceStartOK(before) {
  let b = before;
  for (let k = 0; k < 4; k++) {
    b = b.replace(/\s+$/, '');
    if (/["'(\[]$/.test(b)) b = b.slice(0, -1);
    else break;
  }
  b = b.replace(/\s+$/, '');
  return b === '' || b.endsWith(PARA) || /[.?!:;]$/.test(b) ? { ok: true, colon: /[:;]$/.test(b) } : { ok: false };
}

function snippet(s, at, len = 70) {
  return s.slice(Math.max(0, at), at + len).replace(/¶/g, ' | ');
}

// Explain where a quote stops matching the segment text.
function diagnose(segNorm, q) {
  for (const k of [40, 24, 14]) {
    const head = q.slice(0, k);
    const at = head.length >= 8 ? segNorm.indexOf(head) : -1;
    if (at >= 0) {
      let i = 0;
      while (i < q.length && segNorm[at + i] === q[i]) i++;
      const wordStart = Math.max(0, q.lastIndexOf(' ', i - 1) + 1);
      return `matches the source up to "${q.slice(Math.max(0, i - 25), i)}" then you wrote "${q.slice(i, i + 25)}" but the source has "${snippet(segNorm, at + i, 25)}"`;
    }
  }
  return null;
}

function listFound(doc, qn, exceptIndex) {
  const hits = [];
  for (const s of doc.segments) {
    if (s.index === exceptIndex) continue;
    if (s.nm.norm.includes(qn)) hits.push(s.location);
    if (hits.length >= 4) break;
  }
  return hits;
}

// Verify one pick. Returns { ok, errors, match } where match has canonical source text.
export function verifyPick(writerSlug, pick) {
  const errors = [];
  const writer = findWriter(writerSlug);
  if (!writer) return { ok: false, errors: [`unknown writer "${writerSlug}"`] };
  if (!pick || typeof pick !== 'object') return { ok: false, errors: ['pick is not an object'] };

  // Field validation first so the picker sees everything at once.
  if (typeof pick.plain !== 'string' || !pick.plain.trim()) errors.push('plain is missing');
  else {
    if (pick.plain.length > 140) errors.push(`plain is ${pick.plain.length} chars, max 140`);
    if (/[\u2014\u2013]/.test(pick.plain)) errors.push('plain contains an em or en dash');
  }
  const listCheck = (key, allowed) => {
    const v = pick[key];
    if (!Array.isArray(v) || v.length < 1 || v.length > 3) {
      errors.push(`${key} must be an array of 1 to 3 values`);
      return;
    }
    const bad = v.filter((x) => !allowed.includes(x));
    if (bad.length) errors.push(`${key} has values outside the fixed list: ${bad.join(', ')}`);
    if (new Set(v).size !== v.length) errors.push(`${key} has duplicate values`);
  };
  listCheck('themes', THEMES);
  listCheck('moments', MOMENTS);

  if (typeof pick.text !== 'string' || !pick.text.trim()) {
    errors.push('text is missing');
    return { ok: false, errors };
  }
  const known = workSlugs(writerSlug);
  if (typeof pick.work !== 'string' || !known.includes(pick.work)) {
    errors.push(`unknown work "${pick.work}" for ${writerSlug} (known: ${known.join(', ')})`);
    return { ok: false, errors };
  }
  const doc = loadWork(writerSlug, pick.work);
  if (!doc) {
    errors.push(`no segmented text for ${writerSlug}/${pick.work}; run fetch.mjs`);
    return { ok: false, errors };
  }
  const q = normText(pick.text);
  if (q.includes(PARA)) errors.push('quote spans more than one paragraph or speech; pick text from a single paragraph');

  const segIdx = doc.segments.findIndex((s) => s.location === pick.location);
  let seg = segIdx >= 0 ? doc.segments[segIdx] : null;
  let at = -1;
  if (!seg) {
    const elsewhere = listFound(doc, q, -1);
    errors.push(
      `location "${pick.location}" does not exist in ${pick.work}` +
        (elsewhere.length ? `; the text is in: ${elsewhere.join('; ')}` : ''),
    );
    return { ok: false, errors };
  }
  const sn = seg.nm.norm;
  const occ = [];
  for (let p = sn.indexOf(q); p >= 0 && q; p = sn.indexOf(q, p + 1)) occ.push(p);
  if (!occ.length) {
    const elsewhere = listFound(doc, q, seg.index);
    if (elsewhere.length) errors.push(`text is not in ${pick.location}; it is in: ${elsewhere.join('; ')}`);
    else {
      // Look in the other works by the same writer.
      const other = [];
      for (const ws of known) {
        if (ws === pick.work) continue;
        const d2 = loadWork(writerSlug, ws);
        if (!d2) continue;
        const hits = listFound(d2, q, -1);
        if (hits.length) other.push(`${ws}: ${hits[0]}`);
      }
      if (other.length) errors.push(`text is not in work ${pick.work}; it is in ${other.join('; ')}`);
      else {
        const why = diagnose(sn, q);
        errors.push('text does not appear word for word in the source' + (why ? '; ' + why : ''));
      }
    }
    return { ok: false, errors };
  }

  // Choose the first occurrence whose boundaries are acceptable, else report on the first.
  const orig = seg.text;
  const evalAt = (p) => {
    const errs = [];
    const endN = p + q.length;
    const startO = seg.nm.map[p];
    const endO = seg.nm.map[endN - 1] + 1;
    const span = orig.slice(startO, endO);
    const before = sn.slice(0, p);
    const after = sn.slice(endN);
    if (p > 0 && /[A-Za-z0-9]/.test(sn[p - 1])) errs.push('quote starts in the middle of a word');
    if (endN < sn.length && /[A-Za-z0-9]/.test(sn[endN])) errs.push('quote ends in the middle of a word');
    const verse = doc.verse;
    const atLineStart = startO === 0 || orig[startO - 1] === '\n';
    const atLineEnd = endO >= orig.length || orig[endO] === '\n';
    const ss = sentenceStartOK(before);
    const firstLetter = (/[A-Za-z]/.exec(q) || [''])[0];
    if (verse && pick.work === 'plays') {
      const bi = orig.lastIndexOf('\n\n', startO);
      const blockStart = bi < 0 ? 0 : bi + 2;
      const labelEnd = orig.indexOf('\n', blockStart);
      if (startO < labelEnd) errs.push('quote includes the speaker label; start at the first spoken word');
    }
    if (!(ss.ok || (verse && atLineStart))) {
      errs.push(`quote does not start at a sentence start (preceded by "${before.slice(-30)}")`);
    } else if (/[a-z]/.test(firstLetter) && !(verse && atLineStart) && !ss.colon && before.trim() !== '' && !before.endsWith(PARA)) {
      errs.push('quote starts with a lowercase word, so it begins mid-sentence');
    }
    const lastCore = q.replace(/["')\]]+$/, '');
    const endChars = verse ? /[.?!;:]$/ : /[.?!]$/;
    if (!endChars.test(lastCore)) errs.push(`quote does not end at sentence-ending punctuation (ends "${q.slice(-20)}")`);
    else if (after && !verse) {
      const nextWord = after.replace(/^["')\]\s]+/, '');
      if (/^[a-z]/.test(nextWord) && /[.]$/.test(lastCore)) errs.push('quote ends at an abbreviation or mid-sentence full stop');
    }
    if (verse && !atLineEnd && !/[.?!]$/.test(lastCore)) errs.push('verse quote must end at the end of a line');
    const dq = (q.match(/"/g) || []).length;
    if (dq % 2) errs.push('unbalanced double quotation marks; include both or neither');
    if ((q.match(/\(/g) || []).length !== (q.match(/\)/g) || []).length) errs.push('unbalanced parentheses');
    if ((q.match(/\[/g) || []).length !== (q.match(/\]/g) || []).length) errs.push('unbalanced square brackets');
    const words = q.split(/\s+/).filter(Boolean).length;
    if (verse) {
      const lines = span.split('\n').length;
      if (lines > 8) errs.push(`verse quote is ${lines} lines, max 8`);
      if (words > 90) errs.push(`quote is ${words} words, max 90`);
    } else {
      if (words > 65) errs.push(`quote is ${words} words, max about 60`);
      const sc = countSentences(q);
      if (sc > 3) errs.push(`quote is ${sc} sentences, max 3`);
      if (sc < 1) errs.push('quote contains no complete sentence');
    }
    return { errs, startO, endO, span, words };
  };
  let best = null;
  for (const p of occ) {
    const r = evalAt(p);
    if (!best) best = { p, ...r };
    if (!r.errs.length) {
      best = { p, ...r };
      break;
    }
  }
  errors.push(...best.errs);
  const lines = best.span.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const text = doc.verse ? lines.join('\n') : lines.join(' ').replace(/\s+/g, ' ');
  return {
    ok: errors.length === 0,
    errors,
    match: {
      work: pick.work,
      segIndex: seg.index,
      location: seg.location,
      start: best.startO,
      end: best.endO,
      text,
      norm: q,
      words: best.words,
    },
  };
}

export function listPickFiles(writerSlug, fileArg) {
  const files = [];
  if (fileArg) {
    const cand = [path.resolve(fileArg), path.join(PICKS, writerSlug || '', fileArg), path.join(PICKS, fileArg)];
    const f = cand.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!f) throw new Error('pick file not found: ' + fileArg);
    const w = writerSlug || path.basename(path.dirname(f));
    return [{ writer: w, file: f }];
  }
  if (!fs.existsSync(PICKS)) return files;
  const slugs = writerSlug ? [writerSlug] : fs.readdirSync(PICKS).filter((d) => fs.statSync(path.join(PICKS, d)).isDirectory());
  for (const w of slugs) {
    const dir = path.join(PICKS, w);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.json')) files.push({ writer: w, file: path.join(dir, f) });
    }
  }
  return files;
}

export function readPicks(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { error: `invalid JSON: ${e.message}` };
  }
  if (!Array.isArray(data)) return { error: 'pick file must be a JSON array' };
  return { picks: data };
}

export { writers, findWriter };
