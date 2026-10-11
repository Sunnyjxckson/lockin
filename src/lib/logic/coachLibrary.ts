// Lines from the Library the coach may quote, next to its own (coachQuotes).
// Pure. The screen that sends a message picks a few candidates for what the
// message is about and hands them to the prompt, the reply checks and the
// rule-based answer. A quote on screen is always word for word from
// coachQuotes or from these candidates, and never one used this week.
//
// Injury, emergency and "more than a bad day" never get here: the callers ask
// for no candidates for them (`momentsFor` answers none), and the checks in
// coachChat return before looking at the library for a careful reply.

import { daySeed, seeded } from "./libraryQueue";
import type { Moment } from "./library";
import type { ShortPool } from "./drops";
import type { DateStr } from "../types";

/** A library line the coach may use in this reply. */
export interface LibCandidate {
  /** "lib:" and the quote id. The key a coach message keeps in `quote`, so a line rests for a week like the others. */
  key: string;
  text: string;
  /** Who said it. */
  by: string;
  /** He saved it. */
  saved?: boolean;
}

export const LIB_PREFIX = "lib:";
/** At most this many go into a prompt. */
export const MAX_CANDIDATES = 6;
const MAX_TEXT = 260;
const MAX_BY = 60;

export function libKey(id: string): string {
  return `${LIB_PREFIX}${id}`;
}

/** The quote id a message's `quote` key points at, or null when it is one of the coach's own lines. */
export function libId(key: string | null | undefined): string | null {
  return key && key.startsWith(LIB_PREFIX) && key.length > LIB_PREFIX.length ? key.slice(LIB_PREFIX.length) : null;
}

export function isLibKey(key: unknown): key is string {
  return typeof key === "string" && /^lib:[A-Za-z0-9._-]{1,120}$/.test(key);
}

// ---------- what a message is about, in the Library's moments ----------

const WORDS: [Moment, RegExp][] = [
  ["angry", /\b(angry|anger|mad|furious|pissed|rage|resent\w*|annoyed|irritated)\b/i],
  ["alone", /\b(alone|lonely|loneliness|nobody|no one|isolated|left out)\b/i],
  ["afraid", /\b(scared|afraid|fear\w*|anxious|anxiety|nervous|worried|worry|dread\w*|panic\w*)\b/i],
  ["overwhelmed", /\b(overwhelm\w*|too much|stressed|swamped|behind on|buried|can'?t keep up)\b/i],
  ["doubting", /\b(doubt\w*|not good enough|can'?t do (this|it)|what'?s the point|am i (even|really)|imposter|impostor|give up|giving up)\b/i],
  ["broke", /\b(broke|no money|can'?t afford|bills?|debt|rent)\b/i],
  ["tempted", /\b(tempt\w*|crav\w*|urge|want to (smoke|drink)|about to)\b/i],
  ["tired", /\b(tired|exhausted|drained|wiped|burn(ed|t) out|no energy)\b/i],
];

const BY_TOPIC: Record<string, Moment[]> = {
  pain: ["tired", "doubting"],
  urge: ["tempted"],
  slipped: ["doubting"],
  hungry: ["tempted"],
  tired: ["tired", "overwhelmed"],
  unmotivated: ["doubting", "tired"],
  money: ["broke", "overwhelmed"],
  study: ["overwhelmed", "tired"],
  general: ["doubting", "overwhelmed"],
};

/**
 * The Library moments a message is about, most specific first: what the words
 * say, then what the coach's topic suggests. Nothing for a win, and nothing
 * for the safety topics: they never carry a quote.
 */
export function momentsFor(topic: string, message: string): Moment[] {
  if (topic === "care" || topic === "emergency" || topic === "injury" || topic === "win") return [];
  const said = WORDS.filter(([, re]) => re.test(message)).map(([m]) => m);
  return [...new Set([...said, ...(BY_TOPIC[topic] ?? [])])];
}

// ---------- picking candidates ----------

export interface PickInput {
  topic: string;
  message: string;
  /** Quote ids he saved. They come first: he picked them. */
  saved: ReadonlySet<string>;
  /** Quote ids he has read. A line he has not read comes before one he has. */
  read: ReadonlySet<string>;
  /** Keys used by coach messages this week. */
  used: readonly string[];
  date: DateStr;
  count?: number;
}

/**
 * A few lines that fit the moment, from the short set. Saved first, then
 * unread, then the rest; each group in an order that is the same for the same
 * message on the same day. The laws are left out (they are sayings, not
 * advice). Lines used this week are left out.
 */
export function pickCandidates(pool: ShortPool, input: PickInput): LibCandidate[] {
  const moments = momentsFor(input.topic, input.message);
  if (moments.length === 0) return [];
  const used = new Set(input.used);
  const fits = pool.quotes.filter((q) => q.w !== "laws" && !used.has(libKey(q.id)) && q.m.some((m) => moments.includes(m as Moment)));
  const rank = (id: string) => (input.saved.has(id) ? 0 : input.read.has(id) ? 2 : 1);
  const rand = seeded(daySeed(input.date, input.message.length * 17));
  const keyed = fits.map((q) => ({ q, r: rank(q.id), tie: rand(), first: q.m.findIndex((m) => moments.includes(m as Moment)) }));
  // Saved, unread, read. Within a group the most specific moment first, then the day's order.
  keyed.sort((a, b) => a.r - b.r || moments.indexOf(a.q.m[a.first] as Moment) - moments.indexOf(b.q.m[b.first] as Moment) || a.tie - b.tie);
  return keyed.slice(0, input.count ?? MAX_CANDIDATES).map(({ q, r }) => ({ key: libKey(q.id), text: q.t, by: pool.names[q.w] ?? q.w, ...(r === 0 ? { saved: true } : {}) }));
}

// ---------- reading what was quoted ----------

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function opening(text: string): string {
  return norm(text).split(" ").slice(0, 6).join(" ");
}

/** Keys of the candidates a text quotes in full, word for word (ignoring case and marks). */
export function libraryQuotesIn(text: string, library: readonly LibCandidate[]): string[] {
  const t = norm(text);
  return library.filter((c) => t.includes(norm(c.text))).map((c) => c.key);
}

/** Candidates whose opening is in the text but whose whole line is not: a line that was reworded or cut. */
export function misquotedFrom(text: string, library: readonly LibCandidate[]): LibCandidate[] {
  const t = norm(text);
  return library.filter((c) => t.includes(opening(c.text)) && !t.includes(norm(c.text)));
}

/** The line a candidate becomes in a message: the words in quotes, then who said it. */
export function candidateLine(c: LibCandidate): string {
  return `"${c.text}" ${c.by}.`;
}

/** The candidates a request carried, checked: the right shape and a sensible size. Anything else is dropped. */
export function cleanCandidates(v: unknown): LibCandidate[] {
  if (!Array.isArray(v)) return [];
  const out: LibCandidate[] = [];
  for (const c of v.slice(0, MAX_CANDIDATES + 2)) {
    if (!c || typeof c !== "object") continue;
    const { key, text, by, saved } = c as Partial<LibCandidate>;
    if (!isLibKey(key) || typeof text !== "string" || typeof by !== "string") continue;
    if (text.length < 8 || text.length > MAX_TEXT || text.includes('"') || by.length === 0 || by.length > MAX_BY) continue;
    out.push({ key, text, by, ...(saved === true ? { saved: true } : {}) });
  }
  return out;
}
