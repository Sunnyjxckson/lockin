// Commitments: something you told the coach you would do. "Lifting at 6:30",
// "I'm gonna study after class", "I will call her tonight". Rule based, so it
// works with no key and offline. A statement needs two things to count: it
// says you will do something, and it says when.
//
// Pure. No React, no db.

import { WEEKDAY_NAMES, type CoachCommitment, type CoachVoice, type DateStr, type IsoStr, type TimeStr } from "../types";
import { addDays, addMinutes, formatTime, minutesOf, nyInstant, nyParts, weekdayOf } from "./dates";
import { mentionsVice } from "./coachChat";

export interface CommitBlock {
  block_name: string;
  start: TimeStr;
  end: TimeStr;
  kind: string;
}

export interface CommitContext {
  date: DateStr;
  /** Now, 24 hour. */
  time: TimeStr;
  /** Today's schedule blocks. "After class" is read from these. */
  blocks: readonly CommitBlock[];
}

export interface ParsedCommitment {
  /** What they said they would do, short and plain. */
  body: string;
  made_on: DateStr;
  due_at: IsoStr;
  /** The due time as written for the check-back, in New York. */
  due_date: DateStr;
  due_time: TimeStr;
}

// ---------- what counts as a statement of intent ----------

const INTENT =
  /\b(i(?:'| a)?ll|i will|i(?:'| a)?m (?:gonna|going to|about to)|im (?:gonna|going to)|i am (?:gonna|going to)|gonna|going to|i plan to|planning to|i promise|i(?:'| ha)?ve got to|i have to|i need to|i(?:'| a)?m (?:lifting|studying|working out|training|running|hitting|doing|heading|cooking|calling|writing|cleaning|starting|finishing|walking|reading|meal prepping|going to the))\b/i;
/** "Lifting at 6:30" with no "I'm" in front. */
const BARE = /^(?:ok(?:ay)?,?\s+|so\s+|and\s+|then\s+)?(lifting|studying|working out|training|running|cooking|reading|writing|walking|cleaning|meal prep(?:ping)?|going to the gym|hitting the gym|gym|lift|study|workout)\b/i;
/** Not a promise: a question, a denial, the past, or giving up. */
const NOT_A_PROMISE =
  /\?|\b(not|never|won'?t|wont|can'?t|cant|don'?t|dont|ain'?t|wasn'?t|weren'?t|didn'?t|did not|couldn'?t|no way)\b|\b(yesterday|last night|last week|earlier|already did)\b|\b(skip|quit|cancel|bail|ditch|sleep in|give up|giving up|nap|stop)\b/i;

// ---------- when ----------

const SPOKEN: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5 };

