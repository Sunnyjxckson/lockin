// First run: write the starting defaults. Safe to call on every load, it
// only writes when app_settings has no seeded row.

import { db } from "../db";
import { BASELINE_DATE } from "../logic/targets";
import type { NewRow } from "../types";
import {
  SEED_CHALLENGE,
  SEED_ITEMS,
  SEED_REMINDERS,
  SEED_SETTINGS,
  SEED_TEMPLATE,
  SEED_VICE_LIBRARY,
  SEED_WORKOUTS,
} from "./data";

export * from "./data";

function uid(): string {
  return globalThis.crypto.randomUUID();
}

let running: Promise<boolean> | null = null;

/** Returns true when it seeded, false when the data was already there. */
export function ensureSeeded(): Promise<boolean> {
  if (!running) {
    running = seedIfEmpty().finally(() => {
      running = null;
    });
  }
  return running;
}

async function seedIfEmpty(): Promise<boolean> {
  const settings = await db.get("app_settings", "app");
  if (settings?.seeded) return false;

  // Checklist first, vices from the library after it. Ids are made here so
  // the version rows can point at them.
  const items: NewRow<"checklist_item">[] = [...SEED_ITEMS, ...SEED_VICE_LIBRARY].map((item, i) => ({
    ...item,
    id: uid(),
    sort_order: (i + 1) * 10,
    archived: false,
  }));
  const versions: NewRow<"target_version">[] = items.map((item) => ({
    item_id: item.id as string,
    effective_from: BASELINE_DATE,
    target: item.target,
    active: item.active,
  }));

  if (!(await db.get("challenge", SEED_CHALLENGE.id as string))) await db.insert("challenge", SEED_CHALLENGE);
  if ((await db.list("checklist_item", { limit: 1 })).length === 0) {
    await db.insertMany("checklist_item", items);
    await db.insertMany("target_version", versions);
  }
  if ((await db.list("schedule_template", { limit: 1 })).length === 0) await db.insertMany("schedule_template", SEED_TEMPLATE);
  if ((await db.list("workout", { limit: 1 })).length === 0) await db.insertMany("workout", SEED_WORKOUTS);
  if ((await db.list("reminder", { limit: 1 })).length === 0) {
    await db.insertMany(
      "reminder",
      SEED_REMINDERS.map((r, i) => ({ ...r, item_id: null, sort_order: (i + 1) * 10 })),
    );
  }
  // Written last: its presence is what marks the seed as complete.
  await db.upsert("app_settings", SEED_SETTINGS, ["id"]);
  return true;
}
