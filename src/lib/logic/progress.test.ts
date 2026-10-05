import { describe, expect, it } from "vitest";
import type { BodyLog, DayLog } from "../types";
import { addDays } from "./dates";
import {
  buildGrid,
  buildProgress,
  cardData,
  cellKind,
  countLabel,
  headline,
  itemRates,
  pickPhotos,
  streakHealth,
  streakRows,
  stripDashes,
  topStreaks,
  weeklyRollups,
  type ProgressInput,
} from "./progress";
import { makeItem, makeLog, makeVersion, tick } from "./testkit";

// 2026-10-05 is a Monday.
const START = "2026-10-05";
const day = (n: number) => addDays(START, n - 1);

const a = makeItem({ id: "a", name: "Workout", sort_order: 1 });
const b = makeItem({ id: "b", name: "No smoking", category: "vice", mode: "quit", sort_order: 2 });
const p = makeItem({ id: "p", name: "Protein", type: "number", unit: "g", target: { kind: "min", min: 180 }, sort_order: 3 });
const w = makeItem({ id: "w", name: "Weigh-in", cadence: "weekly", sort_order: 4 });
const items = [a, b, p, w];

function input(today: string, logs: DayLog[], over: Partial<ProgressInput> = {}): ProgressInput {
  return { startDate: START, lengthDays: 30, today, items, versions: [], logs, ...over };
}

const fullDay = (n: number) => [tick("a", day(n)), tick("b", day(n)), makeLog("p", day(n), { value: 190, checked: true })];

describe("cellKind", () => {
  it("keeps today open until something is done", () => {
    expect(cellKind("missed", day(3), day(3))).toBe("open");
    expect(cellKind("partial", day(3), day(3))).toBe("partial");
    expect(cellKind("missed", day(2), day(3))).toBe("missed");
    expect(cellKind("missed", day(4), day(3))).toBe("future");
  });
});

describe("buildGrid", () => {
  it("is sized from the challenge length", () => {
    expect(buildGrid(input(day(1), [])).cells).toHaveLength(30);
    expect(buildGrid(input(day(1), [], { lengthDays: 45 })).cells).toHaveLength(45);
    expect(buildGrid(input(day(1), [], { lengthDays: 0 })).cells).toHaveLength(0);
  });

  it("marks full, partial, missed, today and future", () => {
    const logs = [...fullDay(1), tick("a", day(2)), tick("a", day(4))];
    const g = buildGrid(input(day(4), logs));
    expect(g.cells.slice(0, 5).map((c) => c.kind)).toEqual(["full", "partial", "missed", "partial", "future"]);
    expect(g.cells[3].isToday).toBe(true);
    expect(g.cells[1]).toMatchObject({ day: 2, done: 1, total: 3, percent: 33 });
    expect(g.cells[4].summary).toBeNull();
    expect(g.todayDay).toBe(4);
  });

  it("leaves today open when nothing is logged", () => {
    const g = buildGrid(input(day(2), fullDay(1)));
    expect(g.cells[1].kind).toBe("open");
  });

  it("lines the first day up under its weekday", () => {
    expect(buildGrid(input(day(1), [])).lead).toBe(0);
    expect(buildGrid(input("2026-10-08", [], { startDate: "2026-10-08" })).lead).toBe(3);
    expect(buildGrid(input("2026-10-11", [], { startDate: "2026-10-11" })).lead).toBe(6);
  });

  it("is all future before the start and has no today after the end", () => {
    const before = buildGrid(input(addDays(START, -2), []));
    expect(before.cells.every((c) => c.kind === "future")).toBe(true);
    expect(before.todayDay).toBeNull();
    const after = buildGrid(input(day(31), []));
    expect(after.cells.every((c) => c.kind === "missed")).toBe(true);
    expect(after.todayDay).toBeNull();
  });

  it("scores a past day against the target in force that day", () => {
    const versions = [makeVersion("p", "2000-01-01", { kind: "min", min: 150 }), makeVersion("p", day(3), { kind: "min", min: 180 })];
    const only = [p];
    const logs = [makeLog("p", day(1), { value: 160, checked: true }), makeLog("p", day(3), { value: 160, checked: true })];
    const g = buildGrid(input(day(4), logs, { items: only, versions }));
    expect(g.cells[0].kind).toBe("full");
    expect(g.cells[2].kind).toBe("missed");
    expect(g.cells[2].summary?.items[0].state).toBe("off");
  });

  it("does not count an item on days before it was added", () => {
    const versions = [
      makeVersion("a", "2000-01-01", { kind: "check" }),
      makeVersion("b", day(3), { kind: "check" }),
    ];
    const g = buildGrid(input(day(3), [tick("a", day(1))], { items: [a, b], versions }));
    expect(g.cells[0]).toMatchObject({ kind: "full", total: 1 });
    expect(g.cells[2].total).toBe(2);
  });
});

