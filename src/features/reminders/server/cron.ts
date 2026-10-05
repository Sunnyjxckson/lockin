// One run of the reminder job. Everything it touches comes in through
// CronDeps, so the whole run can be tested with an in-memory store.

import { addDays } from "@/lib/logic/dates";
import { dueNotifications, windowDates, type ReminderDay } from "@/lib/logic/reminders";
import type { DateStr, Reminder, TimeStr } from "@/lib/types";
import type { PushTarget, Sender } from "./push";

export interface CronData {
  reminders: Reminder[];
  floor: number;
  quiet_start: TimeStr;
  quiet_end: TimeStr;
  days: ReminderDay[];
}

export interface CronDeps {
  now: Date;
  /** Reminders, settings, and blocks plus earnings for each date. */
  loadData(dates: DateStr[]): Promise<CronData>;
  getLastRun(): Promise<Date | null>;
  setLastRun(at: Date): Promise<void>;
  sentKeys(dates: DateStr[]): Promise<string[]>;
  /** Record a send. False when the key is already there, which means another run got to it first. */
  claim(date: DateStr, key: string): Promise<boolean>;
  /** Delete send records dated before this. */
  forget(before: DateStr): Promise<void>;
  listSubscriptions(): Promise<PushTarget[]>;
  removeSubscription(endpoint: string): Promise<void>;
  send: Sender;
}

export interface CronResult {
  ran_at: string;
  last_run: string | null;
  dates: DateStr[];
  subscriptions: number;
  due: number;
  sent: { key: string; delivered: number; failed: number }[];
  pruned: number;
}

export async function runCron(deps: CronDeps): Promise<CronResult> {
  const { now } = deps;
  const lastRun = await deps.getLastRun();
  const dates = windowDates(lastRun, now);
  const [data, already, subs] = await Promise.all([deps.loadData(dates), deps.sentKeys(dates), deps.listSubscriptions()]);

  const due = dueNotifications({
    reminders: data.reminders,
    days: data.days,
    floor: data.floor,
    quiet_start: data.quiet_start,
    quiet_end: data.quiet_end,
    sent: already,
    lastRun,
    now,
  });

  const result: CronResult = {
    ran_at: now.toISOString(),
    last_run: lastRun ? lastRun.toISOString() : null,
    dates,
    subscriptions: subs.length,
    due: due.length,
    sent: [],
    pruned: 0,
  };

  const dead = new Set<string>();
  // With no device subscribed there is nobody to tell. Nothing is recorded,
  // and the window still moves on so old reminders do not pile up.
  if (subs.length > 0) {
    for (const n of due) {
      // Claim before sending. If two runs overlap, only one gets the row.
      if (!(await deps.claim(n.date, n.key))) continue;
      let delivered = 0;
      let failed = 0;
      for (const sub of subs) {
        if (dead.has(sub.endpoint)) continue;
        const out = await deps.send(sub, { title: n.title, body: n.body, url: n.url, tag: n.key });
        if (out.ok) delivered++;
        else {
          failed++;
          if (out.gone) dead.add(sub.endpoint);
        }
      }
      result.sent.push({ key: n.key, delivered, failed });
    }
  }

  for (const endpoint of dead) {
    await deps.removeSubscription(endpoint);
    result.pruned++;
  }

  await deps.setLastRun(now);
  await deps.forget(addDays(dates[0], -3));
  return result;
}
