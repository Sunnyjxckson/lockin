// Rules for the Schedule screen. Pure: no db, no React, no clock reads.
//
// A day is a list of blocks. Every function here takes a list and returns a
// new one, so the screen can preview a change (a drag, a shift) and only
// write it once the user lets go.
//
// Times inside this file are minutes since midnight. A block never crosses
// midnight: the day ends at 1440, which is stored as "00:00" with the length
// in `duration`, the same way the foundation reads it.

import type { DayBlock } from "../blocks";
import type { BlockKind, DateStr, NewRow, TimeStr } from "../types";
import { minutesOf, timeFromMinutes } from "./dates";

export const DAY_END = 1440;
/** Shortest block the editor allows. */
export const MIN_BLOCK = 5;
/** A shifted block is squeezed in front of a fixed one only if this much is left. */
export const MIN_COMPRESSED = 15;
export const SNAP_STEPS = [5, 15] as const;

export interface Span {
  s: number;
  e: number;
}

type Timed = Pick<DayBlock, "start" | "duration">;

// ---------- spans and snapping ----------

export function spanOf(b: Timed): Span {
  const s = minutesOf(b.start);
  return { s, e: Math.min(DAY_END, s + Math.max(0, b.duration)) };
}

/** Put a block on new minutes. Clamped to the day, never shorter than MIN_BLOCK. */
export function withSpan<T extends DayBlock>(b: T, s: number, e: number): T {
  let start = Math.max(0, Math.min(DAY_END - MIN_BLOCK, Math.round(s)));
  let end = Math.max(start + MIN_BLOCK, Math.min(DAY_END, Math.round(e)));
  if (end > DAY_END) {
    end = DAY_END;
    start = Math.min(start, end - MIN_BLOCK);
  }
  return { ...b, start: timeFromMinutes(start), end: timeFromMinutes(end), duration: end - start };
}

/** Nearest multiple of `step`. */
export function snap(minutes: number, step = 5): number {
  return Math.round(minutes / step) * step;
}

/** Next multiple of `step` at or after `minutes`. */
export function snapUp(minutes: number, step = 5): number {
  return Math.ceil(minutes / step) * step;
}

export function snapTime(time: TimeStr, step = 5): TimeStr {
  return timeFromMinutes(Math.min(DAY_END - step, snap(minutesOf(time), step)));
}