describe("headline", () => {
  const run = (today: string, logs: DayLog[], over: Partial<ProgressInput> = {}) => {
    const i = input(today, logs, over);
    return headline(buildGrid(i), i.startDate, today);
  };

  it("counts days and what is left", () => {
    const logs = [...fullDay(1), tick("a", day(2)), ...fullDay(4)];
    const h = run(day(5), logs);
    expect(h).toMatchObject({ day: 5, length: 30, lockedIn: 2, partial: 1, missed: 1, remaining: 25, started: true, finished: false });
    // 3 + 1 + 0 + 3 done over 12 counted, today has nothing done so it adds nothing.
    expect(h.percent).toBe(58);
  });

  it("does not call today partial or missed while it is running", () => {
    const h = run(day(2), [...fullDay(1), tick("a", day(2))]);
    expect(h.partial).toBe(0);
    expect(h.missed).toBe(0);
    // Today's one done item counts, its two open ones do not yet.
    expect(h.percent).toBe(100);
  });

  it("counts today as locked in once it is full", () => {
    expect(run(day(2), [...fullDay(1), ...fullDay(2)]).lockedIn).toBe(2);
  });

  it("uses today in full on day 1 so the number is honest", () => {
    const h = run(day(1), [tick("a", day(1))]);
    expect(h.percent).toBe(33);
    expect(h).toMatchObject({ day: 1, lockedIn: 0, partial: 0, missed: 0, remaining: 29 });
  });

  it("handles before the start and after the end", () => {
    expect(run(addDays(START, -3), [])).toMatchObject({ day: 0, started: false, remaining: 30, percent: 0 });
    expect(run(day(40), fullDay(1))).toMatchObject({ day: 30, finished: true, remaining: 0, lockedIn: 1, missed: 29 });
  });
});

describe("weeklyRollups", () => {
  it("splits the challenge into Monday to Sunday weeks", () => {
    const i = input(day(1), []);
    const weeks = weeklyRollups(buildGrid(i), i);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toMatchObject({ index: 1, from: day(1), to: day(7), state: "current" });
    expect(weeks[4]).toMatchObject({ from: day(29), to: day(30), state: "future", percent: null });
  });

  it("clips the first week when the start is midweek", () => {
    const i = input("2026-10-08", [], { startDate: "2026-10-08", lengthDays: 10 });
    const weeks = weeklyRollups(buildGrid(i), i);
    expect(weeks.map((x) => [x.from, x.to])).toEqual([
      ["2026-10-08", "2026-10-11"],
      ["2026-10-12", "2026-10-17"],
    ]);
    expect(weeks[0].weekStart).toBe("2026-10-05");
  });

  it("rolls up days, the rate and the weekly items", () => {
    const logs = [...fullDay(1), tick("a", day(2)), tick("w", day(5)), ...fullDay(8)];
    const i = input(day(9), logs);
    const [w1, w2, w3] = weeklyRollups(buildGrid(i), i);
    expect(w1).toMatchObject({ state: "past", full: 1, partial: 1, missed: 5, done: 4, total: 21, percent: 19, weeklyDone: 1, weeklyTotal: 1 });
    expect(w1.weekly[0].doneOn).toBe(day(5));
    expect(w2).toMatchObject({ state: "current", full: 1, partial: 0, missed: 0, done: 3, total: 3, percent: 100, weeklyDone: 0, weeklyTotal: 1 });
    expect(w3.state).toBe("future");
    expect(w3.weekly).toEqual([]);
  });
});

