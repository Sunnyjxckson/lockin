import { describe, expect, it } from "vitest";
import type { DayBlock } from "../blocks";
import { sigOfBlock, type RemoteEvent } from "./calendar";
import { countPlan, isQuiet, linkOp, planSync, resolveWinner, type SyncDay } from "./calendarSync";
import { durationMinutes } from "./dates";

const MON = "2026-10-05";
const TUE = "2026-10-06";

function blk(id: string, start: string, end: string, p: Partial<DayBlock> = {}): DayBlock {
  return {
    id,
    date: MON,
    block_name: p.block_name ?? id,
    start,
    end,
    duration: durationMinutes(start, end),
    flexible: true,
    kind: "other",
    note: null,
    calendar_event_id: null,
    template_id: null,
    source: "manual",
    persisted: true,
    ...p,
  };
}

function tpl(tid: string, start: string, end: string, p: Partial<DayBlock> = {}): DayBlock {
  return blk(`template:${tid}`, start, end, { block_name: tid, template_id: tid, source: "template", persisted: false, ...p });
}

function ev(id: string, title: string, start: string, minutes: number, p: Partial<RemoteEvent> = {}): RemoteEvent {
  return {
    id,
    calendar: "lockin",
    cancelled: false,
    title,
    date: MON,
    start,
    duration: minutes,
    allDay: false,
    updated: "2026-10-05T12:00:00.000Z",
    blockId: null,
    base: null,
    ...p,
  };
}

/** An event that is exactly in step with a block. */
function mirror(b: DayBlock, p: Partial<RemoteEvent> = {}): RemoteEvent {
  return ev(b.calendar_event_id ?? `e-${b.id}`, b.block_name, b.start, b.duration, { date: b.date, blockId: b.id, base: sigOfBlock(b), ...p });
}

const days = (...list: [string, DayBlock[]][]): SyncDay[] => list.map(([date, blocks]) => ({ date, blocks }));
const plan = (p: Partial<Parameters<typeof planSync>[0]> & { days: SyncDay[] }) =>
  planSync({ imported: [], exported: [], exportDates: [], ...p });

describe("resolveWinner", () => {
  const A = "a";
  const B = "b";
  const C = "c";
  const early = "2026-10-05T10:00:00Z";
  const late = "2026-10-05T11:00:00Z";

  it("nothing to do when both sides agree, whatever the base", () => {
    for (const base of [null, A, C]) expect(resolveWinner({ local: A, remote: A, base })).toBe("none");
  });
  it("only this side changed: local wins", () => {
    expect(resolveWinner({ local: B, remote: A, base: A })).toBe("local");
  });
  it("only Google changed: remote wins", () => {
    expect(resolveWinner({ local: A, remote: B, base: A })).toBe("remote");
  });
  it("only Google changed, even with a stale local edit time on record", () => {
    expect(resolveWinner({ local: A, remote: B, base: A, editedAt: late, remoteUpdated: early })).toBe("remote");
  });
  it("both changed: the newer one wins", () => {
    expect(resolveWinner({ local: A, remote: B, base: C, editedAt: late, remoteUpdated: early })).toBe("local");
    expect(resolveWinner({ local: A, remote: B, base: C, editedAt: early, remoteUpdated: late })).toBe("remote");
  });
  it("both changed at the same instant: Google wins the tie", () => {
    expect(resolveWinner({ local: A, remote: B, base: C, editedAt: early, remoteUpdated: early })).toBe("remote");
  });
  it("both changed and no local edit time: Google wins", () => {
    expect(resolveWinner({ local: A, remote: B, base: C, remoteUpdated: early })).toBe("remote");
  });
  it("no base yet: a local edit newer than the event wins, otherwise Google", () => {
    expect(resolveWinner({ local: A, remote: B, base: null, editedAt: late, remoteUpdated: early })).toBe("local");
    expect(resolveWinner({ local: A, remote: B, base: null, editedAt: early, remoteUpdated: late })).toBe("remote");
    expect(resolveWinner({ local: A, remote: B, base: null })).toBe("remote");
    expect(resolveWinner({ local: A, remote: B, base: null, editedAt: late, remoteUpdated: null })).toBe("local");
  });
  it("a calendar that cannot be written always wins", () => {
    expect(resolveWinner({ local: B, remote: A, base: A, writable: false })).toBe("remote");
    expect(resolveWinner({ local: A, remote: B, base: null, editedAt: late, remoteUpdated: early, writable: false })).toBe("remote");
    expect(resolveWinner({ local: A, remote: A, base: null, writable: false })).toBe("none");
  });
});

