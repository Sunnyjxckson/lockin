// The Library: the shapes of the quote files, the fixed vocabularies, which
// quotes a way in covers, the link format and the rule for when a quote counts
// as read. Pure, no React, no db. The queue is in libraryQueue, the counters
// in libraryProgress, search in librarySearch.

import type { IsoStr } from "../types";

// ---------- the data contract (src/data/quotes) ----------

export interface IndexWork {
  slug: string;
  title: string;
  count: number;
}

export interface IndexWriter {
  slug: string;
  name: string;
  count: number;
  works: IndexWork[];
}

/** src/data/quotes/index.json */
export interface QuoteIndex {
  total: number;
  writers: IndexWriter[];
}

export interface WriterInfo {
  slug: string;
  name: string;
  years: string;
  bio: string;
}

export interface WorkInfo {
  slug: string;
  title: string;
  translator: string;
  year: string | number;
  source_url: string;
  note: string;
}

/** One quote as the writer file holds it. */
export interface Quote {
  id: string;
  text: string;
  /** A work slug. */
  work: string;
  location: string;
  plain: string;
  themes: string[];
  moments: string[];
  /** Laws and maxims only: who the law is attributed to, the year, where it first appeared and a link. */
  by?: string;
  year?: string;
  source?: string;
  source_url?: string;
}

/** src/data/quotes/<writer-slug>.json */
export interface WriterFile {
  writer: WriterInfo;
  works: WorkInfo[];
  quotes: Quote[];
}

/** A quote with the writer it belongs to, which the loaders add. */
export interface LibQuote extends Quote {
  writer: string;
}

/** What is kept per quote (the `quote_state` row without its ids). */
export interface QuoteMark {
  quote_id: string;
  writer: string;
  work: string;
  read_at: IsoStr | null;
  saved_at: IsoStr | null;
  note: string | null;
}

export type Marks = ReadonlyMap<string, QuoteMark>;

// ---------- vocabularies ----------

export const THEMES = [
  "fear",
  "death",
  "time",
  "discipline",
  "adversity",
  "anger",
  "wealth",
  "desire",
  "solitude",
  "friendship",
  "fate",
  "self-mastery",
  "work",
  "pain",
  "reputation",
  "happiness",
  "mind",
  "change",
  "courage",
  "folly",
  "love",
  "power",
] as const;
export type Theme = (typeof THEMES)[number];

export const MOMENTS = ["overwhelmed", "angry", "broke", "alone", "doubting", "tempted", "tired", "afraid"] as const;
export type Moment = (typeof MOMENTS)[number];

export function isTheme(s: string | null | undefined): s is Theme {
  return !!s && (THEMES as readonly string[]).includes(s);
}

export function isMoment(s: string | null | undefined): s is Moment {
  return !!s && (MOMENTS as readonly string[]).includes(s);
}

/** "self-mastery" to "Self-mastery". */
export function themeLabel(theme: string): string {
  return theme ? theme.charAt(0).toUpperCase() + theme.slice(1) : theme;
}

export const momentLabel = themeLabel;

// ---------- ways in ----------

/** Which quotes a reading session covers. */
export type Scope =
  | { kind: "writer"; writer: string; work?: string }
  | { kind: "theme"; theme: Theme }
  | { kind: "moment"; moment: Moment }
  | { kind: "shuffle"; seed: number }
  | { kind: "saved" };

export interface ParamSource {
  get(name: string): string | null;
}

function intParam(v: string | null): number | null {
  if (v === null || !/^\d{1,12}$/.test(v)) return null;
  return Number(v);
}

/**
 * The scope a reader URL names, or null when it names none. Parameters:
 * `w` (writer slug, with `k` for one work), `t` (theme), `m` (moment),
 * `shuffle` (a seed), `saved` (1). The first one found wins, in that order.
 */
