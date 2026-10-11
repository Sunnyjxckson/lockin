"use client";

// The device side of philosophy drops. Loaded only when drops are switched
// on, so the short quote set and the reading state stay out of every
// screen's first load. It makes the function that picks a drop for a date
// and slot: the same walk the server does (logic/drops), skipping quotes
// already read in the Library, which the device knows at once.

import pool from "@/data/quotes-short.json";
import { dropMessage, pickDrop, type DropMessage, type ShortPool } from "@/lib/logic/drops";
import { currentMarks, ensureMarks, subscribeMarks } from "./state";

export type DropPicker = (date: string, slot: number, perDay: number) => DropMessage | null;

const shortPool = pool as unknown as ShortPool;

function make(): DropPicker {
  const marks = currentMarks();
  return (date, slot, perDay) => {
    const q = pickDrop(shortPool, date, slot, perDay, (id) => !!marks.get(id)?.read_at);
    return q ? dropMessage(shortPool, q) : null;
  };
}

/**
 * Hand `set` a picker now and a new one whenever what has been read changes.
 * When the reading state cannot be loaded (the Library migration has not
 * been run) it picks without it, which is what the server does too.
 */
export async function connect(set: (picker: DropPicker) => void): Promise<void> {
  await ensureMarks().catch(() => undefined);
  set(make());
  subscribeMarks(() => set(make()));
}
