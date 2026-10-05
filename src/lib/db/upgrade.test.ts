// Upgrading a device store written by version 1 (one fixed challenge row, no
// ongoing history fields). Nothing that was logged may change.

import { beforeEach, describe, expect, it } from "vitest";
import { db, setBackend } from "./index";
import { getChallenge, getChallenges, getScoringVersions, getSettings } from "./helpers";
import { LocalBackend, memoryStore, STORAGE_PREFIX, type KeyValueStore } from "./local";
import { adoptDevicePrefs, upgradeLocalData } from "./upgrade";
import { STAPLES } from "../logic/mealsFoods";
import { modeOn } from "../logic/challenge";
import { summarizeDay } from "../logic/day";
import { allStreaks } from "../logic/streaks";
import { ensureSeeded } from "../seed";
import { TABLE_NAMES, type TableName } from "../types";

const CHALLENGE_V2 = ["name", "status", "ended_on", "rules", "restart_of"];
const SETTINGS_V2 = ["history_start", "daily_floor", "weekly_food_budget", "food_likes", "food_dislikes", "focus_goal_minutes", "business_goal", "preferred_store"];
const NEW_TABLES: TableName[] = ["mood_log", "motivation", "board", "board_item", "theme", "recipe", "meal_plan", "grocery_item", "pantry_item", "receipt_price", "expense", "focus_session"];

let store: KeyValueStore;

function read(table: TableName): Record<string, unknown>[] {
  return JSON.parse(store.getItem(STORAGE_PREFIX + table) ?? "[]") as Record<string, unknown>[];
}

function write(table: TableName, rows: Record<string, unknown>[]): void {
  store.setItem(STORAGE_PREFIX + table, JSON.stringify(rows));
}

function strip(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out = { ...row };
  for (const f of fields) delete out[f];
  return out;
}

/**
 * A store exactly as version 1 left it: seeded on Oct 5, used for three days,
 * with the challenge and settings rows in their old shape and none of the
 * new tables.
 */
