import { describe, expect, it } from "vitest";
import { addDays, dateRange } from "./dates";
import { ongoingCells, ongoingHeadline, ongoingMonths, ongoingWeeks, statusByDate, tally, type OngoingInput } from "./ongoing";
import { makeItem, tick } from "./testkit";

const a = makeItem({ id: "a", name: "Workout" });
const b = makeItem({ id: "b", name: "Read" });
const weekly = makeItem({ id: "wk", name: "Weigh in", cadence: "weekly" });

/** History from Mon Sep 28. Everything done except: Oct 2 partial, Oct 6 missed. Today, Oct 9, is half done. */
function input(today = "2026-10-09"): OngoingInput {
  const logs = [];
  for (const d of dateRange("2026-09-28", addDays(today, -1))) {
    if (d === "2026-10-06") continue;
    logs.push(tick("a", d));
    if (d !== "2026-10-02") logs.push(tick("b", d));
  }
  logs.push(tick("a", today), tick("wk", "2026-09-30"));
  return { historyStart: "2026-09-28", today, items: [a, b, weekly], versions: [], logs };
}

describe("ongoingCells", () => {
  it("marks days before the history and after today, and scores the rest", () => {
    const cells = ongoingCells(input(), "2026-09-26", "2026-10-11");
    const kind = (d: string) => cells.find((c) => c.date === d)?.kind;
    expect(kind("2026-09-27")).toBe("before");
    expect(kind("2026-09-28")).toBe("full");
    expect(kind("2026-10-02")).toBe("partial");
    expect(kind("2026-10-06")).toBe("missed");
    expect(kind("2026-10-09")).toBe("partial");
    expect(kind("2026-10-10")).toBe("future");
    expect(cells.find((c) => c.date === "2026-10-09")).toMatchObject({ isToday: true, day: 9, done: 1, total: 2 });
    expect(cells.find((c) => c.date === "2026-09-27")?.summary).toBeNull();
  });

  it("shows today as open, not missed, before anything is checked", () => {
    const base = input();
    const cells = ongoingCells({ ...base, logs: base.logs.filter((l) => l.date !== "2026-10-09") }, "2026-10-09", "2026-10-09");
    expect(cells[0].kind).toBe("open");
  });
});

describe("tally", () => {
  it("counts finished days, and today only once it is full", () => {
    const cells = ongoingCells(input(), "2026-09-28", "2026-10-09");
    expect(tally(cells)).toEqual({ full: 9, partial: 1, missed: 1, days: 11, percent: 82 });
    const done = input();
    done.logs.push(tick("b", "2026-10-09"));
    expect(tally(ongoingCells(done, "2026-09-28", "2026-10-09"))).toMatchObject({ full: 10, days: 12 });
  });

  it("has no percent before anything counts", () => {
    expect(tally(ongoingCells(input("2026-09-28"), "2026-09-28", "2026-09-28")).percent).toBeNull();
  });
});

describe("ongoingWeeks", () => {
  it("lists weeks newest first back to the week the history starts in", () => {
    const weeks = ongoingWeeks(input());
    expect(weeks.map((w) => [w.weekStart, w.state])).toEqual([
      ["2026-10-05", "current"],
      ["2026-09-28", "past"],
    ]);
    expect(weeks[0]).toMatchObject({ label: "Oct 5 to Oct 11", full: 3, partial: 0, missed: 1, days: 4 });
    expect(weeks[1]).toMatchObject({ full: 6, partial: 1, missed: 0, days: 7, percent: 86 });
    expect(weeks[0].cells).toHaveLength(7);
    expect(weeks[1].weekly.map((r) => [r.item.id, r.done])).toEqual([["wk", true]]);
    expect(weeks[0].weeklyDone).toBe(0);
  });

  it("does not end: a year in, it still returns the latest weeks", () => {
    const weeks = ongoingWeeks({ ...input("2027-10-08"), logs: [] }, 8);
    expect(weeks).toHaveLength(8);
    expect(weeks[0].weekStart).toBe("2027-10-04");
    expect(weeks[0].state).toBe("current");
  });

  it("is empty before the history starts", () => {
    expect(ongoingWeeks({ ...input(), today: "2026-09-20" })).toEqual([]);
  });
});

describe("ongoingMonths", () => {
  it("lists every month of the history, newest first, as calendar grids", () => {
    const months = ongoingMonths(input());
    expect(months.map((m) => [m.key, m.label, m.state])).toEqual([
      ["2026-10", "October 2026", "current"],
      ["2026-09", "September 2026", "past"],
    ]);
    // October 1, 2026 is a Thursday: three blanks before it in a Monday first grid.
    expect(months[0].lead).toBe(3);
    expect(months[0].cells).toHaveLength(31);
    expect(months[0]).toMatchObject({ full: 6, partial: 1, missed: 1, days: 8 });
    expect(months[1].cells).toHaveLength(30);
    expect(months[1].cells.filter((c) => c.kind === "before")).toHaveLength(27);
    expect(months[1]).toMatchObject({ full: 3, partial: 0, missed: 0, days: 3, percent: 100 });
  });

  it("crosses a year end", () => {
    const months = ongoingMonths({ ...input("2027-01-15"), historyStart: "2026-11-20", logs: [] });
    expect(months.map((m) => m.key)).toEqual(["2027-01", "2026-12", "2026-11"]);
  });
});

describe("ongoingHeadline", () => {
  it("leads with consistency and keeps streaks beside it", () => {
    const i = input();
    const h = ongoingHeadline(statusByDate(i), i.historyStart, i.today);
    expect(h.totalDays).toBe(12);
    expect(h.fullDays).toBe(9);
    expect(h.last30).toMatchObject({ full: 9, partial: 1, days: 11, window: 30 });
    expect(h.last7).toMatchObject({ full: 5, days: 7 });
    expect(h.fullStreak).toBe(2);
    expect(h.bestFullStreak).toBe(4);
  });

  it("is all zeros on the first morning", () => {
    const h = ongoingHeadline({ "2026-10-05": "missed" }, "2026-10-05", "2026-10-05");
    expect(h).toMatchObject({ totalDays: 1, fullDays: 0, fullStreak: 0, bestFullStreak: 0 });
    expect(h.last30.days).toBe(0);
  });
});
