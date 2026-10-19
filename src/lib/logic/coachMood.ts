// Mood for the coach: when to ask, the last week in a few lines, and the two
// patterns the drift rules look for (a mood sliding for days, a low that
// keeps coming back).
//
// Pure. No React, no db. `MoodLog` rows come from the `mood_log` table.

import type { DateStr, MoodLog, TimeStr } from "../types";
import { addDays, dateRange, minutesOf } from "./dates";

export const MOOD_LEVELS = [1, 2, 3, 4, 5] as const;
export const MOOD_LABEL: Record<number, string> = { 1: "Low", 2: "Down", 3: "Okay", 4: "Good", 5: "High" };

export function moodLabel(n: number): string {
  return MOOD_LABEL[Math.min(5, Math.max(1, Math.round(n)))];
}

/** One day of mood: the average if there was more than one entry, and the last note. */
export interface MoodDay {
  date: DateStr;
  mood: number;
  label: string;
  note: string | null;
  entries: number;
}

function avg(ns: number[]): number {
  return Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 10) / 10;
}

/** Every day with at least one entry between `from` and `to`, oldest first. */
export function moodDays(logs: readonly MoodLog[], from: DateStr, to: DateStr): MoodDay[] {
  const out: MoodDay[] = [];
  for (const date of dateRange(from, to)) {
    const day = logs.filter((l) => l.date === date).sort((a, b) => (a.time < b.time ? -1 : 1));
    if (day.length === 0) continue;
    const note = [...day].reverse().find((l) => l.note?.trim())?.note?.trim() ?? null;
    const mood = avg(day.map((l) => l.mood));
    out.push({ date, mood, label: moodLabel(mood), note, entries: day.length });
  }
  return out;
}

/** The last seven days (today included) for the coach's context. */
export function moodHistory(logs: readonly MoodLog[], today: DateStr): MoodDay[] {
  return moodDays(logs, addDays(today, -6), today).map((d) => ({ ...d, note: d.note ? d.note.slice(0, 120) : null }));
}

// ---------- when to ask ----------

/** The first check-in of the day runs from here to the second one. */
export const MOOD_FIRST_FROM: TimeStr = "07:00";
export const MOOD_SECOND_FROM: TimeStr = "17:00";
export const MOOD_LAST_ASK: TimeStr = "22:30";

export type MoodSlot = "first" | "second";

/**
 * Which mood check-in is due, if any: at most two a day. The first from 7:00,
 * until the second opens at 17:00. The second from 17:00 until 22:30. A slot
 * is answered by any entry made inside it, so someone who logs once at noon
 * is asked again in the evening and nobody is asked twice in a row.
 * `skipped` are the slots they closed with "Not now".
 */
export function moodDue(todays: readonly Pick<MoodLog, "time">[], time: TimeStr, skipped: readonly MoodSlot[] = []): MoodSlot | null {
  const now = minutesOf(time);
  const second = minutesOf(MOOD_SECOND_FROM);
  if (now < minutesOf(MOOD_FIRST_FROM) || now > minutesOf(MOOD_LAST_ASK)) return null;
  const slot: MoodSlot = now >= second ? "second" : "first";
  if (skipped.includes(slot)) return null;
  const answered = todays.some((l) => (slot === "second" ? minutesOf(l.time) >= second : minutesOf(l.time) < second));
  return answered ? null : slot;
}

// ---------- patterns ----------

export interface MoodDrop {
  kind: "dropping" | "low";
  /** The run, oldest first. */
  days: MoodDay[];
}

/** An average this low counts as a low day. */
export const LOW_MOOD = 2;
/** Days in a row before the coach says anything about it. */
export const MOOD_RUN = 3;

/**
 * The mood trend that is live now, or null. "dropping": three or more days
 * in a row, each lower than the one before. "low": three or more days in a
 * row at or under 2. The run has to reach yesterday or today, so a bad week
 * that ended is not raised again.
 */
export function moodDrop(logs: readonly MoodLog[], today: DateStr): MoodDrop | null {
  const days = moodDays(logs, addDays(today, -13), today);
  if (days.length < MOOD_RUN) return null;
  const last = days[days.length - 1];
  if (last.date < addDays(today, -1)) return null;

  const run = (ok: (prev: MoodDay, next: MoodDay) => boolean, single: (d: MoodDay) => boolean): MoodDay[] => {
    const out: MoodDay[] = [last];
    if (!single(last)) return [];
    for (let i = days.length - 2; i >= 0; i--) {
      const d = days[i];
      // Days in a row means calendar days with an entry on each.
      if (d.date !== addDays(out[0].date, -1) || !ok(d, out[0]) || !single(d)) break;
      out.unshift(d);
    }
    return out;
  };

  const low = run(() => true, (d) => d.mood <= LOW_MOOD);
  const falling = run((prev, next) => next.mood < prev.mood, () => true);
  if (falling.length >= MOOD_RUN && falling.length >= low.length) return { kind: "dropping", days: falling };
  if (low.length >= MOOD_RUN) return { kind: "low", days: low };
  return null;
}

/** Low days in the last two weeks. */
export function lowDays(logs: readonly MoodLog[], today: DateStr): number {
  return moodDays(logs, addDays(today, -13), today).filter((d) => d.mood <= LOW_MOOD).length;
}

/** True when the same struggle keeps coming back: low on five or more of the last fourteen days. */
export function recurringStruggle(logs: readonly MoodLog[], today: DateStr): boolean {
  return lowDays(logs, today) >= 5;
}