async function v1Store(): Promise<Record<string, Record<string, unknown>[]>> {
  store = memoryStore();
  setBackend(new LocalBackend(store, "local", () => "2026-10-05T09:50:00.000Z"));
  await ensureSeeded("2026-10-05");
  const items = await db.list("checklist_item", { orderBy: "sort_order" });
  const id = (key: string) => items.find((i) => i.key === key)!.id;
  const daily = items.filter((i) => i.active && i.cadence === "daily");

  // Day 1: everything done. Day 2: a slip and a short earnings day. Day 3: half.
  for (const item of daily) {
    const value = item.key === "calories" ? 2000 : item.key === "protein" ? 190 : item.key === "earned" ? 140 : null;
    await db.insert("day_log", { date: "2026-10-05", item_id: item.id, value, checked: true, text: item.key === "business" ? "Emailed the cohort lead" : null, completed_at: "2026-10-05T09:55:00.000Z", slips: 0 });
  }
  for (const key of ["workout", "core", "study", "bed", "vice_drinking", "vice_masturbation"]) {
    await db.insert("day_log", { date: "2026-10-06", item_id: id(key), value: null, checked: true, text: null, completed_at: "2026-10-06T22:00:00.000Z", slips: 0 });
  }
  await db.insert("day_log", { date: "2026-10-06", item_id: id("vice_smoking"), value: null, checked: true, text: null, completed_at: "2026-10-06T22:00:00.000Z", slips: 1 });
  await db.insert("day_log", { date: "2026-10-06", item_id: id("earned"), value: 60, checked: true, text: null, completed_at: "2026-10-06T22:00:00.000Z", slips: 0 });
  await db.insert("day_log", { date: "2026-10-07", item_id: id("workout"), value: null, checked: true, text: null, completed_at: "2026-10-07T11:00:00.000Z", slips: 0 });
  await db.insert("day_log", { date: "2026-10-07", item_id: id("weighin"), value: 182.4, checked: true, text: null, completed_at: "2026-10-07T11:00:00.000Z", slips: 0 });
  await db.insertMany("earning", [
    { date: "2026-10-05", amount: 60, app: "Uber Eats", hours: 2, screenshot_url: null },
    { date: "2026-10-05", amount: 80, app: "DoorDash", hours: null, screenshot_url: "idb:shot1" },
    { date: "2026-10-06", amount: 60, app: "DoorDash", hours: 3, screenshot_url: null },
  ]);
  await db.insertMany("meal", [
    { date: "2026-10-05", time: "12:10", name: "Chicken, rice and broccoli", photo_url: null, calories: 1200, protein: 110, carbs: 120, fat: 25 },
    { date: "2026-10-05", time: "19:30", name: "Chicken, rice and broccoli", photo_url: "idb:meal1", calories: 800, protein: 80, carbs: 120, fat: 25 },
  ]);
  await db.insert("saved_meal", { name: "Chicken, rice and broccoli", photo_url: null, calories: 1200, protein: 110, carbs: 120, fat: 25, use_count: 2 });
  await db.insertMany("set_log", [
    { date: "2026-10-05", exercise: "Bench press", set_number: 1, weight: 135, reps: 8 },
    { date: "2026-10-05", exercise: "Bench press", set_number: 2, weight: 135, reps: 7 },
  ]);
  await db.insert("vice_slip", { item_id: id("vice_smoking"), date: "2026-10-06", time: "21:15", trigger: "stressed", amount: null });
  await db.insert("body_log", { date: "2026-10-07", weight: 182.4, photo_url: "idb:front1" });
  await db.insert("schedule_block", { date: "2026-10-05", block_name: "Lift heavy", start: "06:30", end: "07:30", duration: 60, flexible: false, kind: "workout", note: null, calendar_event_id: null, template_id: null, source: "manual" });
  await db.insert("coach_note", { date: "2026-10-05", kind: "morning", body: "Today: upper A at 6:30 AM.", source: "fallback" });
  // A target changed on day 2, as Settings would write it.
  await db.insert("target_version", { item_id: id("protein"), effective_from: "2026-10-06", target: { kind: "min", min: 200 }, active: true });
  await db.update("checklist_item", id("protein"), { target: { kind: "min", min: 200 } });

  // Back to the version 1 shapes.
  write("challenge", read("challenge").map((r) => strip(r, CHALLENGE_V2)));
  write("app_settings", read("app_settings").map((r) => strip(r, SETTINGS_V2)));
  for (const t of NEW_TABLES) store.removeItem(STORAGE_PREFIX + t);

  const before: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLE_NAMES) before[t] = read(t);
  // A fresh backend, as on the next app load.
  setBackend(new LocalBackend(store, "local", () => "2026-10-08T12:00:00.000Z"));
  return before;
}

