"use client";

// Library lines for the coach. Loaded only when a message is sent, as its own
// chunk, so the coach and the Library stay out of every screen's first load.
// Uses the short quote set (the same one philosophy drops use) and what he has
// saved and read, which it can do without when the table cannot be read.

import pool from "@/data/quotes-short.json";
import { pickCandidates, type LibCandidate } from "@/lib/logic/coachLibrary";
import type { ShortPool } from "@/lib/logic/drops";
import type { DateStr } from "@/lib/types";
import { ensureMarks } from "./state";

export async function libraryLinesFor(message: string, topic: string, used: readonly string[], date: DateStr): Promise<LibCandidate[]> {
  const saved = new Set<string>();
  const read = new Set<string>();
  try {
    const { marks } = await ensureMarks();
    for (const m of marks.values()) {
      if (m.saved_at) saved.add(m.quote_id);
      if (m.read_at) read.add(m.quote_id);
    }
  } catch {
    // No reading state yet: every line counts as unread.
  }
  return pickCandidates(pool as unknown as ShortPool, { topic, message, saved, read, used, date });
}
