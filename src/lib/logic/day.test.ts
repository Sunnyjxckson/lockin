import { describe, expect, it } from "vitest";
import { checkedInTime, dayStatus, isItemDone, itemState, meetsNumber, statusFromCounts, summarizeDay, summarizeWeek } from "./day";
import { makeItem, makeLog, makeVersion, tick } from "./testkit";

const D = "2026-10-05"; // a Monday

describe("number targets", () => {
  it("range: calories 1,900 to 2,100, inclusive", () => {
    const t = { kind: "range", min: 1900, max: 2100 } as const;
    expect(meetsNumber(t, 1899)).toBe(false);
    expect(meetsNumber(t, 1900)).toBe(true);
    expect(meetsNumber(t, 2000)).toBe(true);
    expect(meetsNumber(t, 2100)).toBe(true);
    expect(meetsNumber(t, 2101)).toBe(false);
  });

  it("minimum: protein 180g or more, earned $100 or more", () => {
    const t = { kind: "min", min: 180 } as const;
    expect(meetsNumber(t, 179.9)).toBe(false);
    expect(meetsNumber(t, 180)).toBe(true);
    expect(meetsNumber(t, 240)).toBe(true);
  });

  it("maximum: a capped vice", () => {
    const t = { kind: "max", max: 30 } as const;
    expect(meetsNumber(t, 0)).toBe(true);
    expect(meetsNumber(t, 30)).toBe(true);
    expect(meetsNumber(t, 31)).toBe(false);
  });

  it("nothing entered is never done", () => {
    expect(meetsNumber({ kind: "min", min: 0 }, null)).toBe(false);
    expect(meetsNumber({ kind: "min", min: 0 }, undefined)).toBe(false);
    expect(meetsNumber({ kind: "min", min: 0 }, Number.NaN)).toBe(false);
    expect(meetsNumber({ kind: "check" }, 5)).toBe(false);
  });

  it("item state for numbers: open, off, done", () => {
    const item = makeItem({ type: "number" });
    const t = { kind: "range", min: 1900, max: 2100 } as const;
    expect(itemState(item, t, null)).toBe("open");
    expect(itemState(item, t, makeLog(item.id, D))).toBe("open");
    expect(itemState(item, t, makeLog(item.id, D, { value: 1500, checked: true }))).toBe("off");
    expect(itemState(item, t, makeLog(item.id, D, { value: 2050, checked: true }))).toBe("done");
    expect(itemState(item, { kind: "max", max: 30 }, makeLog(item.id, D, { value: 0, checked: true }))).toBe("done");
  });
});

describe("yes/no targets", () => {
  const item = makeItem();

  it("a plain check is done when ticked", () => {
    expect(isItemDone(item, { kind: "check" }, null)).toBe(false);
    expect(isItemDone(item, { kind: "check" }, makeLog(item.id, D))).toBe(false);
    expect(isItemDone(item, { kind: "check" }, tick(item.id, D))).toBe(true);
  });

  describe("time gate: up by 5:45, checked before 6:00", () => {
    const t = { kind: "check_by", by: "06:00" } as const;
    // Oct 5 is daylight time, UTC-4.
    it("counts at 5:50 AM", () => {
      expect(itemState(item, t, tick(item.id, D, "2026-10-05T09:50:00Z"))).toBe("done");
    });
    it("counts at 6:00 AM on the dot", () => {
      expect(itemState(item, t, tick(item.id, D, "2026-10-05T10:00:59Z"))).toBe("done");
    });
    it("does not count at 6:01 AM, and shows as off rather than open", () => {
      expect(itemState(item, t, tick(item.id, D, "2026-10-05T10:01:00Z"))).toBe("off");
    });
    it("does not count late in the same day", () => {
      expect(itemState(item, t, tick(item.id, D, "2026-10-06T02:00:00Z"))).toBe("off");
    });
    it("counts on trust when backfilled on a later date", () => {
      expect(itemState(item, t, tick(item.id, D, "2026-10-07T18:00:00Z"))).toBe("done");
    });
    it("counts with no timestamp, and is open when unticked", () => {
      expect(itemState(item, t, tick(item.id, D, null))).toBe("done");
      expect(itemState(item, t, makeLog(item.id, D))).toBe("open");
    });
    it("uses New York time after the clock change too", () => {
      // Nov 2 is standard time, UTC-5. 5:55 AM is 10:55 UTC.
      expect(checkedInTime(tick(item.id, "2026-11-02", "2026-11-02T10:55:00Z"), "06:00")).toBe(true);
      expect(checkedInTime(tick(item.id, "2026-11-02", "2026-11-02T11:05:00Z"), "06:00")).toBe(false);
    });
  });
});