describe("upgrading a version 1 device store", () => {
  let before: Record<string, Record<string, unknown>[]>;

  beforeEach(async () => {
    before = await v1Store();
  });

  it("starts from the old shapes", () => {
    expect(before.challenge).toHaveLength(1);
    expect(Object.keys(before.challenge[0]).sort()).toEqual(
      ["created_at", "daily_floor", "id", "length_days", "money_deadline", "money_target", "money_target_start", "start_date"].sort(),
    );
    expect(before.app_settings[0]).not.toHaveProperty("history_start");
    expect(before.day_log.length).toBeGreaterThan(20);
  });

  it("turns the one challenge into the first, active challenge and keeps its numbers", async () => {
    await upgradeLocalData();
    const all = await getChallenges();
    expect(all).toHaveLength(1);
    const c = await getChallenge();
    expect(c).toMatchObject({
      id: "challenge",
      name: "30 day lock in",
      status: "active",
      start_date: "2026-10-05",
      length_days: 30,
      ended_on: null,
      rules: null,
      restart_of: null,
      money_target: 1000,
      money_deadline: "2026-10-14",
      daily_floor: 100,
      money_target_start: null,
    });
    expect(c?.created_at).toBe(before.challenge[0].created_at);
    expect(modeOn(all, (await getSettings())!.history_start, "2026-10-08")).toMatchObject({ mode: "challenge", day: 4, length: 30 });
  });

  it("opens the ongoing history on the first day there is anything for", async () => {
    await upgradeLocalData();
    expect(await getSettings()).toMatchObject({ history_start: "2026-10-05", daily_floor: 100, weekly_food_budget: null, food_likes: [], food_dislikes: [], focus_goal_minutes: 60 });
  });

  it("loses nothing: every row that was there is still there, field for field", async () => {
    await upgradeLocalData();
    for (const table of TABLE_NAMES) {
      // The pantry is the one table the upgrade fills: the staples a new install is seeded with.
      if (table === "pantry_item") continue;
      const after = read(table);
      expect(after, table).toHaveLength(before[table].length);
      for (const old of before[table]) {
        const now = after.find((r) => r.id === old.id);
        expect(now, `${table} ${String(old.id)}`).toBeDefined();
        expect(now, `${table} ${String(old.id)}`).toMatchObject(old);
      }
    }
    // Only the two reshaped tables gained fields.
    for (const table of TABLE_NAMES) {
      if (table === "challenge" || table === "app_settings" || table === "pantry_item") continue;
      expect(read(table), table).toEqual(before[table]);
    }
  });

  it("scores every day exactly as before", async () => {
    const score = async () => {
      const items = await db.list("checklist_item", { orderBy: "sort_order" });
      const logs = await db.list("day_log");
      const versions = await getScoringVersions();
      return {
        days: ["2026-10-05", "2026-10-06", "2026-10-07"].map((d) => {
          const s = summarizeDay(d, items, versions, logs);
          return [d, s.status, s.done, s.total];
        }),
        streaks: allStreaks(items.filter((i) => i.active), versions, logs, "2026-10-08", "2026-10-05"),
      };
    };
    const was = await score();
    await upgradeLocalData();
    expect(await score()).toEqual(was);
    expect(was.days).toEqual([
      ["2026-10-05", "full", 12, 12],
      ["2026-10-06", "partial", 6, 12],
      ["2026-10-07", "partial", 1, 12],
    ]);
  });

  it("is safe to run on every load", async () => {
    await upgradeLocalData();
    const once: Record<string, unknown> = {};
    for (const t of TABLE_NAMES) once[t] = read(t);
    await upgradeLocalData();
    await upgradeLocalData();
    for (const t of TABLE_NAMES) expect(read(t), t).toEqual(once[t]);
  });

  it("keeps a floor the user had changed", async () => {
    write("challenge", read("challenge").map((r) => ({ ...r, daily_floor: 150 })));
    setBackend(new LocalBackend(store, "local"));
    await upgradeLocalData();
    expect((await getSettings())?.daily_floor).toBe(150);
  });

  it("starts the history on the earliest log when that is before the challenge", async () => {
    const rows = read("day_log");
    write("day_log", [{ ...rows[0], id: "early", date: "2026-10-03" }, ...rows]);
    setBackend(new LocalBackend(store, "local"));
    await upgradeLocalData();
    expect((await getSettings())?.history_start).toBe("2026-10-03");
  });

  it("does nothing on a store that is already current", async () => {
    store = memoryStore();
    setBackend(new LocalBackend(store, "local", () => "2026-10-05T09:50:00.000Z"));
    await ensureSeeded("2026-10-05");
    const fresh: Record<string, unknown> = {};
    for (const t of TABLE_NAMES) fresh[t] = read(t);
    await upgradeLocalData();
    for (const t of TABLE_NAMES) expect(read(t), t).toEqual(fresh[t]);
  });
});

describe("moving the pantry, receipt prices and preferred store off the reserved meal plan row", () => {
  beforeEach(async () => {
    await v1Store();
  });

  it("gives a store that never opened Meals the staples, once", async () => {
    await upgradeLocalData();
    expect((await db.list("pantry_item")).map((p) => p.name).sort()).toEqual([...STAPLES].sort());
    expect((await getSettings())?.preferred_store).toBeNull();
    // Emptied by the user afterwards, it stays empty.
    for (const p of await db.list("pantry_item")) await db.remove("pantry_item", p.id);
    await upgradeLocalData();
    expect(await db.list("pantry_item")).toHaveLength(0);
  });

  it("moves the reserved row's data to the new tables and removes the row", async () => {
    const book = await db.insert("meal_plan", { week_start: "2000-01-03", budget: 0, recipe_ids: [], meals: [], total_cost: 0, store: "Walmart" });
    const real = await db.insert("meal_plan", { week_start: "2026-10-05", budget: 70, recipe_ids: [], meals: [], total_cost: 61.2, store: "Aldi" });
    const item = { quantity: 1, unit: null, store: null, price: null };
    await db.insertMany("grocery_item", [
      { ...item, plan_id: book.id, name: "salt", category: "@pantry", prices: null, bought: true },
      { ...item, plan_id: book.id, name: "Whey  Protein", category: "@pantry", prices: null, bought: true },
      { ...item, plan_id: book.id, name: "chicken breast", category: "@price", prices: { Aldi: 2.49, Walmart: 2.97 }, bought: false },
      { ...item, plan_id: real.id, name: "rice", category: "pantry", prices: { Aldi: 1.59 }, bought: false },
    ]);
    await upgradeLocalData();
    expect((await db.list("pantry_item")).map((p) => p.name).sort()).toEqual(["salt", "whey protein"]);
    expect((await db.list("receipt_price", { orderBy: "store" })).map((p) => [p.name, p.store, p.price])).toEqual([
      ["chicken breast", "Aldi", 2.49],
      ["chicken breast", "Walmart", 2.97],
    ]);
    expect((await getSettings())?.preferred_store).toBe("Walmart");
    expect((await db.list("meal_plan")).map((p) => p.week_start)).toEqual(["2026-10-05"]);
    expect((await db.list("grocery_item")).map((g) => g.name)).toEqual(["rice"]);
    const once = TABLE_NAMES.map((t) => read(t));
    await upgradeLocalData();
    expect(TABLE_NAMES.map((t) => read(t))).toEqual(once);
  });
});

