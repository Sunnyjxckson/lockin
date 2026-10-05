// Typed helpers on top of the generic interface. No React here, so these work
// in API routes too (in Supabase mode). Hooks live in ./hooks.

import { db } from "./index";
import { nowIso, todayNY } from "../logic/dates";
import { defaultTarget, targetsEqual, versionForChange } from "../logic/targets";
import type {
  AppSettings,
  Challenge,
  ChecklistItem,
  DateStr,
  DayLog,
  NewRow,
  Target,
  TargetVersion,
  Weekday,
  Workout,
} from "../types";

// ---------- singletons ----------

/** The active challenge. There is one row. Null only before first run seeding. */
export async function getChallenge(): Promise<Challenge | null> {
  return db.first("challenge", { orderBy: "created_at" });
}

export async function updateChallenge(patch: Partial<Omit<Challenge, "id" | "created_at">>): Promise<Challenge> {
  const c = await getChallenge();
  if (!c) throw new Error("No challenge yet");
  return db.update("challenge", c.id, patch);
}

export async function getSettings(): Promise<AppSettings | null> {
  return db.get("app_settings", "app");
}

export async function updateSettings(patch: Partial<Omit<AppSettings, "id" | "created_at">>): Promise<AppSettings> {
  return db.update("app_settings", "app", patch);
}

// ---------- checklist ----------

/** Every item, including vices that are off and archived items. */
export async function getItems(): Promise<ChecklistItem[]> {
  return db.list("checklist_item", { orderBy: "sort_order" });
}

export async function getItemByKey(key: string): Promise<ChecklistItem | null> {
  return db.first("checklist_item", { eq: { key } });
}

export async function getVersions(): Promise<TargetVersion[]> {
  return db.list("target_version", { orderBy: "effective_from" });
}

export interface NewItemInput {
  name: string;
  type: ChecklistItem["type"];
  cadence?: ChecklistItem["cadence"];
  target?: Target;
  category?: ChecklistItem["category"];
  mode?: ChecklistItem["mode"];
  unit?: string | null;
  hint?: string | null;
  key?: string | null;
  tracks_money?: boolean;
  weekly_day?: Weekday | null;
}

/** Add an item to the checklist. It counts from today, not on earlier days. */
export async function addItem(input: NewItemInput, today: DateStr = todayNY()): Promise<ChecklistItem> {
  const all = await getItems();
  const last = all.filter((i) => !i.archived && i.active).reduce((m, i) => Math.max(m, i.sort_order), 0);
  const target = input.target ?? defaultTarget(input.type);
  const item = await db.insert("checklist_item", {
    key: input.key ?? null,
    name: input.name.trim(),
    type: input.type,
    cadence: input.cadence ?? "daily",
    target,
    category: input.category ?? "habit",
    mode: input.mode ?? null,
    unit: input.unit ?? null,
    hint: input.hint ?? null,
    sort_order: last + 10,
    active: true,
    archived: false,
    weekly_day: input.weekly_day ?? null,
    with_photo: false,
    tracks_money: input.tracks_money ?? false,
  });
  await db.upsert("target_version", versionForChange(item.id, today, target, true), ["item_id", "effective_from"]);
  return item;
}

/**
 * Change an item. Name, hint, unit, order and the like change in place.
 * A new target or on/off state also writes a target_version dated today, so
 * the change applies from today forward and past days keep their scoring.
 */
export async function saveItem(
  id: string,
  patch: Partial<Omit<ChecklistItem, "id" | "created_at">>,
  today: DateStr = todayNY(),
): Promise<ChecklistItem> {
  const before = await db.get("checklist_item", id);
  if (!before) throw new Error("Item not found");
  const after = await db.update("checklist_item", id, patch);
  if (!targetsEqual(before.target, after.target) || before.active !== after.active) {
    await db.upsert("target_version", versionForChange(id, today, after.target, after.active), ["item_id", "effective_from"]);
  }
  return after;
}

export function setItemTarget(id: string, target: Target, today?: DateStr): Promise<ChecklistItem> {
  return saveItem(id, { target }, today);
}

/** Turn an item (or a vice from the library) on or off from today forward. */
export function setItemActive(id: string, active: boolean, today?: DateStr): Promise<ChecklistItem> {
  return saveItem(id, { active }, today);
}

/** Remove from the checklist from today forward. Past days still count it. */
export function removeItem(id: string, today?: DateStr): Promise<ChecklistItem> {
  return saveItem(id, { active: false, archived: true }, today);
}

