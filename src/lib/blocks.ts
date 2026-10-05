// The one place Today (and anything else) gets a day's schedule blocks.
//
// getBlocksForDate(date) returns the per-day rows in schedule_block when the
// day has any, and otherwise builds the day from schedule_template for that
// weekday. So the Schedule feature only has to write schedule_block rows for
// a day and every reader picks them up. Nothing here needs replacing.

import { db } from "./db";
import { durationMinutes, minutesOf, weekdayOf } from "./logic/dates";
import type { BlockKind, DateStr, ScheduleBlock, ScheduleTemplate, TimeStr } from "./types";

/** A block as shown on screen, whichever table it came from. */
export interface DayBlock {
  /** schedule_block id, or "template:<template id>" when built from the template. */
  id: string;
  date: DateStr;
  block_name: string;
  start: TimeStr;
  end: TimeStr;
  duration: number;
  flexible: boolean;
  kind: BlockKind;
  note: string | null;
  calendar_event_id: string | null;
  template_id: string | null;
  source: "template" | "manual" | "calendar";
  /** True when this is a real schedule_block row, false when derived. */
  persisted: boolean;
}

function byStart(a: { start: TimeStr; end: TimeStr }, b: { start: TimeStr; end: TimeStr }): number {
  return minutesOf(a.start) - minutesOf(b.start) || minutesOf(a.end) - minutesOf(b.end);
}

/** Build a day's blocks from template rows. Pure. */
export function blocksFromTemplate(date: DateStr, template: readonly ScheduleTemplate[]): DayBlock[] {
  const weekday = weekdayOf(date);
  return template
    .filter((t) => t.weekday === weekday)
    .map((t) => ({
      id: `template:${t.id}`,
      date,
      block_name: t.block_name,
      start: t.start,
      end: t.end,
      duration: durationMinutes(t.start, t.end),
      flexible: t.flexible,
      kind: t.kind,
      note: t.note,
      calendar_event_id: null,
      template_id: t.id,
      source: "template" as const,
      persisted: false,
    }))
    .sort(byStart);
}

/** Per-day rows as DayBlocks. Pure. */
export function blocksFromRows(rows: readonly ScheduleBlock[]): DayBlock[] {
  return rows.map((r) => ({ ...r, persisted: true })).sort(byStart);
}

/** Choose per-day rows when the day has any, else the template. Pure. */
export function resolveBlocks(
  date: DateStr,
  rows: readonly ScheduleBlock[],
  template: readonly ScheduleTemplate[],
): DayBlock[] {
  const own = rows.filter((r) => r.date === date);
  return own.length > 0 ? blocksFromRows(own) : blocksFromTemplate(date, template);
}

/** The schedule for a date. */
export async function getBlocksForDate(date: DateStr): Promise<DayBlock[]> {
  const [rows, template] = await Promise.all([
    db.list("schedule_block", { eq: { date } }),
    db.list("schedule_template", { eq: { weekday: weekdayOf(date) } }),
  ]);
  return resolveBlocks(date, rows, template);
}

export interface NowNext {
  /** The block the clock is inside, if any. */
  now: DayBlock | null;
  /** The next block to start after the current time. */
  next: DayBlock | null;
  /** Minutes left in `now`. */
  minutesLeft: number | null;
  /** Minutes until `next` starts. */
  minutesUntilNext: number | null;
}

/**
 * Current and next block for a clock time on the same day. When blocks
 * overlap, the one that started most recently is "now". Pure.
 */
export function nowAndNext(blocks: readonly DayBlock[], time: TimeStr): NowNext {
  const t = minutesOf(time);
  const sorted = blocks.slice().sort(byStart);
  let now: DayBlock | null = null;
  for (const b of sorted) {
    const s = minutesOf(b.start);
    const e = s + b.duration;
    if (s <= t && t < e) now = b;
  }
  const next = sorted.find((b) => minutesOf(b.start) > t) ?? null;
  return {
    now,
    next,
    minutesLeft: now ? minutesOf(now.start) + now.duration - t : null,
    minutesUntilNext: next ? minutesOf(next.start) - t : null,
  };
}