describe("itemRates", () => {
  const run = (today: string, logs: DayLog[], over: Partial<ProgressInput> = {}) => {
    const i = input(today, logs, over);
    const g = buildGrid(i);
    return itemRates(g, weeklyRollups(g, i), i);
  };
  const find = (rows: ReturnType<typeof run>, id: string) => rows.find((r) => r.item.id === id)!;

  it("counts done days over days so far, lowest first", () => {
    const logs = [tick("a", day(1)), tick("a", day(2)), tick("a", day(3)), tick("b", day(1)), makeLog("p", day(2), { value: 100, checked: true })];
    const rows = run(day(4), logs);
    expect(find(rows, "a")).toMatchObject({ done: 3, total: 3, rate: 1, unit: "day" });
    expect(find(rows, "b")).toMatchObject({ done: 1, total: 3 });
    expect(find(rows, "p")).toMatchObject({ done: 0, total: 3, rate: 0 });
    expect(rows.map((r) => r.item.id)).toEqual(["p", "b", "a", "w"]);
  });

  it("counts today for an item only once it is done", () => {
    const rows = run(day(2), [tick("a", day(1)), tick("a", day(2))]);
    expect(find(rows, "a")).toMatchObject({ done: 2, total: 2 });
    expect(find(rows, "b")).toMatchObject({ done: 0, total: 1 });
  });

  it("counts weekly items in weeks, and not before a week can be judged", () => {
    expect(find(run(day(3), []), "w")).toMatchObject({ total: 0, rate: null, unit: "week" });
    expect(find(run(day(3), [tick("w", day(2))]), "w")).toMatchObject({ done: 1, total: 1, rate: 1 });
    expect(find(run(day(10), [tick("w", day(2))]), "w")).toMatchObject({ done: 1, total: 1 });
    expect(find(run(day(15), [tick("w", day(2))]), "w")).toMatchObject({ done: 1, total: 2, rate: 0.5 });
  });

  it("keeps a removed item with its past days and marks it not current", () => {
    const versions = [makeVersion("a", "2000-01-01", { kind: "check" }), makeVersion("a", day(3), { kind: "check" }, false)];
    const gone = { ...a, active: false, archived: true };
    const rows = run(day(5), [tick("a", day(1))], { items: [gone, b], versions });
    expect(find(rows, "a")).toMatchObject({ done: 1, total: 2, current: false });
    expect(find(rows, "b").current).toBe(true);
  });

  it("leaves out vices that are off", () => {
    const off = makeItem({ id: "off", category: "vice", active: false });
    expect(run(day(3), [], { items: [a, off] }).map((r) => r.item.id)).toEqual(["a"]);
  });
});

