// The coach chat on the client: build what the coach knows right now, send a
// message and save the answer, and send the check-ins that are due. No React.

import { db, isUniqueViolation } from "@/lib/db";
import { getSettings, updateSettings } from "@/lib/db/helpers";
import { buildSnapshot, cleanCoachText, viceName, type CoachData } from "@/lib/logic/coach";
import {
  MAX_MESSAGE,
  MAX_TURNS,
  chatFallback,
  checkinsOf,
  dueCheckins,
  quotesUsedSince,
  voiceOf,
  type ChatContext,
  type ChatTurn,
} from "@/lib/logic/coachChat";
import { detectFlags } from "@/lib/logic/coachFlags";
import { quoteByKey } from "@/lib/logic/coachQuotes";
import { addDays, formatTime, nowIso, timeNY, todayNY, weekdayOf } from "@/lib/logic/dates";
import { summarizeDay } from "@/lib/logic/day";
import type { CoachCheckins, CoachMessage, CoachVoice, DateStr } from "@/lib/types";
import { loadCoachData } from "./data";

/** A line does not come back for this many days. */
const QUOTE_REST_DAYS = 7;

/** Their own reasons, in their words: boards, the notes on them, the business goal. */
async function loadWhy(): Promise<string[]> {
  const [boards, notes, settings] = await Promise.all([
    db.list("board", { orderBy: "sort_order" }).catch(() => []),
    db.list("board_item", { eq: { kind: "note" }, orderBy: "sort_order" }).catch(() => []),
    getSettings().catch(() => null),
  ]);
  const out: string[] = [];
  for (const b of boards.slice(0, 4)) {
    const own = notes.filter((n) => n.board_id === b.id && n.note?.trim()).slice(0, 3).map((n) => (n.note as string).trim().slice(0, 140));
    out.push(own.length > 0 ? `${b.name} board: ${own.join(" / ")}` : `${b.name} board`);
  }
  if (settings?.business_goal?.trim()) out.push(`Business goal: ${settings.business_goal.trim().slice(0, 200)}`);
  return out.map((l) => cleanCoachText(l));
}

function contextFrom(data: CoachData, why: string[]): ChatContext {
  const snapshot = buildSnapshot(data, detectFlags(data));
  const day = summarizeDay(data.today, data.items, data.versions, data.logs);
  return {
    snapshot,
    now: { time: formatTime(timeNY()), done: day.done, total: day.total, left: day.items.filter((r) => !r.done).map((r) => r.item.name) },
    why,
  };
}

async function recent(limit: number): Promise<CoachMessage[]> {
  const rows = await db.list("coach_message", { orderBy: "sent_at", ascending: false, limit });
  return rows.reverse();
}

async function usedQuotes(today: DateStr): Promise<string[]> {
  const rows = await db.list("coach_message", { from: addDays(today, -QUOTE_REST_DAYS), to: today, orderBy: "sent_at" });
  return quotesUsedSince(rows, addDays(today, -(QUOTE_REST_DAYS - 1)));
}

interface Answer {
  body: string;
  source: "ai" | "fallback";
  quote: string | null;
}

/** Ask the route. Offline or on any failure, answer here from the same rules. */
async function answer(ctx: ChatContext, turns: ChatTurn[], voice: CoachVoice, used: string[]): Promise<Answer> {
  try {
    const res = await fetch("/api/coach/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: ctx, turns, voice, used }),
    });
    if (res.ok) {
      const json = (await res.json()) as Partial<Answer>;
      if (typeof json.body === "string" && json.body.trim()) {
        return { body: cleanCoachText(json.body), source: json.source === "ai" ? "ai" : "fallback", quote: quoteByKey(json.quote) ? (json.quote as string) : null };
      }
    }
  } catch {
    // Fall through to the local version.
  }
  const local = chatFallback(turns[turns.length - 1].body, ctx, voice, used);
  return { body: local.body, source: "fallback", quote: local.quote };
}

