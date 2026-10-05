import { describe, expect, it } from "vitest";
import type { DayBlock } from "../blocks";
import type { BlockKind } from "../types";
import { durationMinutes } from "./dates";
import {
  addBlock,
  findErrand,
  findOverlaps,
  formatCountdown,
  freeTimeFocus,
  insertErrand,
  isMaterialized,
  layoutLanes,
  makeBlock,
  materializeDay,
  materializedId,
  moveBlock,
  nextOpenSlot,
  overlappingIds,
  planDayWrite,
  removeBlock,
  removeErrand,
  resizeBlock,
  shiftAfter,
  snap,
  snapTime,
  snapUp,
  spanOf,
  stillGoing,
  timelineRange,
  timerState,
  updateBlock,
  withSpan,
} from "./schedule";

const DATE = "2026-10-06";

function blk(id: string, start: string, end: string, p: Partial<DayBlock> = {}): DayBlock {
  return {
    id,
    date: DATE,
    block_name: p.block_name ?? id,
    start,
    end,
    duration: durationMinutes(start, end),
    flexible: true,
    kind: "other" as BlockKind,
    note: null,
    calendar_event_id: null,
    template_id: null,
    source: "manual",
    persisted: true,
    ...p,
  };
}

const fixed = (id: string, start: string, end: string, p: Partial<DayBlock> = {}) => blk(id, start, end, { flexible: false, ...p });
const times = (blocks: DayBlock[]) => Object.fromEntries(blocks.map((b) => [b.id, `${b.start}-${b.end}`]));

// A Tuesday close to the seeded template.
const tuesday = () => [
  fixed("wake", "05:45", "06:30", { kind: "wake" }),
  fixed("lift", "06:30", "07:30", { kind: "workout" }),
  blk("home", "07:30", "09:30", { kind: "home" }),
  fixed("class", "10:00", "14:30", { kind: "class" }),
  blk("ball", "15:00", "16:30", { kind: "basketball" }),
  blk("dinner", "17:00", "21:00", { kind: "delivery" }),
  blk("study", "21:00", "23:00", { kind: "study" }),
  fixed("bed", "23:00", "23:59", { kind: "bed" }),
];

describe("snapping", () => {
  it("rounds to the nearest step", () => {
    expect(snap(62, 5)).toBe(60);
    expect(snap(63, 5)).toBe(65);
    expect(snap(67, 15)).toBe(60);
    expect(snap(68, 15)).toBe(75);
  });
  it("snapUp never goes back in time", () => {
    expect(snapUp(60, 5)).toBe(60);
    expect(snapUp(61, 5)).toBe(65);
    expect(snapUp(61, 15)).toBe(75);
  });
  it("snaps clock times and stays inside the day", () => {
    expect(snapTime("09:07", 5)).toBe("09:05");
    expect(snapTime("09:08", 15)).toBe("09:15");
    expect(snapTime("23:59", 15)).toBe("23:45");
  });
});

describe("spans", () => {
  it("reads start plus duration and stops at midnight", () => {
    expect(spanOf(blk("a", "23:00", "23:59"))).toEqual({ s: 1380, e: 1439 });
    expect(spanOf({ start: "23:00", duration: 120 })).toEqual({ s: 1380, e: 1440 });
  });
  it("withSpan keeps start, end and duration in step", () => {
    const b = withSpan(blk("a", "09:00", "10:00"), 600, 690);
    expect([b.start, b.end, b.duration]).toEqual(["10:00", "11:30", 90]);
  });
  it("withSpan writes the end of the day as 00:00 with the real length", () => {
    const b = withSpan(blk("a", "09:00", "10:00"), 1380, 1500);
    expect([b.start, b.end, b.duration]).toEqual(["23:00", "00:00", 60]);
    expect(durationMinutes(b.start, b.end)).toBe(60);
  });
  it("never makes a block shorter than five minutes", () => {
    expect(withSpan(blk("a", "09:00", "10:00"), 600, 600).duration).toBe(5);
  });
});

