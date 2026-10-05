// Typed helpers on top of the generic interface. No React here, so these work
// in API routes too (in Supabase mode). Hooks live in ./hooks.

import { db } from "./index";
import {
  activeChallenge,
  canFinish,
  challengeProblem,
  endPatch,
  finishPatch,
  newChallengeRow,
  restartRows,
  scoringVersions,
  type ChallengeInput,
} from "../logic/challenge";
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

/** Every challenge, past and present, oldest start first. */
export async function getChallenges(): Promise<Challenge[]> {
  return db.list("challenge", { orderBy: "start_date" });
}

/**
 * The active challenge, or null in ongoing mode with none set up. Active is a
 * status, not a date check: it may not have started, or its last day may have
 * passed. Use modeOn() from logic/challenge to know what is running today.
 */
export async function getChallenge(): Promise<Challenge | null> {
  return activeChallenge(await db.list("challenge", { eq: { status: "active" }, orderBy: "created_at" }));
}

/** Change the active challenge. Throws when there is none. */
export async function updateChallenge(patch: Partial<Omit<Challenge, "id" | "created_at">>): Promise<Challenge> {
  const c = await getChallenge();
  if (!c) throw new Error("No active challenge");
  return db.update("challenge", c.id, patch);
}

/**
 * Start a challenge. Only challenge rows are written: no log, target or
 * checklist item changes, so the ongoing history is untouched. Throws when
 * one is already active or the input is not valid.
 */
export async function startChallenge(input: ChallengeInput, today: DateStr = todayNY()): Promise<Challenge> {
  const problem = challengeProblem(input, today);
  if (problem) throw new Error(problem);
  if (await getChallenge()) throw new Error("A challenge is already active. End it first.");
  return db.insert("challenge", newChallengeRow(input));
}

/** Stop the active challenge early. It is kept as a record with the days it ran. */
export async function endChallenge(today: DateStr = todayNY()): Promise<Challenge> {
  const c = await getChallenge();
  if (!c) throw new Error("No active challenge");
  return db.update("challenge", c.id, endPatch(c, today));
}

/** Mark the active challenge finished. Only once its last day is today or behind. */
export async function finishChallenge(today: DateStr = todayNY()): Promise<Challenge> {
  const c = await getChallenge();
  if (!c) throw new Error("No active challenge");
  if (!canFinish(c, today)) throw new Error("It has days left. End it early instead.");
  return db.update("challenge", c.id, finishPatch(c));
}

/**
 * Run a challenge again from `today`: same name, length and rules. Pass an id
 * to restart a past one, or leave it out to restart the active one (which is
 * then kept as abandoned). Throws when another challenge is active.
 */
export async function restartChallenge(id?: string | null, today: DateStr = todayNY()): Promise<Challenge> {
  const active = await getChallenge();
  const source = id && id !== active?.id ? await db.get("challenge", id) : active;
  if (!source) throw new Error("No challenge to restart");
  if (active && active.id !== source.id) throw new Error("A challenge is already active. End it first.");
  const { close, next } = restartRows(source, today);
  if (close) await db.update("challenge", source.id, close);
  return db.insert("challenge", next);
}

/**
 * Set the daily earnings floor everywhere it lives: app settings (the live
 * number), the "earned" checklist item's target, and the active challenge.
 */
