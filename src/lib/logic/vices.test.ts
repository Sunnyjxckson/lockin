import { describe, expect, it } from "vitest";
import type { ViceSlip } from "../types";
import { makeItem, makeLog, makeVersion, tick } from "./testkit";
import {
  cleanDayCount,
  describeRule,
  dollarsKept,
  formatAmount,
  formatDollars,
  describeSpend,
  isCleanDay,
  joinTriggers,
  logsWithSlips,
  parseLegacySpendHint,
  spendOf,
  slipPattern,
  splitTriggers,
  timeBucket,
  viceCalendar,
  viceStreak,
} from "./vices";

let n = 0;
function slip(itemId: string, date: string, time = "21:30", trigger: string | null = null, amount: number | null = null): ViceSlip {
  n += 1;
  return { id: `slip${n}`, created_at: "2026-10-01T12:00:00.000Z", item_id: itemId, date, time, trigger, amount };
}

const START = "2026-10-05"; // a Monday

function quit(id = "q") {
  const item = makeItem({ id, category: "vice", mode: "quit" });
  return { item, versions: [makeVersion(id, "2000-01-01", { kind: "check" })] };
}

function cap(id = "c", max = 30) {
  const target = { kind: "max" as const, max };
  const item = makeItem({ id, category: "vice", mode: "cap", type: "number", unit: "min", target });
  return { item, versions: [makeVersion(id, "2000-01-01", target)] };
}

describe("isCleanDay", () => {
  it("quit: clean when checked with no slip", () => {
    expect(isCleanDay({ kind: "check" }, tick("q", START))).toBe(true);
    expect(isCleanDay({ kind: "check" }, makeLog("q", START))).toBe(false);
    expect(isCleanDay({ kind: "check" }, null)).toBe(false);
  });
  it("quit: a slip beats a tick", () => {
    expect(isCleanDay({ kind: "check" }, tick("q", START), 1)).toBe(false);
  });
  it("cap: clean at or under the cap, not over, not when nothing is logged", () => {
    const t = { kind: "max" as const, max: 30 };
    expect(isCleanDay(t, makeLog("c", START, { value: 30, checked: true }))).toBe(true);
    expect(isCleanDay(t, makeLog("c", START, { value: 0, checked: true }))).toBe(true);
    expect(isCleanDay(t, makeLog("c", START, { value: 31, checked: true }))).toBe(false);
    expect(isCleanDay(t, makeLog("c", START))).toBe(false);
    expect(isCleanDay(t, makeLog("c", START, { value: 10, checked: true }), 1)).toBe(false);
  });
});

