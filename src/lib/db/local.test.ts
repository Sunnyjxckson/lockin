import { beforeEach, describe, expect, it } from "vitest";
import { db, notify, setBackend, subscribe, subscribeAll } from "./index";
import { applyQuery, LocalBackend, memoryStore, STORAGE_PREFIX, type KeyValueStore } from "./local";
import { DbError } from "./types";
import type { NewRow } from "../types";

const earning = (date: string, amount: number, app = "DoorDash"): NewRow<"earning"> => ({
  date,
  amount,
  app,
  hours: null,
  screenshot_url: null,
});

const log = (date: string, item_id: string, p: Partial<NewRow<"day_log">> = {}): NewRow<"day_log"> => ({
  date,
  item_id,
  value: null,
  checked: false,
  text: null,
  completed_at: null,
  slips: 0,
  ...p,
});

let store: KeyValueStore;
let backend: LocalBackend;

beforeEach(() => {
  store = memoryStore();
  let t = 0;
  backend = new LocalBackend(store, "memory", () => `2026-10-05T12:00:${String(t++).padStart(2, "0")}.000Z`);
  setBackend(backend);
});

describe("insert and get", () => {
  it("fills in id and created_at", async () => {
    const row = await db.insert("earning", earning("2026-10-05", 42.5));
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.created_at).toBe("2026-10-05T12:00:00.000Z");
    expect(row.amount).toBe(42.5);
    expect(await db.get("earning", row.id)).toEqual(row);
  });

  it("keeps an id that was given", async () => {
    const row = await db.insert("earning", { ...earning("2026-10-05", 1), id: "fixed" });
    expect(row.id).toBe("fixed");
    await expect(db.insert("earning", { ...earning("2026-10-05", 2), id: "fixed" })).rejects.toBeInstanceOf(DbError);
  });

  it("get returns null for a missing row", async () => {
    expect(await db.get("earning", "nope")).toBeNull();
  });

  it("insertMany writes all rows and keeps their order", async () => {
    const rows = await db.insertMany("earning", [earning("2026-10-05", 1), earning("2026-10-05", 2), earning("2026-10-06", 3)]);
    expect(rows.map((r) => r.amount)).toEqual([1, 2, 3]);
    expect((await db.list("earning")).map((r) => r.amount)).toEqual([1, 2, 3]);
    expect(await db.insertMany("earning", [])).toEqual([]);
  });

  it("returns copies, so changing a result does not change the store", async () => {
    const made = await db.insert("workout", {
      weekday: 1,
      slot: "main",
      name: "Upper A",
      kind: "lift",
      detail: null,
      exercises: [{ name: "Bench press", sets: 4, reps: "6 to 8" }],
    });
    made.exercises[0].name = "changed";
    made.name = "changed";
    const again = await db.get("workout", made.id);
    expect(again?.name).toBe("Upper A");
    expect(again?.exercises[0].name).toBe("Bench press");
    again!.exercises.push({ name: "x", sets: 1, reps: "1" });
    expect((await db.list("workout"))[0].exercises).toHaveLength(1);
  });
});

