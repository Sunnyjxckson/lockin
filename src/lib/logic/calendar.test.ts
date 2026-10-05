import { describe, expect, it } from "vitest";
import type { DayBlock } from "../blocks";
import {
  describeConflict,
  eventBody,
  eventFromGoogle,
  eventTimes,
  findCalendarConflicts,
  kindForTitle,
  patchFromEvent,
  rowFromEvent,
  sigOfBlock,
  sigOfEvent,
} from "./calendar";
import { durationMinutes } from "./dates";

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
    kind: "other",
    note: null,
    calendar_event_id: null,
    template_id: null,
    source: "manual",
    persisted: true,
    ...p,
  };
}

describe("calendar conflicts", () => {
  it("finds a delivery block that overlaps an imported class", () => {
    const out = findCalendarConflicts([
      blk("class", "10:00", "14:30", { block_name: "ECON 2101", source: "calendar", flexible: false, kind: "class" }),
      blk("lunch", "11:00", "14:00", { block_name: "Delivery: lunch", kind: "delivery" }),
      blk("study", "15:00", "16:00"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].event.id).toBe("class");
    expect(out[0].block.id).toBe("lunch");
    expect([out[0].start, out[0].end, out[0].minutes]).toEqual(["11:00", "14:00", 180]);
    expect(describeConflict(out[0])).toBe("Delivery: lunch overlaps ECON 2101");
  });
  it("counts a template class block as fixed too, with no calendar connected", () => {
    const out = findCalendarConflicts([blk("class", "09:30", "16:00", { kind: "class", flexible: false, source: "template" }), blk("errand", "09:00", "10:00", { kind: "errand" })]);
    expect(out.map((c) => [c.block.id, c.minutes])).toEqual([["errand", 30]]);
  });
  it("counts an imported event that is not a class", () => {
    const out = findCalendarConflicts([blk("dentist", "15:00", "16:00", { source: "calendar", flexible: false }), blk("ball", "15:30", "17:00")]);
    expect(out.map((c) => [c.event.id, c.block.id, c.minutes])).toEqual([["dentist", "ball", 30]]);
  });
  it("is empty when blocks only touch", () => {
    expect(findCalendarConflicts([blk("class", "10:00", "11:00", { kind: "class" }), blk("a", "09:00", "10:00"), blk("b", "11:00", "12:00")])).toEqual([]);
  });
  it("ignores two Lock In blocks overlapping each other", () => {
    expect(findCalendarConflicts([blk("a", "09:00", "10:00"), blk("b", "09:30", "10:30")])).toEqual([]);
  });
  it("ignores two calendar events overlapping each other", () => {
    expect(
      findCalendarConflicts([blk("a", "09:00", "10:00", { source: "calendar" }), blk("b", "09:30", "10:30", { source: "calendar" })]),
    ).toEqual([]);
  });
  it("lists every block an event collides with, earliest first", () => {
    const out = findCalendarConflicts([
      blk("class", "10:00", "14:00", { source: "calendar" }),
      blk("late", "13:00", "15:00"),
      blk("early", "09:00", "10:30"),
    ]);
    expect(out.map((c) => c.block.id)).toEqual(["early", "late"]);
  });
  it("is empty for an empty day", () => {
    expect(findCalendarConflicts([])).toEqual([]);
  });
});

describe("reading Google events", () => {
  it("turns an instant into a New York date and time", () => {
    const e = eventFromGoogle(
      { id: "e1", summary: "ECON 2101", start: { dateTime: "2026-10-06T14:00:00Z" }, end: { dateTime: "2026-10-06T15:15:00Z" }, updated: "2026-10-01T00:00:00Z" },
      "import",
    );
    expect([e.date, e.start, e.duration, e.allDay, e.cancelled]).toEqual(["2026-10-06", "10:00", 75, false, false]);
  });
  it("reads an offset time the same way", () => {
    const e = eventFromGoogle({ id: "e1", start: { dateTime: "2026-10-06T10:00:00-04:00" }, end: { dateTime: "2026-10-06T11:00:00-04:00" } }, "import");
    expect([e.date, e.start, e.duration, e.title]).toEqual(["2026-10-06", "10:00", 60, "Busy"]);
  });
  it("uses the New York date for a late evening event, not the UTC one", () => {
    const e = eventFromGoogle({ id: "e1", start: { dateTime: "2026-10-07T01:30:00Z" }, end: { dateTime: "2026-10-07T02:30:00Z" } }, "import");
    expect([e.date, e.start]).toEqual(["2026-10-06", "21:30"]);
  });
  it("is right after the clocks change in November", () => {
    const e = eventFromGoogle({ id: "e1", start: { dateTime: "2026-11-02T15:00:00Z" }, end: { dateTime: "2026-11-02T16:00:00Z" } }, "import");
    expect([e.date, e.start]).toEqual(["2026-11-02", "10:00"]);
  });
  it("cuts an event that runs past midnight", () => {
    const e = eventFromGoogle({ id: "e1", start: { dateTime: "2026-10-06T23:00:00-04:00" }, end: { dateTime: "2026-10-07T02:00:00-04:00" } }, "import");
    expect(e.duration).toBe(60);
  });
  it("marks all day and cancelled events", () => {
    expect(eventFromGoogle({ id: "a", start: { date: "2026-10-06" }, end: { date: "2026-10-07" } }, "import").allDay).toBe(true);
    const gone = eventFromGoogle({ id: "b", status: "cancelled" }, "lockin");
    expect([gone.cancelled, gone.date]).toEqual([true, null]);
  });
  it("reads the private properties", () => {
    const e = eventFromGoogle(
      { id: "e", start: { dateTime: "2026-10-06T10:00:00-04:00" }, end: { dateTime: "2026-10-06T11:00:00-04:00" }, extendedProperties: { private: { lockinBlock: "b1", lockinSig: "x" } } },
      "lockin",
    );
    expect([e.blockId, e.base]).toEqual(["b1", "x"]);
  });
});

describe("writing Google events", () => {
  it("sends wall clock times with the New York zone", () => {
    expect(eventTimes({ date: DATE, start: "17:00", duration: 240 })).toEqual({
      start: { dateTime: "2026-10-06T17:00:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-10-06T21:00:00", timeZone: "America/New_York" },
    });
  });
  it("ends on the next day when a block runs to midnight", () => {
    expect(eventTimes({ date: DATE, start: "23:00", duration: 60 }).end.dateTime).toBe("2026-10-07T00:00:00");
  });
  it("builds a full body and a stamp only body", () => {
    const full = eventBody({ title: "TV", date: DATE, start: "20:00", duration: 60, note: "One episode" }, "sig", "b1");
    expect(full).toMatchObject({ summary: "TV", description: "One episode", extendedProperties: { private: { lockinSig: "sig", lockinBlock: "b1" } } });
    expect(eventBody(undefined, "sig")).toEqual({ extendedProperties: { private: { lockinSig: "sig" } } });
  });
  it("round trips: a block written out and read back has the same signature", () => {
    const b = blk("b1", "17:00", "21:00", { block_name: "Delivery: dinner" });
    const body = eventBody({ title: b.block_name, date: b.date, start: b.start, duration: b.duration }, sigOfBlock(b), b.id) as {
      summary: string;
      start: { dateTime: string };
      end: { dateTime: string };
    };
    const back = eventFromGoogle(
      { id: "e", summary: body.summary, start: { dateTime: `${body.start.dateTime}-04:00` }, end: { dateTime: `${body.end.dateTime}-04:00` } },
      "lockin",
    );
    expect(sigOfEvent(back)).toBe(sigOfBlock(b));
  });
});

describe("imported events as blocks", () => {
  const event = eventFromGoogle({ id: "e9", summary: "MGMT 3140 lecture", start: { dateTime: "2026-10-06T10:00:00-04:00" }, end: { dateTime: "2026-10-06T11:15:00-04:00" } }, "import");
  it("come in fixed, from the calendar, tied to the event", () => {
    expect(rowFromEvent(event)).toEqual({
      date: "2026-10-06",
      block_name: "MGMT 3140 lecture",
      start: "10:00",
      end: "11:15",
      duration: 75,
      flexible: false,
      kind: "class",
      note: null,
      calendar_event_id: "e9",
      template_id: null,
      source: "calendar",
    });
  });
  it("an event added by hand to the Lock In calendar is an ordinary flexible block", () => {
    expect(rowFromEvent({ ...event, calendar: "lockin" })).toMatchObject({ flexible: true, source: "manual", kind: "other" });
  });
  it("guesses class from the title", () => {
    expect(kindForTitle("ECON 2101")).toBe("class");
    expect(kindForTitle("Stats lab")).toBe("class");
    expect(kindForTitle("Dentist")).toBe("other");
    expect(kindForTitle("Lunch with Thomas")).toBe("other");
  });
  it("patchFromEvent carries name, day, times and length", () => {
    expect(patchFromEvent(event)).toEqual({ block_name: "MGMT 3140 lecture", date: "2026-10-06", start: "10:00", end: "11:15", duration: 75 });
  });
});
