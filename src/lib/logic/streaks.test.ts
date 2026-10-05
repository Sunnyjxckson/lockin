import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { allStreaks, fullDayStreak, itemStreak } from "./streaks";
import { BASELINE_DATE } from "./targets";
import { makeItem, makeLog, makeVersion, tick } from "./testkit";

const START = "2026-10-05";
const day = (n: number) => addDays(START, n - 1);

describe("daily streaks", () => {
  const item = makeItem({ id: "a" });

  it("is zero with no logs", () => {
    expect(itemStreak(item, [], [], day(5), START)).toEqual({ current: 0, best: 0, doneNow: false });
  });

  it("counts days in a row ending today", () => {
    const logs = [1, 2, 3].map((n) => tick("a", day(n)));
    expect(itemStreak(item, [], logs, day(3), START)).toEqual({ current: 3, best: 3, doneNow: true });
  });

  it("today not done yet does not break it", () => {
    const logs = [1, 2, 3].map((n) => tick("a", day(n)));
    expect(itemStreak(item, [], logs, day(4), START)).toEqual({ current: 3, best: 3, doneNow: false });
  });

  it("a missed day resets that item's streak", () => {
    const logs = [1, 2, 4, 5].map((n) => tick("a", day(n)));
    expect(itemStreak(item, [], logs, day(5), START)).toEqual({ current: 2, best: 2, doneNow: true });
    expect(itemStreak(item, [], logs, day(7), START).current).toBe(0);
  });

  it("remembers the best run", () => {
    const logs = [1, 2, 3, 4, 6].map((n) => tick("a", day(n)));
    expect(itemStreak(item, [], logs, day(6), START)).toEqual({ current: 1, best: 4, doneNow: true });
  });

  it("an unticked log row counts as not done", () => {
    const logs = [tick("a", day(1)), makeLog("a", day(2)), tick("a", day(3))];
    expect(itemStreak(item, [], logs, day(3), START).current).toBe(1);
  });

  it("never counts days before the challenge start", () => {
    const logs = [tick("a", addDays(START, -1)), tick("a", day(1)), tick("a", day(2))];
    expect(itemStreak(item, [], logs, day(2), START).current).toBe(2);
  });

  it("is per item: one item's miss leaves the others alone", () => {
    const b = makeItem({ id: "b" });
    const logs = [tick("a", day(1)), tick("a", day(2)), tick("b", day(2))];
    const s = allStreaks([item, b], [], logs, day(2), START);
    expect(s.a.current).toBe(2);
    expect(s.b.current).toBe(1);
  });

  it("scores number items against the target of each day", () => {
    const cal = makeItem({ id: "cal", type: "number", target: { kind: "range", min: 1700, max: 1900 } });
    const versions = [
      makeVersion("cal", BASELINE_DATE, { kind: "range", min: 1900, max: 2100 }),
      makeVersion("cal", day(3), { kind: "range", min: 1700, max: 1900 }),
    ];
    const logs = [
      makeLog("cal", day(1), { value: 2000, checked: true }),
      makeLog("cal", day(2), { value: 2000, checked: true }),
      makeLog("cal", day(3), { value: 1800, checked: true }),
    ];
    expect(itemStreak(cal, versions, logs, day(3), START).current).toBe(3);
    // Without versions day 1 and 2 would be judged by the new, lower range.
    expect(itemStreak(cal, [], logs, day(3), START).current).toBe(1);
  });

  it("starts from the day an item was added", () => {
    const added = makeItem({ id: "n" });
    const versions = [makeVersion("n", day(3), { kind: "check" })];
    const logs = [tick("n", day(2)), tick("n", day(3)), tick("n", day(4))];
    expect(itemStreak(added, versions, logs, day(4), START)).toEqual({ current: 2, best: 2, doneNow: true });
  });

  it("respects the wake time gate", () => {
    const wake = makeItem({ id: "wake", target: { kind: "check_by", by: "06:00" } });
    const logs = [tick("wake", day(1), "2026-10-05T09:50:00Z"), tick("wake", day(2), "2026-10-06T11:30:00Z")];
    // Today still shows yesterday's run. Tomorrow the late check has reset it.
    expect(itemStreak(wake, [], logs, day(2), START)).toEqual({ current: 1, best: 1, doneNow: false });
    expect(itemStreak(wake, [], logs, day(3), START)).toEqual({ current: 0, best: 1, doneNow: false });
  });
});

describe("weekly streaks", () => {
  const talk = makeItem({ id: "talk", cadence: "weekly" });

  it("counts weeks in a row", () => {
    const logs = [tick("talk", "2026-10-07"), tick("talk", "2026-10-16"), tick("talk", "2026-10-19")];
    expect(itemStreak(talk, [], logs, "2026-10-20", START)).toEqual({ current: 3, best: 3, doneNow: true });
  });

  it("this week not done yet does not break it", () => {
    const logs = [tick("talk", "2026-10-07"), tick("talk", "2026-10-16")];
    expect(itemStreak(talk, [], logs, "2026-10-20", START)).toEqual({ current: 2, best: 2, doneNow: false });
  });

  it("a missed week resets it", () => {
    const logs = [tick("talk", "2026-10-07"), tick("talk", "2026-10-21")];
    expect(itemStreak(talk, [], logs, "2026-10-22", START)).toEqual({ current: 1, best: 1, doneNow: true });
  });
});

describe("full day streak", () => {
  it("counts full days ending today or yesterday", () => {
    const s = { [day(1)]: "full", [day(2)]: "partial", [day(3)]: "full", [day(4)]: "full" } as const;
    expect(fullDayStreak(s, day(4), START)).toBe(2);
    expect(fullDayStreak(s, day(5), START)).toBe(2);
    expect(fullDayStreak(s, day(6), START)).toBe(0);
  });
});