describe("overlaps", () => {
  it("finds nothing in a clean day", () => {
    expect(findOverlaps(tuesday())).toEqual([]);
  });
  it("touching blocks do not overlap", () => {
    expect(findOverlaps([blk("a", "09:00", "10:00"), blk("b", "10:00", "11:00")])).toEqual([]);
  });
  it("reports the shared window and whether a fixed block is involved", () => {
    const out = findOverlaps([...tuesday(), blk("lunch", "11:00", "14:00", { kind: "delivery" })]);
    expect(out).toHaveLength(1);
    expect(out[0].a.id).toBe("class");
    expect(out[0].b.id).toBe("lunch");
    expect([out[0].start, out[0].end, out[0].minutes, out[0].fixed]).toEqual(["11:00", "14:00", 180, true]);
  });
  it("finds every pair when three stack up", () => {
    const out = findOverlaps([blk("a", "09:00", "11:00"), blk("b", "09:30", "10:30"), blk("c", "10:00", "12:00")]);
    expect(out.map((o) => `${o.a.id}${o.b.id}`).sort()).toEqual(["ab", "ac", "bc"]);
    expect(out.every((o) => !o.fixed)).toBe(true);
  });
  it("lists the ids involved", () => {
    expect(Array.from(overlappingIds([blk("a", "09:00", "10:00"), blk("b", "09:30", "10:30"), blk("c", "12:00", "13:00")])).sort()).toEqual(["a", "b"]);
  });
});

describe("nextOpenSlot", () => {
  it("uses now when now is free", () => {
    expect(nextOpenSlot(tuesday(), 30, 9 * 60 + 30)).toMatchObject({ start: "09:30", end: "10:00" });
  });
  it("rounds now up to the grid", () => {
    expect(nextOpenSlot(tuesday(), 20, 9 * 60 + 32)).toMatchObject({ start: "09:35", end: "09:55" });
  });
  it("skips a gap that is too small", () => {
    // 09:30 to 10:00 is only 30 minutes, the next gap is 14:30 to 15:00, then 16:30 to 17:00.
    expect(nextOpenSlot(tuesday(), 60, 9 * 60 + 30)).toBeNull();
    expect(nextOpenSlot(tuesday(), 30, 9 * 60 + 45)).toMatchObject({ start: "14:30", end: "15:00" });
  });
  it("starts after the block that is under way", () => {
    expect(nextOpenSlot(tuesday(), 30, 12 * 60)).toMatchObject({ start: "14:30" });
  });
  it("finds the hour once a block is removed", () => {
    const day = removeBlock(tuesday(), "ball");
    expect(nextOpenSlot(day, 60, 12 * 60)).toMatchObject({ start: "14:30", end: "15:30" });
  });
  it("returns null when nothing is left today", () => {
    expect(nextOpenSlot(tuesday(), 30, 23 * 60 + 10)).toBeNull();
  });
  it("takes the whole day when it is empty", () => {
    expect(nextOpenSlot([], 60, 0)).toMatchObject({ start: "00:00", end: "01:00" });
  });
  it("can end exactly at midnight but not past it", () => {
    expect(nextOpenSlot([], 60, 23 * 60)).toMatchObject({ start: "23:00", end: "00:00", endMin: 1440 });
    expect(nextOpenSlot([], 60, 23 * 60 + 5)).toBeNull();
  });
  it("honors a 15 minute grid", () => {
    expect(nextOpenSlot([blk("a", "09:00", "09:50")], 30, 9 * 60, { step: 15 })).toMatchObject({ start: "10:00" });
  });
  it("walks past overlapping blocks", () => {
    const day = [blk("a", "09:00", "10:00"), blk("b", "09:30", "11:00"), blk("c", "11:00", "11:30")];
    expect(nextOpenSlot(day, 15, 9 * 60)).toMatchObject({ start: "11:30" });
  });
});