function order<T extends DayBlock>(blocks: readonly T[]): T[] {
  return blocks.slice().sort((a, b) => {
    const x = spanOf(a);
    const y = spanOf(b);
    return x.s - y.s || x.e - y.e || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

export function sortBlocks<T extends DayBlock>(blocks: readonly T[]): T[] {
  return order(blocks);
}

// ---------- overlaps ----------

export function overlapMinutes(a: Timed, b: Timed): number {
  const x = spanOf(a);
  const y = spanOf(b);
  return Math.max(0, Math.min(x.e, y.e) - Math.max(x.s, y.s));
}

export interface Overlap {
  a: DayBlock;
  b: DayBlock;
  start: TimeStr;
  end: TimeStr;
  minutes: number;
  /** True when a block that cannot move is involved. */
  fixed: boolean;
}

/** Every pair of blocks that share at least a minute, earliest first. */
export function findOverlaps(blocks: readonly DayBlock[]): Overlap[] {
  const sorted = order(blocks);
  const out: Overlap[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const x = spanOf(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      const y = spanOf(sorted[j]);
      if (y.s >= x.e) break;
      const s = Math.max(x.s, y.s);
      const e = Math.min(x.e, y.e);
      if (e - s < 1) continue;
      out.push({
        a: sorted[i],
        b: sorted[j],
        start: timeFromMinutes(s),
        end: timeFromMinutes(e),
        minutes: e - s,
        fixed: !sorted[i].flexible || !sorted[j].flexible,
      });
    }
  }
  return out;
}

/** Ids of blocks that overlap something. */
export function overlappingIds(blocks: readonly DayBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const o of findOverlaps(blocks)) {
    ids.add(o.a.id);
    ids.add(o.b.id);
  }
  return ids;
}

// ---------- next open slot ----------

export interface Slot {
  start: TimeStr;
  end: TimeStr;
  startMin: number;
  endMin: number;
}

export interface SlotOptions {
  /** Start times land on this grid. Default 5. */
  step?: number;
  /** Nothing is placed past this minute. Default the end of the day. */
  dayEnd?: number;
}

/**
 * The first gap of `duration` minutes that starts at or after `from` and
 * touches no block. Null when the rest of the day has no such gap.
 */
export function nextOpenSlot(blocks: readonly Timed[], duration: number, from: number, options: SlotOptions = {}): Slot | null {
  const step = options.step ?? 5;
  const dayEnd = options.dayEnd ?? DAY_END;
  const len = Math.max(MIN_BLOCK, Math.round(duration));
  const busy = blocks.map(spanOf).sort((a, b) => a.s - b.s);
  let start = snapUp(Math.max(0, from), step);
  for (let guard = 0; guard <= busy.length; guard++) {
    const hit = busy.find((x) => x.s < start + len && x.e > start);
    if (!hit) break;
    start = snapUp(hit.e, step);
  }
  if (start + len > dayEnd) return null;
  if (busy.some((x) => x.s < start + len && x.e > start)) return null;
  return { start: timeFromMinutes(start), end: timeFromMinutes(start + len), startMin: start, endMin: start + len };
}

// ---------- shifting flexible blocks ----------

export interface ShiftChange {
  id: string;
  name: string;
  from: { start: TimeStr; end: TimeStr };
  to: { start: TimeStr; end: TimeStr };
  /** Minutes cut off to fit in front of a fixed block. 0 when only moved. */
  cut: number;
}

export interface ShiftConflict {
  /** The block that runs into the fixed one. */
  id: string;
  /** The fixed block that did not move. */
  withId: string;
  minutes: number;
}

export interface ShiftResult<T extends DayBlock = DayBlock> {
  blocks: T[];
  moved: ShiftChange[];
  conflicts: ShiftConflict[];
}

/**
 * Push the flexible blocks that `anchorId` now runs into.
 *
 * Walks the blocks that start at or after `from` in time order. A flexible
 * block the anchor (or an already pushed block) overlaps moves to start
 * where that one ends, keeping its length. Gaps soak the delay up, so the
 * ripple stops at the first block that is not overlapped.
 *
 * Fixed blocks never move. When a pushed block would run into one it is cut
 * short to end where the fixed block starts, as long as MIN_COMPRESSED
 * minutes are left. Otherwise it keeps its length and the overlap is
 * returned in `conflicts`, never hidden.
 */
export function shiftAfter<T extends DayBlock>(blocks: readonly T[], anchorId: string, from?: number): ShiftResult<T> {
  const anchor = blocks.find((b) => b.id === anchorId);
  if (!anchor) return { blocks: order(blocks), moved: [], conflicts: [] };
  const a = spanOf(anchor);
  const floor = from ?? a.s;
  const rest = order(blocks.filter((b) => b.id !== anchorId));
  const next = new Map<string, T>();
  const moved: ShiftChange[] = [];
  const conflicts: ShiftConflict[] = [];

  let cursor = a.e;
  let pusher: DayBlock = anchor;
  for (let i = 0; i < rest.length; i++) {
    const b = rest[i];
    const x = spanOf(b);
    if (x.s < floor) continue;
    if (x.s >= cursor) break;
    if (!b.flexible) {
      // Whatever reached this far is sitting on a fixed block.
      const p = next.get(pusher.id) ?? pusher;
      const minutes = Math.min(cursor, x.e) - x.s;
      if (minutes > 0 && !conflicts.some((c) => c.id === p.id && c.withId === b.id)) {
        conflicts.push({ id: p.id, withId: b.id, minutes });
      }
      cursor = Math.max(cursor, x.e);
      continue;
    }
    const len = x.e - x.s;
    const wall = rest.slice(i + 1).find((f) => !f.flexible && spanOf(f).e > cursor);
    const wallStart = wall ? Math.max(cursor, spanOf(wall).s) : DAY_END;
    let end = cursor + len;
    let cut = 0;
    if (end > wallStart && wallStart - cursor >= Math.min(MIN_COMPRESSED, len)) {
      cut = end - wallStart;
      end = wallStart;
    }
    const placed = withSpan(b, cursor, end);
    next.set(b.id, placed);
    moved.push({
      id: b.id,
      name: b.block_name,
      from: { start: b.start, end: b.end },
      to: { start: placed.start, end: placed.end },
      cut,
    });
    cursor = spanOf(placed).e;
    pusher = placed;
  }

  return { blocks: order(blocks.map((b) => next.get(b.id) ?? b)), moved, conflicts };
}

// ---------- edits ----------

/** Move a block to a new start, keeping its length. Nothing else moves. */
export function moveBlock<T extends DayBlock>(blocks: readonly T[], id: string, startMin: number): T[] {
  return order(
    blocks.map((b) => {
      if (b.id !== id) return b;
      const len = spanOf(b).e - spanOf(b).s;
      const s = Math.max(0, Math.min(DAY_END - len, startMin));
      return withSpan(b, s, s + len);
    }),
  );
}

/**
 * Change where a block ends. Making it longer shifts the flexible blocks it
 * runs into. Making it shorter leaves the rest alone.
 */
export function resizeBlock<T extends DayBlock>(blocks: readonly T[], id: string, endMin: number): ShiftResult<T> {
  const target = blocks.find((b) => b.id === id);
  if (!target) return { blocks: order(blocks), moved: [], conflicts: [] };
  const old = spanOf(target);
  const end = Math.max(old.s + MIN_BLOCK, Math.min(DAY_END, endMin));
  const resized = blocks.map((b) => (b.id === id ? withSpan(b, old.s, end) : b));
  if (end <= old.e) return { blocks: order(resized), moved: [], conflicts: [] };
  return shiftAfter(resized, id, old.e);
}

/**
 * "Still going": the block runs to at least `extra` minutes past now (or
 * past its own end when that is later), and what follows shifts.
 */
export function stillGoing<T extends DayBlock>(blocks: readonly T[], id: string, nowMin: number, extra = 15, step = 5): ShiftResult<T> {
  const target = blocks.find((b) => b.id === id);
  if (!target) return { blocks: order(blocks), moved: [], conflicts: [] };
  const end = snapUp(Math.max(spanOf(target).e, nowMin), step) + extra;
  return resizeBlock(blocks, id, end);
}

export interface BlockPatch {
  block_name?: string;
  start?: TimeStr;
  end?: TimeStr;
  flexible?: boolean;
  kind?: BlockKind;
  note?: string | null;
}

/**
 * Apply a typed edit. An end at or before the start is read as running to
 * the end of the day. If the block now ends later than before, the flexible
 * blocks behind it shift.
 */
export function updateBlock<T extends DayBlock>(blocks: readonly T[], id: string, patch: BlockPatch): ShiftResult<T> {
  const target = blocks.find((b) => b.id === id);
  if (!target) return { blocks: order(blocks), moved: [], conflicts: [] };
  const old = spanOf(target);
  const s = patch.start !== undefined ? minutesOf(patch.start) : old.s;
  let e = patch.end !== undefined ? minutesOf(patch.end) : patch.start !== undefined ? s + (old.e - old.s) : old.e;
  if (e <= s) e = DAY_END;
  const edited = blocks.map((b) => {
    if (b.id !== id) return b;
    const named: T = {
      ...b,
      block_name: patch.block_name !== undefined ? patch.block_name.trim() || b.block_name : b.block_name,
      flexible: patch.flexible ?? b.flexible,
      kind: patch.kind ?? b.kind,
      note: patch.note !== undefined ? patch.note : b.note,
    };
    return withSpan(named, s, e);
  });
  const now = spanOf(edited.find((b) => b.id === id)!);
  if (now.e > old.e && now.s <= old.e) return shiftAfter(edited, id, Math.max(old.e, now.s));
  return { blocks: order(edited), moved: [], conflicts: [] };
}

export interface NewBlockInput {
  id: string;
  date: DateStr;
  name: string;
  startMin: number;
  duration: number;
  flexible?: boolean;
  kind?: BlockKind;
  note?: string | null;
}

export function makeBlock(input: NewBlockInput): DayBlock {
  const s = Math.max(0, Math.min(DAY_END - MIN_BLOCK, input.startMin));
  const e = Math.min(DAY_END, s + Math.max(MIN_BLOCK, input.duration));
  return {
    id: input.id,
    date: input.date,
    block_name: input.name.trim() || "Block",
    start: timeFromMinutes(s),
    end: timeFromMinutes(e),
    duration: e - s,
    flexible: input.flexible ?? true,
    kind: input.kind ?? "other",
    note: input.note ?? null,
    calendar_event_id: null,
    template_id: null,
    source: "manual",
    persisted: false,
  };
}

export function addBlock<T extends DayBlock>(blocks: readonly T[], block: T): T[] {
  return order([...blocks, block]);
}

export function removeBlock<T extends DayBlock>(blocks: readonly T[], id: string): T[] {
  return order(blocks.filter((b) => b.id !== id));
}

// ---------- the 9:00 clock-in errand ----------

export const ERRAND_NAME = "Clock-in errand";
export const ERRAND_START: TimeStr = "09:00";
export const ERRAND_MINUTES = 60;

export function findErrand<T extends DayBlock>(blocks: readonly T[]): T | null {
  return blocks.find((b) => b.kind === "errand") ?? null;
}

export interface ErrandInput {
  id: string;
  date: DateStr;
  start?: TimeStr;
  duration?: number;
  name?: string;
}

/**
 * Put the errand in as a fixed block and make room for it.
 *
 * A flexible block that is under way when the errand starts is cut to end at
 * the errand (or pushed behind it when under MIN_COMPRESSED would be left).
 * Flexible blocks that start inside the errand shift behind it and the
 * shift ripples on. Fixed blocks stay, and any that the errand lands on come
 * back in `conflicts`.
 */
export function insertErrand(blocks: readonly DayBlock[], input: ErrandInput): ShiftResult {
  if (findErrand(blocks)) return { blocks: order(blocks), moved: [], conflicts: [] };
  const errand: DayBlock = {
    ...makeBlock({
      id: input.id,
      date: input.date,
      name: input.name ?? ERRAND_NAME,
      startMin: minutesOf(input.start ?? ERRAND_START),
      duration: input.duration ?? ERRAND_MINUTES,
      flexible: false,
      kind: "errand",
    }),
  };
  const e = spanOf(errand);
  const pre: ShiftChange[] = [];
  const conflicts: ShiftConflict[] = [];
  const staged = blocks.map((b) => {
    const x = spanOf(b);
    const straddles = x.s < e.s && x.e > e.s;
    if (!straddles) return b;
    if (!b.flexible) return b;
    if (e.s - x.s >= MIN_COMPRESSED) {
      const cutBlock = withSpan(b, x.s, e.s);
      pre.push({
        id: b.id,
        name: b.block_name,
        from: { start: b.start, end: b.end },
        to: { start: cutBlock.start, end: cutBlock.end },
        cut: x.e - e.s,
      });
      return cutBlock;
    }
    // Too little would be left in front: line it up to be pushed behind.
    return withSpan(b, e.s, e.s + (x.e - x.s));
  });
  for (const b of blocks) {
    const x = spanOf(b);
    if (!b.flexible && x.s < e.s && x.e > e.s) {
      conflicts.push({ id: errand.id, withId: b.id, minutes: Math.min(x.e, e.e) - e.s });
    }
  }
  const shifted = shiftAfter([...staged, errand], errand.id, e.s);
  // Report moves against where each block really started from.
  const original = new Map(blocks.map((b) => [b.id, b]));
  const moved = [...pre, ...shifted.moved].map((m) => {
    const o = original.get(m.id);
    return o ? { ...m, from: { start: o.start, end: o.end } } : m;
  });
  const byId = new Map<string, ShiftChange>();
  for (const m of moved) {
    const prev = byId.get(m.id);
    byId.set(m.id, prev ? { ...m, cut: prev.cut + m.cut } : m);
  }
  return { blocks: shifted.blocks, moved: Array.from(byId.values()), conflicts: [...conflicts, ...shifted.conflicts] };
}

/**
 * Take the errand out. Flexible blocks that came from the template and
 * belong to the morning (template start before `until`) go back to their
 * template times, which undoes the shift. Hand edits to other blocks stay.
 */
export function removeErrand(
  blocks: readonly DayBlock[],
  template: readonly { id: string; start: TimeStr; end: TimeStr }[],
  until: TimeStr = "12:00",
): DayBlock[] {
  const errand = findErrand(blocks);
  if (!errand) return order(blocks);
  const limit = minutesOf(until);
  const byId = new Map(template.map((t) => [t.id, t]));
  return order(
    blocks
      .filter((b) => b.kind !== "errand")
      .map((b) => {
        const t = b.template_id ? byId.get(b.template_id) : undefined;
        if (!t || !b.flexible || minutesOf(t.start) >= limit) return b;
        const s = minutesOf(t.start);
        let e = minutesOf(t.end);
        if (e <= s) e = DAY_END;
        return withSpan(b, s, e);
      }),
  );
}

// ---------- template to day ----------

/** Row id for a template block copied into a day. Stable, so a retry cannot double it. */
export function materializedId(date: DateStr, templateId: string): string {
  return `${date}.${templateId}`;
}

/** A DayBlock as a schedule_block row. Template blocks get their stable id, new ones none. */
export function toRow(date: DateStr, b: DayBlock): NewRow<"schedule_block"> {
  const row: NewRow<"schedule_block"> = {
    date,
    block_name: b.block_name,
    start: b.start,
    end: b.end,
    duration: b.duration,
    flexible: b.flexible,
    kind: b.kind,
    note: b.note,
    calendar_event_id: b.calendar_event_id,
    template_id: b.template_id,
    source: b.source,
  };
  if (b.persisted) row.id = b.id;
  else if (b.id.startsWith("template:") && b.template_id) row.id = materializedId(date, b.template_id);
  return row;
}

/**
 * Copy a day built from the template into rows for that date only. The
 * template itself is never touched. Each row keeps `template_id` and
 * `source: "template"` so it is clear where it came from.
 */
export function materializeDay(date: DateStr, blocks: readonly DayBlock[]): NewRow<"schedule_block">[] {
  return order(blocks).map((b) => toRow(date, b));
}

/** True when the day already has its own rows. */
export function isMaterialized(blocks: readonly DayBlock[]): boolean {
  return blocks.length > 0 && blocks.every((b) => b.persisted);
}

export interface DayWrite {
  insert: NewRow<"schedule_block">[];
  update: { id: string; patch: Partial<NewRow<"schedule_block">> }[];
  remove: string[];
}

const FIELDS = ["block_name", "start", "end", "duration", "flexible", "kind", "note", "calendar_event_id", "template_id", "source"] as const;

/**
 * The writes that turn `before` (what the day shows now) into `after`.
 * The first edit to a template day inserts every block, which is what makes
 * the day its own. Later edits touch only the rows that changed.
 */
export function planDayWrite(date: DateStr, before: readonly DayBlock[], after: readonly DayBlock[]): DayWrite {
  if (!isMaterialized(before)) {
    return { insert: materializeDay(date, after), update: [], remove: [] };
  }
  const old = new Map(before.map((b) => [b.id, b]));
  const kept = new Set<string>();
  const write: DayWrite = { insert: [], update: [], remove: [] };
  for (const b of order(after)) {
    const prev = old.get(b.id);
    if (!prev) {
      write.insert.push(toRow(date, { ...b, persisted: false }));
      continue;
    }
    kept.add(b.id);
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) if (prev[f] !== b[f]) patch[f] = b[f];
    if (Object.keys(patch).length > 0) write.update.push({ id: b.id, patch: patch as Partial<NewRow<"schedule_block">> });
  }
  for (const b of before) if (!kept.has(b.id)) write.remove.push(b.id);
  return write;
}

// ---------- drawing ----------

export interface Lane {
  lane: number;
  lanes: number;
}

/**
 * Side by side columns for blocks that overlap, so none hides another.
 * Blocks that touch no other get the full width (lane 0 of 1).
 */
export function layoutLanes(blocks: readonly DayBlock[]): Map<string, Lane> {
  const sorted = order(blocks);
  const out = new Map<string, Lane>();
  let cluster: { id: string; lane: number }[] = [];
  let ends: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: ends.length });
    cluster = [];
    ends = [];
  };
  for (const b of sorted) {
    const x = spanOf(b);
    if (cluster.length > 0 && x.s >= clusterEnd) flush();
    let lane = ends.findIndex((e) => e <= x.s);
    if (lane === -1) {
      lane = ends.length;
      ends.push(x.e);
    } else {
      ends[lane] = x.e;
    }
    cluster.push({ id: b.id, lane });
    clusterEnd = Math.max(clusterEnd, x.e);
  }
  flush();
  return out;
}

