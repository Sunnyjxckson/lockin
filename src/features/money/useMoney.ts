"use client";

import { useMemo } from "react";
import { useList, useMode } from "@/lib/db/hooks";
import { weekEnd, weekStart } from "@/lib/logic/dates";
import {
  daysLeft,
  floorStatus,
  groupByDay,
  hourlyRate,
  neededPerDay,
  normalizeApp,
  runningTotal,
  spentBetween,
  surplusBanked,
  targetStart,
  targetState,
  type DeliveryApp,
} from "@/lib/logic/money";

/**
 * Everything the money screens show. The floor and the earnings list are part
 * of the ongoing history and are always there. The target, its deadline and
 * its running total come from the challenge running today, and `hasTarget` is
 * false without one.
 */
export function useMoney() {
  const mode = useMode();
  const today = mode.today;
  const list = useList("earning", { orderBy: "created_at", ascending: false });
  const expenses = useList("expense", { from: weekStart(today), to: weekEnd(today) });

  return useMemo(() => {
    const c = mode.challenge;
    const earnings = list.data ?? [];
    const loading = mode.loading || list.loading;
    const floor = mode.floor;
    const hasTarget = !!c && c.money_target !== null && c.money_target > 0 && !!c.money_deadline;
    const target = hasTarget && c ? (c.money_target as number) : 0;
    const deadline = hasTarget && c ? (c.money_deadline as string) : today;
    const counted = earnings.filter((e) => e.date >= mode.historyStart);
    const since = c ? targetStart(c) : mode.historyStart;
    const allTime = runningTotal(counted);
    const total = hasTarget ? runningTotal(counted, since) : allTime;
    const todays = earnings.filter((e) => e.date === today);
    const banked = surplusBanked(counted, floor);
    const lastApp: DeliveryApp = normalizeApp(earnings[0]?.app) ?? "DoorDash";
    return {
      loading,
      today,
      /** "challenge" while one is running today, otherwise "ongoing". */
      mode: mode.mode,
      /** The challenge running today. Null in ongoing mode. */
      challenge: c,
      /** First date of the ongoing history. */
      historyStart: mode.historyStart,
      earnings,
      floor,
      /** False in ongoing mode and for a challenge without a money target. */
      hasTarget,
      target,
      deadline,
      total,
      /** The first date that counts toward the current target. */
      since,
      /** True once the target has been reset, so the total and the all time total differ in meaning. */
      wasReset: !!c && hasTarget && since > c.start_date,
      allTime,
      progress: target > 0 ? Math.min(1, total / target) : 0,
      daysLeft: daysLeft(today, deadline),
      state: targetState(target, total, today, deadline),
      needed: neededPerDay(target, total, today, deadline, floor),
      todayFloor: floorStatus(runningTotal(todays), floor, banked),
      banked,
      rateToday: hourlyRate(todays),
      rateOverall: hourlyRate(counted),
      days: groupByDay(earnings),
      lastApp,
      /** Dollars spent on groceries this week, from the expense table. */
      groceriesThisWeek: spentBetween(expenses.data, weekStart(today), weekEnd(today), "groceries"),
    };
  }, [mode, list.data, list.loading, expenses.data, today]);
}

export type Money = ReturnType<typeof useMoney>;