describe("planSync: sending blocks out", () => {
  it("does nothing for a template day that is not in the export window", () => {
    expect(isQuiet(plan({ days: days([MON, [tpl("lift", "06:30", "07:30")]]) }))).toBe(true);
  });
  it("gives an export day its own rows and makes an event per block", () => {
    const p = plan({ days: days([MON, [tpl("lift", "06:30", "07:30"), tpl("dinner", "17:00", "21:00")]]), exportDates: [MON] });
    expect(p.local).toHaveLength(1);
    expect(p.local[0]).toMatchObject({ op: "materialize", date: MON });
    expect(p.local[0].op === "materialize" && p.local[0].rows.map((r) => r.id)).toEqual(["2026-10-05.lift", "2026-10-05.dinner"]);
    expect(p.remote).toEqual([
      { op: "create", calendar: "lockin", blockId: "2026-10-05.lift", event: { title: "lift", date: MON, start: "06:30", duration: 60, note: null }, sig: "lift|2026-10-05|06:30|60" },
      { op: "create", calendar: "lockin", blockId: "2026-10-05.dinner", event: { title: "dinner", date: MON, start: "17:00", duration: 240, note: null }, sig: "dinner|2026-10-05|17:00|240" },
    ]);
  });
  it("sends out a day that already has its own rows even outside the window", () => {
    const p = plan({ days: days([TUE, [blk("a", "09:00", "10:00", { date: TUE })]]) });
    expect(p.local).toEqual([]);
    expect(p.remote.map((o) => o.op)).toEqual(["create"]);
  });
  it("is quiet when block and event are in step", () => {
    const b = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    expect(isQuiet(plan({ days: days([MON, [b]]), exported: [mirror(b)] }))).toBe(true);
  });
  it("pushes a local move", () => {
    const was = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    const now = { ...was, start: "11:00", end: "12:00" };
    const p = plan({ days: days([MON, [now]]), exported: [mirror(was)] });
    expect(p.local).toEqual([]);
    expect(p.remote).toEqual([
      { op: "update", calendar: "lockin", eventId: "e1", event: { title: "a", date: MON, start: "11:00", duration: 60, note: null }, sig: "a|2026-10-05|11:00|60", blockId: "a", revert: undefined },
    ]);
  });
  it("pulls a move made in Google and re-stamps the event", () => {
    const b = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    const p = plan({ days: days([MON, [b]]), exported: [mirror(b, { start: "13:00", duration: 90 })] });
    expect(p.local).toEqual([{ op: "update", id: "a", patch: { start: "13:00", end: "14:30", duration: 90 } }]);
    expect(p.remote).toEqual([{ op: "update", calendar: "lockin", eventId: "e1", sig: "a|2026-10-05|13:00|90", blockId: "a" }]);
  });
  it("only stamps when both sides already match but the base is stale", () => {
    const b = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    const p = plan({ days: days([MON, [b]]), exported: [mirror(b, { base: "old" })] });
    expect(p.local).toEqual([]);
    expect(p.remote).toEqual([{ op: "update", calendar: "lockin", eventId: "e1", sig: sigOfBlock(b), blockId: "a" }]);
    expect(countPlan(p)).toEqual({ pulled: 0, pushed: 0, removed: 0 });
  });
  it("links a block to the event that names it rather than making another", () => {
    const b = blk("a", "09:00", "10:00");
    const p = plan({ days: days([MON, [b]]), exported: [mirror(b, { id: "e7" })] });
    expect(p.local).toEqual([linkOp("a", "e7")]);
    expect(p.remote).toEqual([]);
  });
  it("deletes the event of a block that is gone", () => {
    const b = blk("gone", "09:00", "10:00", { calendar_event_id: "e1" });
    const p = plan({ days: days([MON, []]), exported: [mirror(b)] });
    expect(p.remote).toEqual([{ op: "delete", calendar: "lockin", eventId: "e1" }]);
    expect(p.local).toEqual([]);
  });
  it("deletes the block of an event that was cancelled in Google", () => {
    const b = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    const p = plan({ days: days([MON, [b]]), exported: [mirror(b, { cancelled: true })] });
    expect(p.local).toEqual([{ op: "delete", id: "a" }]);
    expect(p.remote).toEqual([]);
  });
  it("keeps a block that was edited here after Google cancelled it, and makes a new event", () => {
    const b = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    const p = plan({ days: days([MON, [b]]), exported: [mirror(b, { cancelled: true })], edits: { a: "2026-10-05T13:00:00Z" } });
    expect(p.local).toEqual([]);
    expect(p.remote.map((o) => o.op)).toEqual(["create"]);
  });
  it("makes the event again when the link points at nothing", () => {
    const b = blk("a", "09:00", "10:00", { calendar_event_id: "missing" });
    const p = plan({ days: days([MON, [b]]) });
    expect(p.remote.map((o) => o.op)).toEqual(["create"]);
    expect(p.local).toEqual([]);
  });
  it("removes a second event for the same block", () => {
    const b = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    const p = plan({ days: days([MON, [b]]), exported: [mirror(b), mirror(b, { id: "e2" })] });
    expect(p.remote).toEqual([{ op: "delete", calendar: "lockin", eventId: "e2" }]);
  });
  it("turns an event added by hand into a block", () => {
    const p = plan({ days: days([MON, [blk("a", "09:00", "10:00", { calendar_event_id: "e1" })]]), exported: [mirror(blk("a", "09:00", "10:00", { calendar_event_id: "e1" })), ev("u1", "Haircut", "13:00", 45)] });
    expect(p.local).toEqual([
      {
        op: "create",
        row: { date: MON, block_name: "Haircut", start: "13:00", end: "13:45", duration: 45, flexible: true, kind: "other", note: null, calendar_event_id: "u1", template_id: null, source: "manual" },
      },
    ]);
    expect(p.remote).toEqual([]);
  });
  it("then tags that event with its block on the next round", () => {
    const b = blk("row9", "13:00", "13:45", { block_name: "Haircut", calendar_event_id: "u1" });
    const p = plan({ days: days([MON, [b]]), exported: [ev("u1", "Haircut", "13:00", 45)] });
    expect(p.local).toEqual([]);
    expect(p.remote).toEqual([{ op: "update", calendar: "lockin", eventId: "u1", sig: sigOfBlock(b), blockId: "row9" }]);
  });
  it("follows an event to another day and gives that day its rows first", () => {
    const b = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    const p = plan({
      days: days([MON, [b]], [TUE, [tpl("lift", "06:30", "07:30", { date: TUE })]]),
      exported: [mirror(b, { date: TUE })],
    });
    expect(p.local.map((o) => o.op)).toEqual(["materialize", "update"]);
    expect(p.local[1]).toEqual({ op: "update", id: "a", patch: { date: TUE } });
    // The blocks of the day that just got rows go out on the next round.
    expect(p.remote).toEqual([{ op: "update", calendar: "lockin", eventId: "e1", sig: "a|2026-10-06|09:00|60", blockId: "a" }]);
  });
  it("ignores events outside the days it was given", () => {
    const p = plan({ days: days([MON, []]), exported: [ev("far", "Later", "10:00", 60, { date: "2026-12-01", blockId: "x" })] });
    expect(isQuiet(p)).toBe(true);
  });
});

