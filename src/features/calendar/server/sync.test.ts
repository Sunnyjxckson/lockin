// The whole sync loop against a pretend Google and a pretend device, so the
// promises that matter (both directions, no duplicates, settles to quiet)
// are checked end to end without a network.

import { describe, expect, it } from "vitest";
import type { DayBlock } from "@/lib/blocks";
import { eventTimes, sigOfBlock, type GoogleEvent } from "@/lib/logic/calendar";
import type { LocalOp, SyncDay } from "@/lib/logic/calendarSync";
import { addDays, dateRange, durationMinutes, weekdayOf } from "@/lib/logic/dates";
import { sortBlocks } from "@/lib/logic/schedule";
import { GoogleError, runSync, type CalendarApi, type RunSyncInput } from "./sync";

const FROM = "2026-10-05"; // a Monday
const TO = "2026-10-11";
const IMPORT = "primary";
const LOCKIN = "lockin-cal";

// ---------- a pretend Google ----------

class FakeGoogle implements CalendarApi {
  events = new Map<string, Map<string, GoogleEvent>>([
    [IMPORT, new Map()],
    [LOCKIN, new Map()],
  ]);
  readOnly = new Set<string>();
  clock = Date.parse("2026-10-05T12:00:00Z");
  n = 0;
  writes = 0;
  failInserts = 0;

  tick(minutes = 1): string {
    this.clock += minutes * 60_000;
    return new Date(this.clock).toJSON();
  }
  private cal(id: string): Map<string, GoogleEvent> {
    const c = this.events.get(id);
    if (!c) throw new GoogleError("Not Found", 404);
    return c;
  }
  async listEvents(calendarId: string): Promise<GoogleEvent[]> {
    return Array.from(this.cal(calendarId).values()).map((e) => structuredClone(e));
  }
  async insertEvent(calendarId: string, body: Record<string, unknown>): Promise<GoogleEvent> {
    if (this.readOnly.has(calendarId)) throw new GoogleError("Forbidden", 403);
    if (this.failInserts > 0) {
      this.failInserts -= 1;
      throw new GoogleError("Backend Error", 500);
    }
    this.writes += 1;
    const e = { ...(structuredClone(body) as object), id: `ev${++this.n}`, status: "confirmed", updated: this.tick() } as GoogleEvent;
    this.cal(calendarId).set(e.id, e);
    return structuredClone(e);
  }
  async patchEvent(calendarId: string, eventId: string, body: Record<string, unknown>): Promise<GoogleEvent> {
    if (this.readOnly.has(calendarId)) throw new GoogleError("Forbidden", 403);
    const e = this.cal(calendarId).get(eventId);
    if (!e || e.status === "cancelled") throw new GoogleError("Not Found", 404);
    this.writes += 1;
    const patch = structuredClone(body) as unknown as GoogleEvent;
    const priv = { ...(e.extendedProperties?.private ?? {}), ...(patch.extendedProperties?.private ?? {}) };
    Object.assign(e, patch, { extendedProperties: { private: priv }, updated: this.tick() });
    return structuredClone(e);
  }
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const e = this.cal(calendarId).get(eventId);
    if (!e || e.status === "cancelled") throw new GoogleError("Gone", 410);
    this.writes += 1;
    e.status = "cancelled";
    e.updated = this.tick();
  }

  // What a person does in the Google Calendar app.
  userAdd(calendarId: string, summary: string, date: string, start: string, minutes: number): string {
    const id = `user${++this.n}`;
    this.cal(calendarId).set(id, { id, status: "confirmed", summary, updated: this.tick(), ...offset(eventTimes({ date, start, duration: minutes })) });
    return id;
  }
  userMove(calendarId: string, id: string, date: string, start: string, minutes: number, summary?: string): void {
    const e = this.cal(calendarId).get(id)!;
    Object.assign(e, offset(eventTimes({ date, start, duration: minutes })), { updated: this.tick() });
    if (summary) e.summary = summary;
  }
  userDelete(calendarId: string, id: string): void {
    const e = this.cal(calendarId).get(id)!;
    e.status = "cancelled";
    e.updated = this.tick();
  }
  live(calendarId: string): GoogleEvent[] {
    return Array.from(this.cal(calendarId).values()).filter((e) => e.status !== "cancelled");
  }
}

