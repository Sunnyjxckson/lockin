// Shared text helpers for fetch.mjs (segmenting) and lib.mjs (verifying).
// Source texts may contain em/en dashes; we match them with \u escapes so this file stays dash free.

export const DASH_CLASS = '\\u2014\\u2013';

export function wordCount(s) {
  const m = String(s).trim().match(/\S+/g);
  return m ? m.length : 0;
}

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
export function romanToInt(s) {
  let total = 0;
  const u = s.toUpperCase();
  for (let i = 0; i < u.length; i++) {
    const v = ROMAN[u[i]];
    const n = ROMAN[u[i + 1]];
    if (!v) return NaN;
    total += n && n > v ? -v : v;
  }
  return total;
}

const SMALL = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'on', 'to', 'for', 'with', 'or', 'at', 'by', 'from', 'as']);
export function titleCase(s) {
  const words = s.toLowerCase().split(/(\s+)/);
  let first = true;
  return words
    .map((w) => {
      if (/^\s+$/.test(w) || w === '') return w;
      const cap = (x) =>
        x
          .split(/([-'’])/)
          .map((p, i) => (i % 2 === 0 && p ? p[0].toUpperCase() + p.slice(1) : p))
          .join('');
      const out = !first && SMALL.has(w) ? w : cap(w);
      first = false;
      return out;
    })
    .join('');
}

export function toLines(raw) {
  return raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
}

// Lines strictly between the Gutenberg START and END markers.
export function gutBody(raw) {
  const lines = toLines(raw);
  let s = lines.findIndex((l) => /^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG/.test(l));
  let e = lines.findIndex((l) => /^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/.test(l));
  if (s < 0) s = -1;
  if (e < 0) e = lines.length;
  return lines.slice(s + 1, e);
}

export function findLine(lines, test, from = 0, to = lines.length) {
  for (let i = from; i < to; i++) {
    if (typeof test === 'string' ? lines[i] === test : test.test(lines[i])) return i;
  }
  return -1;
}

const hasLower = (s) => /[a-z]/.test(s);

// Turn raw lines into an array of clean paragraph strings.
export function proseFromLines(lines, opts = {}) {
  const {
    dropIndented = false, // drop paragraphs whose lines are all indented (notes)
    verseIndented = false, // keep indented paragraphs line by line
    dropPlus = false,
    stripUnderscores = true,
    dropLinePatterns = [],
    keepMarkers = false,
  } = opts;
  let text = lines.filter((l) => !dropLinePatterns.some((re) => re.test(l))).join('\n');
  text = text.replace(/\[Footnote[:\s][\s\S]*?\]/g, '');
  text = text.replace(/\[Greek:[\s\S]*?\]/gi, '');
  text = text.replace(/\[Illustration[^\]]*\]/g, '');
  text = text.replace(/\{\d+\}/g, '').replace(/\[Pg\s*\d+\]/gi, '');
  if (!keepMarkers) text = text.replace(/\[(?:\d{1,3}|[A-Z])\](?!\()/g, '');
  if (dropPlus) text = text.replace(/\+/g, '');
  if (stripUnderscores) text = text.replace(/_/g, '');
  const blocks = text.split(/\n[ \t]*\n/);
  const out = [];
  for (const block of blocks) {
    const ls = block.split('\n').filter((l) => l.trim() !== '');
    if (!ls.length) continue;
    const indented = ls.every((l) => /^\s{2,}/.test(l));
    if (indented && dropIndented) continue;
    let p;
    if (indented && verseIndented) {
      p = ls.map((l) => l.trim().replace(/[ \t]+/g, ' ')).join('\n');
    } else {
      p = ls.map((l) => l.trim()).join(' ').replace(/\s+/g, ' ');
    }
    p = p.replace(/\(\s*\)/g, '').replace(/ +([,.;:!?])/g, '$1').replace(/ {2,}/g, ' ').trim();
    if (p) out.push(p);
  }
  return out;
}

// Drop leading/trailing short all-caps paragraphs (running heads, titles).
export function trimCaps(paras) {
  const caps = (p) => !hasLower(p) && p.length < 120 && /[A-Z]/.test(p);
  const a = paras.slice();
  while (a.length && caps(a[0])) a.shift();
  while (a.length && caps(a[a.length - 1])) a.pop();
  return a;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...' };
export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n] !== undefined ? ENT[n] : m));
}

// Remove every <tag ... class="...re..."> element, nesting aware.
export function removeByClass(html, tag, classRe) {
  const open = new RegExp(`<${tag}\\b[^>]*\\bclass="[^"]*(?:${classRe})[^"]*"[^>]*>`, 'i');
  const any = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  for (;;) {
    const m = open.exec(html);
    if (!m) return html;
    any.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = html.length;
    let t;
    while ((t = any.exec(html))) {
      if (t[0].endsWith('/>')) continue;
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    html = html.slice(0, m.index) + html.slice(end);
  }
}

// Rendered Wikisource HTML to an array of paragraph strings.
export function wikiParas(html) {
  let h = html;
  const i = h.indexOf('<div class="prp-pages-output"');
  if (i >= 0) h = h.slice(i);
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  h = h.replace(/<link[^>]*>/gi, '');
  h = removeByClass(h, 'div', 'reflist|printfooter|wst-center|ws-noexport|wst-dhr|noprint');
  h = removeByClass(h, 'ol', 'references');
  h = removeByClass(h, 'span', 'pagenum|wst-sidenote|wst-verse|mw-cite-backlink');
  h = removeByClass(h, 'sup', 'reference|wst-sup');
  h = h.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '');
  h = h.replace(/<hr[^>]*>/gi, '\n\n');
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<\/(p|div|blockquote|li|h\d|table|tr)>/gi, '\n\n');
  h = h.replace(/<[^>]+>/g, '');
  h = decodeEntities(h).replace(/[​‎‏﻿]/g, '').replace(/ /g, ' ');
  const out = [];
  for (const blk of h.split(/\n[ \t]*\n/)) {
    const ls = blk.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
    if (!ls.length) continue;
    const avg = ls.reduce((n, l) => n + l.length, 0) / ls.length;
    const p = ls.length > 1 && avg < 60 ? ls.join('\n') : ls.join(' ');
    out.push(p.replace(/ +([,.;:!?])/g, '$1'));
  }
  return out;
}