describe("adopting what an earlier build kept per device", () => {
  let prefs: Map<string, string>;
  const readPref = (k: string) => prefs.get(k) ?? null;
  const writePref = (k: string, v: string | null) => void (v === null ? prefs.delete(k) : prefs.set(k, v));

  beforeEach(async () => {
    await v1Store();
    await upgradeLocalData();
    prefs = new Map();
  });

  it("moves a finished session's away numbers, the business goal and image shapes into the tables", async () => {
    const blank = { away_count: 0, away_minutes: 0, clock_minutes: null, planned_minutes: null, completed: false, live: null };
    const done = await db.insert("focus_session", { date: "2026-10-07", start: "20:00", end: "20:50", minutes: 44, label: "Study", source: "timer", block_id: "b1", ...blank });
    const running = await db.insert("focus_session", { date: "2026-10-08", start: "09:00", end: null, minutes: 0, label: "Study", source: "timer", block_id: null, ...blank });
    const board = await db.insert("board", { name: "Body", kind: "body", cover_item_id: null, sort_order: 0 });
    const piece = { board_id: board.id, kind: "image" as const, image_url: "idb:x", note: null, color: null, palette: null, source: null, source_url: null, sort_order: 0 };
    const unmeasured = await db.insert("board_item", { ...piece, aspect: null });
    const measured = await db.insert("board_item", { ...piece, aspect: 1.5 });
    prefs.set("focus:meta", JSON.stringify({ [done.id]: { clock_minutes: 50, away_count: 2, away_minutes: 6, paused_minutes: 0, planned_minutes: 45, completed: true }, [running.id]: { away_count: 9 }, gone: { away_count: 1 } }));
    prefs.set("focus:business_goal", "  Sign three paying clients by December ");
    prefs.set("board-aspects", JSON.stringify({ [unmeasured.id]: 0.667, [measured.id]: 0.5, gone: 2 }));

    await adoptDevicePrefs(readPref, writePref);

    expect(await db.get("focus_session", done.id)).toMatchObject({ minutes: 44, clock_minutes: 50, away_count: 2, away_minutes: 6, planned_minutes: 45, completed: true });
    expect(await db.get("focus_session", running.id)).toMatchObject({ away_count: 0, end: null });
    expect((await getSettings())?.business_goal).toBe("Sign three paying clients by December");
    expect((await db.get("board_item", unmeasured.id))?.aspect).toBe(0.667);
    expect((await db.get("board_item", measured.id))?.aspect).toBe(1.5);
    expect(prefs.size).toBe(0);
  });

  it("does nothing when there is nothing kept, and never overwrites a goal already saved", async () => {
    const before = TABLE_NAMES.map((t) => read(t));
    await adoptDevicePrefs(readPref, writePref);
    expect(TABLE_NAMES.map((t) => read(t))).toEqual(before);
    await db.update("app_settings", "app", { business_goal: "The saved one" });
    prefs.set("focus:business_goal", "An old device copy");
    await adoptDevicePrefs(readPref, writePref);
    expect((await getSettings())?.business_goal).toBe("The saved one");
  });
});