/** First and last minute the timeline should draw, on whole hours. */
export function timelineRange(blocks: readonly Timed[], defaultStart = 5 * 60, defaultEnd = DAY_END): Span {
  let s = defaultStart;
  let e = defaultEnd;
  for (const b of blocks) {
    const x = spanOf(b);
    s = Math.min(s, x.s);
    e = Math.max(e, x.e);
  }
  return { s: Math.floor(s / 60) * 60, e: Math.min(DAY_END, Math.ceil(e / 60) * 60) };
}

// ---------- free time timer ----------

export type TimerPhase = "before" | "live" | "over";

export interface TimerState {
  phase: TimerPhase;
  /** Seconds left while live, 0 otherwise. */
  remaining: number;
  /** Seconds past the end once over, 0 otherwise. */
  overBy: number;
  /** 0 to 1 through the block. */
  progress: number;
}

/** Where the clock is against a block. `nowSeconds` is seconds since midnight. */
export function timerState(block: Timed, nowSeconds: number): TimerState {
  const x = spanOf(block);
  const s = x.s * 60;
  const e = x.e * 60;
  if (nowSeconds < s) return { phase: "before", remaining: 0, overBy: 0, progress: 0 };
  if (nowSeconds < e) {
    return { phase: "live", remaining: Math.ceil(e - nowSeconds), overBy: 0, progress: (nowSeconds - s) / Math.max(1, e - s) };
  }
  return { phase: "over", remaining: 0, overBy: Math.floor(nowSeconds - e), progress: 1 };
}