export function parseScope(params: ParamSource): Scope | null {
  const w = params.get("w");
  if (w && /^[a-z0-9][a-z0-9-]*$/.test(w)) {
    const k = params.get("k");
    return k && /^[a-z0-9][a-z0-9-]*$/.test(k) ? { kind: "writer", writer: w, work: k } : { kind: "writer", writer: w };
  }
  const t = params.get("t");
  if (isTheme(t)) return { kind: "theme", theme: t };
  const m = params.get("m");
  if (isMoment(m)) return { kind: "moment", moment: m };
  const seed = intParam(params.get("shuffle"));
  if (seed !== null) return { kind: "shuffle", seed };
  if (params.get("saved") === "1") return { kind: "saved" };
  return null;
}

/** The query string for a scope, without the quote. The inverse of parseScope. */
export function scopeQuery(scope: Scope): string {
  switch (scope.kind) {
    case "writer":
      return scope.work ? `w=${scope.writer}&k=${scope.work}` : `w=${scope.writer}`;
    case "theme":
      return `t=${scope.theme}`;
    case "moment":
      return `m=${scope.moment}`;
    case "shuffle":
      return `shuffle=${scope.seed}`;
    case "saved":
      return "saved=1";
  }
}

/** Parse a stored scope string ("w=seneca"). */
export function scopeFromQuery(query: string): Scope | null {
  return parseScope(new URLSearchParams(query));
}

export const READER_PATH = "/library/read";

/** The reader's address for a scope, optionally opened on one quote. */
export function readerLink(scope: Scope | null, quoteId?: string | null): string {
  const parts: string[] = [];
  if (scope) parts.push(scopeQuery(scope));
  if (quoteId) parts.push(`q=${encodeURIComponent(quoteId)}`);
  return parts.length ? `${READER_PATH}?${parts.join("&")}` : READER_PATH;
}

/**
 * The deep link that opens the reader on one quote and carries on from there.
 * Give `writer` when known so the reader loads only that writer's file; without
 * it the reader finds the quote's writer itself. With no scope the reader goes
 * on through that quote's writer in source order, unread quotes first.
 */
export function quoteLink(quoteId: string, opts: { writer?: string; scope?: Scope } = {}): string {
  const scope: Scope | null = opts.scope ?? (opts.writer ? { kind: "writer", writer: opts.writer } : null);
  return readerLink(scope, quoteId);
}

/** A short name for a scope, for the reader's top line. */
export function scopeTitle(scope: Scope, writerName: (slug: string) => string | null, workTitle?: (writer: string, work: string) => string | null): string {
  switch (scope.kind) {
    case "writer": {
      const name = writerName(scope.writer) ?? scope.writer;
      if (scope.work) return workTitle?.(scope.writer, scope.work) ?? name;
      return name;
    }
    case "theme":
      return themeLabel(scope.theme);
    case "moment":
      return momentLabel(scope.moment);
    case "shuffle":
      return "Shuffled";
    case "saved":
      return "Saved";
  }
}

// ---------- when a quote counts as read ----------

/** Moved past a quote after at least this long on screen: it was read. A faster flick is skimming. */
export const READ_PASS_MS = 1000;
/** Never wait longer than this on a quote before it counts. */
export const READ_DWELL_MAX_MS = 8000;
/** Never less than this either. */
export const READ_DWELL_MIN_MS = 3000;

/** How long a quote has to stay on screen to count by itself: a little more for a longer one. */
export function dwellMs(text: string): number {
  const ms = 2000 + 20 * text.length;
  return Math.min(READ_DWELL_MAX_MS, Math.max(READ_DWELL_MIN_MS, ms));
}

/**
 * The rule. `visibleMs` is the time the quote has been on screen with the app
 * in front (time away does not count). A quote is read when
 *  - it stayed up for its dwell time, or
 *  - you moved past it after at least READ_PASS_MS.
 * Being loaded or preloaded is nothing. Going back to a quote and leaving it
 * counts the same way.
 */
export function countsAsRead(input: { visibleMs: number; text: string; movedPast: boolean }): boolean {
  if (input.visibleMs >= dwellMs(input.text)) return true;
  return input.movedPast && input.visibleMs >= READ_PASS_MS;
}