describe("shifting when a block runs long", () => {
  it("pushes the next flexible blocks and stops at a gap", () => {
    const day = [blk("a", "09:00", "10:00"), blk("b", "10:00", "11:00"), blk("c", "11:00", "12:00"), blk("d", "13:00", "14:00")];
    const out = resizeBlock(day, "a", 10 * 60 + 30);
    expect(times(out.blocks)).toEqual({ a: "09:00-10:30", b: "10:30-11:30", c: "11:30-12:30", d: "13:00-14:00" });
    expect(out.moved.map((m) => m.id)).toEqual(["b", "c"]);
    expect(out.conflicts).toEqual([]);
  });
  it("lets a gap soak up the delay", () => {
    const day = [blk("a", "09:00", "10:00"), blk("b", "10:15", "11:00"), blk("c", "11:30", "12:00")];
    const out = resizeBlock(day, "a", 10 * 60 + 30);
    expect(times(out.blocks)).toEqual({ a: "09:00-10:30", b: "10:30-11:15", c: "11:30-12:00" });
  });
  it("does nothing to the rest when a block gets shorter", () => {
    const out = resizeBlock(tuesday(), "dinner", 20 * 60);
    expect(out.moved).toEqual([]);
    expect(times(out.blocks).study).toBe("21:00-23:00");
    expect(times(out.blocks).dinner).toBe("17:00-20:00");
  });
  it("never moves a fixed block, and cuts the flexible one in front of it", () => {
    // Dinner runs 30 minutes long. Study would end 23:30, but Bed is fixed at 23:00.
    const out = resizeBlock(tuesday(), "dinner", 21 * 60 + 30);
    const t = times(out.blocks);
    expect(t.dinner).toBe("17:00-21:30");
    expect(t.study).toBe("21:30-23:00");
    expect(t.bed).toBe("23:00-23:59");
    expect(out.moved).toEqual([{ id: "study", name: "study", from: { start: "21:00", end: "23:00" }, to: { start: "21:30", end: "23:00" }, cut: 30 }]);
    expect(out.conflicts).toEqual([]);
    expect(findOverlaps(out.blocks)).toEqual([]);
  });
  it("flags instead of hiding when there is no room in front of a fixed block", () => {
    // Dinner runs to 22:55. Five minutes before Bed is not a study block.
    const out = resizeBlock(tuesday(), "dinner", 22 * 60 + 55);
    const t = times(out.blocks);
    expect(t.study).toBe("22:55-00:00");
    expect(t.bed).toBe("23:00-23:59");
    expect(out.conflicts).toEqual([{ id: "study", withId: "bed", minutes: 59 }]);
    expect(findOverlaps(out.blocks).map((o) => [o.a.id, o.b.id])).toEqual([["study", "bed"]]);
  });
  it("flags the block itself when it is stretched over a fixed block", () => {
    const out = resizeBlock(tuesday(), "home", 10 * 60 + 30);
    expect(times(out.blocks).class).toBe("10:00-14:30");
    expect(out.conflicts).toEqual([{ id: "home", withId: "class", minutes: 30 }]);
    expect(out.moved).toEqual([]);
  });
  it("keeps shifting on the far side of a fixed block when the overrun reaches that far", () => {
    const day = [blk("a", "09:00", "10:00"), fixed("f", "10:00", "10:30"), blk("b", "10:30", "11:00"), blk("c", "11:00", "11:30")];
    const out = resizeBlock(day, "a", 10 * 60 + 45);
    expect(times(out.blocks)).toEqual({ a: "09:00-10:45", f: "10:00-10:30", b: "10:45-11:15", c: "11:15-11:45" });
    expect(out.conflicts).toEqual([{ id: "a", withId: "f", minutes: 30 }]);
  });
  it("squeezes a pushed block between two things when at least 15 minutes fit", () => {
    const day = [blk("a", "09:00", "10:00"), blk("b", "10:00", "11:00"), fixed("f", "11:00", "12:00"), blk("c", "12:00", "13:00")];
    const out = resizeBlock(day, "a", 10 * 60 + 40);
    expect(times(out.blocks)).toEqual({ a: "09:00-10:40", b: "10:40-11:00", f: "11:00-12:00", c: "12:00-13:00" });
    expect(out.moved[0].cut).toBe(40);
  });
  it("leaves blocks that start before the old end alone", () => {
    // b already sat on top of a. Stretching a must not shove b around.
    const day = [blk("a", "09:00", "10:00"), blk("b", "09:30", "09:45"), blk("c", "10:00", "10:30")];
    const out = resizeBlock(day, "a", 10 * 60 + 15);
    expect(times(out.blocks)).toEqual({ a: "09:00-10:15", b: "09:30-09:45", c: "10:15-10:45" });
  });
  it("cuts the last block at midnight when there is nothing fixed to stop it", () => {
    const day = [blk("a", "21:00", "22:00"), blk("b", "22:00", "23:30")];
    const out = resizeBlock(day, "a", 23 * 60);
    expect(times(out.blocks).b).toBe("23:00-00:00");
    expect(out.moved[0].cut).toBe(30);
  });
  it("shiftAfter with an unknown id changes nothing", () => {
    expect(shiftAfter(tuesday(), "nope").moved).toEqual([]);
  });
  it("does not change the input list", () => {
    const day = tuesday();
    const before = JSON.stringify(day);
    resizeBlock(day, "dinner", 22 * 60);
    expect(JSON.stringify(day)).toBe(before);
  });
});

