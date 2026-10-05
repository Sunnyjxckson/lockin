// Small builders for tests. Not used by the app.

import type { ChecklistItem, DayLog, Target, TargetVersion } from "../types";

let n = 0;

export function makeItem(p: Partial<ChecklistItem> = {}): ChecklistItem {
  n += 1;
  return {
    id: p.id ?? `item${n}`,
    created_at: "2026-10-01T12:00:00.000Z",
    key: null,
    name: `Item ${n}`,
    type: "yesno",
    cadence: "daily",
    target: { kind: "check" },
    category: "habit",
    mode: null,
    unit: null,
    hint: null,
    sort_order: n,
    active: true,
    archived: false,
    weekly_day: null,
    with_photo: false,
    tracks_money: false,
    ...p,
  };
}

export function makeLog(itemId: string, date: string, p: Partial<DayLog> = {}): DayLog {
  n += 1;
  return {
    id: `log${n}`,
    created_at: "2026-10-01T12:00:00.000Z",
    date,
    item_id: itemId,
    value: null,
    checked: false,
    text: null,
    completed_at: null,
    ...p,
  };
}

export function makeVersion(itemId: string, from: string, target: Target, active = true): TargetVersion {
  n += 1;
  return { id: `ver${n}`, created_at: "2026-10-01T12:00:00.000Z", item_id: itemId, effective_from: from, target, active };
}

/** A ticked log. */
export function tick(itemId: string, date: string, completedAt: string | null = null): DayLog {
  return makeLog(itemId, date, { checked: true, completed_at: completedAt });
}