describe("viceStreak", () => {
  it("counts clean days and a slip resets only that vice", () => {
    const a = quit("a");
    const b = quit("b");
    const versions = [...a.versions, ...b.versions];
    const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    const logs = days.flatMap((d) => [tick("a", d), tick("b", d)]);
    const slips = [slip("a", "2026-10-07")];
    expect(viceStreak(a.item, versions, logs, slips, "2026-10-08", START)).toMatchObject({ current: 1, best: 2 });
    expect(viceStreak(b.item, versions, logs, slips, "2026-10-08", START)).toMatchObject({ current: 4, best: 4 });
  });
  it("a slip today ends the run even if the day was ticked", () => {
    const { item, versions } = quit();
    const logs = [tick("q", "2026-10-05"), tick("q", "2026-10-06")];
    expect(viceStreak(item, versions, logs, [slip("q", "2026-10-06")], "2026-10-06", START).current).toBe(0);
  });
  it("today not checked yet does not break the streak", () => {
    const { item, versions } = quit();
    const logs = [tick("q", "2026-10-05"), tick("q", "2026-10-06")];
    expect(viceStreak(item, versions, logs, [], "2026-10-07", START)).toMatchObject({ current: 2, doneNow: false });
  });
  it("cap: over the cap breaks it", () => {
    const { item, versions } = cap();
    const logs = [
      makeLog("c", "2026-10-05", { value: 20, checked: true }),
      makeLog("c", "2026-10-06", { value: 45, checked: true }),
      makeLog("c", "2026-10-07", { value: 30, checked: true }),
    ];
    expect(viceStreak(item, versions, logs, [], "2026-10-07", START)).toMatchObject({ current: 1, best: 1 });
    const over = [...logs, makeLog("c", "2026-10-08", { value: 31, checked: true })];
    expect(viceStreak(item, versions, over, [], "2026-10-08", START)).toMatchObject({ current: 0, best: 1 });
  });
  it("logsWithSlips leaves other items and clean days alone", () => {
    const { item } = cap();
    const logs = [makeLog("c", "2026-10-05", { value: 20, checked: true }), tick("other", "2026-10-05")];
    expect(logsWithSlips(item, logs, [])).toEqual([logs[0]]);
    expect(logsWithSlips(item, logs, [slip("c", "2026-10-05")])[0].value).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("viceCalendar", () => {
  it("marks clean, slip, open, off and future days", () => {
    const item = makeItem({ id: "v", category: "vice", mode: "quit" });
    const versions = [makeVersion("v", "2000-01-01", { kind: "check" }, false), makeVersion("v", "2026-10-06", { kind: "check" }, true)];
    const logs = [tick("v", "2026-10-06"), tick("v", "2026-10-07")];
    const slips = [slip("v", "2026-10-07"), slip("v", "2026-10-07", "23:00")];
    const cal = viceCalendar(item, versions, logs, slips, START, 30, "2026-10-08");
    expect(cal).toHaveLength(30);
    expect(cal.slice(0, 5).map((d) => d.state)).toEqual(["off", "clean", "slip", "open", "future"]);
    expect(cal[2].slips).toBe(2);
    expect(cal[3]).toMatchObject({ day: 4, isToday: true });
    expect(cleanDayCount(item, versions, logs, slips, START, "2026-10-08")).toBe(1);
  });
  it("cap: over the cap with no slip row still shows as a slip day", () => {
    const { item, versions } = cap();
    const logs = [makeLog("c", START, { value: 50, checked: true })];
    expect(viceCalendar(item, versions, logs, [], START, 30, START)[0].state).toBe("slip");
  });
  it("past days keep the rule they were scored against", () => {
    const item = makeItem({ id: "v", category: "vice", mode: "cap", type: "number", target: { kind: "max", max: 30 } });
    const versions = [makeVersion("v", "2000-01-01", { kind: "check" }), makeVersion("v", "2026-10-07", { kind: "max", max: 30 })];
    const logs = [tick("v", "2026-10-05"), makeLog("v", "2026-10-07", { value: 10, checked: true })];
    const cal = viceCalendar(item, versions, logs, [], START, 30, "2026-10-07");
    expect(cal.slice(0, 3).map((d) => d.state)).toEqual(["clean", "open", "clean"]);
  });
});

describe("dollars kept", () => {
  it("reads the typical spend from its own fields", () => {
    expect(spendOf({ typical_spend: 20, spend_period: "day" })).toEqual({ amount: 20, period: "day" });
    expect(spendOf({ typical_spend: 87.5, spend_period: "week" })).toEqual({ amount: 87.5, period: "week" });
    expect(spendOf({ typical_spend: 40, spend_period: null })).toEqual({ amount: 40, period: "week" });
    expect(spendOf({ typical_spend: null, spend_period: "week" })).toBeNull();
    expect(spendOf({ typical_spend: 0, spend_period: "week" })).toBeNull();
    expect(describeSpend({ amount: 87.5, period: "week" })).toBe("$87.5 a week");
  });
  it("still reads the old hint sentence, for moving old rows over", () => {
    expect(parseLegacySpendHint("Usually $20 a day")).toEqual({ amount: 20, period: "day" });
    expect(parseLegacySpendHint("Usually $87.5 a week")).toEqual({ amount: 87.5, period: "week" });
    expect(parseLegacySpendHint("Some other note")).toBeNull();
    expect(parseLegacySpendHint(null)).toBeNull();
  });
  it("clean days times the daily spend, minus what slips cost", () => {
    expect(dollarsKept(5, { amount: 20, period: "day" }, [])).toMatchObject({ saved: 100, spent: 0, kept: 100 });
    expect(dollarsKept(7, { amount: 70, period: "week" }, [{ amount: 25 }, { amount: null }])).toMatchObject({ saved: 70, spent: 25, kept: 45 });
  });
  it("can go below zero and works with no typical spend", () => {
    expect(dollarsKept(1, { amount: 10, period: "day" }, [{ amount: 60 }]).kept).toBe(-50);
    expect(dollarsKept(4, null, [{ amount: 15 }])).toMatchObject({ saved: 0, kept: -15 });
  });
  it("formats dollars", () => {
    expect(formatDollars(1240)).toBe("$1,240");
    expect(formatDollars(12.5)).toBe("$12.50");
    expect(formatDollars(-40)).toBe("-$40");
  });
});

describe("triggers", () => {
  it("joins chips and free text, lower case, no repeats", () => {
    expect(joinTriggers(["bored", "late night"], "After the game, Bored")).toBe("bored, late night, after the game");
    expect(joinTriggers([], "  ")).toBeNull();
    expect(splitTriggers("bored, late night")).toEqual(["bored", "late night"]);
    expect(splitTriggers(null)).toEqual([]);
  });
});

describe("slipPattern", () => {
  it("buckets the time of day", () => {
    expect(timeBucket("05:00")).toBe("morning");
    expect(timeBucket("11:59")).toBe("morning");
    expect(timeBucket("12:00")).toBe("afternoon");
    expect(timeBucket("17:00")).toBe("evening");
    expect(timeBucket("21:00")).toBe("late night");
    expect(timeBucket("02:30")).toBe("late night");
  });
  it("finds the most common time, trigger and weekday", () => {
    const p = slipPattern([
      slip("v", "2026-10-09", "22:30", "bored, late night"), // Friday
      slip("v", "2026-10-10", "23:10", "with friends"), // Saturday
      slip("v", "2026-10-16", "01:15", "bored"), // Friday
      slip("v", "2026-10-14", "15:00", "stressed"),
    ]);
    expect(p.total).toBe(4);
    expect(p.timeOfDay).toEqual({ value: "late night", count: 3 });
    expect(p.trigger).toEqual({ value: "bored", count: 2 });
    expect(p.weekday).toEqual({ value: 5, count: 2 });
  });
  it("ties go to the most recent slip, and no slips gives nulls", () => {
    const p = slipPattern([slip("v", "2026-10-06", "09:00", "tired"), slip("v", "2026-10-08", "19:00", "stressed")]);
    expect(p.trigger?.value).toBe("stressed");
    expect(p.timeOfDay?.value).toBe("evening");
    expect(slipPattern([])).toEqual({ total: 0, timeOfDay: null, trigger: null, weekday: null });
  });
});

describe("rule text", () => {
  it("describes quit and cap", () => {
    expect(describeRule({ mode: "quit", unit: null }, { kind: "check" })).toBe("Quit completely");
    expect(describeRule({ mode: "cap", unit: "min" }, { kind: "max", max: 30 })).toBe("30 min or less a day");
    expect(formatAmount(1, "times")).toBe("1 time");
    expect(formatAmount(40, "$")).toBe("$40");
  });
});
