"use client";

// Reads and writes for the Vices screens. Everything goes through the
// foundation's db layer and helpers, so Today and Vices share one day_log.

import { useMemo } from "react";
import { db } from "@/lib/db";
import { addItem, saveItem, setChecked, setItemActive, setValue, syncSlipCount } from "@/lib/db/helpers";
import { useChecklist, useList, useLogs, useMode } from "@/lib/db/hooks";
import { dayWindow, type DayWindow } from "@/lib/logic/challenge";
import { addDays } from "@/lib/logic/dates";
import type { Streak } from "@/lib/logic/streaks";
import { targetOn } from "@/lib/logic/targets";
import {
  cleanDayCount,
  describeRule,
  dollarsKept,
  sortSlips,
  spendOf,
  viceDayState,
  viceStreak,
  type DollarsKept,
  type TypicalSpend,
  type ViceDayState,
} from "@/lib/logic/vices";
import type { ChecklistItem, DateStr, DayLog, Target, TargetVersion, TimeStr, ViceSlip } from "@/lib/types";

export interface ViceView {
  item: ChecklistItem;
  /** The rule in force today. */
  target: Target;
  rule: string;
  streak: Streak;
  /** Today's state. */
  state: ViceDayState;
  log: DayLog | null;
  /** Newest first. */
  slips: ViceSlip[];
  slipsToday: ViceSlip[];
  spend: TypicalSpend | null;
  /** Only for money vices. */
  kept: DollarsKept | null;
}

export interface VicesData {
  loading: boolean;
  today: DateStr;
  /** The days the vice calendar draws: the running challenge, or the last five weeks. */
  window: DayWindow;
  versions: TargetVersion[];
  logs: DayLog[];
  /** Vices that are on, in checklist order. */
  active: ViceView[];
  /** Every vice that is not removed, on or off. */
  library: ViceView[];
}

export function useVices(): VicesData {
  const mode = useMode();
  const today = mode.today;
  const checklist = useChecklist();
  // Clean streaks belong to the ongoing history: they count from its start
  // and carry on across the start and the end of a challenge.
  const back = addDays(today, -400);
  const start = mode.historyStart > back ? mode.historyStart : back;
  const logs = useLogs(start, today);
  const slips = useList("vice_slip", { orderBy: "date" });

  return useMemo(() => {
    const { items, versions } = checklist.data;
    const library = items
      .filter((i) => i.category === "vice" && !i.archived)
      .map((item): ViceView => {
        const mine = sortSlips(slips.data.filter((s) => s.item_id === item.id && s.date >= start && s.date <= today));
        const log = logs.data.find((l) => l.item_id === item.id && l.date === today) ?? null;
        const slipsToday = mine.filter((s) => s.date === today);
        const target = targetOn(item, versions, today);
        const spend = spendOf(item);
        return {
          item,
          target,
          rule: describeRule(item, target),
          streak: viceStreak(item, versions, logs.data, mine, today, start),
          state: viceDayState(item, versions, log, slipsToday.length, today, today),
          log,
          slips: mine,
          slipsToday,
          spend,
          kept: item.tracks_money ? dollarsKept(cleanDayCount(item, versions, logs.data, mine, start, today), spend, mine) : null,
        };
      });
    return {
      loading: mode.loading || checklist.loading || logs.loading || slips.loading,
      today,
      window: dayWindow(mode, today, 35),
      versions,
      logs: logs.data,
      active: library.filter((v) => v.item.active),
      library,
    };
  }, [today, start, mode, checklist.data, checklist.loading, logs.data, logs.loading, slips.data, slips.loading]);
}

// ---------- writes ----------

export interface SlipInput {
  /** Set to change an existing slip. */
  id?: string;
  item: ChecklistItem;
  date: DateStr;
  time: TimeStr;
  trigger: string | null;
  amount: number | null;
}

/**
 * Save a slip, then store the day's slip count on its day_log row. That count
 * is what makes the day not clean on Today, Progress, streaks and the coach.
 * The tick and the number are left as they were, so removing a slip logged by
 * mistake puts the day back exactly. Nothing else is touched: other vices,
 * other streaks and everything else carry on.
 */
export async function saveSlip(input: SlipInput): Promise<ViceSlip> {
  const row = { item_id: input.item.id, date: input.date, time: input.time, trigger: input.trigger, amount: input.amount };
  const before = input.id ? await db.get("vice_slip", input.id) : null;
  const saved = input.id ? await db.update("vice_slip", input.id, row) : await db.insert("vice_slip", row);
  await syncSlipCount(saved.item_id, saved.date);
  if (before && (before.date !== saved.date || before.item_id !== saved.item_id)) await syncSlipCount(before.item_id, before.date);
  return saved;
}

export async function removeSlip(id: string): Promise<void> {
  const slip = await db.get("vice_slip", id);
  await db.remove("vice_slip", id);
  if (slip) await syncSlipCount(slip.item_id, slip.date);
}

/** Tick or untick a quit vice as clean for a date. Same row Today writes. */
export function setClean(item: ChecklistItem, date: DateStr, clean: boolean): Promise<DayLog> {
  return setChecked(item.id, date, clean);
}

/** Set the running amount for a capped vice. */
export function setAmount(item: ChecklistItem, date: DateStr, total: number | null): Promise<DayLog> {
  return setValue(item.id, date, total);
}

export interface ViceInput {
  name: string;
  mode: "quit" | "cap";
  cap: number | null;
  unit: string | null;
  tracksMoney: boolean;
  spend: TypicalSpend | null;
}

function fieldsFor(input: ViceInput) {
  const capped = input.mode === "cap" && input.cap !== null;
  const target: Target = capped ? { kind: "max", max: input.cap as number } : { kind: "check" };
  const spend = input.tracksMoney ? input.spend : null;
  return {
    name: input.name.trim(),
    type: capped ? ("number" as const) : ("yesno" as const),
    mode: capped ? ("cap" as const) : ("quit" as const),
    unit: capped ? input.unit : null,
    target,
    tracks_money: input.tracksMoney,
    typical_spend: spend ? spend.amount : null,
    spend_period: spend ? spend.period : null,
  };
}

/** Add a vice of the user's own. On from today. */
export function createVice(input: ViceInput, today: DateStr): Promise<ChecklistItem> {
  return addItem({ ...fieldsFor(input), category: "vice", cadence: "daily" }, today);
}

/** Change a vice's rule, and turn it on. Applies from today forward. */
export function updateVice(item: ChecklistItem, input: ViceInput, today: DateStr): Promise<ChecklistItem> {
  return saveItem(item.id, { ...fieldsFor(input), active: true }, today);
}

export function turnOn(item: ChecklistItem, today: DateStr): Promise<ChecklistItem> {
  return setItemActive(item.id, true, today);
}

export function turnOff(item: ChecklistItem, today: DateStr): Promise<ChecklistItem> {
  return setItemActive(item.id, false, today);
}
