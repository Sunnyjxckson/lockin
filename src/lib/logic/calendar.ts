// Calendar rules that need no network: turning Google events into blocks and
// back, the signature used to tell which side changed, and finding where a
// fixed calendar event collides with a Lock In block. Pure.

import type { DayBlock } from "../blocks";
import type { BlockKind, DateStr, IsoStr, NewRow, TimeStr } from "../types";
import { addDays, minutesOf, nyParts, timeFromMinutes, TIME_ZONE } from "./dates";
import { DAY_END, MIN_BLOCK, sortBlocks, spanOf } from "./schedule";

// ---------- conflicts ----------

export interface CalendarConflict {
  /** The fixed event: an imported calendar event or a class block. */
  event: DayBlock;
  /** The Lock In block that runs into it. */
  block: DayBlock;
  start: TimeStr;
  end: TimeStr;
  minutes: number;
}

/** A block that stands for a real commitment the schedule has to fit around. */
export function isCalendarAnchor(b: Pick<DayBlock, "source" | "kind">): boolean {
  return b.source === "calendar" || b.kind === "class";
}

/**
 * Overlaps between fixed calendar events (imported events, class) and the
 * other blocks of one day, for example a delivery block that runs into
 * class. Two calendar events on top of each other are not Lock In's problem
 * and are left out.
 */
export function findCalendarConflicts(blocks: readonly DayBlock[]): CalendarConflict[] {
  const sorted = sortBlocks(blocks);
  const anchors = sorted.filter(isCalendarAnchor);
  const rest = sorted.filter((b) => !isCalendarAnchor(b));
  const out: CalendarConflict[] = [];
  for (const event of anchors) {
    const x = spanOf(event);
    for (const block of rest) {
      const y = spanOf(block);
      const s = Math.max(x.s, y.s);
      const e = Math.min(x.e, y.e);
      if (e - s < 1) continue;
      out.push({ event, block, start: timeFromMinutes(s), end: timeFromMinutes(e), minutes: e - s });
    }
  }
  return out.sort((a, b) => minutesOf(a.start) - minutesOf(b.start) || minutesOf(a.end) - minutesOf(b.end));
}

/** "Delivery overlaps Class" */
export function describeConflict(c: CalendarConflict): string {
  return `${c.block.block_name} overlaps ${c.event.block_name}`;
}

// ---------- events ----------

export type CalendarRole = "import" | "lockin";

/** A Google event reduced to what sync needs. */
export interface RemoteEvent {
  id: string;
  calendar: CalendarRole;
  cancelled: boolean;
  title: string;
  /** New York date and time of the start. Null for all day events. */
  date: DateStr | null;
  start: TimeStr | null;
  /** Minutes, cut at midnight. */
  duration: number;
  allDay: boolean;
  /** When Google last saw a change. */
  updated: IsoStr | null;
  /** The block this event was made from (extendedProperties.private.lockinBlock). */
  blockId: string | null;
  /** Signature both sides agreed on at the last sync (private.lockinSig). */
  base: string | null;
}

/** The parts of the Google event resource this app reads. */
export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export const PROP_BLOCK = "lockinBlock";
export const PROP_SIG = "lockinSig";

export function eventFromGoogle(raw: GoogleEvent, calendar: CalendarRole): RemoteEvent {
  const priv = raw.extendedProperties?.private ?? {};
  const base: RemoteEvent = {
    id: raw.id,
    calendar,
    cancelled: raw.status === "cancelled",
    title: (raw.summary ?? "").trim() || "Busy",
    date: null,
    start: null,
    duration: 0,
    allDay: false,
    updated: raw.updated ?? null,
    blockId: priv[PROP_BLOCK] ?? null,
    base: priv[PROP_SIG] ?? null,
  };
  if (raw.start?.date && !raw.start.dateTime) return { ...base, allDay: true };
  const startAt = raw.start?.dateTime ? new Date(raw.start.dateTime) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) return base;
  const p = nyParts(startAt);
  const endAt = raw.end?.dateTime ? new Date(raw.end.dateTime) : null;
  const length = endAt && !Number.isNaN(endAt.getTime()) ? Math.round((endAt.getTime() - startAt.getTime()) / 60_000) : 60;
  const duration = Math.max(MIN_BLOCK, Math.min(length, DAY_END - p.minutes));
  return { ...base, date: p.date, start: p.time, duration };
}

