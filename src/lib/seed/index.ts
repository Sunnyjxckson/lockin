// First run: write the starting defaults. Safe to call on every load, it
// only writes when app_settings has no seeded row.

import { db } from "../db";
import { plannedEnd } from "../logic/challenge";
import { todayNY } from "../logic/dates";
import { STAPLES } from "../logic/mealsFoods";
import { BASELINE_DATE } from "../logic/targets";
import type { DateStr, NewRow } from "../types";
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
export function ensureSeeded(today: DateStr = todayNY()): Promise<boolean> {
  if (!running) {
    running = seedIfEmpty(today).finally(() => {
      running = null;
    });
  }
  return running;
}

async function seedIfEmpty(today: DateStr): Promise<boolean> {
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

  // The first challenge from the PRD, unless its 30 days are already over on
  // a first install. Then the app simply starts in ongoing mode.
  const withChallenge = today <= plannedEnd(SEED_CHALLENGE);
  if (withChallenge && (await db.list("challenge", { limit: 1 })).length === 0) await db.insert("challenge", SEED_CHALLENGE);
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
  // Salt, oil and spices are assumed to be at home until the grocery list is told otherwise.
  if ((await db.list("pantry_item", { limit: 1 })).length === 0) await db.insertMany("pantry_item", STAPLES.map((name) => ({ name })));
  // Written last: its presence is what marks the seed as complete.
  // The history opens on the challenge start, so the days before a late
  // install can be backfilled, and never later than the install day.
  const historyStart = withChallenge && SEED_CHALLENGE.start_date < today ? SEED_CHALLENGE.start_date : today;
  await db.upsert("app_settings", { ...SEED_SETTINGS, history_start: historyStart }, ["id"]);
  return true;
}
