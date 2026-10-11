"use client";

// The Library's small public surface, for Today (a rough day button),
// reminders (a quote through the day), the coach, and a daily "read N quotes"
// checklist item. Import from "@/features/library/api". Everything here is
// browser side. It loads only the writer files it needs, and none of it runs
// until it is called, so importing it costs a tab nothing but this file.
//
// Deep link: quoteLink(id, { writer?, scope? }) from "@/lib/logic/library"
// gives "/library/read?w=<writer>&q=<id>". The reader opens on that quote and
// goes on through the scope. Re-exported here.

import { useMemo } from "react";
import { useToday } from "@/lib/db/hooks";
import { todayNY } from "@/lib/logic/dates";
import type { LibQuote, Moment } from "@/lib/logic/library";
import { daySeed, pickQuote, readOnDate, type PickOptions } from "@/lib/logic/libraryQueue";
import { libraryCounts, type LibraryCounts } from "@/lib/logic/libraryProgress";
import { ALL_WRITERS, QUOTE_INDEX, findQuote, loadWriters, makeLibrary } from "./data";
import { currentMarks, ensureMarks, markRead, setNote, setSaved, useMarks, type MarksProblem, type QuoteRef } from "./state";

export { quoteLink, readerLink, MOMENTS, THEMES, momentLabel, themeLabel } from "@/lib/logic/library";
export type { LibQuote, Moment, Theme, Scope } from "@/lib/logic/library";
export { QUOTE_INDEX } from "./data";

/** One quote by id. Pass the writer slug when you have it to load only that file. Null when there is no such quote. */
export async function loadQuote(id: string, writer?: string | null): Promise<LibQuote | null> {
  return findQuote(id, writer);
}

/** Quotes by id, in the order given. Ids that do not exist are left out. */
export async function loadQuotes(ids: readonly string[]): Promise<LibQuote[]> {
  const out: LibQuote[] = [];
  for (const id of ids) {
    const q = await findQuote(id);
    if (q) out.push(q);
  }
  return out;
}

export interface PickInput extends Omit<PickOptions, "seed"> {
  /** Any number. Default: today's date plus the filter, so the same call gives the same quote all day. */
  seed?: number;
}

/**
 * One quote, preferring ones not read yet. Filter by `moment`, `theme` or
 * `writer`. Seeded and pure: the same seed, the same filter and the same
 * reading state give the same quote. Without a seed the pick holds for the day.
 * Null when nothing fits the filter.
 */
export async function pickUnread(input: PickInput = {}): Promise<LibQuote | null> {
  const [lib, { marks }] = await Promise.all([
    loadWriters(input.writer ? [input.writer] : ALL_WRITERS).then(makeLibrary),
    ensureMarks(),
  ]);
  const seed = input.seed ?? daySeed(todayNY(), (input.moment?.length ?? 0) * 7 + (input.theme?.length ?? 0) * 13);
  return pickQuote(lib.quotes, marks, { ...input, seed });
}

/** A quote for a rough moment ("overwhelmed", "angry", "broke", "alone", "doubting", "tempted", "tired", "afraid"). */
export function pickForMoment(moment: Moment, seed?: number): Promise<LibQuote | null> {
  return pickUnread({ moment, seed });
}

/** Any quote, unread first. */
export function pickRandom(seed: number = Math.floor(Math.random() * 1e9)): Promise<LibQuote | null> {
  return pickUnread({ seed });
}

export type { PickOptions };

/** Mark a quote read. True when it was not read before. */
export async function markQuoteRead(id: string, writer?: string | null): Promise<boolean> {
  const q = await findQuote(id, writer);
  if (!q) return false;
  return markRead(refOf(q));
}

/** Save a quote to the collection, or take it out. */
export async function saveQuote(id: string, saved = true, writer?: string | null): Promise<void> {
  const q = await findQuote(id, writer);
  if (q) await setSaved(refOf(q), saved);
}

/** Keep a note on a quote. This saves the quote too. An empty note removes the note. */
export async function noteQuote(id: string, note: string, writer?: string | null): Promise<void> {
  const q = await findQuote(id, writer);
  if (q) await setNote(refOf(q), note);
}

export function refOf(q: LibQuote): QuoteRef {
  return { id: q.id, writer: q.writer, work: q.work };
}

/** How many quotes were read on a New York date (today by default). */
export async function readTodayCount(date: string = todayNY()): Promise<number> {
  const { marks } = await ensureMarks();
  return readOnDate(marks, date);
}

/** Quotes read today, live. For a checklist item or a count on Today. */
export function useReadToday(): number {
  const today = useToday();
  const { marks } = useMarks();
  return useMemo(() => readOnDate(marks, today), [marks, today]);
}

/** Read of total overall, per writer and per work, live. Needs no quote file. */
export function useLibraryCounts(): LibraryCounts & { ready: boolean; problem: MarksProblem | null; retry: () => void } {
  const { marks, ready, problem, retry } = useMarks();
  return useMemo(() => ({ ...libraryCounts(QUOTE_INDEX, marks), ready, problem, retry }), [marks, ready, problem, retry]);
}

/** The counters once, outside React. */
export async function getLibraryCounts(): Promise<LibraryCounts> {
  await ensureMarks();
  return libraryCounts(QUOTE_INDEX, currentMarks());
}
