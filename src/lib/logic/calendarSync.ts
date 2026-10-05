// The two way sync decision. Pure: given the local days and the events on
// both Google calendars, return what to write on each side. Nothing here
// talks to Google or the database, so every rule is covered by fixtures.
//
// Two calendars are involved.
// - The import calendar (the one the user picks, usually their main one).
//   Its events come in as fixed blocks with source "calendar". Google decides
//   whether they exist: an event that is gone takes its block with it.
// - The "Lock In" calendar, which this app owns. Every block that has its own
//   row goes out to it. Lock In decides whether those exist: a block that is
//   gone takes its event with it. An event the user adds there by hand comes
//   back as a block.
//
// Which side wins a change is a three way compare. Each event carries the
// signature both sides agreed on last time (the base). Whichever side still
// matches the base did not change, so the other side wins. When both moved,
// or there is no base yet, the newer edit wins using the event's updated
// time against the time of the local edit, and Google wins a tie.
//
// Nothing is duplicated: a block is tied to its event by calendar_event_id,
// and the event names its block in a private property, so a link that was
// lost half way is found again instead of made twice.

import type { DayBlock } from "../blocks";
import type { DateStr, IsoStr, NewRow } from "../types";
import {
  fieldsOfBlock,
  patchFromEvent,
  rowFromEvent,
  sigOfBlock,
  sigOfEvent,
  type CalendarRole,
  type EventFields,
  type RemoteEvent,
} from "./calendar";
import { materializeDay, materializedId, overlapMinutes, sortBlocks } from "./schedule";

export interface SyncDay {
  date: DateStr;
  /** What the day shows now: its own rows, or blocks built from the template (persisted false). */
  blocks: DayBlock[];
}

export interface SyncInput {
  /** One entry per date in the sync range. Events outside these dates are ignored. */
  days: readonly SyncDay[];
  /** Events on the chosen calendar. Empty when none is chosen. */
  imported: readonly RemoteEvent[];
  /** Events on the Lock In calendar. */
  exported: readonly RemoteEvent[];
  /** Days whose blocks go out even if the day is still on the template. */
  exportDates: readonly DateStr[];
  /** Blocks edited on this device since the last sync, with when. */
  edits?: Readonly<Record<string, IsoStr>>;
  /** False when the chosen calendar cannot be written, so Google always wins there. */
  importWritable?: boolean;
}

type BlockRow = NewRow<"schedule_block">;

export type LocalOp =
  | { op: "materialize"; date: DateStr; rows: BlockRow[] }
  | { op: "create"; row: BlockRow }
  | { op: "update"; id: string; patch: Partial<BlockRow> }
  | { op: "delete"; id: string };

export type RemoteOp =
  | { op: "create"; calendar: "lockin"; blockId: string; event: EventFields; sig: string }
  | {
      op: "update";
      calendar: CalendarRole;
      eventId: string;
      /** Left out when only the signature is being stamped. */
      event?: EventFields;
      sig: string;
      blockId?: string;
      /** What to do locally if Google refuses the write. */
      revert?: { id: string; patch: Partial<BlockRow> };
    }
  | { op: "delete"; calendar: "lockin"; eventId: string };

export interface SyncPlan {
  local: LocalOp[];
  remote: RemoteOp[];
}

export type Winner = "none" | "local" | "remote";

export interface ResolveInput {
  local: string;
  remote: string;
  base: string | null;
  /** When the block was edited on this device, if it was. */
  editedAt?: IsoStr | null;
  /** When Google last changed the event. */
  remoteUpdated?: IsoStr | null;
  writable?: boolean;
}

/** Which side's version stands. */
export function resolveWinner(i: ResolveInput): Winner {
  if (i.local === i.remote) return "none";
  if (i.writable === false) return "remote";
  if (i.base !== null && i.base === i.remote) return "local";
  if (i.base !== null && i.base === i.local) return "remote";
  if (!i.editedAt) return "remote";
  if (!i.remoteUpdated) return "local";
  return Date.parse(i.editedAt) > Date.parse(i.remoteUpdated) ? "local" : "remote";
}

function usable(e: RemoteEvent, dates: ReadonlySet<DateStr>): boolean {
  return !e.cancelled && !e.allDay && e.date !== null && e.start !== null && dates.has(e.date);
}