describe("still going", () => {
  it("runs the block to 15 minutes past now and shifts what follows", () => {
    const day = [blk("tv", "20:00", "21:00", { kind: "free" }), blk("study", "21:00", "22:00"), fixed("bed", "23:00", "23:59")];
    const out = stillGoing(day, "tv", 21 * 60 + 2);
    expect(times(out.blocks)).toEqual({ tv: "20:00-21:20", study: "21:20-22:20", bed: "23:00-23:59" });
  });
  it("adds to the planned end when pressed early", () => {
    const day = [blk("tv", "20:00", "21:00"), blk("study", "21:00", "22:00")];
    expect(times(stillGoing(day, "tv", 20 * 60 + 30).blocks).tv).toBe("20:00-21:15");
  });
});

describe("move and typed edits", () => {
  it("moves a block and keeps its length, touching nothing else", () => {
    const out = moveBlock(tuesday(), "ball", 14 * 60 + 30);
    expect(times(out).ball).toBe("14:30-16:00");
    expect(times(out).dinner).toBe("17:00-21:00");
  });
  it("clamps a move to the day", () => {
    expect(times(moveBlock([blk("a", "09:00", "10:00")], "a", -30)).a).toBe("00:00-01:00");
    expect(times(moveBlock([blk("a", "09:00", "10:00")], "a", 1430)).a).toBe("23:00-00:00");
  });
  it("renames and flips flexible without moving anything", () => {
    const out = updateBlock(tuesday(), "ball", { block_name: "  Pickup run ", flexible: false });
    const b = out.blocks.find((x) => x.id === "ball")!;
    expect([b.block_name, b.flexible, b.start, b.end]).toEqual(["Pickup run", false, "15:00", "16:30"]);
    expect(out.moved).toEqual([]);
  });
  it("a later end time shifts what follows", () => {
    const out = updateBlock(tuesday(), "dinner", { end: "21:15" });
    expect(times(out.blocks).study).toBe("21:15-23:00");
  });
  it("a new start alone keeps the length", () => {
    const out = updateBlock(tuesday(), "ball", { start: "14:45" });
    expect(times(out.blocks).ball).toBe("14:45-16:15");
  });
  it("an end before the start means the end of the day", () => {
    const out = updateBlock([blk("a", "22:00", "23:00")], "a", { end: "00:00" });
    expect([out.blocks[0].end, out.blocks[0].duration]).toEqual(["00:00", 120]);
  });
  it("keeps the old name when the new one is blank", () => {
    expect(updateBlock(tuesday(), "ball", { block_name: "  " }).blocks.find((b) => b.id === "ball")!.block_name).toBe("ball");
  });
  it("adds and removes", () => {
    const tv = makeBlock({ id: "new:1", date: DATE, name: "TV", startMin: 14 * 60 + 30, duration: 30, kind: "free" });
    const day = addBlock(tuesday(), tv);
    expect(day.map((b) => b.id).indexOf("new:1")).toBe(4);
    expect([tv.start, tv.end, tv.flexible, tv.source, tv.persisted]).toEqual(["14:30", "15:00", true, "manual", false]);
    expect(removeBlock(day, "new:1")).toHaveLength(8);
  });
});

