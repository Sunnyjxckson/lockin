"use client";

import { useMemo } from "react";
import { workoutsFor } from "@/lib/db/helpers";
import { useChallenge, useDayBlocks, useList, useSettings, useToday, useWorkouts } from "@/lib/db/hooks";
import { weekdayOf } from "@/lib/logic/dates";
import { planDay, type PlannedNotification, type ReminderDay } from "@/lib/logic/reminders";

export interface TodayPlan {
  loading: boolean;
  /** Everything today could send, in time order. The earnings nudge is always in here. */
  plan: PlannedNotification[];
  /** The same, minus the nudge when today's earnings already meet the floor. */
  toSend: PlannedNotification[];
  earned: number;
  floor: number;
  /** Reminders switched on in Settings. */
  enabledCount: number;
}

/** Today's reminders, live: it follows edits to reminders, the schedule, earnings and quiet hours. */
export function useTodayPlan(): TodayPlan {
  const today = useToday();
  const reminders = useList("reminder", { orderBy: "sort_order" });
  const blocks = useDayBlocks(today);
  const earnings = useList("earning", { from: today, to: today });
  const settings = useSettings();
  const challenge = useChallenge();
  const workouts = useWorkouts();

  const loading = reminders.loading || blocks.loading || earnings.loading || settings.loading || challenge.loading || workouts.loading;

  return useMemo(() => {
    const earned = earnings.data.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const floor = challenge.data?.daily_floor ?? 0;
    const enabledCount = reminders.data.filter((r) => r.enabled).length;
    if (loading || !settings.data) return { loading: true, plan: [], toSend: [], earned, floor, enabledCount };
    const day: ReminderDay = {
      date: today,
      blocks: blocks.data,
      earned,
      restDay: workoutsFor(workouts.data, weekdayOf(today)).main?.kind === "rest",
    };
    const opts = { floor, quiet_start: settings.data.quiet_start, quiet_end: settings.data.quiet_end };
    return {
      loading: false,
      plan: planDay(reminders.data, day, opts),
      toSend: planDay(reminders.data, day, opts, true),
      earned,
      floor,
      enabledCount,
    };
  }, [loading, today, reminders.data, blocks.data, earnings.data, settings.data, challenge.data, workouts.data]);
}