/** Google hands times back with an offset. October in New York is -04:00. */
function offset(t: ReturnType<typeof eventTimes>): Pick<GoogleEvent, "start" | "end"> {
  return { start: { dateTime: `${t.start.dateTime}-04:00` }, end: { dateTime: `${t.end.dateTime}-04:00` } };
}

// ---------- a pretend device ----------

interface Tpl {
  id: string;
  weekday: number;
  name: string;
  start: string;
  end: string;
  flexible: boolean;
  kind: DayBlock["kind"];
}

const TEMPLATE: Tpl[] = [1, 2, 3, 4, 5, 6, 0].flatMap((weekday) => [
  { id: `w${weekday}-lift`, weekday, name: "Lift + core", start: "06:30", end: "07:30", flexible: false, kind: "workout" as const },
  { id: `w${weekday}-class`, weekday, name: "Class", start: "10:00", end: "14:30", flexible: false, kind: "class" as const },
  { id: `w${weekday}-dinner`, weekday, name: "Delivery: dinner", start: "17:00", end: "21:00", flexible: true, kind: "delivery" as const },
]);

class Device {
  rows: DayBlock[] = [];
  n = 0;

  day(date: string): DayBlock[] {
    const own = this.rows.filter((r) => r.date === date);
    if (own.length > 0) return sortBlocks(own);
    return sortBlocks(
      TEMPLATE.filter((t) => t.weekday === weekdayOf(date)).map((t) => ({
        id: `template:${t.id}`,
        date,
        block_name: t.name,
        start: t.start,
        end: t.end,
        duration: durationMinutes(t.start, t.end),
        flexible: t.flexible,
        kind: t.kind,
        note: null,
        calendar_event_id: null,
        template_id: t.id,
        source: "template" as const,
        persisted: false,
      })),
    );
  }
  days(): SyncDay[] {
    return dateRange(FROM, TO).map((date) => ({ date, blocks: this.day(date) }));
  }
  apply(ops: LocalOp[]): void {
    for (const op of ops) {
      if (op.op === "materialize") {
        if (this.rows.some((r) => r.date === op.date)) continue;
        for (const row of op.rows) this.rows.push({ ...row, id: row.id ?? `row${++this.n}`, persisted: true } as DayBlock);
      } else if (op.op === "create") {
        this.rows.push({ ...op.row, id: op.row.id ?? `row${++this.n}`, persisted: true } as DayBlock);
      } else if (op.op === "update") {
        this.rows = this.rows.map((r) => (r.id === op.id ? ({ ...r, ...op.patch } as DayBlock) : r));
      } else {
        this.rows = this.rows.filter((r) => r.id !== op.id);
      }
    }
  }
  find(name: string, date: string): DayBlock {
    const b = this.rows.find((r) => r.block_name === name && r.date === date);
    if (!b) throw new Error(`no block ${name} on ${date}`);
    return b;
  }
  edit(id: string, patch: Partial<DayBlock>): void {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
  }
}

async function sync(google: FakeGoogle, device: Device, extra: Partial<RunSyncInput> = {}) {
  const result = await runSync(google, {
    importCalendarId: IMPORT,
    importWritable: true,
    lockinCalendarId: LOCKIN,
    days: device.days(),
    exportDates: [FROM, addDays(FROM, 1)],
    ...extra,
  });
  device.apply(result.localOps);
  return result;
}

/** Sync until a round changes nothing, and fail if that takes too long. */
async function settle(google: FakeGoogle, device: Device, extra: Partial<RunSyncInput> = {}): Promise<number> {
  for (let i = 1; i <= 5; i++) {
    const before = google.writes;
    const r = await sync(google, device, extra);
    if (r.localOps.length === 0 && google.writes === before) return i;
  }
  throw new Error("sync never settled");
}