// ---------- how a quote is cited ----------

/** A law or maxim carries its own attribution and source. */
export function isLaw(q: Pick<Quote, "by" | "source" | "source_url">): boolean {
  return !!(q.by || q.source || q.source_url);
}

export interface Citation {
  /** The big small line under the quote: a work and place, or the law's name. */
  title: string;
  /** The next line: where in the work, or who a law is attributed to and when. */
  lines: string[];
  /** A law's source, as words. */
  source: string | null;
  source_url: string | null;
}

/**
 * What goes under a quote on the card. A law reads: its name, who it is
 * attributed to and the year, then the source. Anything else reads: the work
 * and the place in it. The plays are one work, so the play's name is enough.
 */
export function citeQuote(q: Pick<Quote, "location" | "by" | "year" | "source" | "source_url" | "work">, workTitle: string): Citation {
  if (isLaw(q)) {
    const who = [q.by ?? "", q.year ?? ""].filter(Boolean).join(", ");
    return { title: q.location, lines: who ? [who] : [], source: q.source ?? null, source_url: q.source_url || null };
  }
  const plays = q.work === "plays";
  const line = plays ? q.location : [workTitle, q.location].filter(Boolean).join(", ");
  return { title: line, lines: [], source: null, source_url: null };
}

/** Only an http or https link is ever drawn as one. */
export function safeUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

// ---------- layout ----------

/** Quote type steps, biggest first. The reader starts at the one `quoteStep` picks and steps down until the text fits. */
export const QUOTE_SIZES = [34, 29, 25, 22, 19, 17, 15] as const;

/** The first type step to try, by length: short quotes get big type. */
export function quoteStep(text: string): number {
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  // Verse is set by lines, prose by total length.
  const weight = lines.length > 1 ? Math.max(text.length * 0.7, longest * 2.2, lines.length * 38) : text.length;
  if (weight <= 70) return 0;
  if (weight <= 130) return 1;
  if (weight <= 220) return 2;
  if (weight <= 340) return 3;
  if (weight <= 520) return 4;
  if (weight <= 760) return 5;
  return 6;
}

// ---------- the passage around a quote ----------

export interface Piece {
  text: string;
  hit: boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Where the quote sits in its passage, as [start, end), or null. Tolerates different line breaks and spacing. */
export function findInPassage(passage: string, quote: string): [number, number] | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || !passage) return null;
  const whole = new RegExp(words.map(escapeRe).join("\\s+"), "i").exec(passage);
  if (whole) return [whole.index, whole.index + whole[0].length];
  // The passage may differ in a word or a mark. Try the first and last few words.
  if (words.length >= 8) {
    const head = new RegExp(words.slice(0, 4).map(escapeRe).join("\\s+"), "i").exec(passage);
    const tail = new RegExp(words.slice(-4).map(escapeRe).join("\\s+"), "i").exec(passage);
    if (head && tail && tail.index + tail[0].length > head.index) return [head.index, tail.index + tail[0].length];
  }
  return null;
}

/** The passage as paragraphs, each a list of pieces, with the quote marked. */
export function passageParagraphs(passage: string, quote: string): Piece[][] {
  const text = passage.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const range = findInPassage(text, quote);
  const out: Piece[][] = [];
  const re = /\n\s*\n/g;
  let start = 0;
  const bounds: [number, number][] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    bounds.push([start, m.index]);
    start = m.index + m[0].length;
  }
  bounds.push([start, text.length]);
  for (const [a, b] of bounds) {
    if (a === b) continue;
    const pieces: Piece[] = [];
    const push = (from: number, to: number, hit: boolean) => {
      if (to > from) pieces.push({ text: text.slice(from, to), hit });
    };
    if (!range || range[1] <= a || range[0] >= b) {
      push(a, b, false);
    } else {
      push(a, Math.max(a, range[0]), false);
      push(Math.max(a, range[0]), Math.min(b, range[1]), true);
      push(Math.min(b, range[1]), b, false);
    }
    out.push(pieces);
  }
  return out;
}
