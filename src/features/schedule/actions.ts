"use client";

// Writes for the Schedule screen. The rules are in src/lib/logic/schedule.ts.
// This only turns a before and after list into rows.

import { blocksFromRows, type DayBlock } from "@/lib/blocks";
import { db } from "@/lib/db";
import { materializedId, planDayWrite } from "@/lib/logic/schedule";
import type { DateStr } from "@/lib/types";
import { noteLocalEdit } from "@/features/calendar/client";

function rowId(date: DateStr, b: DayBlock): string {
  return !b.persisted && b.template_id && b.id.startsWith("template:") ? materializedId(date, b.template_id) : b.id;
}

const same = (a: DayBlock, b: DayBlock) => a.block_name === b.block_name && a.start === b.start && a.duration === b.duration;

/**
 * Save a day. `before` is what the screen showed, `after` is what it should
 * show now. The first save of a template day copies the whole day into
 * schedule_block, so the change touches this date only and never the
 * template.
 */
export async function saveDay(date: DateStr, before: readonly DayBlock[], after: readonly DayBlock[]): Promise<void> {
  let from = before.slice();
  let to = after.slice();

  const fresh = from.length === 0 || from.some((b) => !b.persisted);
  if (fresh) {
    // Something else (another tab, a calendar sync) may have given the day
    // its rows a moment ago. Work against those instead of inserting twice.
    const existing = await db.list("schedule_block", { eq: { date } });
    if (existing.length > 0) {
      from = blocksFromRows(existing);
      const known = new Set(existing.map((r) => r.id));
      to = to.map((b) => {
        const id = rowId(date, b);
        return known.has(id) ? { ...b, id, persisted: true } : b;
      });
    }
  }

  const edited: string[] = [];
  const old = new Map(before.map((b) => [rowId(date, b), b]));
  for (const b of after) {
    const prev = old.get(rowId(date, b));
    if (prev && !same(prev, b)) edited.push(rowId(date, b));
  }

  const write = planDayWrite(date, from, to);
  if (write.insert.length > 0) await db.insertMany("schedule_block", write.insert);
  for (const u of write.update) await db.update("schedule_block", u.id, u.patch);
  for (const id of write.remove) await db.remove("schedule_block", id);

  if (write.insert.length + write.update.length + write.remove.length > 0) noteLocalEdit(edited);
}

/** Drop the day's own rows so it follows the weekday template again. */
export async function resetDay(date: DateStr): Promise<void> {
  await db.removeWhere("schedule_block", { date });
  noteLocalEdit();
}

let counter = 0;

/** A throwaway id for a block that has not been saved yet. */
export function draftId(): string {
  counter += 1;
  return `new:${Date.now().toString(36)}${counter}`;
}