export async function setDailyFloor(floor: number, today: DateStr = todayNY()): Promise<void> {
  const value = Math.max(0, floor);
  await updateSettings({ daily_floor: value });
  const earned = await getItemByKey("earned");
  if (earned && !(earned.target.kind === "min" && earned.target.min === value)) await setItemTarget(earned.id, { kind: "min", min: value }, today);
  const c = await getChallenge();
  if (c && c.daily_floor !== value) await db.update("challenge", c.id, { daily_floor: value });
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

/** The saved target history, as written by Settings. */
export async function getVersions(): Promise<TargetVersion[]> {
  return db.list("target_version", { orderBy: "effective_from" });
}

/**
 * The target history to score with: the saved versions with each challenge's
 * rule targets laid over the days it ran. This is what useChecklist() returns
 * as `versions`, and what anything that scores days outside React should use.
 */
export async function getScoringVersions(): Promise<TargetVersion[]> {
  const [versions, challenges] = await Promise.all([getVersions(), getChallenges()]);
  return scoringVersions(versions, challenges);
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
  typical_spend?: number | null;
  spend_period?: ChecklistItem["spend_period"];
  weekly_day?: Weekday | null;
  /** Which of Today's four tracks it counts toward. Leave out for the default. */
  track?: ChecklistItem["track"];
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
    typical_spend: input.typical_spend ?? null,
    spend_period: input.spend_period ?? null,
    track: input.track ?? null,
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
  return { date, item_id: itemId, value: null, checked: false, text: null, completed_at: null, slips: 0, ...fields };
}

// Day log writes read the row first, then write it back. Running them one at
// a time keeps two quick taps from overwriting each other.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

async function existingLog(date: DateStr, itemId: string): Promise<DayLog | null> {
  return db.first("day_log", { eq: { date, item_id: itemId } });
}

/** Tick or untick a yes/no or text item for a date. */
export function setChecked(itemId: string, date: DateStr, checked: boolean, at: Date = new Date()): Promise<DayLog> {
  return serial(async () => {
    const prev = await existingLog(date, itemId);
    return db.upsert(
      "day_log",
      logRow(date, itemId, { value: prev?.value ?? null, text: prev?.text ?? null, slips: prev?.slips ?? 0, checked, completed_at: checked ? nowIso(at) : null }),
      ["date", "item_id"],
    );
  });
}

/** Set a number item for a date. Null clears it. */
export function setValue(itemId: string, date: DateStr, value: number | null, at: Date = new Date()): Promise<DayLog> {
  return serial(async () => {
    const prev = await existingLog(date, itemId);
    const has = value !== null && !Number.isNaN(value);
    return db.upsert(
      "day_log",
      logRow(date, itemId, { text: prev?.text ?? null, slips: prev?.slips ?? 0, value: has ? value : null, checked: has, completed_at: has ? nowIso(at) : null }),
      ["date", "item_id"],
    );
  });
}

/** Set the text of a text item for a date. Keeps the tick as it was. */
export function setText(itemId: string, date: DateStr, text: string): Promise<DayLog> {
  return serial(async () => {
    const prev = await existingLog(date, itemId);
    const clean = text.trim();
    const checked = clean.length > 0 ? (prev?.checked ?? false) : false;
    return db.upsert(
      "day_log",
      logRow(date, itemId, {
        value: prev?.value ?? null,
        slips: prev?.slips ?? 0,
        text: clean.length > 0 ? clean : null,
        checked,
        completed_at: checked ? (prev?.completed_at ?? null) : null,
      }),
      ["date", "item_id"],
    );
  });
}

/**
 * Recount the slips logged for one item on one date and store the count on
 * its day_log row. Call it after any vice_slip row is added, changed or
 * removed. This is what makes a slip count everywhere day_log is scored.
 */
export function syncSlipCount(itemId: string, date: DateStr): Promise<DayLog | null> {
  return serial(async () => {
    const [prev, slips] = await Promise.all([existingLog(date, itemId), db.list("vice_slip", { eq: { item_id: itemId, date } })]);
    const n = slips.length;
    if (!prev && n === 0) return null;
    if (prev && (prev.slips ?? 0) === n) return prev;
    return db.upsert(
      "day_log",
      logRow(date, itemId, {
        value: prev?.value ?? null,
        text: prev?.text ?? null,
        checked: prev?.checked ?? false,
        completed_at: prev?.completed_at ?? null,
        slips: n,
      }),
      ["date", "item_id"],
    );
  });
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
