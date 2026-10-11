import { describe, expect, it } from "vitest";
import { DROP_BODY_MAX, dropCandidates, dropKey, dropMessage, dropSlotTimes, dropWindow, dropsPerDay, pickDrop, trimForNotification, type ShortPool } from "./drops";
import { dueNotifications, planDay, type PlanOptions } from "./reminders";
import { nyInstant } from "./dates";

const POOL: ShortPool = {
  names: { seneca: "Seneca", epictetus: "Epictetus" },
  quotes: Array.from({ length: 60 }, (_, i) => ({
    id: `${i % 2 ? "epictetus" : "seneca"}-work-${i}-ab${i}`,
    w: i % 2 ? "epictetus" : "seneca",
    t: `Short quote ${i}.`,
    m: ["tired"],
  })),
};

describe("how many drops", () => {
  it("is whole, one to six, and three when missing", () => {
    expect(dropsPerDay(undefined)).toBe(3);
    expect(dropsPerDay(null)).toBe(3);
    expect(dropsPerDay(0)).toBe(1);
    expect(dropsPerDay(2.4)).toBe(2);
    expect(dropsPerDay(40)).toBe(6);
  });
});

describe("when the drops land", () => {
  it("spreads them evenly from wake to bed, off the ends, on five minute marks", () => {
    expect(dropSlotTimes(3, "05:45", "23:00", "23:00", "05:30")).toEqual(["10:05", "14:25", "18:40"]);
    expect(dropSlotTimes(1, "06:00", "22:00", "23:00", "05:30")).toEqual(["14:00"]);
    for (const t of dropSlotTimes(6, "05:45", "23:00", "23:00", "05:30")) expect(t >= "05:45" && t < "23:00").toBe(true);
  });

  it("never lands in quiet hours, even with a late bedtime or an early wake", () => {
    for (const t of dropSlotTimes(6, "04:00", "23:59", "23:00", "05:30")) expect(t >= "05:30" && t < "23:00", t).toBe(true);
    // A wake and bed that are both in quiet hours fall back to the whole waking day.
    expect(dropSlotTimes(3, "23:30", "23:45", "23:00", "05:30")).toEqual(["09:55", "14:15", "18:40"]);
  });

  it("takes wake and bed from the day's blocks, else the ends of quiet hours", () => {
    expect(dropWindow([{ kind: "wake", start: "06:15" }, { kind: "bed", start: "22:30" }, { kind: "study", start: "09:00" }], "23:00", "05:30")).toEqual({ wake: "06:15", bed: "22:30" });
    expect(dropWindow([], "23:00", "05:30")).toEqual({ wake: "05:30", bed: "23:00" });
  });
});

describe("which quote", () => {
  it("is the same for the same date and slot, and different across slots and days", () => {
    const a = pickDrop(POOL, "2026-10-12", 0, 3)!;
    expect(pickDrop(POOL, "2026-10-12", 0, 3)).toEqual(a);
    const ids = new Set<string>();
    for (const day of ["2026-10-12", "2026-10-13", "2026-10-14"]) for (let slot = 0; slot < 3; slot++) ids.add(pickDrop(POOL, day, slot, 3)!.id);
    expect(ids.size).toBe(9);
  });

  it("walks the whole set before any quote comes back", () => {
    const seen = new Set<string>();
    // 60 quotes at 3 a day: 20 days.
    for (let d = 0; d < 20; d++) for (let slot = 0; slot < 3; slot++) seen.add(pickDrop(POOL, `2026-11-${String(d + 1).padStart(2, "0")}`, slot, 3)!.id);
    expect(seen.size).toBe(60);
  });

  it("gives candidates that are distinct and start with the pick", () => {
    const c = dropCandidates(POOL, "2026-10-12", 1, 3);
    expect(new Set(c.map((q) => q.id)).size).toBe(c.length);
    expect(c.length).toBe(6);
    expect(pickDrop(POOL, "2026-10-12", 1, 3)).toEqual(c[0]);
  });

  it("skips what has been read, and settles on the first when all are", () => {
    const c = dropCandidates(POOL, "2026-10-12", 0, 3);
    expect(pickDrop(POOL, "2026-10-12", 0, 3, (id) => id === c[0].id)).toEqual(c[1]);
    expect(pickDrop(POOL, "2026-10-12", 0, 3, () => true)).toEqual(c[0]);
  });

  it("handles an empty set and dates before the walk began", () => {
    expect(pickDrop({ names: {}, quotes: [] }, "2026-10-12", 0, 3)).toBeNull();
    expect(pickDrop(POOL, "2025-03-01", 2, 3)).not.toBeNull();
  });
});

describe("what a drop says", () => {
  it("has the writer as the title, the quote as the body and a link to that quote", () => {
    const q = POOL.quotes[0];
    expect(dropMessage(POOL, q)).toEqual({ title: "Seneca", body: "Short quote 0.", url: "/library/read?w=seneca&q=seneca-work-0-ab0" });
  });

  it("is never cut in the middle of a word", () => {
    const long = "Nothing is more honorable than a good conscience and nothing is more certain than that which is in the keeping of the wise ".repeat(3).trim();
    const out = trimForNotification(long);
    expect(out.length).toBeLessThanOrEqual(DROP_BODY_MAX);
    expect(out.endsWith("...")).toBe(true);
    const words = long.split(" ");
    for (const w of out.slice(0, -3).split(" ")) expect(words).toContain(w);
    expect(trimForNotification("A short one.")).toBe("A short one.");
    expect(trimForNotification("x".repeat(300)).length).toBeLessThanOrEqual(DROP_BODY_MAX);
  });
});

describe("drops in the day's plan", () => {
  const opts = (perDay: number): PlanOptions => ({
    floor: 100,
    quiet_start: "23:00",
    quiet_end: "05:30",
    drops: { perDay, pick: (date, slot) => { const q = pickDrop(POOL, date, slot, perDay); return q ? dropMessage(POOL, q) : null; } },
  });
  const day = { date: "2026-10-12", blocks: [{ id: "w", block_name: "Wake", start: "05:45", kind: "wake" as const }, { id: "b", block_name: "Bed", start: "23:00", kind: "bed" as const }], earned: 0 };

  it("adds one notification per slot, keyed by date and slot, that opens the quote", () => {
    const plan = planDay([], day, opts(3));
    expect(plan.map((n) => [n.key, n.time, n.kind])).toEqual([
      [dropKey("2026-10-12", 0), "10:05", "drop"],
      [dropKey("2026-10-12", 1), "14:25", "drop"],
      [dropKey("2026-10-12", 2), "18:40", "drop"],
    ]);
    expect(plan[0].url).toMatch(/^\/library\/read\?w=(seneca|epictetus)&q=/);
    expect(plan[0].drop).toEqual({ slot: 0, perDay: 3 });
  });

  it("adds nothing when drops are off", () => {
    expect(planDay([], day, { ...opts(3), drops: null })).toEqual([]);
    expect(planDay([], day, { floor: 100, quiet_start: "23:00", quiet_end: "05:30" })).toEqual([]);
  });

  it("is due once, and not again after it is sent", () => {
    const input = { ...opts(3), reminders: [], days: [day], sent: [] as string[], lastRun: nyInstant("2026-10-12", "10:00"), now: nyInstant("2026-10-12", "10:05") };
    const due = dueNotifications(input);
    expect(due.map((n) => n.key)).toEqual([dropKey("2026-10-12", 0)]);
    expect(dueNotifications({ ...input, sent: [due[0].key] })).toEqual([]);
  });
});
