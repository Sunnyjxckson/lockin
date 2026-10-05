"use client";

import { useMemo } from "react";
import { useChallenge, useList, useToday } from "@/lib/db/hooks";
import {
  daysLeft,
  floorStatus,
  groupByDay,
  hourlyRate,
  neededPerDay,
  normalizeApp,
  runningTotal,
  surplusBanked,
  targetState,
  type DeliveryApp,
} from "@/lib/logic/money";

/** Everything the money screens show, computed from the earning table and the challenge. */
export function useMoney() {
  const today = useToday();
  const challenge = useChallenge();
  const list = useList("earning", { orderBy: "created_at", ascending: false });

  return useMemo(() => {
    const c = challenge.data;
    const earnings = list.data ?? [];
    const loading = challenge.loading || list.loading || !c;
    const floor = c?.daily_floor ?? 0;
    const target = c?.money_target ?? 0;
    const deadline = c?.money_deadline ?? today;
    const from = c?.start_date ?? null;
    const counted = from ? earnings.filter((e) => e.date >= from) : earnings;
    const total = runningTotal(counted);
    const todays = earnings.filter((e) => e.date === today);
    const banked = surplusBanked(counted, floor);
    const lastApp: DeliveryApp = normalizeApp(earnings[0]?.app) ?? "DoorDash";
    return {
      loading,
      today,
      challenge: c,
      earnings,
      floor,
      target,
      deadline,
      total,
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
    };
  }, [challenge.data, challenge.loading, list.data, list.loading, today]);
}

export type Money = ReturnType<typeof useMoney>;