describe("the 9:00 clock-in errand", () => {
  it("cuts the block under way and leaves fixed blocks alone", () => {
    // Tuesday: Home runs 7:30 to 9:30, class is fixed at 10:00.
    const out = insertErrand(tuesday(), { id: "new:e", date: DATE });
    const t = times(out.blocks);
    expect(t["new:e"]).toBe("09:00-10:00");
    expect(t.home).toBe("07:30-09:00");
    expect(t.class).toBe("10:00-14:30");
    expect(out.moved).toEqual([{ id: "home", name: "home", from: { start: "07:30", end: "09:30" }, to: { start: "07:30", end: "09:00" }, cut: 30 }]);
    expect(out.conflicts).toEqual([]);
    const errand = findErrand(out.blocks)!;
    expect([errand.kind, errand.flexible, errand.block_name]).toEqual(["errand", false, "Clock-in errand"]);
  });
  it("shifts the morning blocks that start inside it, and the ripple carries on", () => {
    const day = [
      fixed("lift", "06:30", "07:30"),
      blk("home", "07:30", "09:00"),
      blk("study", "09:00", "11:00"),
      blk("lunch", "11:00", "14:00"),
      blk("ball", "14:30", "16:30"),
    ];
    const out = insertErrand(day, { id: "e", date: DATE });
    expect(times(out.blocks)).toEqual({
      lift: "06:30-07:30",
      home: "07:30-09:00",
      e: "09:00-10:00",
      study: "10:00-12:00",
      lunch: "12:00-15:00",
      ball: "15:00-17:00",
    });
    expect(out.moved.map((m) => m.id)).toEqual(["study", "lunch", "ball"]);
  });
  it("flags a fixed block the errand lands on", () => {
    const day = [blk("home", "07:30", "09:00"), fixed("class", "09:30", "16:00")];
    const out = insertErrand(day, { id: "e", date: DATE });
    expect(times(out.blocks).class).toBe("09:30-16:00");
    expect(out.conflicts).toEqual([{ id: "e", withId: "class", minutes: 30 }]);
  });
  it("flags a fixed block that is already running at 9:00", () => {
    const day = [fixed("class", "08:00", "09:30")];
    const out = insertErrand(day, { id: "e", date: DATE });
    expect(out.conflicts).toEqual([{ id: "e", withId: "class", minutes: 30 }]);
  });
  it("pushes a block behind the errand when under 15 minutes would be left in front", () => {
    const day = [blk("a", "08:50", "09:20"), blk("b", "10:00", "10:30")];
    const out = insertErrand(day, { id: "e", date: DATE });
    expect(times(out.blocks)).toEqual({ e: "09:00-10:00", a: "10:00-10:30", b: "10:30-11:00" });
    expect(out.moved.find((m) => m.id === "a")!.from).toEqual({ start: "08:50", end: "09:20" });
  });
  it("takes a custom time and length", () => {
    const out = insertErrand([], { id: "e", date: DATE, start: "08:30", duration: 45 });
    expect(times(out.blocks).e).toBe("08:30-09:15");
  });
  it("is not added twice", () => {
    const once = insertErrand(tuesday(), { id: "e", date: DATE }).blocks;
    expect(insertErrand(once, { id: "e2", date: DATE }).blocks).toHaveLength(once.length);
  });
  it("turning it off puts shifted template blocks back and keeps the rest", () => {
    const template = [
      { id: "t-home", start: "07:30", end: "09:00" },
      { id: "t-study", start: "09:00", end: "11:00" },
      { id: "t-lunch", start: "11:00", end: "14:00" },
      { id: "t-ball", start: "14:30", end: "16:30" },
    ];
    const day = [
      blk("home", "07:30", "09:00", { template_id: "t-home", source: "template" }),
      blk("study", "09:00", "11:00", { template_id: "t-study", source: "template" }),
      blk("lunch", "11:00", "14:00", { template_id: "t-lunch", source: "template" }),
      blk("ball", "14:30", "16:30", { template_id: "t-ball", source: "template" }),
      blk("tv", "19:00", "20:00", { kind: "free" }),
    ];
    const on = insertErrand(day, { id: "e", date: DATE }).blocks;
    const off = removeErrand(on, template);
    expect(findErrand(off)).toBeNull();
    expect(times(off)).toEqual({ home: "07:30-09:00", study: "09:00-11:00", lunch: "11:00-14:00", ball: "15:00-17:00", tv: "19:00-20:00" });
  });
  it("removing with no errand changes nothing", () => {
    expect(times(removeErrand(tuesday(), []))).toEqual(times(tuesday()));
  });
});