const noDuplicates = (google: FakeGoogle) => {
  const ids = google.live(LOCKIN).map((e) => e.extendedProperties?.private?.lockinBlock);
  expect(new Set(ids).size).toBe(ids.length);
};

describe("two way sync, end to end", () => {
  it("first sync sends the export days out and then goes quiet", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    const first = await sync(google, device);
    expect(first.errors).toEqual([]);
    expect(google.live(LOCKIN)).toHaveLength(6); // two days of three blocks
    expect(device.rows).toHaveLength(6);
    expect(device.rows.every((r) => r.calendar_event_id)).toBe(true);
    // Days outside the export window stay on the template.
    expect(device.day(addDays(FROM, 3)).every((b) => !b.persisted)).toBe(true);

    const writes = google.writes;
    const second = await sync(google, device);
    expect(second.localOps).toEqual([]);
    expect(google.writes).toBe(writes);
    noDuplicates(google);
  });

  it("writes each block where it really is", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await sync(google, device);
    const dinner = google.live(LOCKIN).find((e) => e.summary === "Delivery: dinner" && e.start?.dateTime?.startsWith(FROM));
    expect(dinner?.start).toEqual({ dateTime: "2026-10-05T17:00:00", timeZone: "America/New_York" });
    expect(dinner?.end?.dateTime).toBe("2026-10-05T21:00:00");
  });

  it("class times come in as fixed blocks and replace the template's guess", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    google.userAdd(IMPORT, "ECON 2101", FROM, "09:30", 75);
    google.userAdd(IMPORT, "MGMT 3140", FROM, "13:00", 75);
    await settle(google, device);
    const day = device.day(FROM);
    expect(day.map((b) => b.block_name)).toEqual(["Lift + core", "ECON 2101", "MGMT 3140", "Delivery: dinner"]);
    const econ = device.find("ECON 2101", FROM);
    expect([econ.flexible, econ.source, econ.kind, econ.start, econ.end]).toEqual([false, "calendar", "class", "09:30", "10:45"]);
    // The class block was never sent out, and imported events are not copied to the Lock In calendar.
    expect(google.live(LOCKIN).map((e) => e.summary).sort()).toEqual(["Delivery: dinner", "Delivery: dinner", "Class", "Lift + core", "Lift + core"].sort());
    expect(google.live(IMPORT)).toHaveLength(2);
  });

  it("an import on a day outside the export window gives that day its own rows", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    const thursday = addDays(FROM, 3);
    google.userAdd(IMPORT, "Dentist", thursday, "15:00", 60);
    await settle(google, device);
    expect(device.day(thursday).map((b) => b.block_name)).toEqual(["Lift + core", "Class", "Dentist", "Delivery: dinner"]);
    expect(device.day(thursday).every((b) => b.persisted)).toBe(true);
    noDuplicates(google);
  });

  it("moving an event in Google moves the block", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const dinner = device.find("Delivery: dinner", FROM);
    google.userMove(LOCKIN, dinner.calendar_event_id!, FROM, "18:00", 180);
    await sync(google, device);
    const after = device.find("Delivery: dinner", FROM);
    expect([after.start, after.end, after.duration]).toEqual(["18:00", "21:00", 180]);
    expect(await settle(google, device)).toBe(1);
  });

  it("moving a block here moves the event, with or without a recorded edit time", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const dinner = device.find("Delivery: dinner", FROM);
    device.edit(dinner.id, { start: "16:00", end: "20:00" });
    await sync(google, device);
    const event = google.live(LOCKIN).find((e) => e.id === dinner.calendar_event_id)!;
    expect(event.start?.dateTime).toBe("2026-10-05T16:00:00");
    expect(device.find("Delivery: dinner", FROM).start).toBe("16:00");
    expect(await settle(google, device)).toBe(1);
  });

  it("after Google wins once, a later local move still goes out", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const dinner = device.find("Delivery: dinner", FROM);
    google.userMove(LOCKIN, dinner.calendar_event_id!, FROM, "18:00", 180);
    await settle(google, device);
    device.edit(dinner.id, { start: "19:00", end: "22:00" });
    await settle(google, device);
    expect(device.find("Delivery: dinner", FROM).start).toBe("19:00");
    expect(google.live(LOCKIN).find((e) => e.id === dinner.calendar_event_id)!.start?.dateTime).toBe("2026-10-05T19:00:00");
  });

  it("when both sides moved, the newer change wins", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const dinner = device.find("Delivery: dinner", FROM);

    // Google moved it, then the phone moved it later: the phone wins.
    google.userMove(LOCKIN, dinner.calendar_event_id!, FROM, "18:00", 180);
    device.edit(dinner.id, { start: "16:00", end: "20:00" });
    await sync(google, device, { edits: { [dinner.id]: google.tick(5) } });
    expect(device.find("Delivery: dinner", FROM).start).toBe("16:00");
    expect(google.live(LOCKIN).find((e) => e.id === dinner.calendar_event_id)!.start?.dateTime).toBe("2026-10-05T16:00:00");
    await settle(google, device);

    // The phone moved it, then Google moved it later: Google wins.
    device.edit(dinner.id, { start: "15:00", end: "19:00" });
    const editedAt = google.tick(1);
    google.userMove(LOCKIN, dinner.calendar_event_id!, FROM, "19:00", 120);
    await sync(google, device, { edits: { [dinner.id]: editedAt } });
    expect(device.find("Delivery: dinner", FROM).start).toBe("19:00");
    expect(await settle(google, device)).toBe(1);
  });

  it("moving an event to another day moves the block and gives that day its rows", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const dinner = device.find("Delivery: dinner", FROM);
    const friday = addDays(FROM, 4);
    google.userMove(LOCKIN, dinner.calendar_event_id!, friday, "12:00", 120);
    await settle(google, device);
    expect(device.rows.find((r) => r.id === dinner.id)!.date).toBe(friday);
    expect(device.day(friday).map((b) => b.block_name)).toEqual(["Lift + core", "Class", "Delivery: dinner", "Delivery: dinner"]);
    expect(device.day(FROM).map((b) => b.block_name)).toEqual(["Lift + core", "Class"]);
    noDuplicates(google);
  });

  it("deleting a block removes its event, and deleting an event removes its block", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const dinner = device.find("Delivery: dinner", FROM);
    const lift = device.find("Lift + core", FROM);

    device.rows = device.rows.filter((r) => r.id !== dinner.id);
    google.userDelete(LOCKIN, lift.calendar_event_id!);
    await settle(google, device);

    expect(google.live(LOCKIN).some((e) => e.id === dinner.calendar_event_id)).toBe(false);
    expect(device.rows.some((r) => r.id === lift.id)).toBe(false);
    expect(device.day(FROM).map((b) => b.block_name)).toEqual(["Class"]);
    expect(google.live(LOCKIN)).toHaveLength(4);
  });

  it("an event that vanished without being cancelled is made again, not treated as a delete", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const dinner = device.find("Delivery: dinner", FROM);
    google.events.get(LOCKIN)!.delete(dinner.calendar_event_id!);
    await settle(google, device);
    const again = device.find("Delivery: dinner", FROM);
    expect(again.calendar_event_id).not.toBe(dinner.calendar_event_id);
    expect(google.live(LOCKIN)).toHaveLength(6);
  });

  it("a link that was never saved is found again instead of making a second event", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    const first = await runSync(google, { importCalendarId: IMPORT, importWritable: true, lockinCalendarId: LOCKIN, days: device.days(), exportDates: [FROM] });
    // The phone saved the day's rows but died before saving the links.
    device.apply(first.localOps.filter((o) => o.op === "materialize"));
    expect(device.rows.every((r) => r.calendar_event_id === null)).toBe(true);
    await settle(google, device, { exportDates: [FROM] });
    expect(google.live(LOCKIN)).toHaveLength(3);
    expect(device.rows.every((r) => r.calendar_event_id)).toBe(true);
    noDuplicates(google);
  });

  it("clears out a duplicate event if one ever exists", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device, { exportDates: [FROM] });
    const dinner = device.find("Delivery: dinner", FROM);
    const original = google.events.get(LOCKIN)!.get(dinner.calendar_event_id!)!;
    google.events.get(LOCKIN)!.set("copy", { ...structuredClone(original), id: "copy" });
    await settle(google, device, { exportDates: [FROM] });
    expect(google.live(LOCKIN).map((e) => e.id)).not.toContain("copy");
    expect(google.live(LOCKIN)).toHaveLength(3);
  });

  it("an event added by hand on the Lock In calendar becomes a block", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const id = google.userAdd(LOCKIN, "Call investor", FROM, "15:00", 30);
    await settle(google, device);
    const block = device.find("Call investor", FROM);
    expect([block.calendar_event_id, block.source, block.flexible, block.start]).toEqual([id, "manual", true, "15:00"]);
    expect(google.live(LOCKIN)).toHaveLength(7);
    expect(google.events.get(LOCKIN)!.get(id)!.extendedProperties?.private?.lockinBlock).toBe(block.id);
  });

  it("a class that moves or is cancelled in Google follows here", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    const econ = google.userAdd(IMPORT, "ECON 2101", FROM, "09:30", 75);
    const lab = google.userAdd(IMPORT, "Stats lab", FROM, "15:00", 60);
    await settle(google, device);
    google.userMove(IMPORT, econ, FROM, "11:00", 75);
    google.userDelete(IMPORT, lab);
    await settle(google, device);
    expect(device.find("ECON 2101", FROM).start).toBe("11:00");
    expect(device.rows.some((r) => r.block_name === "Stats lab")).toBe(false);
  });

  it("moving an imported block here updates Google when the calendar can be written", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    const econ = google.userAdd(IMPORT, "ECON 2101", FROM, "09:30", 75);
    await settle(google, device);
    const block = device.find("ECON 2101", FROM);
    device.edit(block.id, { start: "10:00", end: "11:15" });
    await sync(google, device, { edits: { [block.id]: google.tick(5) } });
    expect(google.events.get(IMPORT)!.get(econ)!.start?.dateTime).toBe("2026-10-05T10:00:00");
    expect(await settle(google, device)).toBe(1);
    // With the base stamped, the next local move needs no edit time at all.
    device.edit(block.id, { start: "10:30", end: "11:45" });
    await settle(google, device);
    expect(google.events.get(IMPORT)!.get(econ)!.start?.dateTime).toBe("2026-10-05T10:30:00");
  });

  it("on a read only calendar the block goes back to where Google has it", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    google.userAdd(IMPORT, "ECON 2101", FROM, "09:30", 75);
    await settle(google, device, { importWritable: false });
    const block = device.find("ECON 2101", FROM);
    device.edit(block.id, { start: "10:00", end: "11:15" });
    await sync(google, device, { importWritable: false, edits: { [block.id]: google.tick(5) } });
    expect(device.find("ECON 2101", FROM).start).toBe("09:30");
  });

  it("if Google refuses the write anyway, the block is put back", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    google.userAdd(IMPORT, "ECON 2101", FROM, "09:30", 75);
    await settle(google, device);
    google.readOnly.add(IMPORT);
    const block = device.find("ECON 2101", FROM);
    device.edit(block.id, { start: "10:00", end: "11:15" });
    const r = await sync(google, device, { edits: { [block.id]: google.tick(5) } });
    expect(r.errors).toEqual([]);
    expect(device.find("ECON 2101", FROM).start).toBe("09:30");
  });

  it("ignores all day events and events outside the range", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    google.events.get(IMPORT)!.set("allday", { id: "allday", status: "confirmed", summary: "Fall break", start: { date: FROM }, end: { date: addDays(FROM, 1) } });
    google.userAdd(IMPORT, "Next month", "2026-11-20", "10:00", 60);
    await settle(google, device);
    expect(device.rows.some((r) => r.source === "calendar")).toBe(false);
  });

  it("works with no import calendar chosen", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    google.userAdd(IMPORT, "ECON 2101", FROM, "09:30", 75);
    await settle(google, device, { importCalendarId: null });
    expect(device.rows.some((r) => r.source === "calendar")).toBe(false);
    expect(google.live(LOCKIN)).toHaveLength(6);
  });

  it("never reads the Lock In calendar as the import calendar", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device, { importCalendarId: LOCKIN });
    expect(device.rows.some((r) => r.source === "calendar")).toBe(false);
    expect(google.live(LOCKIN)).toHaveLength(6);
  });

  it("a failed read writes nothing on either side", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const rows = JSON.stringify(device.rows);
    google.events.delete(IMPORT);
    await expect(sync(google, device)).rejects.toThrow();
    expect(JSON.stringify(device.rows)).toBe(rows);
  });

  it("a failed write is reported and picked up on the next round", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    google.failInserts = 2;
    const first = await sync(google, device);
    expect(first.errors).toHaveLength(2);
    expect(google.live(LOCKIN)).toHaveLength(4);
    await settle(google, device);
    expect(google.live(LOCKIN)).toHaveLength(6);
    noDuplicates(google);
  });

  it("out of time: says so, and the next round finishes the job", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    const first = await sync(google, device, { budgetMs: -1 });
    expect(first.partial).toBe(true);
    expect(google.live(LOCKIN)).toHaveLength(0);
    await settle(google, device);
    expect(google.live(LOCKIN)).toHaveLength(6);
    noDuplicates(google);
  });

  it("a rename goes both ways too", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    await settle(google, device);
    const lift = device.find("Lift + core", FROM);
    device.edit(lift.id, { block_name: "Upper A" });
    await settle(google, device);
    expect(google.events.get(LOCKIN)!.get(lift.calendar_event_id!)!.summary).toBe("Upper A");
    google.userMove(LOCKIN, lift.calendar_event_id!, FROM, "06:30", 60, "Upper A + core");
    await settle(google, device);
    expect(device.rows.find((r) => r.id === lift.id)!.block_name).toBe("Upper A + core");
    expect(sigOfBlock(device.rows.find((r) => r.id === lift.id)!)).toBe("Upper A + core|2026-10-05|06:30|60");
  });

  it("a week of mixed changes on both sides still ends in agreement", async () => {
    const google = new FakeGoogle();
    const device = new Device();
    google.userAdd(IMPORT, "ECON 2101", FROM, "09:30", 75);
    google.userAdd(IMPORT, "ECON 2101", addDays(FROM, 2), "09:30", 75);
    await settle(google, device, { exportDates: dateRange(FROM, TO) });
    const dinner = device.find("Delivery: dinner", addDays(FROM, 1));
    device.edit(dinner.id, { start: "18:00", end: "22:00" });
    google.userAdd(LOCKIN, "Haircut", addDays(FROM, 5), "13:00", 45);
    google.userDelete(LOCKIN, device.find("Lift + core", addDays(FROM, 6)).calendar_event_id!);
    device.rows = device.rows.filter((r) => r.id !== device.find("Class", addDays(FROM, 4)).id);
    await settle(google, device, { exportDates: dateRange(FROM, TO) });

    // Every block that is not an import has exactly one live event that matches it.
    const live = google.live(LOCKIN);
    const own = device.rows.filter((r) => r.source !== "calendar");
    expect(live).toHaveLength(own.length);
    for (const b of own) {
      const e = live.find((x) => x.id === b.calendar_event_id);
      expect(e?.summary).toBe(b.block_name);
      expect(e?.start?.dateTime?.slice(0, 16)).toBe(`${b.date}T${b.start}`);
    }
    noDuplicates(google);
  });
});
