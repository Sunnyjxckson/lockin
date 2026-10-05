import { describe, expect, it } from "vitest";
import { summarizeDay } from "./day";
import {
  BASELINE_DATE,
  defaultTarget,
  describeTarget,
  isActiveOn,
  scoredItems,
  targetOn,
  targetsEqual,
  versionForChange,
  versionOn,
} from "./targets";
import { makeItem, makeLog, makeVersion } from "./testkit";

describe("target versions", () => {
  const item = makeItem({ id: "cal", type: "number", target: { kind: "range", min: 1700, max: 1900 } });
  const versions = [
    makeVersion("cal", BASELINE_DATE, { kind: "range", min: 1900, max: 2100 }),
    makeVersion("cal", "2026-10-10", { kind: "range", min: 1700, max: 1900 }),
    makeVersion("other", "2026-10-07", { kind: "check" }),
  ];

  it("picks the latest version at or before the date", () => {
    expect(versionOn(versions, "cal", "2026-10-05")?.effective_from).toBe(BASELINE_DATE);
    expect(versionOn(versions, "cal", "2026-10-09")?.effective_from).toBe(BASELINE_DATE);
    expect(versionOn(versions, "cal", "2026-10-10")?.effective_from).toBe("2026-10-10");
    expect(versionOn(versions, "cal", "2026-10-20")?.effective_from).toBe("2026-10-10");
    expect(versionOn(versions, "cal", "1999-01-01")).toBeNull();
  });

  it("past days keep the target they were scored against", () => {
    expect(targetOn(item, versions, "2026-10-09")).toEqual({ kind: "range", min: 1900, max: 2100 });
    expect(targetOn(item, versions, "2026-10-10")).toEqual({ kind: "range", min: 1700, max: 1900 });
    const logs = [makeLog("cal", "2026-10-09", { value: 2000, checked: true }), makeLog("cal", "2026-10-10", { value: 2000, checked: true })];
    expect(summarizeDay("2026-10-09", [item], versions, logs).status).toBe("full");
    expect(summarizeDay("2026-10-10", [item], versions, logs).status).toBe("missed");
  });

  it("falls back to the item when it has no versions at all", () => {
    const bare = makeItem({ id: "bare", target: { kind: "check_by", by: "06:00" } });
    expect(targetOn(bare, [], "2026-10-05")).toEqual({ kind: "check_by", by: "06:00" });
    expect(isActiveOn(bare, [], "2026-10-05")).toBe(true);
    expect(isActiveOn(makeItem({ active: false }), [], "2026-10-05")).toBe(false);
  });

  it("an item added today does not count on earlier days", () => {
    const added = makeItem({ id: "new" });
    const v = [makeVersion("new", "2026-10-08", { kind: "check" })];
    expect(isActiveOn(added, v, "2026-10-07")).toBe(false);
    expect(isActiveOn(added, v, "2026-10-08")).toBe(true);
  });

  it("an item removed today still counts on earlier days", () => {
    const removed = makeItem({ id: "gone", active: false, archived: true });
    const v = [makeVersion("gone", BASELINE_DATE, { kind: "check" }, true), makeVersion("gone", "2026-10-08", { kind: "check" }, false)];
    expect(isActiveOn(removed, v, "2026-10-07")).toBe(true);
    expect(isActiveOn(removed, v, "2026-10-08")).toBe(false);
    expect(scoredItems([removed], v, "2026-10-07")).toHaveLength(1);
    expect(scoredItems([removed], v, "2026-10-08")).toHaveLength(0);
  });

  it("a vice turned on later only counts from that day", () => {
    const vice = makeItem({ id: "vape", category: "vice", active: true });
    const v = [makeVersion("vape", BASELINE_DATE, { kind: "check" }, false), makeVersion("vape", "2026-10-12", { kind: "check" }, true)];
    expect(isActiveOn(vice, v, "2026-10-11")).toBe(false);
    expect(isActiveOn(vice, v, "2026-10-12")).toBe(true);
  });

  it("orders by sort_order", () => {
    const a = makeItem({ id: "a", sort_order: 20 });
    const b = makeItem({ id: "b", sort_order: 10 });
    expect(scoredItems([a, b], [], "2026-10-05").map((s) => s.item.id)).toEqual(["b", "a"]);
  });

  it("builds the row for a change dated today", () => {
    expect(versionForChange("cal", "2026-10-10", { kind: "min", min: 200 }, true)).toEqual({
      item_id: "cal",
      effective_from: "2026-10-10",
      target: { kind: "min", min: 200 },
      active: true,
    });
  });

  it("compares and describes targets", () => {
    expect(targetsEqual({ kind: "min", min: 1 }, { kind: "min", min: 1 })).toBe(true);
    expect(targetsEqual({ kind: "min", min: 1 }, { kind: "min", min: 2 })).toBe(false);
    expect(targetsEqual({ kind: "min", min: 1 }, { kind: "max", max: 1 })).toBe(false);
    expect(targetsEqual({ kind: "check_by", by: "06:00" }, { kind: "check_by", by: "06:30" })).toBe(false);
    expect(describeTarget({ kind: "range", min: 1900, max: 2100 }, "kcal")).toBe("1,900 to 2,100 kcal");
    expect(describeTarget({ kind: "min", min: 180 }, "g")).toBe("180g or more");
    expect(describeTarget({ kind: "min", min: 100 }, "$")).toBe("$100 or more");
    expect(describeTarget({ kind: "max", max: 30 }, "min")).toBe("30 min or less");
    expect(describeTarget({ kind: "check_by", by: "06:00" })).toBe("Check by 6:00 AM");
    expect(describeTarget({ kind: "check" })).toBe("");
    expect(defaultTarget("yesno")).toEqual({ kind: "check" });
    expect(defaultTarget("text")).toEqual({ kind: "text" });
    expect(defaultTarget("number").kind).toBe("min");
  });
});