/** "1:05:09" or "12:34". */
export function formatCountdown(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** How long a free block keeps its "time is up" alert after it ends. */
export const ALERT_WINDOW_SECONDS = 30 * 60;

/**
 * The free time block that needs attention right now: one that is live, or
 * one that ended within the alert window and has not been cleared.
 */
export function freeTimeFocus<T extends DayBlock>(
  blocks: readonly T[],
  nowSeconds: number,
  cleared: ReadonlySet<string> = new Set(),
): { block: T; timer: TimerState } | null {
  const free = order(blocks.filter((b) => b.kind === "free"));
  for (const b of free) {
    const timer = timerState(b, nowSeconds);
    if (timer.phase === "live") return { block: b, timer };
  }
  for (const b of free.reverse()) {
    const timer = timerState(b, nowSeconds);
    if (timer.phase === "over" && timer.overBy <= ALERT_WINDOW_SECONDS && !cleared.has(b.id)) return { block: b, timer };
  }
  return null;
}

/** Presets on the add sheet. Free time is planned like everything else. */
export const FREE_PRESETS: readonly { name: string; minutes: number }[] = [
  { name: "TV", minutes: 60 },
  { name: "Games", minutes: 60 },
  { name: "Scrolling", minutes: 30 },
];

export const LENGTH_CHOICES: readonly number[] = [15, 30, 45, 60, 90, 120];