describe("list filters", () => {
  beforeEach(async () => {
    await db.insertMany("earning", [
      earning("2026-10-05", 30, "DoorDash"),
      earning("2026-10-06", 80, "Uber Eats"),
      earning("2026-10-06", 20, "DoorDash"),
      earning("2026-10-08", 55, "Instacart"),
    ]);
  });

  it("filters by equality on one or more columns", async () => {
    expect(await db.list("earning", { eq: { app: "DoorDash" } })).toHaveLength(2);
    expect(await db.list("earning", { eq: { app: "DoorDash", date: "2026-10-06" } })).toHaveLength(1);
    expect(await db.list("earning", { eq: { app: "Nobody" } })).toEqual([]);
  });

  it("treats null and missing the same in equality", async () => {
    expect(await db.list("earning", { eq: { hours: null } })).toHaveLength(4);
  });

  it("filters by an inclusive date range", async () => {
    expect((await db.list("earning", { from: "2026-10-06", to: "2026-10-08" })).map((r) => r.amount)).toEqual([80, 20, 55]);
    expect(await db.list("earning", { from: "2026-10-07" })).toHaveLength(1);
    expect(await db.list("earning", { to: "2026-10-05" })).toHaveLength(1);
    expect(await db.list("earning", { from: "2026-10-06", to: "2026-10-06", eq: { app: "DoorDash" } })).toHaveLength(1);
  });

  it("ranges on another date column", async () => {
    await db.insert("target_version", { item_id: "a", effective_from: "2026-10-01", target: { kind: "check" }, active: true });
    await db.insert("target_version", { item_id: "a", effective_from: "2026-10-09", target: { kind: "check" }, active: true });
    const rows = await db.list("target_version", { dateField: "effective_from", to: "2026-10-05" });
    expect(rows.map((r) => r.effective_from)).toEqual(["2026-10-01"]);
  });

  it("orders, both ways, and limits", async () => {
    expect((await db.list("earning", { orderBy: "amount" })).map((r) => r.amount)).toEqual([20, 30, 55, 80]);
    expect((await db.list("earning", { orderBy: "amount", ascending: false })).map((r) => r.amount)).toEqual([80, 55, 30, 20]);
    expect((await db.list("earning", { orderBy: "amount", ascending: false, limit: 2 })).map((r) => r.amount)).toEqual([80, 55]);
    expect((await db.list("earning", { orderBy: "date" })).map((r) => r.amount)).toEqual([30, 80, 20, 55]);
  });

  it("first returns one row or null", async () => {
    expect((await db.first("earning", { orderBy: "amount", ascending: false }))?.amount).toBe(80);
    expect(await db.first("earning", { eq: { app: "Nobody" } })).toBeNull();
  });

  it("applyQuery sorts nulls first and numbers as numbers", () => {
    const rows = [{ n: 10 }, { n: 9 }, { n: null }, { n: 100 }];
    expect(applyQuery(rows, { orderBy: "n" as never }).map((r) => r.n)).toEqual([null, 9, 10, 100]);
  });
});

describe("update", () => {
  it("merges the patch and keeps id and created_at", async () => {
    const row = await db.insert("earning", earning("2026-10-05", 30));
    const next = await db.update("earning", row.id, { amount: 45, hours: 2, id: "hijack", created_at: "x" } as never);
    expect(next).toEqual({ ...row, amount: 45, hours: 2 });
    expect(await db.get("earning", row.id)).toEqual(next);
  });

  it("throws for a missing row", async () => {
    await expect(db.update("earning", "nope", { amount: 1 })).rejects.toBeInstanceOf(DbError);
  });
});

describe("upsert", () => {
  it("inserts when nothing matches, updates when the conflict columns match", async () => {
    const a = await db.upsert("day_log", log("2026-10-05", "wake", { checked: true }), ["date", "item_id"]);
    const b = await db.upsert("day_log", log("2026-10-05", "wake", { checked: false }), ["date", "item_id"]);
    expect(b.id).toBe(a.id);
    expect(b.created_at).toBe(a.created_at);
    expect(b.checked).toBe(false);
    expect(await db.list("day_log")).toHaveLength(1);
  });

  it("a different date or item is a new row", async () => {
    await db.upsert("day_log", log("2026-10-05", "wake"), ["date", "item_id"]);
    await db.upsert("day_log", log("2026-10-06", "wake"), ["date", "item_id"]);
    await db.upsert("day_log", log("2026-10-05", "core"), ["date", "item_id"]);
    expect(await db.list("day_log")).toHaveLength(3);
  });

  it("does not let an update replace the id", async () => {
    const a = await db.upsert("body_log", { date: "2026-10-09", weight: 182, photo_url: null }, ["date"]);
    const b = await db.upsert("body_log", { id: "other", date: "2026-10-09", weight: 181, photo_url: null }, ["date"]);
    expect(b.id).toBe(a.id);
    expect(b.weight).toBe(181);
  });

  it("works on id for single row tables", async () => {
    const settings = {
      id: "app",
      seeded: true,
      timezone: "America/New_York",
      quiet_start: "23:00",
      quiet_end: "05:30",
      carbs_target: 180,
      fat_target: 60,
      weight_unit: "lb" as const,
      haptics: true,
      history_start: "2026-10-05",
      daily_floor: 100,
      weekly_food_budget: null,
      food_likes: [],
      food_dislikes: [],
      focus_goal_minutes: 60,
    };
    await db.upsert("app_settings", settings, ["id"]);
    await db.upsert("app_settings", { ...settings, haptics: false }, ["id"]);
    const rows = await db.list("app_settings");
    expect(rows).toHaveLength(1);
    expect(rows[0].haptics).toBe(false);
  });

  it("needs a conflict column", async () => {
    await expect(db.upsert("day_log", log("2026-10-05", "wake"), [])).rejects.toBeInstanceOf(DbError);
  });
});