describe("text plus yes/no: the business move", () => {
  const item = makeItem({ type: "text" });
  const t = { kind: "text" } as const;
  it("needs both the text and the tick", () => {
    expect(itemState(item, t, null)).toBe("open");
    expect(itemState(item, t, makeLog(item.id, D, { text: "Emailed the dean" }))).toBe("off");
    expect(itemState(item, t, makeLog(item.id, D, { checked: true }))).toBe("off");
    expect(itemState(item, t, makeLog(item.id, D, { checked: true, text: "   " }))).toBe("off");
    expect(itemState(item, t, makeLog(item.id, D, { checked: true, text: "Emailed the dean" }))).toBe("done");
  });
});

describe("day status", () => {
  const a = makeItem({ id: "a" });
  const b = makeItem({ id: "b", type: "number", target: { kind: "min", min: 180 } });
  const weekly = makeItem({ id: "w", cadence: "weekly" });
  const items = [a, b, weekly];

  it("is missed when nothing is done", () => {
    const s = summarizeDay(D, items, [], []);
    expect(s).toMatchObject({ status: "missed", done: 0, total: 2, percent: 0 });
  });

  it("is partial when some are done", () => {
    const s = summarizeDay(D, items, [], [tick("a", D)]);
    expect(s).toMatchObject({ status: "partial", done: 1, total: 2, percent: 50 });
  });

  it("is full when every daily item is done, weekly items aside", () => {
    const logs = [tick("a", D), makeLog("b", D, { value: 190, checked: true })];
    expect(summarizeDay(D, items, [], logs)).toMatchObject({ status: "full", done: 2, total: 2, percent: 100 });
    expect(dayStatus(D, items, [], logs)).toBe("full");
  });

  it("a number that misses its target keeps the day partial", () => {
    const logs = [tick("a", D), makeLog("b", D, { value: 120, checked: true })];
    const s = summarizeDay(D, items, [], logs);
    expect(s.status).toBe("partial");
    expect(s.items.find((r) => r.item.id === "b")?.state).toBe("off");
  });

  it("only reads logs for the date asked", () => {
    expect(summarizeDay(D, items, [], [tick("a", "2026-10-06")]).status).toBe("missed");
  });

  it("ignores items that are off or archived", () => {
    const off = makeItem({ id: "off", active: false });
    expect(summarizeDay(D, [a, off], [], [tick("a", D)]).status).toBe("full");
  });

  it("a day with no items is missed, not full", () => {
    expect(statusFromCounts(0, 0)).toBe("missed");
    expect(summarizeDay(D, [], [], []).status).toBe("missed");
  });

  it("rounds the percent", () => {
    const three = [makeItem({ id: "x" }), makeItem({ id: "y" }), makeItem({ id: "z" })];
    expect(summarizeDay(D, three, [], [tick("x", D)]).percent).toBe(33);
    expect(summarizeDay(D, three, [], [tick("x", D), tick("y", D)]).percent).toBe(67);
  });
});

describe("weekly items roll up Monday to Sunday", () => {
  const talk = makeItem({ id: "talk", cadence: "weekly" });
  const weigh = makeItem({ id: "weigh", cadence: "weekly", type: "number", target: { kind: "min", min: 1 } });
  const daily = makeItem({ id: "daily" });
  const items = [talk, weigh, daily];

  it("is done for the whole week once done on any day in it", () => {
    const logs = [tick("talk", "2026-10-07")];
    for (const d of ["2026-10-05", "2026-10-07", "2026-10-11"]) {
      const w = summarizeWeek(d, items, [], logs);
      expect(w.weekStart).toBe("2026-10-05");
      expect(w.weekEnd).toBe("2026-10-11");
      expect(w.items.find((r) => r.item.id === "talk")).toMatchObject({ done: true, doneOn: "2026-10-07" });
      expect(w.items.find((r) => r.item.id === "weigh")?.done).toBe(false);
      expect(w).toMatchObject({ done: 1, total: 2, complete: false });
    }
  });

  it("does not carry into the next week", () => {
    const w = summarizeWeek("2026-10-12", items, [], [tick("talk", "2026-10-07")]);
    expect(w.done).toBe(0);
  });

  it("is complete on Sunday when every weekly item was done", () => {
    const logs = [tick("talk", "2026-10-06"), makeLog("weigh", "2026-10-09", { value: 182.4, checked: true })];
    const w = summarizeWeek("2026-10-11", items, [], logs);
    expect(w.complete).toBe(true);
    expect(w.items.map((r) => r.item.id)).toEqual(["talk", "weigh"]);
  });

  it("weekly items never change a day's status", () => {
    expect(summarizeDay("2026-10-07", items, [], [tick("talk", "2026-10-07")]).status).toBe("missed");
  });

  it("a weekly item added mid week shows from the day it was added", () => {
    const v = [makeVersion("talk", "2026-10-08", { kind: "check" })];
    expect(summarizeWeek("2026-10-06", [talk], v, [], "2026-10-06").total).toBe(0);
    expect(summarizeWeek("2026-10-09", [talk], v, [], "2026-10-09").total).toBe(1);
    expect(summarizeWeek("2026-10-06", [talk], v, []).total).toBe(1);
  });
});