describe("streakRows", () => {
  it("puts what is slipping first", () => {
    const logs = [
      // a: 3 day run, then broken yesterday.
      tick("a", day(1)), tick("a", day(2)), tick("a", day(3)),
      // b: 5 in a row and still going.
      ...[1, 2, 3, 4, 5].map((n) => tick("b", day(n))),
      // p: best of 3, now on 1.
      ...[1, 2, 3, 5].map((n) => makeLog("p", day(n), { value: 200, checked: true })),
    ];
    const rows = streakRows(input(day(6), logs));
    expect(rows.map((r) => [r.item.id, r.health, r.current, r.best])).toEqual([
      ["a", "broken", 0, 3],
      ["w", "cold", 0, 0],
      ["p", "behind", 1, 3],
      ["b", "best", 5, 5],
    ]);
    expect(rows.find((r) => r.item.id === "w")?.unit).toBe("week");
  });

  it("includes vices that are on and skips ones that are off or removed", () => {
    const off = makeItem({ id: "off", category: "vice", active: false });
    const gone = makeItem({ id: "gone", archived: true });
    const ids = streakRows(input(day(2), [], { items: [a, b, off, gone] })).map((r) => r.item.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("names each health", () => {
    expect(streakHealth({ current: 0, best: 0, doneNow: false })).toBe("cold");
    expect(streakHealth({ current: 0, best: 2, doneNow: false })).toBe("broken");
    expect(streakHealth({ current: 1, best: 2, doneNow: true })).toBe("behind");
    expect(streakHealth({ current: 2, best: 2, doneNow: true })).toBe("best");
  });
});

describe("card", () => {
  const photo = (date: string, ref: string | null): BodyLog => ({ id: date, created_at: "", date, weight: null, photo_url: ref });

  it("picks the first photo and the latest", () => {
    const logs = [photo(day(12), "idb:c"), photo(day(1), "idb:a"), photo(day(5), null), photo(day(8), "idb:b")];
    expect(pickPhotos(logs, START, day(14))).toEqual({
      before: { date: day(1), ref: "idb:a", label: "Day 1" },
      after: { date: day(12), ref: "idb:c", label: "Day 12" },
    });
  });

  it("has no after with one photo, and nothing with none", () => {
    expect(pickPhotos([photo(day(1), "idb:a")], START, day(3))).toMatchObject({ before: { label: "Day 1" }, after: null });
    expect(pickPhotos([photo(day(1), null)], START, day(3))).toEqual({ before: null, after: null });
  });

  it("labels a photo from before the start by its date", () => {
    expect(pickPhotos([photo("2026-10-03", "idb:a")], START, day(3)).before?.label).toBe("Oct 3");
  });

  it("takes the longest live streaks and drops zeros", () => {
    const logs = [...[1, 2, 3].map((n) => tick("a", day(n))), ...[2, 3].map((n) => tick("b", day(n))), tick("w", day(1))];
    const rows = streakRows(input(day(3), logs));
    expect(topStreaks(rows)).toEqual([
      { name: "Workout", current: 3, unit: "day" },
      { name: "No smoking", current: 2, unit: "day" },
      { name: "Weigh-in", current: 1, unit: "week" },
    ]);
    expect(topStreaks(rows, 1)).toHaveLength(1);
    expect(topStreaks(streakRows(input(day(1), [])))).toEqual([]);
  });

  it("builds the card from the model", () => {
    const i = input(day(3), [...fullDay(1), ...fullDay(2), tick("a", day(3))]);
    const card = cardData(buildProgress(i), START, day(3), [photo(day(1), "idb:a")]);
    expect(card).toMatchObject({ day: 3, length: 30, percent: 100, lockedIn: 2, remaining: 27, range: "Oct 5 to Nov 3", lead: 0, started: true });
    expect(card.cells).toHaveLength(30);
    expect(card.cells[2]).toEqual({ kind: "partial", isToday: true });
    expect(card.streaks[0]).toEqual({ name: "Workout", current: 3, unit: "day" });
    expect(card.before?.ref).toBe("idb:a");
    expect(card.after).toBeNull();
  });
});

describe("text helpers", () => {
  it("pluralizes", () => {
    expect(countLabel(1, "day")).toBe("1 day");
    expect(countLabel(0, "day")).toBe("0 days");
    expect(countLabel(2, "week")).toBe("2 weeks");
  });

  it("strips long dashes from model text", () => {
    const out = stripDashes("Protein held — money slipped. Oct 5–9.");
    expect(out).toBe("Protein held, money slipped. Oct 5, 9.");
    expect(/[‒-―]/.test(out)).toBe(false);
  });
});