/** Save a new display order. Pass item ids top to bottom. */
export async function reorderItems(ids: string[]): Promise<void> {
  const all = await getItems();
  const byId = new Map(all.map((i) => [i.id, i]));
  let n = 0;
  for (const id of ids) {
    n += 10;
    if (byId.get(id) && byId.get(id)?.sort_order !== n) await db.update("checklist_item", id, { sort_order: n });
  }
}

// ---------- day logs ----------

export async function getLogs(from: DateStr, to: DateStr = from): Promise<DayLog[]> {
  return db.list("day_log", { from, to, orderBy: "date" });
}

function logRow(date: DateStr, itemId: string, fields: Partial<DayLog>): NewRow<"day_log"> {
  return { date, item_id: itemId, value: null, checked: false, text: null, completed_at: null, ...fields };
}

async function existingLog(date: DateStr, itemId: string): Promise<DayLog | null> {
  return db.first("day_log", { eq: { date, item_id: itemId } });
}

/** Tick or untick a yes/no or text item for a date. */
export async function setChecked(itemId: string, date: DateStr, checked: boolean, at: Date = new Date()): Promise<DayLog> {
  const prev = await existingLog(date, itemId);
  return db.upsert(
    "day_log",
    logRow(date, itemId, { value: prev?.value ?? null, text: prev?.text ?? null, checked, completed_at: checked ? nowIso(at) : null }),
    ["date", "item_id"],
  );
}

/** Set a number item for a date. Null clears it. */
export async function setValue(itemId: string, date: DateStr, value: number | null, at: Date = new Date()): Promise<DayLog> {
  const prev = await existingLog(date, itemId);
  const has = value !== null && !Number.isNaN(value);
  return db.upsert(
    "day_log",
    logRow(date, itemId, { text: prev?.text ?? null, value: has ? value : null, checked: has, completed_at: has ? nowIso(at) : null }),
    ["date", "item_id"],
  );
}

/** Set the text of a text item for a date. Keeps the tick as it was. */
export async function setText(itemId: string, date: DateStr, text: string): Promise<DayLog> {
  const prev = await existingLog(date, itemId);
  const clean = text.trim();
  const checked = clean.length > 0 ? (prev?.checked ?? false) : false;
  return db.upsert(
    "day_log",
    logRow(date, itemId, {
      value: prev?.value ?? null,
      text: clean.length > 0 ? clean : null,
      checked,
      completed_at: checked ? (prev?.completed_at ?? null) : null,
    }),
    ["date", "item_id"],
  );
}

/**
 * Set the number for a seeded item by its key. This is how other features
 * keep the checklist in step with their own data:
 *   Money: setValueByKey("earned", date, totalEarnedThatDay)
 *   Body:  setValueByKey("calories", date, total), setValueByKey("protein", date, total)
 * Does nothing when the item does not exist.
 */
export async function setValueByKey(key: string, date: DateStr, value: number | null): Promise<DayLog | null> {
  const item = await getItemByKey(key);
  if (!item) return null;
  return setValue(item.id, date, value);
}

/** Record a weigh-in: writes body_log and the weekly weigh-in checklist item. */
export async function logWeight(date: DateStr, weight: number | null): Promise<void> {
  const prev = await db.first("body_log", { eq: { date } });
  await db.upsert("body_log", { date, weight, photo_url: prev?.photo_url ?? null }, ["date"]);
  await setValueByKey("weighin", date, weight);
}

// ---------- workouts ----------

export async function getWorkouts(): Promise<Workout[]> {
  return db.list("workout", { orderBy: "weekday" });
}

/** The main workout and the core routine for a weekday. Either can be null. */
export function workoutsFor(all: readonly Workout[], weekday: Weekday): { main: Workout | null; core: Workout | null } {
  return {
    main: all.find((w) => w.weekday === weekday && w.slot === "main") ?? null,
    core: all.find((w) => w.weekday === weekday && w.slot === "core") ?? null,
  };
}

// ---------- reset ----------

/** Wipe everything this device can reach and seed again. Settings only. */
export async function resetAllData(): Promise<void> {
  const { TABLE_NAMES, SERVER_ONLY_TABLES } = await import("../types");
  const remote = (await db.backendName()) === "remote";
  for (const table of TABLE_NAMES) {
    if (remote && SERVER_ONLY_TABLES.includes(table)) continue;
    const rows = await db.list(table);
    for (const r of rows) await db.remove(table, r.id);
  }
  const { ensureSeeded } = await import("../seed");
  await ensureSeeded();
}
