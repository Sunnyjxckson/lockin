// The coach chat on the client: build what the coach knows right now, send a
// message and save the answer, and send the check-ins that are due. No React.

import { db, isUniqueViolation } from "@/lib/db";
import { getSettings, updateSettings } from "@/lib/db/helpers";
import { buildSnapshot, cleanCoachText, viceName, type CoachData } from "@/lib/logic/coach";
import {
  MAX_MESSAGE,
  MAX_TURNS,
  careInPlay,
  chatFallback,
  checkinsOf,
  classifyMessage,
  driftCheckins,
  dueCheckins,
  quotesUsedSince,
  scheduleNow,
  voiceOf,
  type Checkin,
  type ChatContext,
  type ChatTurn,
  type CoachMode,
} from "@/lib/logic/coachChat";
import { commitmentAnswer, commitmentAsk, commitmentSteps, parseCommitment } from "@/lib/logic/coachCommit";
import { DRIFT_KINDS } from "@/lib/logic/coach";
import { detectFlags } from "@/lib/logic/coachFlags";
import type { LibCandidate } from "@/lib/logic/coachLibrary";
import { recurringStruggle } from "@/lib/logic/coachMood";
import { quoteByKey } from "@/lib/logic/coachQuotes";
import { addDays, formatTime, isQuiet, nowIso, timeNY, todayNY, weekdayOf } from "@/lib/logic/dates";
import { summarizeDay } from "@/lib/logic/day";
import type { CoachCheckins, CoachMessage, CoachVoice, DateStr, NewRow } from "@/lib/types";
import { loadCoachData } from "./data";
import {
  askedCommitment,
  commitmentsForPrompt,
  dropCommitment,
  loadCommitments,
  loadMoods,
  loadProfile,
  markAsked,
  moodsForPrompt,
  profileForPrompt,
  saveCommitment,
  saveProfileNotes,
} from "./memory";


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

/** What the coach has been told and what it has been holding them to. Every part is empty when its table cannot be read. */
interface Extras {
  profile: ChatContext["profile"];
  commitments: ChatContext["commitments"];
  moods: ChatContext["moods"];
  recurring: boolean;
}

function contextFrom(data: CoachData, why: string[], extras: Extras): ChatContext {
  const snapshot = buildSnapshot(data, detectFlags(data));
  const day = summarizeDay(data.today, data.items, data.versions, data.logs);
  const where = scheduleNow(data.blocks, timeNY());
  return {
    snapshot,
    now: { time: formatTime(timeNY()), done: day.done, total: day.total, left: day.items.filter((r) => !r.done).map((r) => r.item.name), block: where.block, next: where.next },
    why,
    profile: extras.profile,
    commitments: extras.commitments,
    moods: extras.moods,
    recurring: extras.recurring,
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
  mode: CoachMode | null;
  /** Durable things the model picked out of their message, to be saved to the profile. */
  notes: unknown[];
}

/** Ask the route. Offline or on any failure, answer here from the same rules. */
async function answer(ctx: ChatContext, turns: ChatTurn[], voice: CoachVoice, used: string[], library: LibCandidate[]): Promise<Answer> {
  try {
    const res = await fetch("/api/coach/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: ctx, turns, voice, used, library }),
    });
    if (res.ok) {
      const json = (await res.json()) as Partial<Answer>;
      if (typeof json.body === "string" && json.body.trim()) {
        return {
          body: cleanCoachText(json.body),
          source: json.source === "ai" ? "ai" : "fallback",
          quote: quoteByKey(json.quote) || library.some((c) => c.key === json.quote) ? (json.quote as string) : null,
          mode: json.mode === "push" || json.mode === "support" || json.mode === "unclear" ? json.mode : null,
          notes: Array.isArray(json.notes) ? json.notes : [],
        };
      }
    }
  } catch {
    // Fall through to the local version.
  }
  const local = chatFallback(turns[turns.length - 1].body, ctx, voice, used, library, turns);
  return { body: local.body, source: "fallback", quote: local.quote, mode: local.mode ?? null, notes: [] };
}

/**
 * A few lines from the Library for what the message is about. None for injury,
 * an emergency, or anything that sounds like more than a bad day: those never
 * carry a quote. The Library is fetched here, when a message is sent, and not
 * before, so it is not part of any screen's first load.
 */
async function libraryLines(message: string, turns: readonly ChatTurn[], used: readonly string[]): Promise<LibCandidate[]> {
  const topic = classifyMessage(message);
  if (topic === "care" || topic === "emergency" || topic === "injury" || careInPlay(turns.slice(-6))) return [];
  try {
    const { libraryLinesFor } = await import("@/features/library/coachPicks");
    return await libraryLinesFor(message, topic, used, todayNY());
  } catch {
    return [];
  }
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
  const turns: ChatTurn[] = history.map((m) => (m.sender === "coach" && m.trigger !== "chat" ? { sender: m.sender, body: m.body, trigger: m.trigger } : { sender: m.sender, body: m.body }));
  await keepWhatTheySaid(body, turns, data);
  const extras = await loadExtras(today);
  const reply = await answer(contextFrom(data, why, extras), turns, voiceOf(settings?.coach_voice), used, await libraryLines(body, turns, used));
  await db.insert("coach_message", { date: todayNY(), sent_at: nowIso(), sender: "coach", body: reply.body, trigger: "chat", source: reply.source, quote: reply.quote, check_key: null, read: true });
  void saveProfileNotes(reply.notes);
}