describe("planSync: bringing events in", () => {
  const classEvent = (p: Partial<RemoteEvent> = {}) => ev("c1", "ECON 2101", "09:30", 75, { calendar: "import", ...p });

  it("creates a fixed block and gives the day its rows", () => {
    const p = plan({ days: days([MON, [tpl("lift", "06:30", "07:30")]]), imported: [classEvent()] });
    expect(p.local.map((o) => o.op)).toEqual(["materialize", "create"]);
    expect(p.local[1]).toMatchObject({ op: "create", row: { block_name: "ECON 2101", flexible: false, source: "calendar", kind: "class", calendar_event_id: "c1" } });
    // Imports are never copied onto the Lock In calendar. The template block of that day does go out.
    expect(p.remote).toHaveLength(1);
    expect(p.remote[0]).toMatchObject({ op: "create", blockId: "2026-10-05.lift" });
  });
  it("drops the template class block the real class overlaps, and only that", () => {
    const p = plan({
      days: days([MON, [tpl("lift", "06:30", "07:30"), tpl("class", "09:30", "16:00", { kind: "class", flexible: false }), tpl("study", "20:00", "23:00")]]),
      imported: [classEvent()],
    });
    expect(p.local.filter((o) => o.op === "delete")).toEqual([{ op: "delete", id: "2026-10-05.class" }]);
    expect(p.remote.map((o) => o.op === "create" && o.blockId)).toEqual(["2026-10-05.lift", "2026-10-05.study"]);
  });
  it("leaves a class block the user made or moved by hand", () => {
    const mine = blk("mine", "09:00", "10:00", { kind: "class", source: "manual" });
    const p = plan({ days: days([MON, [mine]]), imported: [classEvent()] });
    expect(p.local.filter((o) => o.op === "delete")).toEqual([]);
  });
  it("also removes the event of a template class block that had already gone out", () => {
    const old = blk("2026-10-05.class", "09:30", "16:00", { kind: "class", source: "template", template_id: "class", calendar_event_id: "e-class" });
    const p = plan({ days: days([MON, [old]]), imported: [classEvent()], exported: [mirror(old)] });
    expect(p.local.map((o) => o.op).sort()).toEqual(["create", "delete"]);
    expect(p.remote).toEqual([{ op: "delete", calendar: "lockin", eventId: "e-class" }]);
  });
  it("is quiet once the block exists", () => {
    const b = blk("i1", "09:30", "10:45", { block_name: "ECON 2101", source: "calendar", flexible: false, calendar_event_id: "c1" });
    expect(isQuiet(plan({ days: days([MON, [b]]), imported: [classEvent({ base: sigOfBlock(b) })] }))).toBe(true);
  });
  it("first sight of an import only stamps the base, when the calendar can be written", () => {
    const b = blk("i1", "09:30", "10:45", { block_name: "ECON 2101", source: "calendar", flexible: false, calendar_event_id: "c1" });
    const p = plan({ days: days([MON, [b]]), imported: [classEvent()] });
    expect(p.local).toEqual([]);
    expect(p.remote).toEqual([{ op: "update", calendar: "import", eventId: "c1", sig: sigOfBlock(b), blockId: undefined }]);
    expect(isQuiet(plan({ days: days([MON, [b]]), imported: [classEvent()], importWritable: false }))).toBe(true);
  });
  it("follows the event when class moves", () => {
    const b = blk("i1", "09:30", "10:45", { block_name: "ECON 2101", source: "calendar", flexible: false, calendar_event_id: "c1" });
    const p = plan({ days: days([MON, [b]]), imported: [classEvent({ start: "11:00", base: sigOfBlock(b) })] });
    expect(p.local).toEqual([{ op: "update", id: "i1", patch: { start: "11:00", end: "12:15" } }]);
  });
  it("removes the block when the event is cancelled, gone, or now all day", () => {
    const b = blk("i1", "09:30", "10:45", { block_name: "ECON 2101", source: "calendar", flexible: false, calendar_event_id: "c1" });
    for (const imported of [[classEvent({ cancelled: true })], [], [classEvent({ allDay: true, date: null, start: null })]]) {
      expect(plan({ days: days([MON, [b]]), imported }).local).toEqual([{ op: "delete", id: "i1" }]);
    }
  });
  it("pushes a local move of an import, with a way back if Google says no", () => {
    const b = blk("i1", "10:00", "11:15", { block_name: "ECON 2101", source: "calendar", flexible: false, calendar_event_id: "c1" });
    const p = plan({ days: days([MON, [b]]), imported: [classEvent({ base: "ECON 2101|2026-10-05|09:30|75" })] });
    expect(p.local).toEqual([]);
    expect(p.remote).toEqual([
      {
        op: "update",
        calendar: "import",
        eventId: "c1",
        event: { title: "ECON 2101", date: MON, start: "10:00", duration: 75, note: null },
        sig: sigOfBlock(b),
        blockId: undefined,
        revert: { id: "i1", patch: { block_name: "ECON 2101", date: MON, start: "09:30", end: "10:45", duration: 75 } },
      },
    ]);
  });
  it("puts a moved import back when the calendar is read only", () => {
    const b = blk("i1", "10:00", "11:15", { block_name: "ECON 2101", source: "calendar", flexible: false, calendar_event_id: "c1" });
    const p = plan({ days: days([MON, [b]]), imported: [classEvent()], importWritable: false, edits: { i1: "2026-10-05T13:00:00Z" } });
    expect(p.local).toEqual([{ op: "update", id: "i1", patch: { start: "09:30", end: "10:45" } }]);
    expect(p.remote).toEqual([]);
  });
  it("skips all day events", () => {
    expect(isQuiet(plan({ days: days([MON, []]), imported: [classEvent({ allDay: true, date: null, start: null })] }))).toBe(true);
  });
  it("orders local work so days exist before they are edited", () => {
    const p = plan({
      days: days([MON, [tpl("class", "09:30", "16:00", { kind: "class" })]], [TUE, [tpl("lift", "06:30", "07:30", { date: TUE })]]),
      imported: [classEvent(), ev("c2", "Dentist", "15:00", 60, { calendar: "import", date: TUE })],
    });
    expect(p.local.map((o) => o.op)).toEqual(["materialize", "materialize", "create", "create", "delete"]);
  });
});

describe("planSync: settling", () => {
  it("counts what a person would notice", () => {
    const was = blk("a", "09:00", "10:00", { calendar_event_id: "e1" });
    const p = plan({
      days: days([MON, [{ ...was, start: "11:00", end: "12:00" }, blk("b", "13:00", "14:00")]]),
      exported: [mirror(was), mirror(blk("gone", "15:00", "16:00", { calendar_event_id: "e9" })), ev("u1", "Haircut", "17:00", 30)],
    });
    expect(countPlan(p)).toEqual({ pulled: 1, pushed: 2, removed: 1 });
  });
});
