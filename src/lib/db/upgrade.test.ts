// Upgrading a device store written by version 1 (one fixed challenge row, no
// ongoing history fields). Nothing that was logged may change.

import { beforeEach, describe, expect, it } from "vitest";
import { db, setBackend } from "./index";
import { getChallenge, getChallenges, getScoringVersions, getSettings } from "./helpers";
import { LocalBackend, memoryStore, STORAGE_PREFIX, type KeyValueStore } from "./local";
import { upgradeLocalData } from "./upgrade";
import { modeOn } from "../logic/challenge";
import { summarizeDay } from "../logic/day";
import { allStreaks } from "../logic/streaks";
import { ensureSeeded } from "../seed";
import { TABLE_NAMES, type TableName } from "../types";

const CHALLENGE_V2 = ["name", "status", "ended_on", "rules", "restart_of"];
const SETTINGS_V2 = ["history_start", "daily_floor", "weekly_food_budget", "food_likes", "food_dislikes", "focus_goal_minutes"];
const NEW_TABLES: TableName[] = ["mood_log", "motivation", "board", "board_item", "theme", "recipe", "meal_plan", "grocery_item", "expense", "focus_session"];

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
      if (table === "challenge" || table === "app_settings") continue;
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
