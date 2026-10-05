// Target versioning. Settings changes apply from today forward, so every
// change writes a target_version row dated today, and scoring a past day
// reads the version that was in force on that day. Pure functions.

import type { ChecklistItem, DateStr, NewRow, Target, TargetVersion } from "../types";

/** Seeded versions use this date so they cover any challenge start. */
export const BASELINE_DATE: DateStr = "2000-01-01";

/** An item paired with the target it is scored against on one date. */
export interface ScoredItem {
  item: ChecklistItem;
  target: Target;
}

/** The version in force for an item on a date, or null if none had started. */
export function versionOn(versions: readonly TargetVersion[], itemId: string, date: DateStr): TargetVersion | null {
  let best: TargetVersion | null = null;
  for (const v of versions) {
    if (v.item_id !== itemId || v.effective_from > date) continue;
    if (!best || v.effective_from > best.effective_from) best = v;
  }
  return best;
}

function hasVersions(versions: readonly TargetVersion[], itemId: string): boolean {
  return versions.some((v) => v.item_id === itemId);
}

/**
 * The target an item was scored against on a date. Items with no version
 * rows at all fall back to the target on the item itself.
 */
export function targetOn(item: ChecklistItem, versions: readonly TargetVersion[], date: DateStr): Target {
  return versionOn(versions, item.id, date)?.target ?? item.target;
}

/**
 * Whether an item was in the checklist on a date. An item added today is not
 * active on earlier days. An item removed today is still active on earlier days.
 */
export function isActiveOn(item: ChecklistItem, versions: readonly TargetVersion[], date: DateStr): boolean {
  const v = versionOn(versions, item.id, date);
  if (v) return v.active;
  return hasVersions(versions, item.id) ? false : item.active;
}

/** The checklist for one date, in display order, with that date's targets. */
export function scoredItems(
  items: readonly ChecklistItem[],
  versions: readonly TargetVersion[],
  date: DateStr,
): ScoredItem[] {
  return items
    .filter((item) => isActiveOn(item, versions, date))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((item) => ({ item, target: targetOn(item, versions, date) }));
}

/**
 * The row to upsert (on item_id + effective_from) when a target or the on/off
 * state changes. Dated today, so yesterday keeps what it was scored against.
 */
export function versionForChange(
  itemId: string,
  today: DateStr,
  target: Target,
  active: boolean,
): NewRow<"target_version"> {
  return { item_id: itemId, effective_from: today, target, active };
}

export function targetsEqual(a: Target, b: Target): boolean {
  if (a.kind !== b.kind) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  return x.by === y.by && x.min === y.min && x.max === y.max;
}

/** The default target for a freshly made item of a type. */
export function defaultTarget(type: ChecklistItem["type"]): Target {
  if (type === "number") return { kind: "min", min: 1 };
  if (type === "text") return { kind: "text" };
  return { kind: "check" };
}

function num(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function withUnit(n: number, unit: string | null): string {
  if (!unit) return num(n);
  if (unit === "$") return `$${num(n)}`;
  return unit.length <= 2 ? `${num(n)}${unit}` : `${num(n)} ${unit}`;
}

/** Short human text for a target: "1,900 to 2,100", "180g or more", "By 6:00 AM". */
export function describeTarget(target: Target, unit: string | null = null): string {
  switch (target.kind) {
    case "check":
      return "";
    case "check_by": {
      const [h, m] = target.by.split(":").map(Number);
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `Check by ${h12}:${m < 10 ? "0" : ""}${m} ${h < 12 ? "AM" : "PM"}`;
    }
    case "min":
      return `${withUnit(target.min, unit)} or more`;
    case "max":
      return `${withUnit(target.max, unit)} or less`;
    case "range":
      return `${num(target.min)} to ${withUnit(target.max, unit)}`;
    case "text":
      return "Write it, then check it";
  }
}
