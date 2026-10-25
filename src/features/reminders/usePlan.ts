"use client";

import { useEffect, useMemo } from "react";
import { workoutsFor } from "@/lib/db/helpers";
import { useDayBlocks, useList, useMode, useSettings, useToday, useWorkouts } from "@/lib/db/hooks";
import { weekdayOf } from "@/lib/logic/dates";
import { dropsPerDay, withOwnLines } from "@/lib/logic/drops";
import { planDay, type PlannedNotification, type ReminderDay } from "@/lib/logic/reminders";
import { activateDrops, useDropsPicker } from "./dropsPicker";

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
  const workouts = useWorkouts();
  // His own lines: the drop at wake is one of them when he has any.
  const lines = useList("motivation", { eq: { kind: "quote" } });
  // The floor in force today: a running challenge's own target for "Earned today" when it has one.
  const liveFloor = useMode().floor;

  // Philosophy drops: the runtime that picks them loads only while they are on.
  const dropsOn = settings.data?.drops_enabled === true;
  const picker = useDropsPicker();
  useEffect(() => {
    if (dropsOn) activateDrops();
  }, [dropsOn]);

  const loading = reminders.loading || blocks.loading || earnings.loading || settings.loading || workouts.loading;

  return useMemo(() => {
    const earned = earnings.data.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const floor = liveFloor;
    const enabledCount = reminders.data.filter((r) => r.enabled).length + (dropsOn ? 1 : 0);
    if (loading || !settings.data) return { loading: true, plan: [], toSend: [], earned, floor, enabledCount };
    const day: ReminderDay = {
      date: today,
      blocks: blocks.data,
      earned,
      restDay: workoutsFor(workouts.data, weekdayOf(today)).main?.kind === "rest",
    };
    const perDay = dropsPerDay(settings.data.drops_per_day);
    const drops = dropsOn && picker ? { perDay, pick: withOwnLines((date: string, slot: number) => picker(date, slot, perDay), lines.data) } : null;
    const opts = { floor, quiet_start: settings.data.quiet_start, quiet_end: settings.data.quiet_end, drops };
    return {
      loading: false,
      plan: planDay(reminders.data, day, opts),
      toSend: planDay(reminders.data, day, opts, true),
      earned,
      floor,
      enabledCount,
    };
  }, [loading, today, reminders.data, blocks.data, earnings.data, settings.data, workouts.data, liveFloor, dropsOn, picker, lines.data]);
}
