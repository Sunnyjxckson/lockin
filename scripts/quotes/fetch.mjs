#!/usr/bin/env node
// Download source texts (cached in raw/), split them into located segments
// (texts/<writer>/<work>.json) and cut reading chunks (chunks/<writer>/NN.txt).
//
// Usage: node scripts/quotes/fetch.mjs [writer-slug ...] [--chunks-only]

import fs from 'node:fs';
import path from 'node:path';
import { writers, gutUrl } from './sources.mjs';
import { HERE, cached, wikisourceHtml, sleep } from './net.mjs';
import {
  gutBody, findLine, proseFromLines, trimCaps, wikiParas, romanToInt, titleCase, wordCount,
} from './textutil.mjs';

const TEXTS = path.join(HERE, 'texts');
const CHUNKS = path.join(HERE, 'chunks');

async function gutLines(id) {
  const raw = await cached(`pg${id}.txt`, gutUrl(id), { delay: 1500 });
  return gutBody(raw);
}

const seg = (location, title, paras) => ({ location, title, text: paras.join('\n\n') });

// ---------------------------------------------------------------- Wikisource

async function wikisourceLetters(work) {
  const out = [];
  for (let n = 1; n <= work.count; n++) {
    const page = work.pagePrefix + n;
    const html = await wikisourceHtml(page);
    const hm = /header-section-text">([^<]*)</.exec(html);
    let title = hm ? hm[1].replace(/^\s*Letter\s+\d+\.?\s*/i, '').trim() : '';
    const paras = wikiParas(html);
    out.push(seg(`Letter ${n}`, title, paras));
  }
  return out;
}

async function wikisourceMatheson(work) {
  const out = [];
  for (let b = 1; b <= work.chapters.length; b++) {
    for (let c = 1; c <= work.chapters[b - 1]; c++) {
      const html = await wikisourceHtml(`${work.pagePrefix}Book ${b}/Chapter ${c}`);
      const tm = /<div class="wst-center[^"]*">\s*<p><i>([\s\S]*?)<\/i>\s*<\/p>/.exec(html);
      const title = tm ? tm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().replace(/\.$/, '') : '';
      out.push(seg(`Book ${b}, Chapter ${c}`, title, wikiParas(html)));
    }
  }
  return out;
}

// -------------------------------------------------------- numbered paragraphs

// Split paragraphs into numbered sections ("2. text"). Unnumbered first paragraph is section 1.
function numberedSections(paras, { firstUnnumbered = true } = {}) {
  const sections = [];
  let cur = 0;
  for (const p of paras) {
    const m = /^(\d+)\.\s+([\s\S]*)$/.exec(p);
    if (m && Number(m[1]) === cur + 1) {
      cur++;
      sections.push({ n: cur, paras: [m[2]] });
    } else if (!sections.length && firstUnnumbered) {
      cur = 1;
      sections.push({ n: 1, paras: [p] });
    } else if (sections.length) {
      sections[sections.length - 1].paras.push(p);
    }
  }
  return sections;
}

async function meditations(work) {
  const lines = await gutLines(work.gutId);
  let start = findLine(lines, /^THE THOUGHTS$/, 60);
  const end = findLine(lines, /^INDEXES\.$/, start);
  const body = lines.slice(start, end);
  const heads = [];
  body.forEach((l, i) => {
    if (/^[IVX]+\.$/.test(l)) heads.push({ i, n: romanToInt(l.replace('.', '')) });
  });
  const out = [];
  heads.forEach((h, k) => {
    const chunk = body.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : body.length);
    const paras = proseFromLines(chunk, { dropIndented: true, dropPlus: true });
    for (const s of numberedSections(paras)) {
      out.push(seg(`Book ${h.n}, Section ${s.n}`, '', s.paras));
    }
  });
  return out;
}

