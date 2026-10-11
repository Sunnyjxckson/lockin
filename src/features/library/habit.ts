// The "Read N quotes" daily habit. Off by default and not in the checklist at
// all until it is turned on in Settings, Checklist. Then it is an ordinary
// number item (key `read_quotes`), so versioned targets, streaks and day
// locking all apply with no special cases. Its value is the number of quotes
// read on that day, written here whenever a quote is marked read.

import { addItem, getItemByKey, saveItem, setItemActive, setValueByKey } from "@/lib/db/helpers";
import { nyParts } from "@/lib/logic/dates";
import { readOnDate } from "@/lib/logic/libraryQueue";
import type { ChecklistItem, DateStr } from "@/lib/types";
import { currentMarks } from "./state";

export const READ_KEY = "read_quotes";
export const DEFAULT_READ_TARGET = 10;
export const MIN_READ_TARGET = 1;
export const MAX_READ_TARGET = 100;

export function readHabitName(n: number): string {
  return `Read ${n} quotes`;
}

export function clampReadTarget(n: number | null | undefined): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_READ_TARGET, Math.max(MIN_READ_TARGET, v)) : DEFAULT_READ_TARGET;
}

/** The number a habit item asks for, or the default. */
export function readTargetOf(item: ChecklistItem | null): number {
  return item && item.target.kind === "min" ? clampReadTarget(item.target.min) : DEFAULT_READ_TARGET;
}

export function isReadHabitOn(item: ChecklistItem | null): boolean {
  return !!item && item.active && !item.archived;
}

/** Turn the habit on, or change its number. Applies from today, like any target change. */
export async function enableReadHabit(n: number): Promise<ChecklistItem> {
  const count = clampReadTarget(n);
  const fields = { name: readHabitName(count), target: { kind: "min" as const, min: count }, unit: "quotes" };
  const item = await getItemByKey(READ_KEY);
  const saved = item ? await saveItem(item.id, { ...fields, active: true, archived: false }) : await addItem({ ...fields, key: READ_KEY, type: "number", track: "mind" });
  await syncReadHabit();
  return saved;
}

/** Turn it off from today forward. Past days keep what they scored. */
export async function disableReadHabit(): Promise<void> {
  const item = await getItemByKey(READ_KEY);
  if (item && item.active) await setItemActive(item.id, false);
}

// One write at a time, so two reads close together cannot land out of order
// and leave the day one short.
let syncing: Promise<void> = Promise.resolve();

/** Write the day's read count into the habit. Does nothing while the habit is off or has never been on. */
export function syncReadHabit(date?: DateStr): Promise<void> {
  const run = syncing.then(async () => {
    const day = date ?? nyParts(new Date().toISOString()).date;
    const item = await getItemByKey(READ_KEY);
    if (!isReadHabitOn(item)) return;
    const n = readOnDate(currentMarks(), day);
    // Nothing read yet is nothing to write: the tile shows 0 without a row.
    if (n > 0) await setValueByKey(READ_KEY, day, n);
  });
  syncing = run.catch(() => undefined);
  return run;
}
