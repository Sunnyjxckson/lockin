// Coach data flow on the client: read the rows, build the snapshot, ask the
// route for the wording, save coach_note rows. No React in here.

import { getBlocksForDate } from "@/lib/blocks";
import { db } from "@/lib/db";
import { getChallenges, getScoringVersions, getSettings } from "@/lib/db/helpers";
import { modeOn } from "@/lib/logic/challenge";
import {
  buildSnapshot,
  cleanCoachText,
  encodeFlagNote,
  parseFlagNote,
  reconcileFlags,
  reviewDue,
  type CoachData,
  type CoachSnapshot,
  type Flag,
} from "@/lib/logic/coach";
import { detectFlags } from "@/lib/logic/coachFlags";
import { fallbackFor, type CoachKind } from "@/lib/logic/coachWrite";
import { addDays, timeNY } from "@/lib/logic/dates";
import type { CoachNote, DateStr } from "@/lib/types";

/** How far back the coach reads. The history itself has no end, the coach's attention does. */
const LOOKBACK_DAYS = 120;

/**
 * Everything the coach reads, in one go. It works in both modes: the history
 * is ongoing, and a running challenge is context on top. Null only before the
 * app is seeded.
 */
export async function loadCoachData(today: DateStr): Promise<CoachData | null> {
  const [settings, challenges] = await Promise.all([getSettings(), getChallenges()]);
  if (!settings) return null;
  const mode = modeOn(challenges, settings.history_start ?? today, today);
  const back = addDays(today, -LOOKBACK_DAYS);
  const from = mode.historyStart > back ? mode.historyStart : back;
  // Lifts can predate the history and still show a trend.
  const liftsFrom = addDays(today, -42);
  const [items, versions, logs, earnings, meals, bodyLogs, setLogs, slips, workouts, blocks, focus] = await Promise.all([
    db.list("checklist_item", { orderBy: "sort_order" }),
    getScoringVersions(),
    db.list("day_log", { from, to: today, orderBy: "date" }),
    db.list("earning", { from, to: today, orderBy: "date" }),
    db.list("meal", { from: addDays(today, -14), to: today, orderBy: "date" }),
    db.list("body_log", { to: today, orderBy: "date" }),
    db.list("set_log", { from: liftsFrom, to: today, orderBy: "date" }),
    db.list("vice_slip", { from, to: today, orderBy: "date" }),
    db.list("workout"),
    getBlocksForDate(today),
    db.list("focus_session", { from: addDays(today, -14), to: today, orderBy: "date" }),
  ]);
  return {
    today,
    historyStart: from,
    challenge: mode.challenge,
    floor: settings.daily_floor ?? mode.challenge?.daily_floor ?? 0,
    focus,
    settings,
    items,
    versions,
    logs,
    earnings,
    meals,
    bodyLogs,
    setLogs,
    slips,
    workouts,
    blocks: blocks.map((b) => ({ block_name: b.block_name, start: b.start, end: b.end, kind: b.kind })),
  };
}

export interface Written {
  body: string;
  source: "ai" | "fallback";
}

/** Ask the route to write it. Offline or on any failure, write it here from the same rules. */
export async function writeNote(kind: CoachKind, snapshot: CoachSnapshot): Promise<Written> {
  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, snapshot }),
    });
    if (res.ok) {
      const json = (await res.json()) as Partial<Written>;
      if (typeof json.body === "string" && json.body.trim()) {
        return { body: cleanCoachText(json.body), source: json.source === "ai" ? "ai" : "fallback" };
      }
    }
  } catch {
    // Fall through to the local version.
  }
  return { body: fallbackFor(kind, snapshot), source: "fallback" };
}

async function saveNote(kind: CoachKind, date: DateStr, written: Written): Promise<CoachNote> {
  const existing = await db.first("coach_note", { eq: { date, kind } });
  if (existing) return db.update("coach_note", existing.id, { body: written.body, source: written.source });
  return db.insert("coach_note", { date, kind, body: written.body, source: written.source });
}

/** Run the rules and bring the saved flag notes in line. Returns the flags that are live and not dismissed. */
async function syncFlags(data: CoachData): Promise<Flag[]> {
  const detected = detectFlags(data);
  const notes = await db.list("coach_note", { eq: { kind: "flag" } });
  const changes = reconcileFlags(detected, notes, data.today);
  if (changes.insert.length > 0) await db.insertMany("coach_note", changes.insert);
  for (const u of changes.update) await db.update("coach_note", u.id, { body: u.body });
  const dismissed = new Set<string>();
  for (const n of notes) {
    const parsed = parseFlagNote(n.body);
    if (parsed && parsed.dismissed_on && !parsed.resolved_on) dismissed.add(parsed.flag.key);
  }
  return detected.filter((f) => !dismissed.has(f.key));
}

export async function writeMorning(data: CoachData, flags: Flag[]): Promise<CoachNote> {
  const snapshot = buildSnapshot(data, flags);
  return saveNote("morning", data.today, await writeNote("morning", snapshot));
}

/** The review for the week ending on `sunday`, saved under that date. */
export async function writeWeekly(data: CoachData, flags: Flag[], sunday: DateStr): Promise<CoachNote> {
  const snapshot = buildSnapshot(data, flags, { weekOf: sunday });
  return saveNote("weekly", sunday, await writeNote("weekly", snapshot));
}

export interface SyncOptions {
  /** Write a new morning brief even when today has one. */
  regenerate?: boolean;
  /** Write (or rewrite) the current weekly review now. */
  weekly?: boolean;
}

// One run at a time, so two mounted components (or React running an effect
// twice) cannot write the same note twice.
let running: Promise<void> | null = null;

/**
 * The coach's whole routine: refresh flags, write today's brief if it is
 * missing, and write the Sunday review when it is due. Safe to call on every
 * open. It only talks to the model when a note is actually missing.
 */
export function syncCoach(today: DateStr, options: SyncOptions = {}): Promise<void> {
  const run = async () => {
    const data = await loadCoachData(today);
    if (!data) return;
    const flags = await syncFlags(data);
    const active = today >= data.historyStart;

    if (active) {
      const brief = await db.first("coach_note", { eq: { date: today, kind: "morning" } });
      if (!brief || options.regenerate) await writeMorning(data, flags);
    }

    const due = reviewDue(today, timeNY(), data.historyStart);
    if (due) {
      const review = await db.first("coach_note", { eq: { date: due.weekEnd, kind: "weekly" } });
      if (options.weekly || (!review && due.auto)) await writeWeekly(data, flags, due.weekEnd);
    }
  };
  const next = (running ?? Promise.resolve()).catch(() => undefined).then(run);
  running = next;
  void next.finally(() => {
    if (running === next) running = null;
  });
  return next;
}

/** Hide a flag. It stays hidden until the pattern clears. */
export async function dismissFlag(noteId: string, today: DateStr): Promise<void> {
  const note = await db.get("coach_note", noteId);
  if (!note) return;
  const parsed = parseFlagNote(note.body);
  if (!parsed) return;
  await db.update("coach_note", noteId, { body: encodeFlagNote({ ...parsed, dismissed_on: today }) });
}

/** Bring a dismissed flag back. */
export async function restoreFlag(noteId: string): Promise<void> {
  const note = await db.get("coach_note", noteId);
  if (!note) return;
  const parsed = parseFlagNote(note.body);
  if (!parsed) return;
  await db.update("coach_note", noteId, { body: encodeFlagNote({ ...parsed, dismissed_on: null }) });
}
