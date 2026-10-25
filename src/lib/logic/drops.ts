// Philosophy drops: a quote through the day as a notification. Pure.
//
// The notification job on the server and the app on the phone must agree on
// which quote a drop is, and the server cannot cheaply read what has been read
// in the Library, so the choice is a function of the date and the slot over a
// small bundled set of short quotes (src/data/quotes-short.json). The set is
// put in one fixed shuffled order and a day walks through it, so a quote does
// not come back until the whole set has been through. Quotes already read in
// the Library are skipped when the reader can say so: the device knows at
// once, the server asks about the few candidates of a drop at the moment it
// sends one. Both walk the same candidates in the same order.

import { diffDays, isQuiet, minutesOf, timeFromMinutes } from "./dates";
import { shuffled } from "./libraryQueue";
import { quoteLink } from "./library";
import type { DateStr, TimeStr } from "../types";

/** One quote of the bundled short set. `w` is the writer slug, `m` the moments it fits. */
export interface ShortQuote {
  id: string;
  w: string;
  t: string;
  m: string[];
}

export interface ShortPool {
  names: Record<string, string>;
  quotes: ShortQuote[];
}

export const DEFAULT_DROPS_PER_DAY = 3;
export const MIN_DROPS_PER_DAY = 1;
export const MAX_DROPS_PER_DAY = 6;
/** The drop's candidates: the first unread of these is the drop. */
export const DROP_CANDIDATES = 6;
/** The notification body never runs past this many characters. */
export const DROP_BODY_MAX = 170;

/** A saved setting as a usable count: whole, 1 to 6, 3 when missing. */
export function dropsPerDay(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_DROPS_PER_DAY;
  return Math.min(MAX_DROPS_PER_DAY, Math.max(MIN_DROPS_PER_DAY, n));
}

// ---------- when ----------

/** Slots land on five minute marks, which is how often the job runs. */
const STEP = 5;

/**
 * The times of a day's drops: `perDay` of them, none inside quiet hours. The
 * first is the morning drop and lands exactly at wake (at the end of quiet
 * hours when wake falls inside them). The rest spread evenly after it, up to
 * bedtime, so the last sits a whole gap before bed, not on it.
 */
export function dropSlotTimes(perDay: number, wake: TimeStr, bed: TimeStr, quietStart: TimeStr, quietEnd: TimeStr): TimeStr[] {
  let lo = minutesOf(wake);
  let hi = minutesOf(bed);
  if (isQuiet(timeFromMinutes(lo), quietStart, quietEnd)) lo = minutesOf(quietEnd);
  if (hi <= lo) hi = minutesOf(quietStart) > lo ? minutesOf(quietStart) : 24 * 60 - 1;
  if (isQuiet(timeFromMinutes(hi - 1), quietStart, quietEnd)) hi = minutesOf(quietStart);
  if (hi <= lo) return [];
  const n = dropsPerDay(perDay);
  const out: TimeStr[] = [];
  for (let i = 0; i < n; i++) {
    const at = i === 0 ? lo : Math.round((lo + ((hi - lo) * i) / n) / STEP) * STEP;
    const time = timeFromMinutes(Math.min(24 * 60 - 1, at));
    if (!isQuiet(time, quietStart, quietEnd)) out.push(time);
  }
  return out;
}

/** The part of a schedule block the window needs. */
export interface WindowBlock {
  kind?: string;
  start: TimeStr;
}

/** Wake and bedtime for a day: the wake and bed blocks when it has them, else the ends of quiet hours. */
export function dropWindow(blocks: readonly WindowBlock[], quietStart: TimeStr, quietEnd: TimeStr): { wake: TimeStr; bed: TimeStr } {
  const starts = (kind: string) => blocks.filter((b) => b.kind === kind).map((b) => b.start).sort();
  return { wake: starts("wake")[0] ?? quietEnd, bed: starts("bed").slice(-1)[0] ?? quietStart };
}

// ---------- which ----------

const SHUFFLE_SEED = 1517;
const orders = new WeakMap<ShortPool, ShortQuote[]>();

function order(pool: ShortPool): ShortQuote[] {
  let o = orders.get(pool);
  if (!o) {
    o = shuffled(pool.quotes, SHUFFLE_SEED);
    orders.set(pool, o);
  }
  return o;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A step through the set that never lands on the same quote twice in a row and reaches every one. */
function stride(n: number): number {
  let s = 131 % n || 1;
  while (gcd(s, n) !== 1) s += 1;
  return s;
}

/**
 * The candidates of one drop, in order. The first is where the day's walk
 * through the set has got to for this slot. The rest are the fallbacks when
 * the first has been read, spread far apart so they do not meet another
 * day's.
 */
export function dropCandidates(pool: ShortPool, date: DateStr, slot: number, perDay: number, count = DROP_CANDIDATES): ShortQuote[] {
  const all = order(pool);
  const n = all.length;
  if (n === 0) return [];
  const per = dropsPerDay(perDay);
  const day = diffDays("2026-01-01", date);
  const base = (((day * per + slot) % n) + n) % n;
  const step = stride(n);
  const out: ShortQuote[] = [];
  const seen = new Set<string>();
  for (let j = 0; j < Math.min(count, n); j++) {
    const q = all[(base + j * step) % n];
    if (!seen.has(q.id)) {
      seen.add(q.id);
      out.push(q);
    }
  }
  return out;
}

/** The drop for a date and slot: the first candidate not read, or the first when all are. Null for an empty set. */
export function pickDrop(pool: ShortPool, date: DateStr, slot: number, perDay: number, isRead: (id: string) => boolean = () => false): ShortQuote | null {
  const c = dropCandidates(pool, date, slot, perDay);
  return c.find((q) => !isRead(q.id)) ?? c[0] ?? null;
}

// ---------- what it says ----------

/**
 * A quote cut to fit a notification: whole when it fits, otherwise cut at a
 * word and ended with three dots. Never in the middle of a word.
 */
export function trimForNotification(text: string, max = DROP_BODY_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const room = max - 3;
  let cut = flat.slice(0, room + 1);
  const space = cut.lastIndexOf(" ");
  cut = space > 0 ? cut.slice(0, space) : flat.slice(0, room);
  cut = cut.replace(/[\s,;:.!?-]+$/, "");
  return `${cut}...`;
}

export interface DropMessage {
  title: string;
  body: string;
  /** Opens that quote in the reader. */
  url: string;
}

/** The notification for a drop: the writer as the title, the quote as the body, a tap opens it. */
export function dropMessage(pool: ShortPool, q: ShortQuote): DropMessage {
  return { title: pool.names[q.w] ?? q.w, body: trimForNotification(q.t), url: quoteLink(q.id, { writer: q.w }) };
}

/** The same key the job stores, one per date and slot. Starts with its date. */
export function dropKey(date: DateStr, slot: number): string {
  return `${date}:drop:${slot}`;
}
