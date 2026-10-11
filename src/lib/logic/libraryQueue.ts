// What the reader walks through. A way in (a scope) covers some quotes in a
// fixed order. The queue is the part of that you have not read, so nothing
// comes twice on the first pass. When everything in the scope is read, a
// second pass starts from the top and says so. Pure.

import { addDays, nyParts } from "./dates";
import type { LibQuote, Marks, Moment, Scope, Theme } from "./library";
import type { DateStr } from "../types";

// ---------- seeded order ----------

/** A small seeded generator (mulberry32). The same seed gives the same numbers on any device. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded shuffle that leaves the input alone. The same seed and the same list always give the same order. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A new shuffle seed. Call it from an event, not while rendering. */
export function newSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999_998);
}

/** Take one from each writer in turn, each writer's own order kept, so a theme does not start with an hour of one man. */
export function interleave(quotes: readonly LibQuote[]): LibQuote[] {
  const lanes = new Map<string, LibQuote[]>();
  for (const q of quotes) {
    const lane = lanes.get(q.writer);
    if (lane) lane.push(q);
    else lanes.set(q.writer, [q]);
  }
  const order = Array.from(lanes.values());
  // Longer lanes spread over the whole run, so a small writer is not used up in the first few cards.
  const out: LibQuote[] = [];
  const longest = Math.max(0, ...order.map((l) => l.length));
  const taken = order.map(() => 0);
  for (let step = 0; step < longest; step++) {
    order.forEach((lane, i) => {
      const want = Math.ceil(((step + 1) * lane.length) / longest);
      while (taken[i] < want) out.push(lane[taken[i]++]);
    });
  }
  return out;
}

// ---------- scopes ----------

/**
 * The quotes a scope covers, in the order they are read. `all` is every quote
 * loaded, in reading order (writers as the index lists them, each in source
 * order).
 *  - writer: that writer, source order (one work if named)
 *  - theme, moment: every writer taken in turn
 *  - shuffle: everything, in the seeded order
 *  - saved: your collection, newest saved first
 */
export function scopeQuotes(scope: Scope, all: readonly LibQuote[], marks: Marks): LibQuote[] {
  switch (scope.kind) {
    case "writer":
      return all.filter((q) => q.writer === scope.writer && (!scope.work || q.work === scope.work));
    case "theme":
      return interleave(all.filter((q) => q.themes.includes(scope.theme)));
    case "moment":
      return interleave(all.filter((q) => q.moments.includes(scope.moment)));
    case "shuffle":
      return shuffled(all, scope.seed);
    case "saved":
      return all
        .filter((q) => marks.get(q.id)?.saved_at)
        .sort((a, b) => (marks.get(b.id)?.saved_at ?? "").localeCompare(marks.get(a.id)?.saved_at ?? ""));
  }
}

export function isRead(marks: Marks, id: string): boolean {
  return !!marks.get(id)?.read_at;
}

export interface ScopeCounts {
  read: number;
  total: number;
}

export function scopeCounts(quotes: readonly LibQuote[], marks: Marks): ScopeCounts {
  let read = 0;
  for (const q of quotes) if (isRead(marks, q.id)) read += 1;
  return { read, total: quotes.length };
}

// ---------- the queue ----------

export interface Queue {
  ids: string[];
  /** 1 while there is anything unread in the scope, 2 once it has all been read and you are going through again. */
  pass: 1 | 2;
  /** Reviewing a collection (Saved): no passes, read or not. */
  review: boolean;
  /** Where to open. */
  start: number;
}

export interface QueueOptions {
  /** Open on this quote. If it was already read in a first pass it is put in front, once. */
  startAt?: string | null;
  /** The last quote you were on. A second pass begins after it. */
  after?: string | null;
}

/**
 * The queue for a scope's quotes. First pass: the unread ones, in order. Once
 * none are left: all of them again, from after `after` (or the top), pass 2.
 * A saved collection is a review: all of it, as it is. `startAt` always opens
 * on that quote.
 */
export function buildQueue(scope: Scope, quotes: readonly LibQuote[], marks: Marks, opts: QueueOptions = {}): Queue {
  const review = scope.kind === "saved";
  const unread = quotes.filter((q) => !isRead(marks, q.id));
  const first = !review && unread.length > 0;
  let ids = (first ? unread : quotes).map((q) => q.id);
  const pass: 1 | 2 = first || review ? 1 : 2;
  let start = 0;
  if (opts.startAt) {
    const at = ids.indexOf(opts.startAt);
    if (at >= 0) start = at;
    else if (quotes.some((q) => q.id === opts.startAt)) {
      ids = [opts.startAt, ...ids];
    }
  } else if (pass === 2 && opts.after) {
    const at = ids.indexOf(opts.after);
    if (at >= 0) start = (at + 1) % ids.length;
  }
  return { ids, pass, review, start };
}

// ---------- picking one quote ----------

export interface PickOptions {
  moment?: Moment;
  theme?: Theme;
  writer?: string;
  /** Any number. The same seed on the same day gives the same quote. */
  seed: number;
  /** Quote ids not to return (the ones shown lately). */
  exclude?: readonly string[];
  /** Only unread quotes. Default true. When none are left in the filter, a read one is picked anyway unless this is "strict". */
  unread?: boolean | "strict";
}

/**
 * One quote for a moment, a theme, a writer or anything, chosen by the seed.
 * It prefers quotes you have not read. Returns null only when nothing fits the
 * filter at all (or, with unread: "strict", when everything that fits is read).
 */
export function pickQuote(all: readonly LibQuote[], marks: Marks, opts: PickOptions): LibQuote | null {
  const out = new Set(opts.exclude ?? []);
  const fits = all.filter(
    (q) =>
      !out.has(q.id) &&
      (!opts.moment || q.moments.includes(opts.moment)) &&
      (!opts.theme || q.themes.includes(opts.theme)) &&
      (!opts.writer || q.writer === opts.writer),
  );
  if (fits.length === 0) return null;
  const unread = fits.filter((q) => !isRead(marks, q.id));
  const pool = opts.unread === false ? fits : unread.length > 0 ? unread : opts.unread === "strict" ? [] : fits;
  if (pool.length === 0) return null;
  const rand = seeded(Math.floor(Math.abs(opts.seed)) % 4294967296);
  return pool[Math.floor(rand() * pool.length)];
}

/** A seed that is the same all day: today's date as a number, plus anything else that should vary (a moment's index). */
export function daySeed(date: DateStr, extra = 0): number {
  return Number(date.replace(/-/g, "")) * 31 + extra;
}

// ---------- today ----------

/** How many quotes were read on a New York calendar date. */
export function readOnDate(marks: Marks, date: DateStr): number {
  // read_at is an instant in UTC. A New York day never starts before the UTC date before it, so skip older ones cheaply.
  const floor = addDays(date, -1);
  let n = 0;
  for (const m of marks.values()) {
    if (!m.read_at || m.read_at.slice(0, 10) < floor) continue;
    if (nyParts(m.read_at).date === date) n += 1;
  }
  return n;
}