describe("materializing a template day", () => {
  const derived = [
    blk("template:t1", "05:45", "06:30", { template_id: "t1", source: "template", persisted: false, flexible: false, kind: "wake" }),
    blk("template:t2", "06:30", "07:30", { template_id: "t2", source: "template", persisted: false, note: "Lift" }),
  ];
  it("copies every block with a stable id and its template link", () => {
    const rows = materializeDay(DATE, derived);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: materializedId(DATE, "t1"),
      date: DATE,
      block_name: "template:t1",
      start: "05:45",
      end: "06:30",
      duration: 45,
      flexible: false,
      kind: "wake",
      note: null,
      calendar_event_id: null,
      template_id: "t1",
      source: "template",
    });
    expect(rows[1].id).toBe("2026-10-06.t2");
    expect(rows[1].note).toBe("Lift");
  });
  it("gives different days different ids, so one day never touches another", () => {
    expect(materializedId("2026-10-06", "t1")).not.toBe(materializedId("2026-10-13", "t1"));
  });
  it("knows a derived day from one with its own rows", () => {
    expect(isMaterialized(derived)).toBe(false);
    expect(isMaterialized(tuesday())).toBe(true);
    expect(isMaterialized([])).toBe(false);
  });
  it("the first edit writes the whole day, with the edit applied", () => {
    const after = resizeBlock(derived, "template:t2", 8 * 60).blocks;
    const write = planDayWrite(DATE, derived, after);
    expect(write.update).toEqual([]);
    expect(write.remove).toEqual([]);
    expect(write.insert.map((r) => [r.id, r.start, r.end, r.duration])).toEqual([
      ["2026-10-06.t1", "05:45", "06:30", 45],
      ["2026-10-06.t2", "06:30", "08:00", 90],
    ]);
  });
  it("the first edit can also add a block, which gets no id of its own", () => {
    const tv = makeBlock({ id: "new:1", date: DATE, name: "TV", startMin: 600, duration: 60, kind: "free" });
    const write = planDayWrite(DATE, derived, addBlock(derived, tv));
    expect(write.insert).toHaveLength(3);
    expect(write.insert[2].id).toBeUndefined();
    expect(write.insert[2]).toMatchObject({ block_name: "TV", kind: "free", source: "manual", template_id: null });
  });
  it("later edits write only what changed", () => {
    const before = tuesday();
    const tv = makeBlock({ id: "new:1", date: DATE, name: "TV", startMin: 14 * 60 + 30, duration: 30, kind: "free" });
    const after = addBlock(removeBlock(resizeBlock(before, "dinner", 21 * 60 + 30).blocks, "ball"), tv);
    const write = planDayWrite(DATE, before, after);
    expect(write.remove).toEqual(["ball"]);
    expect(write.insert.map((r) => r.block_name)).toEqual(["TV"]);
    expect(write.update).toEqual([
      { id: "dinner", patch: { end: "21:30", duration: 270 } },
      { id: "study", patch: { start: "21:30", duration: 90 } },
    ]);
  });
  it("no change means no writes", () => {
    expect(planDayWrite(DATE, tuesday(), tuesday())).toEqual({ insert: [], update: [], remove: [] });
  });
});

