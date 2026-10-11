// The data side of the reminder job. Server only, Supabase mode only.
// Everything goes through the shared data layer. The send log (reminder_sent)
// and the last run time (reminder_run) are server only tables.

import { getBlocksForDate } from "@/lib/blocks";
import { db, isUniqueViolation } from "@/lib/db";
import { getChallenges, getItemByKey, getSettings, getWorkouts, workoutsFor } from "@/lib/db/helpers";
import { floorOn, modeOn } from "@/lib/logic/challenge";
import { addDays, todayNY, weekdayOf } from "@/lib/logic/dates";
import type { ReminderDay } from "@/lib/logic/reminders";
import type { DateStr } from "@/lib/types";
import pool from "@/data/quotes-short.json";
import { dropCandidates, dropMessage, dropsPerDay, pickDrop, type ShortPool } from "@/lib/logic/drops";
import type { CronData, CronDeps, DropSource } from "./cron";
import type { PushTarget } from "./push";

const RUN_ID = "cron";

export async function loadCronData(dates: DateStr[]): Promise<CronData> {
  const [reminders, settings, workouts, challenges, earned] = await Promise.all([
    db.list("reminder", { orderBy: "sort_order" }),
    getSettings(),
    getWorkouts(),
    getChallenges(),
    getItemByKey("earned"),
  ]);
  // The floor in force today: a running challenge's own target for "Earned today" when it has one.
  const today = todayNY();
  const running = modeOn(challenges, settings?.history_start ?? today, today).challenge;
  const days: ReminderDay[] = await Promise.all(
    dates.map(async (date) => {
      const [blocks, earnings] = await Promise.all([getBlocksForDate(date), db.list("earning", { from: date, to: date })]);
      const main = workoutsFor(workouts, weekdayOf(date)).main;
      return {
        date,
        blocks,
        earned: earnings.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
        restDay: main?.kind === "rest",
      };
    }),
  );
  return {
    // A settings row from before the 0015 migration has no drops columns: drops are off.
    drops: { enabled: settings?.drops_enabled === true, perDay: dropsPerDay(settings?.drops_per_day) },
    reminders,
    floor: floorOn(settings?.daily_floor ?? 0, running, earned?.id),
    quiet_start: settings?.quiet_start ?? "23:00",
    quiet_end: settings?.quiet_end ?? "05:30",
    days,
  };
}

export async function getLastRun(): Promise<Date | null> {
  const row = await db.get("reminder_run", RUN_ID);
  return row?.last_run_at ? new Date(row.last_run_at) : null;
}

export async function listSubscriptions(): Promise<PushTarget[]> {
  const rows = await db.list("push_subscription");
  return rows.map((r) => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
}

const shortPool = pool as unknown as ShortPool;

/**
 * Philosophy drops on the server. The plan picks from the date and slot over
 * the bundled short quotes (no read state, so nothing is loaded to plan). At
 * the moment a drop is sent it asks about just that drop's few candidates and
 * takes the first one not read in the Library: a handful of lookups, only
 * when a drop is actually due.
 */
export const dropSource: DropSource = {
  pick: (date, slot, perDay) => {
    const q = pickDrop(shortPool, date, slot, perDay);
    return q ? dropMessage(shortPool, q) : null;
  },
  async resolve(date, slot, perDay) {
    const candidates = dropCandidates(shortPool, date, slot, perDay);
    const reads = await Promise.all(candidates.map((c) => db.first("quote_state", { eq: { quote_id: c.id } }).then((r) => !!r?.read_at, () => false)));
    const read = new Set(candidates.filter((_, i) => reads[i]).map((c) => c.id));
    const q = pickDrop(shortPool, date, slot, perDay, (id) => read.has(id));
    return q ? dropMessage(shortPool, q) : null;
  },
};

export function cronStore(): Omit<CronDeps, "now" | "send"> {
  return {
    drops: dropSource,
    loadData: loadCronData,
    getLastRun,
    async setLastRun(at) {
      await db.upsert("reminder_run", { id: RUN_ID, last_run_at: at.toISOString() }, ["id"]);
    },
    async sentKeys(dates) {
      if (dates.length === 0) return [];
      const sorted = [...dates].sort();
      const rows = await db.list("reminder_sent", { from: sorted[0], to: sorted[sorted.length - 1] });
      return rows.filter((r) => dates.includes(r.date)).map((r) => r.key);
    },
    // The unique index on key is the lock: when two runs overlap, the second insert fails.
    async claim(date, key) {
      try {
        await db.insert("reminder_sent", { date, key });
        return true;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    async forget(before) {
      const old = await db.list("reminder_sent", { to: addDays(before, -1) });
      for (const r of old) await db.remove("reminder_sent", r.id);
    },
    listSubscriptions,
    async removeSubscription(endpoint) {
      await db.removeWhere("push_subscription", { endpoint });
    },
  };
}