async function enchiridion(work) {
  const lines = await gutLines(work.gutId);
  const start = findLine(lines, /^THE ENCHEIRIDION, OR MANUAL\.$/);
  const body = lines.slice(start + 1);
  const heads = [];
  body.forEach((l, i) => {
    if (/^[IVXL]+\.$/.test(l)) heads.push({ i, n: romanToInt(l.replace('.', '')) });
  });
  return heads.map((h, k) => {
    const chunk = body.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : body.length);
    return seg(`Section ${h.n}`, '', trimCaps(proseFromLines(chunk, { verseIndented: true })));
  });
}

// -------------------------------------------------------------- Seneca dialogues

async function senecaDialogue(work) {
  const lines = await gutLines(work.gutId);
  const out = [];
  for (const book of work.books) {
    const s = findLine(lines, book.heading);
    if (s < 0) throw new Error('book heading not found: ' + book.heading);
    let e = findLine(lines, /^THE [A-Z]+ BOOK OF THE DIALOGUE/, s + 1);
    if (e < 0) e = lines.length;
    // Footnotes follow the body: cut at the first paragraph starting "[1] ".
    let chunk = lines.slice(s, e);
    const fn = chunk.findIndex((l, i) => /^\[1\] /.test(l) && (i === 0 || chunk[i - 1].trim() === ''));
    if (fn > 0) chunk = chunk.slice(0, fn);
    let paras = trimCaps(
      proseFromLines(chunk, { dropLinePatterns: [/^Book [IVX]+\.$/], verseIndented: false }),
    );
    // Sections are Roman numeral paragraphs in order.
    const sections = [];
    let cur = 0;
    for (const p of paras) {
      const m = /^([IVXL]+)\.\s+([\s\S]*)$/.exec(p);
      if (m && romanToInt(m[1]) === cur + 1) {
        cur++;
        sections.push({ n: cur, paras: [m[2]] });
      } else if (!sections.length) {
        cur = 1;
        sections.push({ n: 1, paras: [p] });
      } else {
        sections[sections.length - 1].paras.push(p);
      }
    }
    for (const sec of sections) {
      const loc = book.label ? `${book.label}, Section ${sec.n}` : `Section ${sec.n}`;
      out.push(seg(loc, '', sec.paras));
    }
  }
  return out;
}

// ------------------------------------------------------- Schopenhauer headings

async function headingWork(work) {
  const lines = await gutLines(work.gutId);
  const found = [];
  let from = 0;
  for (const [h, loc, title] of work.headings) {
    const i = findLine(lines, h, from);
    if (i < 0) throw new Error(`${work.slug}: heading not found: ${h}`);
    found.push({ i, loc, title });
    from = i + 1;
  }
  const out = [];
  found.forEach((f, k) => {
    const chunk = lines.slice(f.i + 1, k + 1 < found.length ? found[k + 1].i : lines.length);
    const paras = trimCaps(proseFromLines(chunk, { verseIndented: true }));
    // Heading text shown as the segment location; title kept only when it adds information.
    out.push(seg(f.loc, f.title && f.title !== f.loc ? f.title : '', paras));
  });
  return out;
}

