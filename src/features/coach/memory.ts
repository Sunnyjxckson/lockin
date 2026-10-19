// What the coach keeps between conversations, on the client: the profile, the
// commitments, the mood log. No React.
//
// All of it degrades. A read that fails (in Supabase mode, migration 0016 has
// not been run) is an empty list, and a write that fails is swallowed where
// the coach is doing it on its own, so the chat and Today never break because
// a table is missing. The coach notes page shows one plain line when it
// cannot read the profile.

import { db } from "@/lib/db";
import { commitmentLines, commitmentReply, type CommitmentLine, type ParsedCommitment } from "@/lib/logic/coachCommit";
import type { CommitmentItem, MoodItem, ProfileItem } from "@/lib/logic/coachChat";
import { moodHistory } from "@/lib/logic/coachMood";
import { cleanNote, dedupeNotes, overflow, profileLines, type ProfileNote } from "@/lib/logic/coachProfile";
import { addDays, nowIso, timeNY, todayNY } from "@/lib/logic/dates";
import type { CoachCommitment, CoachProfileEntry, CoachVoice, DateStr, MoodLog, NewRow, ProfileKind } from "@/lib/types";

// ---------- profile ----------

export async function loadProfile(): Promise<CoachProfileEntry[]> {
  try {
    return await db.list("coach_profile", { orderBy: "updated_at", ascending: false, limit: 200 });
  } catch {
    return [];
  }
}

/**
 * Keep what the model picked out of a message. Cleaned and deduped against
 * what is stored: a note said again only refreshes the old one. Never throws.
 */
export async function saveProfileNotes(notes: unknown): Promise<void> {
  if (!Array.isArray(notes) || notes.length === 0) return;
  try {
    const incoming = notes.map((n) => cleanNote(n as { kind?: unknown; body?: unknown })).filter((n): n is ProfileNote => n !== null);
    if (incoming.length === 0) return;
    const existing = await loadProfile();
    const { add, touch } = dedupeNotes(existing, incoming);
    const at = nowIso();
    for (const id of touch) await db.update("coach_profile", id, { updated_at: at });
    for (const n of add) await db.insert("coach_profile", { kind: n.kind, body: n.body, updated_at: at });
    if (add.length > 0) {
      for (const id of overflow(await loadProfile())) await db.remove("coach_profile", id);
    }
  } catch {
    // The coach just does not remember this one.
  }
}

/** For the prompt: a few of each kind, the why first. */
export function profileForPrompt(entries: readonly CoachProfileEntry[]): ProfileItem[] {
  return profileLines(entries).map((p) => ({ kind: p.kind, body: p.body }));
}

export async function addProfileEntry(kind: ProfileKind, body: string): Promise<boolean> {
  const note = cleanNote({ kind, body });
  if (!note) return false;
  await db.insert("coach_profile", { kind: note.kind, body: note.body, updated_at: nowIso() });
  return true;
}

export async function editProfileEntry(id: string, kind: ProfileKind, body: string): Promise<boolean> {
  const note = cleanNote({ kind, body });
  if (!note) return false;
  await db.update("coach_profile", id, { kind: note.kind, body: note.body, updated_at: nowIso() });
  return true;
}

export async function deleteProfileEntry(id: string): Promise<void> {
  await db.remove("coach_profile", id);
}

// ---------- commitments ----------

export async function loadCommitments(): Promise<CoachCommitment[]> {
  try {
    return await db.list("coach_commitment", { orderBy: "due_at", ascending: false, limit: 60 });
  } catch {
    return [];
  }
}

/** Save what they said they would do. Never throws. */
export async function saveCommitment(c: ParsedCommitment): Promise<void> {
  try {
    await db.insert("coach_commitment", { body: c.body, made_on: c.made_on, due_at: c.due_at, status: "open", asked_at: null });
  } catch {
    // Not remembered. The chat carries on.
  }
}

export function commitmentsForPrompt(rows: readonly CoachCommitment[], today: DateStr, now: Date = new Date()): CommitmentItem[] {
  return commitmentLines(rows, today, now).map((c: CommitmentLine) => ({ what: c.what, when: c.when, status: c.status, waiting: c.waiting }));
}

/** The commitment the coach asked about last and that is still open: what a reply in the chat is about. */
export function askedCommitment(rows: readonly CoachCommitment[]): CoachCommitment | null {
  return rows.filter((c) => c.status === "open" && c.asked_at).sort((a, b) => (a.asked_at as string) < (b.asked_at as string) ? 1 : -1)[0] ?? null;
}

/** Mark it done or missed, and the coach answers in the chat: a win noticed, or no shame and a way forward. */
export async function answerCommitment(id: string, status: "done" | "missed", voice: CoachVoice): Promise<void> {
  const row = await db.get("coach_commitment", id);
  if (!row || row.status !== "open") return;
  await db.update("coach_commitment", id, { status, asked_at: row.asked_at ?? nowIso() });
  await db.insert("coach_message", {
    date: todayNY(),
    sent_at: nowIso(),
    sender: "coach",
    body: commitmentReply(status, voice),
    trigger: "chat",
    source: "fallback",
    quote: null,
    check_key: null,
    read: true,
  });
}

/** Ask-time bookkeeping: stamp a commitment as asked, or let a stale one go. */
export async function markAsked(id: string): Promise<void> {
  await db.update("coach_commitment", id, { asked_at: nowIso() }).catch(() => undefined);
}

export async function dropCommitment(id: string): Promise<void> {
  await db.update("coach_commitment", id, { status: "dropped" }).catch(() => undefined);
}

// ---------- mood ----------

/** The last two weeks of mood entries. Empty when the table cannot be read. */
export async function loadMoods(today: DateStr = todayNY()): Promise<MoodLog[]> {
  try {
    return await db.list("mood_log", { from: addDays(today, -13), to: today, orderBy: "date" });
  } catch {
    return [];
  }
}

export async function logMood(mood: number, note: string): Promise<MoodLog> {
  const row: NewRow<"mood_log"> = { date: todayNY(), time: timeNY(), mood: Math.min(5, Math.max(1, Math.round(mood))), note: note.trim().slice(0, 200) || null };
  return db.insert("mood_log", row);
}

export async function setMoodNote(id: string, note: string): Promise<void> {
  await db.update("mood_log", id, { note: note.trim().slice(0, 200) || null });
}

export function moodsForPrompt(logs: readonly MoodLog[], today: DateStr): MoodItem[] {
  return moodHistory(logs, today).map((d) => ({ date: d.date, label: d.label, mood: d.mood, note: d.note }));
}