/**
 * Save their message, get the coach's answer and save that too. Throws only
 * when their message could not be saved. The answer always arrives: from the
 * model, or from the rules.
 */
export async function sendMessage(text: string): Promise<void> {
  const body = text.replace(/\s+\n/g, "\n").trim().slice(0, MAX_MESSAGE);
  if (!body) return;
  const today = todayNY();
  await db.insert("coach_message", { date: today, sent_at: nowIso(), sender: "me", body, trigger: "chat", source: null, quote: null, check_key: null, read: true });

  const [data, why, settings, history, used] = await Promise.all([loadCoachData(today), loadWhy(), getSettings(), recent(MAX_TURNS), usedQuotes(today)]);
  if (!data) return;
  const turns: ChatTurn[] = history.map((m) => ({ sender: m.sender, body: m.body }));
  const reply = await answer(contextFrom(data, why), turns, voiceOf(settings?.coach_voice), used);
  await db.insert("coach_message", { date: todayNY(), sent_at: nowIso(), sender: "coach", body: reply.body, trigger: "chat", source: reply.source, quote: reply.quote, check_key: null, read: true });
}

// One run at a time, so two mounts cannot send the same check-in twice.
let checking: Promise<number> | null = null;

/**
 * Send the check-ins that are due and were not sent yet: after the workout
 * block, after a slip, after yesterday's misses. Safe to call often. Returns
 * how many were sent.
 */
export function syncCheckins(today: DateStr = todayNY()): Promise<number> {
  if (checking) return checking;
  const run = async (): Promise<number> => {
    const settings = await getSettings();
    const enabled = checkinsOf(settings?.coach_checkins);
    if (!enabled.post_workout && !enabled.slip && !enabled.missed_item) return 0;
    const data = await loadCoachData(today);
    if (!data || today < data.historyStart) return 0;
    const sentRows = await db.list("coach_message", { from: addDays(today, -1), to: today });
    const day = summarizeDay(today, data.items, data.versions, data.logs);
    const main = data.workouts.find((w) => w.weekday === weekdayOf(today) && w.slot === "main") ?? null;
    const due = dueCheckins({
      today,
      time: timeNY(),
      enabled,
      voice: voiceOf(settings?.coach_voice),
      blocks: data.blocks,
      workoutName: main && main.kind !== "rest" ? main.name : null,
      workoutDone: day.items.some((r) => r.item.key === "workout" && r.done),
      slips: data.slips
        .filter((s) => s.date === today)
        .map((s) => ({ id: s.id, vice: viceName(data.items.find((i) => i.id === s.item_id)?.name ?? "a vice"), time: s.time, trigger: s.trigger?.trim() || null })),
      yesterday: buildSnapshot(data, []).yesterday,
      sent: new Set(sentRows.map((m) => m.check_key).filter((k): k is string => !!k)),
    });
    let sent = 0;
    const base = Date.now();
    for (const [i, c] of due.entries()) {
      try {
        // A millisecond apart, so they keep this order in the thread.
        await db.insert("coach_message", { date: today, sent_at: new Date(base + i).toISOString(), sender: "coach", body: c.body, trigger: c.trigger, source: "fallback", quote: null, check_key: c.check_key, read: false });
        sent += 1;
      } catch (e) {
        // Another device sent this one first.
        if (!isUniqueViolation(e)) throw e;
      }
    }
    return sent;
  };
  const next = run();
  checking = next;
  void next.catch(() => undefined).finally(() => {
    if (checking === next) checking = null;
  });
  return next;
}

/** The chat was opened: nothing is unread any more. */
export async function markRead(ids: readonly string[]): Promise<void> {
  for (const id of ids) await db.update("coach_message", id, { read: true }).catch(() => undefined);
}

export async function setVoice(voice: CoachVoice): Promise<void> {
  await updateSettings({ coach_voice: voice });
}

export async function setCheckin(current: CoachCheckins, key: keyof CoachCheckins, on: boolean): Promise<void> {
  await updateSettings({ coach_checkins: { ...current, [key]: on } });
}
