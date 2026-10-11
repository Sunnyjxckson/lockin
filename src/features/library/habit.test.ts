import { beforeEach, describe, expect, it } from "vitest";
import { db, setBackend } from "@/lib/db";
import { LocalBackend, memoryStore } from "@/lib/db/local";
import { getItemByKey } from "@/lib/db/helpers";
import { DEFAULT_READ_TARGET, READ_KEY, clampReadTarget, disableReadHabit, enableReadHabit, readHabitName, syncReadHabit } from "./habit";
import { markRead, resetMarks } from "./state";

const ref = (n: number) => ({ id: `seneca-letters-letter-${n}-a${n}b`, writer: "seneca", work: "letters" });
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("the reading habit", () => {
  beforeEach(() => {
    resetMarks();
    setBackend(new LocalBackend(memoryStore(), "local", () => "2026-10-11T16:00:00.000Z"));
  });

  it("does not exist until it is turned on, and reading changes nothing before", async () => {
    expect(await getItemByKey(READ_KEY)).toBeNull();
    await markRead(ref(1), "2026-10-11T16:00:00.000Z");
    await settle();
    expect(await getItemByKey(READ_KEY)).toBeNull();
    expect((await db.list("day_log")).filter((l) => l.item_id)).toEqual([]);
  });

  it("is a number item with a minimum target, and counts what was read that day", async () => {
    await markRead(ref(1), "2026-10-11T16:00:00.000Z");
    const item = await enableReadHabit(2);
    expect(item).toMatchObject({ key: READ_KEY, name: "Read 2 quotes", type: "number", unit: "quotes", active: true, target: { kind: "min", min: 2 } });
    await markRead(ref(2), "2026-10-11T16:05:00.000Z");
    await settle();
    const logs = await db.list("day_log", { from: "2026-10-11", to: "2026-10-11" });
    expect(logs.find((l) => l.item_id === item.id)?.value).toBe(2);
  });

  it("changes the number and turns off from today forward", async () => {
    const a = await enableReadHabit(10);
    const b = await enableReadHabit(5);
    expect(b.id).toBe(a.id);
    expect(b.name).toBe(readHabitName(5));
    await disableReadHabit();
    expect((await getItemByKey(READ_KEY))?.active).toBe(false);
    await markRead(ref(3), "2026-10-11T17:00:00.000Z");
    await syncReadHabit("2026-10-11");
    expect((await db.list("day_log")).filter((l) => l.item_id === a.id)).toEqual([]);
  });

  it("keeps the number sensible", () => {
    expect(clampReadTarget(0)).toBe(1);
    expect(clampReadTarget(500)).toBe(100);
    expect(clampReadTarget(NaN)).toBe(DEFAULT_READ_TARGET);
  });
});
