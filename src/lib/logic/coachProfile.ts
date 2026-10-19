// The running profile the coach keeps on you: your why, what sets off slips,
// what has actually gotten you moving, what you are working on, things you
// said that mattered. This file is the rules around it: what a note looks
// like, when two notes are the same, how a model is asked for new ones and
// how its answer is read.
//
// Pure. No React, no db.

import { PROFILE_KINDS, type ProfileKind } from "../types";
import { cleanCoachText } from "./coach";

export interface ProfileNote {
  kind: ProfileKind;
  body: string;
}

export const PROFILE_LABEL: Record<ProfileKind, string> = {
  why: "Your why",
  trigger: "What sets off slips",
  what_works: "What gets you moving",
  working_on: "What you are working on",
  said: "Things you said that mattered",
};

export const MIN_NOTE = 6;
export const MAX_NOTE = 160;
/** The profile stops growing here, per kind. The oldest note of a kind goes first. */
export const MAX_PER_KIND = 12;

export function isProfileKind(v: unknown): v is ProfileKind {
  return typeof v === "string" && (PROFILE_KINDS as readonly string[]).includes(v);
}

/** A note as it is stored: one line, plain text, no dashes, a sensible length. Null when nothing is left. */
export function cleanNote(input: { kind?: unknown; body?: unknown }): ProfileNote | null {
  if (!isProfileKind(input.kind) || typeof input.body !== "string") return null;
  const body = cleanCoachText(input.body).replace(/\s+/g, " ").trim().slice(0, MAX_NOTE).replace(/[\s,;:]+$/, "");
  return body.length >= MIN_NOTE ? { kind: input.kind, body } : null;
}

// ---------- the same note twice ----------

const STOP = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "at", "for", "my", "i", "me", "is", "it", "that", "this", "with", "be", "so", "when", "he", "she", "they", "you", "your", "his", "her", "was", "are", "do", "does", "not"]);

function tokens(body: string): string[] {
  return body
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    // Crude stem: "slips" and "slip", "running" and "run".
    .map((t) => t.replace(/ies$/, "y").replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1"));
}

function normal(body: string): string {
  return body.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** True when two notes say the same thing: the same words, one inside the other, or mostly the same words. */
export function sameNote(a: string, b: string): boolean {
  const x = normal(a);
  const y = normal(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 12 && long.includes(short)) return true;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared) >= 0.6;
}

export interface Stored extends ProfileNote {
  id: string;
}

export interface DedupeResult {
  /** Notes that are new. */
  add: ProfileNote[];
  /** Ids of stored notes that were said again: refresh their date, keep the row. */
  touch: string[];
}

/**
 * Sort new notes into ones to add and ones already known. A note counts as
 * known when it matches any stored note, whatever its kind, or an earlier
 * note in the same batch. At most two are added.
 */
export function dedupeNotes(existing: readonly Stored[], incoming: readonly ProfileNote[]): DedupeResult {
  const add: ProfileNote[] = [];
  const touch = new Set<string>();
  for (const raw of incoming) {
    const note = cleanNote(raw);
    if (!note) continue;
    const known = existing.find((e) => sameNote(e.body, note.body));
    if (known) {
      touch.add(known.id);
      continue;
    }
    if (add.some((a) => sameNote(a.body, note.body))) continue;
    if (add.length < 2) add.push(note);
  }
  return { add, touch: [...touch] };
}

/** The ids to delete so no kind keeps more than the cap, oldest first. `updated` decides what is oldest. */
export function overflow(entries: readonly (Stored & { updated_at: string })[]): string[] {
  const out: string[] = [];
  for (const kind of PROFILE_KINDS) {
    const own = entries.filter((e) => e.kind === kind).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    for (const e of own.slice(MAX_PER_KIND)) out.push(e.id);
  }
  return out;
}

// ---------- for the coach's context ----------

export interface ProfileLine {
  kind: ProfileKind;
  body: string;
}

/** What goes into the prompt: newest first within a kind, a few of each, the why first. */
export function profileLines(entries: readonly (Stored & { updated_at: string })[]): ProfileLine[] {
  const out: ProfileLine[] = [];
  for (const kind of PROFILE_KINDS) {
    entries
      .filter((e) => e.kind === kind)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .slice(0, kind === "said" ? 4 : 5)
      .forEach((e) => out.push({ kind, body: e.body }));
  }
  return out;
}

// ---------- asking a model for new notes ----------

const EXTRACT_SYSTEM = [
  "You keep a short profile on one person for their coach. You are shown what they just said, and the conversation before it. Pick out at most two things worth remembering for months, not for today.",
  "Kinds",
  "why: the real reason this matters to them, in their own words",
  "trigger: what sets off a slip or a bad day (a time, a place, a feeling, a person, being alone, money, sleep)",
  "what_works: something that actually got them moving or through a hard moment",
  "working_on: a goal or habit they are working on now",
  "said: a thing they said that mattered and the coach should be able to play back later",
  "Rules",
  "Only what they said or clearly meant. Do not guess, diagnose or infer a feeling they did not state. Nothing about how they felt in the moment, no moods, no passing complaints, no jokes.",
  "Leave out anything about self harm, hopelessness or a crisis. Leave out other people's private details.",
  "Each note is one short plain sentence, 12 words or fewer, using their own words where you can. No dashes, no quotes, no names unless they gave one.",
  "When nothing is worth keeping, answer [].",
  "Answer with a JSON array only, for example [{\"kind\":\"trigger\",\"body\":\"Slips after a late delivery shift\"}]. No other text.",
].join("\n");

export interface ExtractPrompt {
  system: string;
  user: string;
  maxTokens: number;
}

/** The small extra model call: the message, a little of the conversation, and what is already known. */
export function extractPrompt(message: string, recent: readonly { sender: "me" | "coach"; body: string }[], known: readonly ProfileLine[]): ExtractPrompt {
  const talk = recent
    .slice(-6)
    .map((t) => `${t.sender === "me" ? "Them" : "Coach"}: ${t.body.replace(/\s+/g, " ").trim().slice(0, 300)}`)
    .join("\n");
  const have = known.length > 0 ? known.map((k) => `${k.kind}: ${k.body}`).join("\n") : "Nothing yet.";
  return {
    system: EXTRACT_SYSTEM,
    user: `<already_known>\n${have}\n</already_known>\n\n<conversation>\n${talk}\n</conversation>\n\n<they_just_said>\n${message.replace(/\s+/g, " ").trim().slice(0, 600)}\n</they_just_said>\n\nAnswer with the JSON array only.`,
    maxTokens: 250,
  };
}

/** Read a model's answer. Anything that is not a clean list of notes gives []. At most two. */
export function parseNotes(raw: string): ProfileNote[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ProfileNote[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const note = cleanNote(item as { kind?: unknown; body?: unknown });
    if (note && !out.some((o) => sameNote(o.body, note.body))) out.push(note);
    if (out.length === 2) break;
  }
  return out;
}
