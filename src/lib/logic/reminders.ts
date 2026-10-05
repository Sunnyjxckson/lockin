// Reminder rules. Pure: no db, no clock of its own.
//
// planDay turns the stored reminders plus one day's blocks into the list of
// notifications that day could send. dueNotifications picks the ones a run
// at `now` must send. The cron route and the in-app fallback both use these,
// so a reminder means the same thing on the server and on the device.

import { addMinutes, minutesOf, nyInstant, nyParts } from "./dates";
import type { BlockKind, DateStr, Reminder, ReminderKind, TimeStr } from "../types";

/** How late a reminder may still go out. Older than this is dropped, not sent stale. */
export const GRACE_MINUTES = 20;

/** The part of a schedule block the rules need. DayBlock fits. */
export interface ReminderBlock {
  id: string;
  block_name: string;
  start: TimeStr;
  kind?: BlockKind;
  template_id?: string | null;
}

/** Everything about one calendar day that decides what is sent. */
export interface ReminderDay {
  date: DateStr;
  blocks: readonly ReminderBlock[];
  /** Total earned on this date so far. */
  earned: number;
  /** True when the day's main workout is a rest day, so the workout reminder is skipped. */
  restDay?: boolean;
}

export interface PlannedNotification {
  /** Unique per send. Stored after sending so it never goes twice. Also the notification tag. */
  key: string;
  reminder_id: string;
  kind: ReminderKind;
  date: DateStr;
  time: TimeStr;
  /** The instant it fires, as epoch milliseconds. */
  at: number;
  title: string;
  body: string;
  url: string;
}

export interface PlanOptions {
  floor: number;
  quiet_start: TimeStr;
  quiet_end: TimeStr;
}

/** True when `time` is inside quiet hours. The window may wrap past midnight. Start is quiet, end is not. */
export function isQuiet(time: TimeStr, quietStart: TimeStr, quietEnd: TimeStr): boolean {
  const t = minutesOf(time);
  const s = minutesOf(quietStart);
  const e = minutesOf(quietEnd);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Where a tap on the notification lands. */
export function urlFor(kind: ReminderKind): string {
  switch (kind) {
    case "delivery":
    case "earnings_nudge":
      return "/money";
    case "workout":
      return "/body/workout";
    default:
      return "/today";
  }
}

function money(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

function clock(time: TimeStr): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Never let a dash character reach a notification. */
function clean(s: string): string {
  return s.replace(/[\u2012-\u2015]/g, ", ").replace(/\s+,/g, ",").trim();
}

/** A stable name for a block across "still on the template" and "edited for today". */
function blockKey(b: ReminderBlock): string {
  if (b.template_id) return `t.${b.template_id}`;
  return `b.${b.id.replace(/^template:/, "")}`;
}

function blockTime(start: TimeStr, offset: number): TimeStr | null {
  const m = minutesOf(start) + offset;
  // An offset that would cross midnight belongs to another day. Skip it.
  if (m < 0 || m >= 24 * 60) return null;
  return addMinutes(start, offset);
}

/**
 * Every notification one day could send, in time order.
 *
 * Left out: disabled reminders, anything inside quiet hours, the workout
 * reminder on a rest day. The earnings nudge is always planned here (so the
 * screen can list it) and dropped at send time when the floor is met; pass
 * `forSend` to drop it now.
 */
export function planDay(
  reminders: readonly Reminder[],
  day: ReminderDay,
  opts: PlanOptions,
  forSend = false,
): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const push = (r: Reminder, key: string, time: TimeStr, title: string, body: string) => {
    if (isQuiet(time, opts.quiet_start, opts.quiet_end)) return;
    out.push({
      key: `${day.date}:${key}`,
      reminder_id: r.id,
      kind: r.kind,
      date: day.date,
      time,
      at: nyInstant(day.date, time).getTime(),
      title: clean(title),
      body: clean(body),
      url: urlFor(r.kind),
    });
  };

  for (const r of reminders) {
    if (!r.enabled) continue;

    if (r.time === null) {
      // Relative to the start of every block whose name starts with block_name.
      const prefix = (r.block_name ?? "").trim().toLowerCase();
      if (!prefix) continue;
      for (const b of day.blocks) {
        if (!b.block_name.trim().toLowerCase().startsWith(prefix)) continue;
        const time = blockTime(b.start, r.offset_minutes);
        if (!time) continue;
        const mins = Math.abs(r.offset_minutes);
        const when = r.offset_minutes < 0 ? `Starts in ${mins} min, at ${clock(b.start)}.` : `Starts at ${clock(b.start)}.`;
        push(r, `${r.id}:${blockKey(b)}`, time, b.block_name, when);
      }
      continue;
    }

    if (r.kind === "workout" && day.restDay) continue;

    if (r.kind === "earnings_nudge") {
      if (forSend && day.earned >= opts.floor) continue;
      const left = Math.max(0, opts.floor - day.earned);
      const lead = `${money(day.earned)} of ${money(opts.floor)} today. ${money(left)} to go.`;
      push(r, r.id, r.time, r.label, r.body ? `${lead} ${r.body}` : lead);
      continue;
    }

    push(r, r.id, r.time, r.label, r.body ?? "");
  }

  return out.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

export interface DueInput extends PlanOptions {
  reminders: readonly Reminder[];
  /** The days the window touches. Usually just today. See windowDates. */
  days: readonly ReminderDay[];
  /** Keys already sent. */
  sent: ReadonlySet<string> | readonly string[];
  /** When the last run finished, or null on the first run. */
  lastRun: Date | null;
  now: Date;
  graceMinutes?: number;
}

/** The start of the send window: the last run, but never further back than the grace period. */
export function windowStart(lastRun: Date | null, now: Date, graceMinutes = GRACE_MINUTES): number {
  const floor = now.getTime() - graceMinutes * 60_000;
  if (!lastRun) return floor;
  return Math.min(now.getTime(), Math.max(lastRun.getTime(), floor));
}

/** The New York dates a run has to look at. Two when the window crosses midnight. */
export function windowDates(lastRun: Date | null, now: Date, graceMinutes = GRACE_MINUTES): DateStr[] {
  const a = nyParts(new Date(windowStart(lastRun, now, graceMinutes))).date;
  const b = nyParts(now).date;
  return a === b ? [b] : [a, b];
}

/**
 * Exactly the notifications a run at `now` must send: those that came due
 * after the last run (or within the grace period on a first run), up to and
 * including now, that have not been sent before.
 */
export function dueNotifications(input: DueInput): PlannedNotification[] {
  const sent = input.sent instanceof Set ? input.sent : new Set(input.sent as readonly string[]);
  const start = windowStart(input.lastRun, input.now, input.graceMinutes);
  const end = input.now.getTime();
  const seen = new Set<string>();
  const out: PlannedNotification[] = [];
  for (const day of input.days) {
    for (const n of planDay(input.reminders, day, input, true)) {
      if (n.at <= start || n.at > end) continue;
      if (sent.has(n.key) || seen.has(n.key)) continue;
      seen.add(n.key);
      out.push(n);
    }
  }
  return out.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

/** What is still to come today, for the screen. */
export function upcoming(plan: readonly PlannedNotification[], now: Date): PlannedNotification[] {
  return plan.filter((n) => n.at > now.getTime());
}
