// How far into the library you are: overall, per writer and per work, and the
// moments worth marking (a writer finished, the whole library, round numbers).
// Counts come from the marks and the index alone, so no quote file has to be
// loaded to draw them. Pure.

import type { Marks, QuoteIndex } from "./library";

export interface Counts {
  read: number;
  total: number;
}

export function percent(c: Counts): number {
  return c.total > 0 ? Math.min(100, Math.round((c.read / c.total) * 100)) : 0;
}

export function fraction(c: Counts): number {
  return c.total > 0 ? Math.min(1, c.read / c.total) : 0;
}

/** Read counts keyed "writer" and "writer/work", from the marks that carry a read time. */
function tally(marks: Marks): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of marks.values()) {
    if (!m.read_at) continue;
    out.set(m.writer, (out.get(m.writer) ?? 0) + 1);
    out.set(`${m.writer}/${m.work}`, (out.get(`${m.writer}/${m.work}`) ?? 0) + 1);
  }
  return out;
}

export interface WriterCounts extends Counts {
  slug: string;
  name: string;
  works: (Counts & { slug: string; title: string })[];
}

export interface LibraryCounts {
  overall: Counts;
  writers: WriterCounts[];
}

/**
 * Overall, per writer and per work. A count never goes above its total, so a
 * quote that left the data does not push a bar past the end, and the overall
 * number is the sum of the writers' so the two always agree.
 */
export function libraryCounts(index: QuoteIndex, marks: Marks): LibraryCounts {
  const t = tally(marks);
  let read = 0;
  let total = 0;
  const writers = index.writers.map((w) => {
    const r = Math.min(w.count, t.get(w.slug) ?? 0);
    read += r;
    total += w.count;
    return {
      slug: w.slug,
      name: w.name,
      read: r,
      total: w.count,
      works: w.works.map((k) => ({ slug: k.slug, title: k.title, read: Math.min(k.count, t.get(`${w.slug}/${k.slug}`) ?? 0), total: k.count })),
    };
  });
  return { overall: { read, total }, writers };
}

export function writerCounts(index: QuoteIndex, marks: Marks, slug: string): WriterCounts | null {
  return libraryCounts(index, marks).writers.find((w) => w.slug === slug) ?? null;
}

/** Saved quotes. */
export function savedCount(marks: Marks): number {
  let n = 0;
  for (const m of marks.values()) if (m.saved_at) n += 1;
  return n;
}

// ---------- milestones ----------

export type Milestone =
  | { kind: "library"; total: number }
  | { kind: "writer"; slug: string; name: string; count: number }
  | { kind: "count"; read: number };

/** Round numbers worth a moment: 10, 25, 50, 100, 250, 500, then every 500. */
export function isRoundNumber(n: number): boolean {
  if (n <= 0) return false;
  if ([10, 25, 50, 100, 250].includes(n)) return true;
  return n >= 500 && n % 500 === 0;
}

/**
 * What a quote that has just been read finished, if anything. Call it with
 * the marks as they are after the read was recorded, and only when that read
 * is a new one (an unread quote turned read). Biggest first: the whole library,
 * then a writer, then a round number.
 */
export function milestonesAfterRead(index: QuoteIndex, marks: Marks, writer: string): Milestone[] {
  const counts = libraryCounts(index, marks);
  const out: Milestone[] = [];
  if (counts.overall.total > 0 && counts.overall.read >= counts.overall.total) out.push({ kind: "library", total: counts.overall.total });
  const w = counts.writers.find((x) => x.slug === writer);
  if (w && w.total > 0 && w.read >= w.total) out.push({ kind: "writer", slug: w.slug, name: w.name, count: w.total });
  if (isRoundNumber(counts.overall.read) && counts.overall.read < counts.overall.total) out.push({ kind: "count", read: counts.overall.read });
  return out;
}
