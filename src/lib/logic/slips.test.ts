import { describe, expect, it } from "vitest";
import { hasSlip, itemState, summarizeDay } from "./day";
import { buildProgress } from "./progress";
import { itemStreak } from "./streaks";
import { makeItem, makeLog, tick } from "./testkit";
import { viceStreak } from "./vices";
import type { ViceSlip } from "../types";

// One source of truth: day_log.slips. A day with a logged slip is not done for
// that item anywhere it is scored, until the slip is removed.

const START = "2026-10-05";
const vice = makeItem({ id: "smoke", category: "vice", mode: "quit" });
const other = makeItem({ id: "bed" });

describe("a logged slip", () => {
  it("makes the item not done even when it is ticked", () => {
    const log = makeLog("smoke", START, { checked: true, slips: 1 });
    expect(hasSlip(log)).toBe(true);
    expect(itemState(vice, { kind: "check" }, log)).toBe("off");
    expect(itemState(vice, { kind: "max", max: 30 }, makeLog("smoke", START, { value: 10, checked: true, slips: 2 }))).toBe("off");
  });

  it("counts again once the slip is removed", () => {
    expect(itemState(vice, { kind: "check" }, makeLog("smoke", START, { checked: true, slips: 0 }))).toBe("done");
  });

  it("treats a row written before the column existed as no slip", () => {
    const old = { ...makeLog("smoke", START, { checked: true }) } as Record<string, unknown>;
    delete old.slips;
    expect(itemState(vice, { kind: "check" }, old as never)).toBe("done");
  });

  it("turns a full day partial on Today's score", () => {
    const logs = [makeLog("smoke", START, { checked: true, slips: 1 }), tick("bed", START)];
    const s = summarizeDay(START, [vice, other], [], logs);
    expect(s.status).toBe("partial");
    expect(s.done).toBe(1);
  });

  it("ends the streak the same day, and Vices agrees", () => {
    const logs = [tick("smoke", "2026-10-05"), tick("smoke", "2026-10-06"), makeLog("smoke", "2026-10-07", { checked: true, slips: 1 })];
    const slips: ViceSlip[] = [{ id: "s1", created_at: "", item_id: "smoke", date: "2026-10-07", time: "21:40", trigger: null, amount: null }];
    const foundation = itemStreak(vice, [], logs, "2026-10-07", START);
    expect(foundation.current).toBe(0);
    expect(foundation.best).toBe(2);
    expect(viceStreak(vice, [], logs, slips, "2026-10-07", START).current).toBe(0);
    // The day after, a clean day starts a new run of one.
    const next = [...logs, tick("smoke", "2026-10-08")];
    expect(itemStreak(vice, [], next, "2026-10-08", START).current).toBe(1);
    expect(viceStreak(vice, [], next, slips, "2026-10-08", START).current).toBe(1);
  });

  it("an open today with no slip still rides on yesterday", () => {
    const logs = [tick("smoke", "2026-10-05"), tick("smoke", "2026-10-06")];
    expect(itemStreak(vice, [], logs, "2026-10-07", START).current).toBe(2);
  });

  it("shows on the Progress grid", () => {
    const logs = [makeLog("smoke", START, { checked: true, slips: 1 }), tick("bed", START)];
    const model = buildProgress({ startDate: START, lengthDays: 30, today: START, items: [vice, other], versions: [], logs });
    expect(model.grid.cells[0].summary?.status).toBe("partial");
    expect(model.streaks.find((r) => r.item.id === "smoke")?.current).toBe(0);
  });
});