describe("lanes", () => {
  it("gives a clean day full width", () => {
    const lanes = layoutLanes(tuesday());
    expect(Array.from(lanes.values()).every((l) => l.lane === 0 && l.lanes === 1)).toBe(true);
  });
  it("puts overlapping blocks side by side", () => {
    const lanes = layoutLanes([blk("a", "09:00", "11:00"), blk("b", "10:00", "12:00"), blk("c", "11:00", "11:30"), blk("d", "13:00", "14:00")]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get("c")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("d")).toEqual({ lane: 0, lanes: 1 });
  });
  it("uses three lanes for three at once", () => {
    const lanes = layoutLanes([blk("a", "09:00", "11:00"), blk("b", "09:30", "10:30"), blk("c", "10:00", "12:00")]);
    expect(Array.from(lanes.values()).map((l) => l.lane)).toEqual([0, 1, 2]);
    expect(lanes.get("a")!.lanes).toBe(3);
  });
});

describe("timeline range", () => {
  it("defaults to 5:00 through midnight", () => {
    expect(timelineRange(tuesday())).toEqual({ s: 300, e: 1440 });
  });
  it("opens earlier for an early block", () => {
    expect(timelineRange([blk("a", "03:20", "04:00")])).toEqual({ s: 180, e: 1440 });
  });
});

describe("free time timer", () => {
  const tv = blk("tv", "20:00", "21:00", { kind: "free" });
  it("counts down while live", () => {
    const t = timerState(tv, 20 * 3600 + 15 * 60 + 30);
    expect(t.phase).toBe("live");
    expect(t.remaining).toBe(44 * 60 + 30);
    expect(t.progress).toBeCloseTo(15.5 / 60, 5);
  });
  it("is before, then over", () => {
    expect(timerState(tv, 19 * 3600).phase).toBe("before");
    const over = timerState(tv, 21 * 3600 + 90);
    expect([over.phase, over.overBy, over.remaining]).toEqual(["over", 90, 0]);
  });
  it("flips to over on the exact second", () => {
    expect(timerState(tv, 21 * 3600 - 1)).toMatchObject({ phase: "live", remaining: 1 });
    expect(timerState(tv, 21 * 3600)).toMatchObject({ phase: "over", overBy: 0 });
  });
  it("formats the countdown", () => {
    expect(formatCountdown(44 * 60 + 30)).toBe("44:30");
    expect(formatCountdown(3909)).toBe("1:05:09");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });
  it("focuses the live free block, then its alert, then nothing", () => {
    const day = [...tuesday().filter((b) => b.id !== "dinner"), tv];
    expect(freeTimeFocus(day, 19 * 3600)).toBeNull();
    expect(freeTimeFocus(day, 20 * 3600 + 60)!.timer.phase).toBe("live");
    expect(freeTimeFocus(day, 21 * 3600 + 60)!.timer.phase).toBe("over");
    expect(freeTimeFocus(day, 21 * 3600 + 60, new Set(["tv"]))).toBeNull();
    expect(freeTimeFocus(day, 21 * 3600 + 31 * 60)).toBeNull();
  });
  it("ignores blocks that are not free time", () => {
    expect(freeTimeFocus(tuesday(), 18 * 3600)).toBeNull();
  });
});