export function planSync(input: SyncInput): SyncPlan {
  const local: LocalOp[] = [];
  const remote: RemoteOp[] = [];
  const edits = input.edits ?? {};
  const importWritable = input.importWritable !== false;

  // ---- a working copy of the days, which the plan changes as it goes ----
  const days = new Map<DateStr, { blocks: DayBlock[]; own: boolean }>();
  for (const d of input.days) {
    const blocks = sortBlocks(d.blocks);
    days.set(d.date, { blocks, own: blocks.length > 0 && blocks.every((b) => b.persisted) });
  }
  const dates = new Set(days.keys());

  /** Give the day its own rows, once, with the ids the Schedule screen would use. */
  const own = (date: DateStr): boolean => {
    const day = days.get(date);
    if (!day) return false;
    if (day.own) return true;
    if (day.blocks.length > 0) {
      const rows = materializeDay(date, day.blocks);
      local.push({ op: "materialize", date, rows });
      day.blocks = day.blocks.map((b) => ({
        ...b,
        id: b.template_id ? materializedId(date, b.template_id) : b.id,
        persisted: true,
      }));
    }
    day.own = true;
    return true;
  };

  const drop = (b: DayBlock) => {
    const day = days.get(b.date);
    if (day) day.blocks = day.blocks.filter((x) => x.id !== b.id);
    local.push({ op: "delete", id: b.id });
  };

  const relocate = (b: DayBlock, e: RemoteEvent): DayBlock => {
    const patch = patchFromEvent(e);
    const moved: DayBlock = { ...b, ...patch };
    if (patch.date !== b.date) {
      own(patch.date);
      const from = days.get(b.date);
      if (from) from.blocks = from.blocks.filter((x) => x.id !== b.id);
      days.get(patch.date)?.blocks.push(moved);
    } else {
      const day = days.get(b.date);
      if (day) day.blocks = day.blocks.map((x) => (x.id === b.id ? moved : x));
    }
    const changed: Partial<BlockRow> = {};
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
      if (b[k] !== patch[k]) (changed as Record<string, unknown>)[k] = patch[k];
    }
    local.push({ op: "update", id: b.id, patch: changed });
    return moved;
  };

  /** Settle one linked pair. */
  const settle = (b: DayBlock, e: RemoteEvent, role: CalendarRole, writable: boolean) => {
    const l = sigOfBlock(b);
    const r = sigOfEvent(e);
    const tag = role === "lockin" ? b.id : undefined;
    const untagged = role === "lockin" && e.blockId !== b.id;
    const winner = resolveWinner({
      local: l,
      remote: r,
      base: e.base,
      editedAt: edits[b.id] ?? null,
      remoteUpdated: e.updated,
      writable,
    });
    if (winner === "none") {
      if (writable && (e.base !== l || untagged)) remote.push({ op: "update", calendar: role, eventId: e.id, sig: l, blockId: tag });
      return;
    }
    if (winner === "local") {
      const patch = patchFromEvent(e);
      remote.push({
        op: "update",
        calendar: role,
        eventId: e.id,
        event: fieldsOfBlock(b),
        sig: l,
        blockId: tag,
        revert: role === "import" ? { id: b.id, patch } : undefined,
      });
      return;
    }
    relocate(b, e);
    if (writable && (e.base !== r || untagged)) remote.push({ op: "update", calendar: role, eventId: e.id, sig: r, blockId: tag });
  };

  // ---- days that go out get their own rows first ----
  for (const date of input.exportDates) own(date);

  const allBlocks = () => Array.from(days.values()).flatMap((d) => (d.own ? d.blocks : []));

  // ---- the import calendar: Google decides what exists ----
  const importLive = input.imported.filter((e) => usable(e, dates));
  const importIds = new Set(importLive.map((e) => e.id));
  const byEvent = new Map<string, DayBlock>();
  for (const b of allBlocks()) if (b.calendar_event_id) byEvent.set(b.calendar_event_id, b);

  for (const b of allBlocks()) {
    if (b.source === "calendar" && (!b.calendar_event_id || !importIds.has(b.calendar_event_id))) drop(b);
  }

  const sortedImport = importLive.slice().sort((a, b) => sigKey(a).localeCompare(sigKey(b)));
  for (const e of sortedImport) {
    const mine = byEvent.get(e.id);
    if (mine && mine.source === "calendar") {
      settle(mine, e, "import", importWritable);
      continue;
    }
    const date = e.date as DateStr;
    own(date);
    const day = days.get(date)!;
    const row = rowFromEvent(e, "import");
    // The template's guess at class gives way to the real class time.
    for (const b of day.blocks.slice()) {
      if (b.source === "template" && b.kind === "class" && overlapMinutes(b, { start: row.start, duration: row.duration }) > 0) drop(b);
    }
    local.push({ op: "create", row });
    day.blocks.push({ ...row, id: `event:${e.id}`, persisted: true } as DayBlock);
  }

  // ---- the Lock In calendar: Lock In decides what exists ----
  const liveById = new Map<string, RemoteEvent>();
  const cancelled = new Set<string>();
  for (const e of input.exported) {
    if (e.cancelled) cancelled.add(e.id);
    else if (usable(e, dates)) liveById.set(e.id, e);
  }
  const byBlock = new Map<string, RemoteEvent[]>();
  for (const e of liveById.values()) {
    if (!e.blockId) continue;
    const list = byBlock.get(e.blockId) ?? [];
    list.push(e);
    byBlock.set(e.blockId, list);
  }
  const claimed = new Set<string>();

  for (const b of allBlocks()) {
    if (b.source === "calendar" || b.id.startsWith("event:")) continue;
    let e = b.calendar_event_id ? liveById.get(b.calendar_event_id) : undefined;
    if (e && claimed.has(e.id)) e = undefined;
    if (!e && b.calendar_event_id && cancelled.has(b.calendar_event_id) && !edits[b.id]) {
      // Deleted in Google Calendar, so it goes here too.
      drop(b);
      continue;
    }
    if (!e) {
      // A link that never got saved: the event still names this block.
      e = (byBlock.get(b.id) ?? []).find((x) => !claimed.has(x.id));
      if (e) local.push({ op: "update", id: b.id, patch: { calendar_event_id: e.id } });
    }
    if (!e) {
      remote.push({ op: "create", calendar: "lockin", blockId: b.id, event: fieldsOfBlock(b), sig: sigOfBlock(b) });
      continue;
    }
    claimed.add(e.id);
    settle(b, e, "lockin", true);
  }

  for (const e of liveById.values()) {
    if (claimed.has(e.id)) continue;
    if (e.blockId) {
      // Its block is gone (deleted, or a second copy of one that is linked elsewhere).
      remote.push({ op: "delete", calendar: "lockin", eventId: e.id });
      continue;
    }
    // Added by hand in Google on the Lock In calendar: it becomes a block.
    const date = e.date as DateStr;
    own(date);
    const row = rowFromEvent(e, "lockin");
    local.push({ op: "create", row });
    days.get(date)!.blocks.push({ ...row, id: `event:${e.id}`, persisted: true } as DayBlock);
  }

  return { local: orderLocal(local), remote };
}