async function artOfControversy(work) {
  const lines = await gutLines(work.gutId);
  const found = [];
  let from = 0;
  for (const [h, loc, title] of work.headings) {
    const i = findLine(lines, h, from);
    if (i < 0) throw new Error(`controversy: heading not found: ${h}`);
    found.push({ i, loc, title });
    from = i + 1;
  }
  const out = [];
  found.forEach((f, k) => {
    const end = k + 1 < found.length ? found[k + 1].i : lines.length;
    const chunk = lines.slice(f.i + 1, end);
    if (f.loc === 'STRATAGEMS') {
      const heads = [];
      chunk.forEach((l, i) => {
        if (/^[IVXL]+\.$/.test(l.trim())) heads.push({ i, n: romanToInt(l.trim().replace('.', '')) });
      });
      heads.forEach((h, j) => {
        const sub = chunk.slice(h.i + 1, j + 1 < heads.length ? heads[j + 1].i : chunk.length);
        const paras = trimCaps(proseFromLines(sub, { verseIndented: true }));
        const first = /^The ([A-Z][\w' -]{0,60})\.--/.exec(paras[0] || '');
        out.push(seg(`Stratagem ${h.n}`, first ? first[1] : '', paras));
      });
    } else {
      out.push(seg(f.loc, f.title !== f.loc ? f.title : '', trimCaps(proseFromLines(chunk, { verseIndented: true }))));
    }
  });
  return out;
}

// ------------------------------------------------------------------ Nietzsche

async function zarathustra(work) {
  const lines = await gutLines(work.gutId);
  const start = findLine(lines, /^ZARATHUSTRA’S PROLOGUE\.$/);
  const end = findLine(lines, /^APPENDIX\.$/, start);
  const body = lines.slice(start, end);
  const heads = [{ i: 0, loc: 'Prologue', title: "Zarathustra's Prologue" }];
  let part = 1;
  let inPart = 0;
  body.forEach((l, i) => {
    if (/^SECOND PART\.?$|THUS SPAKE ZARATHUSTRA\. SECOND PART\./.test(l)) { part = 2; inPart = 0; }
    else if (/^THIRD PART\.$/.test(l)) { part = 3; inPart = 0; }
    else if (/^FOURTH AND LAST PART\.$/.test(l)) { part = 4; inPart = 0; }
    const m = /^([IVXLC]+)\. ([A-Z][A-Z’' -]+)\.$/.exec(l);
    if (m) {
      inPart++;
      heads.push({ i, loc: `Part ${part}, Discourse ${inPart}`, title: titleCase(m[2]) });
    }
  });
  return heads.map((h, k) => {
    const chunk = body.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : body.length);
    const paras = trimCaps(
      proseFromLines(chunk, {
        verseIndented: true,
        dropLinePatterns: [/^(FIRST|SECOND|THIRD) PART\.?$/, /^FOURTH AND LAST PART\.$/, /^THUS SPAKE ZARATHUSTRA\./, /^ZARATHUSTRA’S DISCOURSES\.$/],
      }),
    );
    return seg(h.loc, h.title, paras);
  });
}

// Pull "_Title._--Text" openings out as titles.
function splitTitle(paras) {
  if (!paras.length) return { title: '', paras };
  const m = /^_([^_]{1,100}[.?!])_\s*[\u2014\u2013-]{1,2}\s*/.exec(paras[0]);
  if (!m) return { title: '', paras };
  return { title: m[1].replace(/\.$/, ''), paras: [paras[0].slice(m[0].length), ...paras.slice(1)] };
}

function numberedAphorisms(lines, prefix, { sep = ' ' } = {}) {
  // Aphorism boundaries are lines containing only a number.
  const heads = [];
  lines.forEach((l, i) => {
    if (/^\s*\d{1,3}\.?\s*$/.test(l) && (i === 0 || lines[i - 1].trim() === '') && (lines[i + 1] || '').trim() === '') {
      heads.push({ i, n: Number(l.trim().replace('.', '')) });
    }
  });
  const out = [];
  heads.forEach((h, k) => {
    let chunk = lines.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : lines.length);
    // Translator footnotes follow a rule of dashes and a "Footnote N:" line; they are not text.
    const cut = chunk.findIndex((l, j) => /^-{5,}$/.test(l.trim()) && /^Footnote/.test((chunk.slice(j + 1).find((x) => x.trim()) || '').trim()));
    if (cut >= 0) chunk = chunk.slice(0, cut);
    let paras = proseFromLines(chunk, { stripUnderscores: false, verseIndented: true });
    const t = splitTitle(paras);
    paras = t.paras.map((p) => p.replace(/_/g, ''));
    out.push({ n: h.n, title: t.title, paras: trimCaps(paras) });
  });
  return out;
}

async function twilight(work) {
  const lines = await gutLines(work.gutId);
  const start = findLine(lines, 'MAXIMS AND MISSILES');
  const end = findLine(lines, /^THE END\.$/, start);
  const names = [
    ['MAXIMS AND MISSILES', 'Maxims and Missiles'],
    ['THE PROBLEM OF SOCRATES', 'The Problem of Socrates'],
    ['“REASON” IN PHILOSOPHY', '"Reason" in Philosophy'],
    ['HOW THE “TRUE WORLD” ULTIMATELY BECAME A FABLE', 'How the True World Became a Fable'],
    ['MORALITY AS THE ENEMY OF NATURE', 'Morality as the Enemy of Nature'],
    ['THE FOUR GREAT ERRORS', 'The Four Great Errors'],
    ['THE “IMPROVERS” OF MANKIND', 'The Improvers of Mankind'],
    ['THINGS THE GERMANS LACK', 'Things the Germans Lack'],
    ['SKIRMISHES IN A WAR WITH THE AGE', 'Skirmishes in a War with the Age'],
    ['THINGS I OWE TO THE ANCIENTS', 'Things I Owe to the Ancients'],
  ];
  const heads = [];
  let from = start;
  for (const [h, nm] of names) {
    const i = findLine(lines, h, from);
    if (i < 0) throw new Error('twilight heading missing: ' + h);
    heads.push({ i, nm });
    from = i + 1;
  }
  const out = [];
  heads.forEach((h, k) => {
    const sub = lines.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : end);
    if (h.nm === 'How the True World Became a Fable') {
      out.push(seg(h.nm, 'The history of an error', trimCaps(proseFromLines(sub, { verseIndented: true }))));
      return;
    }
    for (const a of numberedAphorisms(sub)) {
      out.push(seg(`${h.nm} ${a.n}`, a.title, a.paras));
    }
  });
  return out;
}

async function antichrist(work) {
  const lines = await gutLines(work.gutId);
  const start = findLine(lines, 'THE ANTICHRIST', findLine(lines, /^THE END\.$/));
  const end = findLine(lines, 'THE ETERNAL RECURRENCE', start);
  const body = lines.slice(start, end);
  const firstNum = body.findIndex((l, i) => /^1$/.test(l.trim()) && body[i + 1] === '' && i > 20);
  const out = [];
  for (const a of numberedAphorisms(body.slice(firstNum))) {
    out.push(seg(`Section ${a.n}`, a.title, a.paras));
  }
  return out;
}

async function joyfulWisdom(work) {
  const lines = await gutLines(work.gutId);
  const start = findLine(lines, /^\s+BOOK FIRST$/);
  const end = findLine(lines, /^\s+APPENDIX$/, start);
  const body = lines.slice(start, end).filter((l) => !/^\s+(BOOK (FIRST|SECOND|THIRD|FOURTH|FIFTH)|SANCTUS JANUARIUS|WE FEARLESS ONES)\s*$/.test(l));
  const out = [];
  for (const a of numberedAphorisms(body)) {
    out.push(seg(`Aphorism ${a.n}`, a.title, a.paras));
  }
  return out;
}

// ---------------------------------------------------------------- Shakespeare

const PLAYS = [
  ['ALL’S WELL THAT ENDS WELL', "All's Well That Ends Well"],
  ['THE TRAGEDY OF ANTONY AND CLEOPATRA', 'Antony and Cleopatra'],
  ['AS YOU LIKE IT', 'As You Like It'],
  ['THE COMEDY OF ERRORS', 'The Comedy of Errors'],
  ['THE TRAGEDY OF CORIOLANUS', 'Coriolanus'],
  ['CYMBELINE', 'Cymbeline'],
  ['THE TRAGEDY OF HAMLET, PRINCE OF DENMARK', 'Hamlet'],
  ['THE FIRST PART OF KING HENRY THE FOURTH', 'Henry IV, Part 1'],
  ['THE SECOND PART OF KING HENRY THE FOURTH', 'Henry IV, Part 2'],
  ['THE LIFE OF KING HENRY THE FIFTH', 'Henry V'],
  ['THE FIRST PART OF HENRY THE SIXTH', 'Henry VI, Part 1'],
  ['THE SECOND PART OF KING HENRY THE SIXTH', 'Henry VI, Part 2'],
  ['THE THIRD PART OF KING HENRY THE SIXTH', 'Henry VI, Part 3'],
  ['KING HENRY THE EIGHTH', 'Henry VIII'],
  ['THE LIFE AND DEATH OF KING JOHN', 'King John'],
  ['THE TRAGEDY OF JULIUS CAESAR', 'Julius Caesar'],
  ['THE TRAGEDY OF KING LEAR', 'King Lear'],
  ['LOVE’S LABOUR’S LOST', "Love's Labour's Lost"],
  ['THE TRAGEDY OF MACBETH', 'Macbeth'],
  ['MEASURE FOR MEASURE', 'Measure for Measure'],
  ['THE MERCHANT OF VENICE', 'The Merchant of Venice'],
  ['THE MERRY WIVES OF WINDSOR', 'The Merry Wives of Windsor'],
  ['A MIDSUMMER NIGHT’S DREAM', "A Midsummer Night's Dream"],
  ['MUCH ADO ABOUT NOTHING', 'Much Ado About Nothing'],
  ['THE TRAGEDY OF OTHELLO, THE MOOR OF VENICE', 'Othello'],
  ['PERICLES, PRINCE OF TYRE', 'Pericles'],
  ['KING RICHARD THE SECOND', 'Richard II'],
  ['KING RICHARD THE THIRD', 'Richard III'],
  ['THE TRAGEDY OF ROMEO AND JULIET', 'Romeo and Juliet'],
  ['THE TAMING OF THE SHREW', 'The Taming of the Shrew'],
  ['THE TEMPEST', 'The Tempest'],
  ['THE LIFE OF TIMON OF ATHENS', 'Timon of Athens'],
  ['THE TRAGEDY OF TITUS ANDRONICUS', 'Titus Andronicus'],
  ['TROILUS AND CRESSIDA', 'Troilus and Cressida'],
  ['TWELFTH NIGHT; OR, WHAT YOU WILL', 'Twelfth Night'],
  ['THE TWO GENTLEMEN OF VERONA', 'The Two Gentlemen of Verona'],
  ['THE TWO NOBLE KINSMEN', 'The Two Noble Kinsmen'],
  ['THE WINTER’S TALE', "The Winter's Tale"],
];

const SPEAKER = /^([A-Z][A-Z0-9 .,'’&-]*\.|(THE )?(PROLOGUE|EPILOGUE))$/;
const DIRECTION = /^\s*(\[_|Enter\b|Exit\b|Exeunt\b|Re-enter\b|Flourish\b|Alarum|Sound\b|Trumpets|Drum|Music\b|Horns|Thunder|Lightning|Cornets|Retreat|Within\b|Re-|Pass over|Here\b|They\b|Dance|Noise|Sennet|Shout|Tucket|A flourish|The\b.*\b(enter|exit|retire)s?\b)/;

function joinSpeech(speechLines) {
  const ls = speechLines
    .join('\n')
    .replace(/\[[^\]]{1,120}\]/g, '')
    .replace(/_/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (ls.length <= 1) return ls;
  const upper = ls.filter((l) => /^[A-Z‘’“"'(]/.test(l)).length;
  const verse = upper / ls.length >= 0.75 && ls.some((l) => l.length < 62);
  return verse ? ls : [ls.join(' ').replace(/\s+/g, ' ')];
}

function parsePlay(lines, short) {
  const segs = [];
  let act = 0;
  let actLabel = '';
  let scene = 0;
  let sceneTitle = '';
  let blocks = [];
  let speaker = null;
  let sp = [];
  const flushSpeech = () => {
    if (speaker && sp.length) {
      const joined = joinSpeech(sp);
      if (joined.length) blocks.push(`${speaker}\n${joined.join('\n')}`);
    }
    speaker = null;
    sp = [];
  };
  const flushScene = () => {
    flushSpeech();
    if (blocks.length) {
      let loc;
      if (scene > 0) loc = `${short}, Act ${act} Scene ${scene}`;
      else if (act > 0) loc = `${short}, Act ${act} ${actLabel || 'Prologue'}`;
      else loc = `${short}, ${actLabel || 'Prologue'}`;
      segs.push({ location: loc, title: scene > 0 ? sceneTitle : '', text: blocks.join('\n\n') });
    }
    blocks = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = /^\s*ACT ([IVX]+)\.?\s*$/.exec(l))) {
      flushScene();
      act = romanToInt(m[1]);
      scene = 0;
      actLabel = '';
      sceneTitle = '';
      continue;
    }
    if (/^INDUCTION\.?$/.test(l)) {
      flushScene();
      act = 0;
      scene = 0;
      actLabel = 'Induction';
      continue;
    }
    if ((m = /^\s*SCENE ([IVX]+)\.\s*(.*)$/.exec(l))) {
      flushScene();
      scene = romanToInt(m[1]);
      sceneTitle = m[2].trim().replace(/\.$/, '');
      continue;
    }
    if (l.trim() === '') {
      flushSpeech();
      continue;
    }
    if (!speaker && SPEAKER.test(l.trim()) && l === l.trimStart() && !/^(THE END|ACT|SCENE)\b/.test(l)) {
      speaker = l.trim();
      continue;
    }
    if (speaker) {
      if (/^\s*\[_.*\]\s*$/.test(l) || (l !== l.trimStart() && DIRECTION.test(l))) continue;
      sp.push(l);
    } else if (/^(PROLOGUE|EPILOGUE|CHORUS)\.?$/.test(l.trim())) {
      // spoken prologue without speaker format; ignore
    }
  }
  flushScene();
  return segs;
}

async function shakespearePlays(work) {
  const lines = await gutLines(work.gutId);
  // Locate each play: its unindented "Contents" line is preceded by the title line.
  const alias = { 'THE LIFE AND DEATH OF KING RICHARD THE SECOND': 'Richard II' };
  const byTitle = new Map(PLAYS);
  const starts = [];
  lines.forEach((l, i) => {
    if (l !== 'Contents') return;
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === '') j--;
    const title = lines[j];
    const short = byTitle.get(title) || alias[title];
    if (!short) throw new Error('unknown play title: ' + title);
    starts.push({ i: j, short });
  });
  if (starts.length !== PLAYS.length) throw new Error(`expected ${PLAYS.length} plays, found ${starts.length}`);
  const order = starts.slice().sort((a, b) => a.i - b.i);
  const out = [];
  order.forEach((p, k) => {
    let end = k + 1 < order.length ? order[k + 1].i : lines.length;
    const theEnd = findLine(lines, /^THE END$/, p.i, end);
    if (theEnd > 0) end = theEnd;
    const body = lines.slice(p.i, end);
    // The play body begins after the dramatis personae, which ends with a "SCENE: ..." setting line.
    let bodyStart = body.findIndex((l) => /^\s*SCENE\s*[:.]/.test(l) && !/^\s*SCENE [IVX]+\./.test(l));
    if (bodyStart >= 0) bodyStart += 1;
    else {
      const first = body.findIndex((l) => /^\s*SCENE I\.\s+\S/.test(l));
      bodyStart = first;
      for (let j = first; j >= 0; j--) {
        if (/^ACT I\.?$/.test(body[j])) {
          bodyStart = j;
          break;
        }
      }
    }
    for (const s of parsePlay(body.slice(bodyStart), p.short)) out.push(s);
  });
  return out;
}

async function shakespeareSonnets(work) {
  const lines = await gutLines(work.gutId);
  const start = findLine(lines, 'THE SONNETS');
  const end = findLine(lines, 'ALL’S WELL THAT ENDS WELL', start);
  const body = lines.slice(start + 1, end);
  const heads = [];
  body.forEach((l, i) => {
    if (/^\s{10,}\d{1,3}\s*$/.test(l)) heads.push({ i, n: Number(l.trim()) });
  });
  return heads.map((h, k) => {
    const sub = body.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : body.length);
    const ls = sub.map((x) => x.trim()).filter((x) => x && !/^THE END$/.test(x));
    return { location: `Sonnet ${h.n}`, title: '', text: ls.join('\n') };
  });
}

// ----------------------------------------------------------------------- main

const KINDS = {
  'wikisource-letters': wikisourceLetters,
  'wikisource-matheson': wikisourceMatheson,
  meditations,
  enchiridion,
  'seneca-dialogue': senecaDialogue,
  headings: headingWork,
  'art-of-controversy': artOfControversy,
  zarathustra,
  twilight,
  antichrist,
  'joyful-wisdom': joyfulWisdom,
  'shakespeare-plays': shakespearePlays,
  'shakespeare-sonnets': shakespeareSonnets,
};

async function buildTexts(only) {
  for (const w of writers) {
    if (only.length && !only.includes(w.slug)) continue;
    for (const work of w.works) {
      const fn = KINDS[work.kind];
      if (!fn) throw new Error('unknown kind ' + work.kind);
      process.stdout.write(`${w.slug}/${work.slug} ... `);
      const segments = (await fn(work)).filter((s) => s.text.trim());
      const doc = {
        writer: w.slug,
        work: work.slug,
        title: work.title,
        translator: work.translator,
        year: work.year,
        source_url: work.source_url,
        segments,
      };
      const dir = path.join(TEXTS, w.slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, work.slug + '.json'), JSON.stringify(doc, null, 1) + '\n');
      const words = segments.reduce((n, s) => n + wordCount(s.text), 0);
      console.log(`${segments.length} segments, ${words} words`);
    }
  }
}

function buildChunks() {
  fs.rmSync(CHUNKS, { recursive: true, force: true });
  fs.mkdirSync(CHUNKS, { recursive: true });
  const index = [];
  for (const w of writers) {
    const items = [];
    for (const work of w.works) {
      const f = path.join(TEXTS, w.slug, work.slug + '.json');
      if (!fs.existsSync(f)) continue;
      const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const s of doc.segments) {
        items.push({ work: work.slug, location: s.location, title: s.title, text: s.text, words: wordCount(s.text) });
      }
    }
    if (!items.length) continue;
    // Balanced greedy: aim for chunks near 30,000 words, always cutting between whole segments.
    const total = items.reduce((a, b) => a + b.words, 0);
    const target = total / Math.max(1, Math.round(total / 30000));
    const groups = [];
    let cur = [];
    let n = 0;
    for (const it of items) {
      if (cur.length && Math.abs(n + it.words - target) > Math.abs(n - target)) {
        groups.push(cur);
        cur = [];
        n = 0;
      }
      cur.push(it);
      n += it.words;
    }
    if (cur.length) groups.push(cur);
    if (groups.length > 1 && n < target * 0.6) {
      const prevWords = groups[groups.length - 2].reduce((a, b) => a + b.words, 0);
      if (prevWords + n <= 38000) {
        const tail = groups.pop();
        groups[groups.length - 1].push(...tail);
      }
    }
    fs.mkdirSync(path.join(CHUNKS, w.slug), { recursive: true });
    groups.forEach((g, gi) => {
      const name = String(gi + 1).padStart(2, '0') + '.txt';
      const body = g
        .map((it) => {
          const head = `### [${w.slug}/${it.work}] ${it.location}${it.title ? ': ' + it.title : ''}`;
          return head + '\n\n' + it.text;
        })
        .join('\n\n');
      fs.writeFileSync(path.join(CHUNKS, w.slug, name), body + '\n');
      index.push({
        file: `${w.slug}/${name}`,
        writer: w.slug,
        works: [...new Set(g.map((x) => x.work))],
        first_location: `${g[0].work}: ${g[0].location}`,
        last_location: `${g[g.length - 1].work}: ${g[g.length - 1].location}`,
        words: g.reduce((a, b) => a + b.words, 0),
      });
    });
  }
  fs.writeFileSync(path.join(CHUNKS, 'index.json'), JSON.stringify({ chunks: index }, null, 1) + '\n');
  for (const c of index) console.log(`chunk ${c.file}  ${c.words} words  ${c.first_location}  to  ${c.last_location}`);
}

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
if (!args.includes('--chunks-only')) await buildTexts(only);
buildChunks();