export interface EventFields {
  title: string;
  date: DateStr;
  start: TimeStr;
  duration: number;
  note?: string | null;
}

export function fieldsOfBlock(b: Pick<DayBlock, "block_name" | "date" | "start" | "duration" | "note">): EventFields {
  return { title: b.block_name, date: b.date, start: b.start, duration: b.duration, note: b.note };
}

/** Wall clock date-times for Google, sent with the New York zone so no offset maths is needed. */
export function eventTimes(f: Pick<EventFields, "date" | "start" | "duration">): {
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
} {
  const s = minutesOf(f.start);
  const e = s + Math.max(MIN_BLOCK, f.duration);
  const endDate = e >= DAY_END ? addDays(f.date, 1) : f.date;
  return {
    start: { dateTime: `${f.date}T${f.start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${endDate}T${timeFromMinutes(e)}:00`, timeZone: TIME_ZONE },
  };
}

/** The request body for creating or changing an event. Leave `fields` out to only stamp the signature. */
export function eventBody(fields: EventFields | undefined, sig: string, blockId?: string | null): Record<string, unknown> {
  const priv: Record<string, string> = { [PROP_SIG]: sig };
  if (blockId) priv[PROP_BLOCK] = blockId;
  const body: Record<string, unknown> = { extendedProperties: { private: priv } };
  if (fields) {
    body.summary = fields.title;
    Object.assign(body, eventTimes(fields));
    if (fields.note) body.description = fields.note;
  }
  return body;
}

// ---------- signatures ----------

/** What sync compares: name, day, start and length. */
export function signature(f: { title: string; date: DateStr; start: TimeStr; duration: number }): string {
  return `${f.title.trim()}|${f.date}|${f.start}|${f.duration}`;
}

export function sigOfBlock(b: Pick<DayBlock, "block_name" | "date" | "start" | "duration">): string {
  return signature({ title: b.block_name, date: b.date, start: b.start, duration: b.duration });
}

export function sigOfEvent(e: RemoteEvent): string {
  return signature({ title: e.title, date: e.date ?? "", start: e.start ?? "00:00", duration: e.duration });
}

// ---------- imported events as blocks ----------

const CLASS_WORDS = /\b(class|lecture|lab|seminar|recitation|exam|midterm|final|quiz|office hours)\b/i;
const COURSE_CODE = /\b[A-Z]{2,4}[ -]?\d{3,4}[A-Z]?\b/;

/** Class for anything that reads like school, other for the rest. */
export function kindForTitle(title: string): BlockKind {
  return CLASS_WORDS.test(title) || COURSE_CODE.test(title) ? "class" : "other";
}

/** An imported event as a fixed block row. */
export function rowFromEvent(e: RemoteEvent, role: CalendarRole = e.calendar): NewRow<"schedule_block"> {
  const date = e.date ?? "";
  const start = e.start ?? "00:00";
  const s = minutesOf(start);
  const imported = role === "import";
  return {
    date,
    block_name: e.title,
    start,
    end: timeFromMinutes(s + e.duration),
    duration: e.duration,
    flexible: !imported,
    kind: imported ? kindForTitle(e.title) : "other",
    note: null,
    calendar_event_id: e.id,
    template_id: null,
    source: imported ? "calendar" : "manual",
  };
}

/** The patch that puts a block where its event is. */
export function patchFromEvent(e: RemoteEvent): Pick<NewRow<"schedule_block">, "block_name" | "date" | "start" | "end" | "duration"> {
  const start = e.start ?? "00:00";
  return {
    block_name: e.title,
    date: e.date ?? "",
    start,
    end: timeFromMinutes(minutesOf(start) + e.duration),
    duration: e.duration,
  };
}