/** The profile, the commitments and the last week of mood, for the context. */
async function loadExtras(today: DateStr): Promise<Extras> {
  const [profile, commitments, moods] = await Promise.all([loadProfile(), loadCommitments(), loadMoods(today)]);
  return {
    profile: profileForPrompt(profile),
    commitments: commitmentsForPrompt(commitments, today),
    moods: moodsForPrompt(moods, today),
    recurring: recurringStruggle(moods, today),
  };
}

/** How long after the coach asked a reply still counts as the answer. */
const ANSWER_WINDOW_MS = 12 * 3_600_000;

/**
 * What a message says about commitments. If it answers one the coach asked
 * about ("yeah did it", "no, got stuck at work"), that one is marked. If it
 * says they will do something at a time ("lifting at 6:30"), that is saved,
 * unless the conversation is heavy: then they are just talked to.
 */
async function keepWhatTheySaid(body: string, turns: readonly ChatTurn[], data: CoachData): Promise<void> {
  try {
    const topic = classifyMessage(body);
    if (topic === "care" || topic === "emergency" || topic === "injury" || topic === "therapist" || careInPlay(turns.slice(-6))) return;
    const rows = await loadCommitments();
    const asked = askedCommitment(rows);
    const verdict = asked && asked.asked_at && Date.now() - new Date(asked.asked_at).getTime() <= ANSWER_WINDOW_MS ? commitmentAnswer(body) : null;
    if (asked && verdict) {
      await db.update("coach_commitment", asked.id, { status: verdict });
      return;
    }
    const parsed = parseCommitment(body, { date: data.today, time: timeNY(), blocks: data.blocks });
    if (parsed) await saveCommitment(parsed);
  } catch {
    // The message was still sent and will be answered.
  }
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
    if (!Object.values(enabled).some(Boolean)) return 0;
    const data = await loadCoachData(today);
    if (!data || today < data.historyStart) return 0;
    const sentRows = await db.list("coach_message", { from: addDays(today, -1), to: today });
    const day = summarizeDay(today, data.items, data.versions, data.logs);
    const main = data.workouts.find((w) => w.weekday === weekdayOf(today) && w.slot === "main") ?? null;
    const voice = voiceOf(settings?.coach_voice);
    const time = timeNY();
    const quiet = isQuiet(time, settings?.quiet_start ?? "22:00", settings?.quiet_end ?? "07:00");
    const sent = new Set(sentRows.map((m) => m.check_key).filter((k): k is string => !!k));
    const drift = enabled.drift ? detectFlags(data).filter((f) => DRIFT_KINDS.includes(f.kind)) : [];
    const due: Checkin[] = dueCheckins({
      today,
      time: timeNY(),
      enabled,
      voice,
      blocks: data.blocks,
      workoutName: main && main.kind !== "rest" ? main.name : null,
      workoutDone: day.items.some((r) => r.item.key === "workout" && r.done),
      slips: data.slips
        .filter((s) => s.date === today)
        .map((s) => ({ id: s.id, vice: viceName(data.items.find((i) => i.id === s.item_id)?.name ?? "a vice"), time: s.time, trigger: s.trigger?.trim() || null })),
      yesterday: buildSnapshot(data, []).yesterday,
      sent,
      driftCoversMisses: drift.some((f) => f.kind === "missed_streak"),
    });

    // Reaching out when they drift: going quiet, missed days running, a mood sliding. One a day, not in quiet hours.
    due.push(
      ...driftCheckins({
        flags: drift,
        voice,
        today,
        quiet,
        sent,
        sentToday: sentRows.some((m) => m.date === today && m.check_key?.startsWith("drift:")),
      }),
    );

    // Asking after what they said they would do, once it is due.
    const asking = new Map<string, string>();
    if (enabled.commitment) {
      const rows = await loadCommitments();
      for (const step of commitmentSteps(rows, new Date())) {
        if (step.action === "drop") {
          await dropCommitment(step.id);
          continue;
        }
        const row = rows.find((r) => r.id === step.id);
        if (!row || quiet) continue;
        const key = `commit:${row.id}`;
        asking.set(key, row.id);
        if (!sent.has(key)) due.push({ trigger: "commitment", check_key: key, body: commitmentAsk(row, today, voice) });
      }
    }

    let count = 0;
    const base = Date.now();
    for (const [i, c] of due.entries()) {
      try {
        // A millisecond apart, so they keep this order in the thread.
        await insertCheckin({ date: today, sent_at: new Date(base + i).toISOString(), sender: "coach", body: c.body, trigger: c.trigger, source: "fallback", quote: null, check_key: c.check_key, read: false });
        count += 1;
      } catch (e) {
        // Another device sent this one first.
        if (!isUniqueViolation(e)) throw e;
      }
      const id = asking.get(c.check_key);
      if (id) await markAsked(id);
    }
    // A commitment whose question went out earlier but was never stamped (another device, a reload): stamp it now.
    for (const [key, id] of asking) if (sent.has(key)) await markAsked(id);
    return count;
  };
  const next = run();
  checking = next;
  void next.catch(() => undefined).finally(() => {
    if (checking === next) checking = null;
  });
  return next;
}

/**
 * Save a check-in. Migration 0016 widens the reasons a coach message may have
 * (commitment, drift). Before it has been run the database refuses those two,
 * so they are saved as a plain chat message instead and the label comes from
 * the check key.
 */
async function insertCheckin(row: NewRow<"coach_message">): Promise<void> {
  try {
    await db.insert("coach_message", row);
  } catch (e) {
    if (isUniqueViolation(e) || (row.trigger !== "commitment" && row.trigger !== "drift")) throw e;
    await db.insert("coach_message", { ...row, trigger: "chat" });
  }
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
