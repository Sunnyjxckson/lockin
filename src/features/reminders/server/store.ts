// The Supabase side of the reminder job. Server only, Supabase mode only.
//
// Reminders, blocks, earnings and subscriptions are read through the shared
// data layer. The send log (reminder_sent, reminder_run) belongs to this
// feature alone and is not in the shared table map, so it is read and written
// here with the server client.

import { getBlocksForDate } from "@/lib/blocks";
import { db } from "@/lib/db";
import { getChallenge, getSettings, getWorkouts, workoutsFor } from "@/lib/db/helpers";
import { serverSupabase } from "@/lib/db/supabase";
import { weekdayOf } from "@/lib/logic/dates";
import type { ReminderDay } from "@/lib/logic/reminders";
import type { DateStr } from "@/lib/types";
import type { CronData, CronDeps } from "./cron";
import type { PushTarget } from "./push";

const RUN_ID = "cron";

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

export async function loadCronData(dates: DateStr[]): Promise<CronData> {
  const [reminders, settings, challenge, workouts] = await Promise.all([
    db.list("reminder", { orderBy: "sort_order" }),
    getSettings(),
    getChallenge(),
    getWorkouts(),
  ]);
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
    reminders,
    floor: challenge?.daily_floor ?? 0,
    quiet_start: settings?.quiet_start ?? "23:00",
    quiet_end: settings?.quiet_end ?? "05:30",
    days,
  };
}

export async function getLastRun(): Promise<Date | null> {
  const { data, error } = await serverSupabase().from("reminder_run").select("last_run_at").eq("id", RUN_ID).maybeSingle();
  check(error, "read reminder_run");
  const at = (data as { last_run_at?: string } | null)?.last_run_at;
  return at ? new Date(at) : null;
}

export async function listSubscriptions(): Promise<PushTarget[]> {
  const rows = await db.list("push_subscription");
  return rows.map((r) => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
}

export function supabaseCronStore(): Omit<CronDeps, "now" | "send"> {
  const sb = serverSupabase();
  return {
    loadData: loadCronData,
    getLastRun,
    async setLastRun(at) {
      const { error } = await sb.from("reminder_run").upsert({ id: RUN_ID, last_run_at: at.toISOString() }, { onConflict: "id" });
      check(error, "write reminder_run");
    },
    async sentKeys(dates) {
      const { data, error } = await sb.from("reminder_sent").select("key").in("date", dates);
      check(error, "read reminder_sent");
      return ((data ?? []) as { key: string }[]).map((r) => r.key);
    },
    async claim(date, key) {
      const { data, error } = await sb.from("reminder_sent").upsert({ date, key }, { onConflict: "key", ignoreDuplicates: true }).select("key");
      check(error, "write reminder_sent");
      return (data ?? []).length > 0;
    },
    async forget(before) {
      const { error } = await sb.from("reminder_sent").delete().lt("date", before);
      check(error, "trim reminder_sent");
    },
    listSubscriptions,
    async removeSubscription(endpoint) {
      await db.removeWhere("push_subscription", { endpoint });
    },
  };
}
