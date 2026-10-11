"use client";

// What you have done with the quotes: read, saved, your note. The whole
// `quote_state` table is read once into a map and kept in memory; screens read
// the map, never the db, so a card costs nothing to draw. A write updates the
// map first and the screen follows at once, then goes to the db in order. Rows
// written elsewhere (another tab, another device) are picked up when the table
// changes and nothing of ours is in flight.

import { useEffect, useSyncExternalStore } from "react";
import { db, subscribe } from "@/lib/db";
import { isMissingSchema } from "@/lib/db/soft";
import { updateSettings } from "@/lib/db/helpers";
import { nowIso, nyParts } from "@/lib/logic/dates";
import type { Marks, QuoteMark } from "@/lib/logic/library";
import type { IsoStr, LibraryPosition } from "@/lib/types";

/** Why the table could not be read: "setup" is the migration not run yet, "failed" is anything else. */
export type MarksProblem = "setup" | "failed";

export interface MarksSnapshot {
  marks: Marks;
  /** False until the table has been read once. */
  ready: boolean;
  /** Set when the table could not be read. Nothing is counted or saved until it can. */
  problem: MarksProblem | null;
}

const EMPTY: MarksSnapshot = { marks: new Map(), ready: false, problem: null };
let snap: MarksSnapshot = EMPTY;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
let watching = false;
/** Writes of ours not yet saved. The table's change notice for them is not news. */
let inFlight = 0;
let chain: Promise<void> = Promise.resolve();

function publish(next: MarksSnapshot): void {
  snap = next;
  for (const l of Array.from(listeners)) l();
}

async function readAll(): Promise<void> {
  const rows = await db.list("quote_state");
  const map = new Map<string, QuoteMark>();
  for (const r of rows) map.set(r.quote_id, { quote_id: r.quote_id, writer: r.writer, work: r.work, read_at: r.read_at, saved_at: r.saved_at, note: r.note });
  publish({ marks: map, ready: true, problem: null });
}

/** Read the table, and when that fails say why in the snapshot so a screen can show one plain line. */
async function readOrReport(): Promise<void> {
  try {
    await readAll();
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    publish({ marks: snap.marks, ready: false, problem: isMissingSchema(message) ? "setup" : "failed" });
    throw e;
  }
}

/** Read the table once. Safe to call from anywhere, any number of times. */
export function ensureMarks(): Promise<MarksSnapshot> {
  if (!loading) {
    loading = readOrReport().then(
      () => {
        if (!watching) {
          watching = true;
          subscribe("quote_state", () => {
            if (inFlight === 0) void readAll().catch(() => undefined);
          });
        }
      },
      (e: unknown) => {
        loading = null;
        throw e;
      },
    );
  }
  return loading.then(() => snap);
}

/** Forget what was read, so the next read starts from the table. For tests. */
export function resetMarks(): void {
  loading = null;
  chain = Promise.resolve();
  inFlight = 0;
  publish(EMPTY);
}

/** The marks as they are now. Empty until ensureMarks has finished. */
export function currentMarks(): Marks {
  return snap.marks;
}

function getSnapshot(): MarksSnapshot {
  return snap;
}

export function subscribeMarks(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The marks, live. Reads the table the first time any screen asks. `retry` reads it again after a failure. */
export function useMarks(): MarksSnapshot & { retry: () => void } {
  const value = useSyncExternalStore(subscribeMarks, getSnapshot, () => EMPTY);
  useEffect(() => {
    void ensureMarks().catch(() => undefined);
  }, []);
  return { ...value, retry: retryMarks };
}

/** Try the table again, for the Try again button. */
export function retryMarks(): void {
  loading = null;
  publish({ marks: snap.marks, ready: false, problem: null });
  void ensureMarks().catch(() => undefined);
}

// ---------- writes ----------

export interface QuoteRef {
  id: string;
  writer: string;
  work: string;
}

type Patch = Partial<Pick<QuoteMark, "read_at" | "saved_at" | "note">>;

function apply(ref: QuoteRef, patch: Patch): QuoteMark {
  const was = snap.marks.get(ref.id) ?? { quote_id: ref.id, writer: ref.writer, work: ref.work, read_at: null, saved_at: null, note: null };
  const next: QuoteMark = { ...was, ...patch };
  const marks = new Map(snap.marks);
  marks.set(ref.id, next);
  publish({ marks, ready: snap.ready, problem: snap.problem });
  inFlight += 1;
  chain = chain
    .then(async () => {
      const m = snap.marks.get(ref.id) ?? next;
      await db.upsert("quote_state", { quote_id: m.quote_id, writer: m.writer, work: m.work, read_at: m.read_at, saved_at: m.saved_at, note: m.note }, ["quote_id"]);
    })
    .catch(() => {
      // The map is ahead of the table. Read the table again so the screen shows what was kept.
      return readAll().catch(() => undefined);
    })
    .finally(() => {
      inFlight -= 1;
    });
  return next;
}

/** Make sure the table has been read before a write, so a write never hides rows that exist. */
async function ready(): Promise<void> {
  await ensureMarks();
}

/** Mark a quote read. Returns true when it was not read before. */
export async function markRead(ref: QuoteRef, at: IsoStr = nowIso()): Promise<boolean> {
  await ready();
  if (snap.marks.get(ref.id)?.read_at) return false;
  apply(ref, { read_at: at });
  // The "Read N quotes" habit follows. Loaded only now, and never in the way of the read.
  void import("./habit").then((h) => h.syncReadHabit(nyParts(at).date)).catch(() => undefined);
  return true;
}

export async function setSaved(ref: QuoteRef, saved: boolean, at: IsoStr = nowIso()): Promise<void> {
  await ready();
  if (!!snap.marks.get(ref.id)?.saved_at === saved) return;
  apply(ref, { saved_at: saved ? at : null });
}

/** Keep a note. A note on a quote saves it, so the collection holds everything you wrote on. An empty note removes it. */
export async function setNote(ref: QuoteRef, text: string, at: IsoStr = nowIso()): Promise<void> {
  await ready();
  const note = text.trim() || null;
  const was = snap.marks.get(ref.id);
  if ((was?.note ?? null) === note) return;
  apply(ref, note && !was?.saved_at ? { note, saved_at: at } : { note });
}

// ---------- position ----------

let pending: LibraryPosition | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Write the position now, if one is waiting. */
export function flushPosition(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const p = pending;
  pending = null;
  if (p) void updateSettings({ library_position: p }).catch(() => undefined);
}

/**
 * Remember where the reader is. Written at most once a second or so, and
 * flushed when the reader closes, so swiping through does not write a row a card.
 */
export function savePosition(position: LibraryPosition): void {
  pending = position;
  if (!timer) timer = setTimeout(flushPosition, 1500);
}
