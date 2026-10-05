"use client";

// Reads and writes for the Vices screens. Everything goes through the
// foundation's db layer and helpers, so Today and Vices share one day_log.

import { useMemo } from "react";
import { db } from "@/lib/db";
import { addItem, saveItem, setChecked, setItemActive, setValue } from "@/lib/db/helpers";
import { useChallenge, useChecklist, useList, useLogs, useToday } from "@/lib/db/hooks";
import { challengeEndDate } from "@/lib/logic/dates";
import type { Streak } from "@/lib/logic/streaks";
import { targetOn } from "@/lib/logic/targets";
import {
  cleanDayCount,
  describeRule,
  dollarsKept,
  formatSpend,
  parseSpend,
  sortSlips,
  viceDayState,
  viceStreak,
  type DollarsKept,
  type TypicalSpend,
  type ViceDayState,
} from "@/lib/logic/vices";
import type { Challenge, ChecklistItem, DateStr, DayLog, Target, TargetVersion, TimeStr, ViceSlip } from "@/lib/types";

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
  challenge: Challenge | null;
  versions: TargetVersion[];
  logs: DayLog[];
  /** Vices that are on, in checklist order. */
  active: ViceView[];
  /** Every vice that is not removed, on or off. */
  library: ViceView[];
}

export function useVices(): VicesData {
  const today = useToday();
  const challenge = useChallenge();
  const checklist = useChecklist();
  const start = challenge.data?.start_date ?? today;
  const logs = useLogs(start, today);
  const slips = useList("vice_slip", { orderBy: "date" });

  return useMemo(() => {
    const { items, versions } = checklist.data;
    const end = challenge.data ? challengeEndDate(challenge.data.start_date, challenge.data.length_days) : today;
    const library = items
      .filter((i) => i.category === "vice" && !i.archived)
      .map((item): ViceView => {
        const mine = sortSlips(slips.data.filter((s) => s.item_id === item.id && s.date >= start && s.date <= end));
        const log = logs.data.find((l) => l.item_id === item.id && l.date === today) ?? null;
        const slipsToday = mine.filter((s) => s.date === today);
        const target = targetOn(item, versions, today);
        const spend = parseSpend(item.hint);
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
      loading: challenge.loading || checklist.loading || logs.loading || slips.loading,
      today,
      challenge: challenge.data,
      versions,
      logs: logs.data,
      active: library.filter((v) => v.item.active),
      library,
    };
  }, [today, start, challenge.data, challenge.loading, checklist.data, checklist.loading, logs.data, logs.loading, slips.data, slips.loading]);
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
 * Save a slip. For a quit vice the day is also unticked in day_log, so Today
 * shows the same thing. Nothing else is touched: other vices, other streaks
 * and the challenge carry on.
 */
export async function saveSlip(input: SlipInput): Promise<ViceSlip> {
  const row = { item_id: input.item.id, date: input.date, time: input.time, trigger: input.trigger, amount: input.amount };
  const saved = input.id ? await db.update("vice_slip", input.id, row) : await db.insert("vice_slip", row);
  if (input.item.type !== "number") {
    const log = await db.first("day_log", { eq: { date: input.date, item_id: input.item.id } });
    if (log?.checked) await setChecked(input.item.id, input.date, false);
  }
  return saved;
}

export function removeSlip(id: string): Promise<void> {
  return db.remove("vice_slip", id);
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

function fieldsFor(input: ViceInput, previousHint: string | null) {
  const capped = input.mode === "cap" && input.cap !== null;
  const target: Target = capped ? { kind: "max", max: input.cap as number } : { kind: "check" };
  // The typical spend lives in the hint. Keep a hint the user wrote himself.
  const ownHint = parseSpend(previousHint) ? null : previousHint;
  return {
    name: input.name.trim(),
    type: capped ? ("number" as const) : ("yesno" as const),
    mode: capped ? ("cap" as const) : ("quit" as const),
    unit: capped ? input.unit : null,
    target,
    tracks_money: input.tracksMoney,
    hint: input.tracksMoney && input.spend ? formatSpend(input.spend) : ownHint,
  };
}

/** Add a vice of the user's own. On from today. */
export function createVice(input: ViceInput, today: DateStr): Promise<ChecklistItem> {
  return addItem({ ...fieldsFor(input, null), category: "vice", cadence: "daily" }, today);
}

/** Change a vice's rule, and turn it on. Applies from today forward. */
export function updateVice(item: ChecklistItem, input: ViceInput, today: DateStr): Promise<ChecklistItem> {
  return saveItem(item.id, { ...fieldsFor(input, item.hint), active: true }, today);
}

export function turnOn(item: ChecklistItem, today: DateStr): Promise<ChecklistItem> {
  return setItemActive(item.id, true, today);
}

export function turnOff(item: ChecklistItem, today: DateStr): Promise<ChecklistItem> {
  return setItemActive(item.id, false, today);
}