const CLOCK = /(\b(?:at|by|around|before|@)\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d:])/gi;
const IN_SPAN = /\bin\s+(an?|half an|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\s*(min(?:ute)?s?|hours?|hrs?)\b/i;
const AFTER = /\bafter\s+(?:my\s+|the\s+)?(class|work|school|the gym|gym|my shift|shift|lunch|dinner|practice)\b/i;

interface Moment {
  date: DateStr;
  time: TimeStr;
  /** The words that said it, to cut out of the action. */
  words: string[];
}

function clockMoment(text: string, ctx: CommitContext, tomorrow: boolean): Moment | null {
  const nowMin = minutesOf(ctx.time);
  for (const m of text.matchAll(CLOCK)) {
    const prefixed = !!m[1];
    const hasMinutes = m[3] !== undefined;
    const meridiem = m[4]?.replace(/\./g, "").toLowerCase();
    if (!prefixed && !hasMinutes && !meridiem) continue;
    let h = Number(m[2]);
    const mi = hasMinutes ? Number(m[3]) : 0;
    if (mi > 59) continue;
    if (meridiem) {
      if (h < 1 || h > 12) continue;
      h = (h % 12) + (meridiem === "pm" ? 12 : 0);
    } else if (h > 23) {
      continue;
    }
    let date = tomorrow ? addDays(ctx.date, 1) : ctx.date;
    if (!meridiem && h >= 1 && h <= 12) {
      // "6:30" with no am or pm: the next one that has not passed yet.
      const am = (h % 12) * 60 + mi;
      const pm = am + 720;
      if (tomorrow) {
        h = h >= 4 && h <= 11 ? h % 12 : (h % 12) + 12;
      } else if (am > nowMin && h !== 12) {
        h = h % 12;
      } else if (pm > nowMin) {
        h = (h % 12) + 12;
      } else {
        // Both have passed today, so it is tomorrow. A small hour is a morning.
        date = addDays(ctx.date, 1);
        h = h >= 4 && h <= 11 ? h % 12 : (h % 12) + 12;
      }
    } else if (!tomorrow && h * 60 + mi <= nowMin) {
      date = addDays(ctx.date, 1);
    }
    const time = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    return { date, time, words: [m[0].trim()] };
  }
  return null;
}

const DAYPARTS: [RegExp, TimeStr][] = [
  [/\btonight\b/i, "20:00"],
  [/\bthis evening\b/i, "18:30"],
  [/\bthis afternoon\b/i, "15:00"],
  [/\bthis morning\b/i, "10:00"],
  [/\bafter lunch\b/i, "13:30"],
];
const TOMORROW_PARTS: [RegExp, TimeStr][] = [
  [/\btomorrow (?:morning|am)\b/i, "08:00"],
  [/\btomorrow (?:afternoon)\b/i, "15:00"],
  [/\btomorrow (?:evening|night)\b/i, "19:00"],
];

function momentOf(text: string, ctx: CommitContext): Moment | null {
  const nowMin = minutesOf(ctx.time);

  const span = IN_SPAN.exec(text);
  if (span) {
    const raw = span[1].toLowerCase();
    const n = /^\d+$/.test(raw) ? Number(raw) : raw === "half an" ? 0.5 : (SPOKEN[raw] ?? 1);
    const minutes = Math.round(n * (/^h/i.test(span[2]) ? 60 : 1));
    if (minutes < 1 || minutes > 12 * 60) return null;
    const total = nowMin + minutes;
    const date = total >= 1440 ? addDays(ctx.date, 1) : ctx.date;
    return { date, time: addMinutes(ctx.time, minutes), words: [span[0]] };
  }

  const tomorrow = /\btomorrow\b/i.test(text);
  const clock = clockMoment(text, ctx, tomorrow);
  if (clock) return { ...clock, words: [...clock.words, ...(tomorrow ? ["tomorrow"] : [])] };

  if (tomorrow) {
    for (const [rx, time] of TOMORROW_PARTS) {
      const m = rx.exec(text);
      if (m) return { date: addDays(ctx.date, 1), time, words: [m[0]] };
    }
    return { date: addDays(ctx.date, 1), time: "09:00", words: ["tomorrow"] };
  }

  const after = AFTER.exec(text);
  if (after) {
    const what = after[1].toLowerCase().replace(/^the /, "");
    const root = what === "shift" || what === "my shift" ? "deliver" : what;
    const block = ctx.blocks.find((b) => {
      const name = b.block_name.toLowerCase();
      return name.includes(root) || (root === "class" && b.kind === "class") || (root === "gym" && b.kind === "workout") || (root === "work" && b.kind === "delivery");
    });
    if (block && minutesOf(block.end) > nowMin) return { date: ctx.date, time: block.end, words: [after[0]] };
    // No such block left today: two hours from now, unless that runs into the night.
    const later = nowMin + 120;
    if (later >= minutesOf("22:30")) return null;
    return { date: ctx.date, time: addMinutes(ctx.time, 120), words: [after[0]] };
  }

  for (const [rx, time] of DAYPARTS) {
    const m = rx.exec(text);
    if (m && minutesOf(time) > nowMin) return { date: ctx.date, time, words: [m[0]] };
  }
  return null;
}

// ---------- the action ----------

function actionOf(sentence: string, moment: Moment): string {
  let s = sentence;
  for (const w of moment.words) s = s.replace(w, " ");
  s = s
    .replace(INTENT, " ")
    .replace(/\b(at|by|around|before|@)\b\s*$/i, " ")
    .replace(/[,.!]+/g, " ")
    .replace(/^\s*(ok(?:ay)?|so|and|then|yeah|yep|bet|aight)\b[\s,]*/i, "")
    .replace(/^\s*to\s+(?=\w)/i, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\b(at|by|around|and)\s*$/i, "").trim();
  return s.slice(0, 70).trim() || "do it";
}

/** The first statement in a message that says they will do something at a time. Null when there is none. */
export function parseCommitment(text: string, ctx: CommitContext): ParsedCommitment | null {
  if (mentionsVice(text)) return null;
  const sentences = text.split(/(?<=[.!\n])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    if (NOT_A_PROMISE.test(sentence)) continue;
    if (!INTENT.test(sentence) && !BARE.test(sentence)) continue;
    const moment = momentOf(sentence, ctx);
    if (!moment) continue;
    const at = nyInstant(moment.date, moment.time);
    if (at.getTime() <= nyInstant(ctx.date, ctx.time).getTime()) continue;
    return { body: actionOf(sentence, moment), made_on: ctx.date, due_at: at.toISOString(), due_date: moment.date, due_time: moment.time };
  }
  return null;
}

// ---------- asking after it ----------

/** Minutes after the due time before the coach asks. */
export const ASK_AFTER_MIN = 10;
/** Past this many hours it is too late to ask: the moment has gone. */
export const STALE_HOURS = 36;

export type CommitmentStep = { id: string; action: "ask" | "drop" };

/** What to do with each open commitment right now: ask about it, or let it go. */
export function commitmentSteps(rows: readonly CoachCommitment[], now: Date): CommitmentStep[] {
  const out: CommitmentStep[] = [];
  for (const c of rows) {
    if (c.status !== "open" || c.asked_at) continue;
    const due = new Date(c.due_at).getTime();
    const age = now.getTime() - due;
    if (age < ASK_AFTER_MIN * 60_000) continue;
    out.push({ id: c.id, action: age > STALE_HOURS * 3_600_000 ? "drop" : "ask" });
  }
  return out;
}

const ASK_LINE: Record<CoachVoice, string> = {
  stoic: "Did it happen?",
  sergeant: "Report. Did you do it?",
  brother: "Did you get it done?",
};

/** The check-in text: what they said, when, and the question. */
export function commitmentAsk(c: Pick<CoachCommitment, "body" | "due_at">, today: DateStr, voice: CoachVoice): string {
  const p = nyParts(c.due_at);
  const day = p.date === today ? "" : p.date === addDays(today, -1) ? " yesterday" : ` on ${WEEKDAY_NAMES[weekdayOf(p.date)]}`;
  return `You said you would do this${day} at ${formatTime(p.time)}: ${c.body}. ${ASK_LINE[voice]}`;
}

// ---------- the answer ----------

const DONE = /\b(yes|yeah|yep|yup|ya|did it|done|got it done|finished|crushed|hit it|completed|i did|made it|knocked it out|handled it|it happened)\b/i;
const MISSED = /\b(no|nope|nah|didn'?t|did not|couldn'?t|could not|missed|skipped|didn'?t happen|not yet|fell through|never got|blew it|forgot|failed|ended up not)\b/i;

/** Whether a reply says it happened, it did not, or neither. "Didn't" beats "did". */
export function commitmentAnswer(text: string): "done" | "missed" | null {
  if (MISSED.test(text)) return "missed";
  if (DONE.test(text)) return "done";
  return null;
}

/** What the coach says back after a tap or an answer. A miss gets no shame and a way forward. */
export function commitmentReply(status: "done" | "missed", voice: CoachVoice): string {
  if (status === "done") {
    return {
      stoic: "Good. You said it and you did it. That is how you start trusting yourself.",
      sergeant: "Good. Word kept. That is the standard. Next.",
      brother: "That is what I like to hear. You said it and you did it. Proud of that one.",
    }[voice];
  }
  return {
    stoic: "Noted. One miss is data, not a verdict. What got in the way? Then pick a new time and I will ask again.",
    sergeant: "Noted. No sulking. What got in the way? Facts. Then pick a new time and I will hold you to it.",
    brother: "All good, it happens. What got in the way? Then pick a new time and I will check back.",
  }[voice];
}

// ---------- for the coach's context ----------

export interface CommitmentLine {
  what: string;
  /** "today 6:30 PM", "yesterday 8:00 PM". */
  when: string;
  status: CoachCommitment["status"];
  /** True when the due time has passed and they have not answered. */
  waiting: boolean;
}

/** Open commitments and what happened to the last few days of them, newest first, at most six. */
export function commitmentLines(rows: readonly CoachCommitment[], today: DateStr, now: Date): CommitmentLine[] {
  return rows
    .filter((c) => c.status !== "dropped" && c.made_on >= addDays(today, -3))
    .sort((a, b) => (a.due_at < b.due_at ? 1 : -1))
    .slice(0, 6)
    .map((c) => {
      const p = nyParts(c.due_at);
      const day = p.date === today ? "today" : p.date === addDays(today, -1) ? "yesterday" : p.date > today ? WEEKDAY_NAMES[weekdayOf(p.date)] : p.date;
      return { what: c.body, when: `${day} ${formatTime(p.time)}`, status: c.status, waiting: c.status === "open" && new Date(c.due_at).getTime() <= now.getTime() };
    });
}