function sigKey(e: RemoteEvent): string {
  return `${e.date ?? ""} ${e.start ?? ""} ${e.id}`;
}

const LOCAL_ORDER: Record<LocalOp["op"], number> = { materialize: 0, create: 1, update: 2, delete: 3 };

/** Days get their rows before anything edits them. */
function orderLocal(ops: LocalOp[]): LocalOp[] {
  return ops
    .map((op, i) => ({ op, i }))
    .sort((a, b) => LOCAL_ORDER[a.op.op] - LOCAL_ORDER[b.op.op] || a.i - b.i)
    .map((x) => x.op);
}

/** After an event is made in Google, tie its block to it. */
export function linkOp(blockId: string, eventId: string): LocalOp {
  return { op: "update", id: blockId, patch: { calendar_event_id: eventId } };
}

export interface SyncStats {
  pulled: number;
  pushed: number;
  removed: number;
}

export function countPlan(plan: SyncPlan): SyncStats {
  return {
    pulled: plan.local.filter((o) => o.op === "create" || (o.op === "update" && !("calendar_event_id" in o.patch && Object.keys(o.patch).length === 1))).length,
    pushed: plan.remote.filter((o) => o.op === "create" || (o.op === "update" && o.event !== undefined)).length,
    removed: plan.local.filter((o) => o.op === "delete").length + plan.remote.filter((o) => o.op === "delete").length,
  };
}

/** True when a plan would change nothing a person can see. */
export function isQuiet(plan: SyncPlan): boolean {
  return plan.local.length === 0 && plan.remote.length === 0;
}