describe("remove", () => {
  it("removes by id and is quiet when the row is gone", async () => {
    const row = await db.insert("earning", earning("2026-10-05", 30));
    await db.remove("earning", row.id);
    await db.remove("earning", row.id);
    expect(await db.list("earning")).toEqual([]);
  });

  it("removeWhere removes every match and returns the count", async () => {
    await db.insertMany("earning", [earning("2026-10-05", 1), earning("2026-10-05", 2), earning("2026-10-06", 3)]);
    expect(await db.removeWhere("earning", { date: "2026-10-05" })).toBe(2);
    expect((await db.list("earning")).map((r) => r.amount)).toEqual([3]);
    expect(await db.removeWhere("earning", { date: "2026-10-05" })).toBe(0);
  });

  it("removeWhere refuses an empty filter", async () => {
    await expect(db.removeWhere("earning", {})).rejects.toBeInstanceOf(DbError);
  });
});

describe("persistence", () => {
  it("writes one JSON array per table under the prefix", async () => {
    await db.insert("earning", earning("2026-10-05", 30));
    const raw = store.getItem(`${STORAGE_PREFIX}earning`);
    expect(JSON.parse(raw ?? "null")).toHaveLength(1);
    expect(store.getItem(`${STORAGE_PREFIX}meal`)).toBeNull();
  });

  it("a fresh backend on the same store reads what was written", async () => {
    await db.insert("earning", earning("2026-10-05", 30));
    const again = new LocalBackend(store, "memory");
    expect((await again.list("earning"))[0].amount).toBe(30);
  });

  it("survives corrupt stored data", async () => {
    store.setItem(`${STORAGE_PREFIX}earning`, "{not json");
    store.setItem(`${STORAGE_PREFIX}meal`, '{"an":"object"}');
    backend.invalidate();
    expect(await db.list("earning")).toEqual([]);
    expect(await db.list("meal")).toEqual([]);
    await db.insert("earning", earning("2026-10-05", 5));
    expect(await db.list("earning")).toHaveLength(1);
  });

  it("re-reads after invalidate, as when another tab writes", async () => {
    await db.insert("earning", earning("2026-10-05", 30));
    store.setItem(`${STORAGE_PREFIX}earning`, "[]");
    expect(await db.list("earning")).toHaveLength(1);
    backend.invalidate("earning");
    expect(await db.list("earning")).toHaveLength(0);
  });

  it("reports a full store as a DbError and keeps the old rows", async () => {
    await db.insert("earning", earning("2026-10-05", 30));
    const full: KeyValueStore = {
      getItem: (k) => store.getItem(k),
      removeItem: (k) => store.removeItem(k),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    setBackend(new LocalBackend(full, "memory"));
    await expect(db.insert("earning", earning("2026-10-06", 1))).rejects.toBeInstanceOf(DbError);
    expect(await db.list("earning")).toHaveLength(1);
  });
});

describe("subscribe and notify", () => {
  it("tells table subscribers after every kind of write, and only them", async () => {
    let earnings = 0;
    let meals = 0;
    const all: string[] = [];
    const off = subscribe("earning", () => earnings++);
    const offMeals = subscribe("meal", () => meals++);
    const offAll = subscribeAll((t) => all.push(t));

    const row = await db.insert("earning", earning("2026-10-05", 30));
    await db.update("earning", row.id, { amount: 31 });
    await db.upsert("earning", { ...earning("2026-10-05", 32), id: row.id }, ["id"]);
    await db.insertMany("earning", [earning("2026-10-06", 1)]);
    await db.removeWhere("earning", { date: "2026-10-06" });
    await db.remove("earning", row.id);
    expect(earnings).toBe(6);
    expect(meals).toBe(0);
    expect(all).toHaveLength(6);

    await db.list("earning");
    await db.removeWhere("earning", { date: "2026-10-06" });
    expect(earnings).toBe(6);

    off();
    await db.insert("earning", earning("2026-10-05", 30));
    expect(earnings).toBe(6);
    notify("meal");
    expect(meals).toBe(1);
    offMeals();
    offAll();
  });

  it("names its backend", async () => {
    expect(await db.backendName()).toBe("memory");
  });
});
