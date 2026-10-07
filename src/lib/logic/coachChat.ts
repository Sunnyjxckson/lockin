// The coach as a chat: reading a message, answering it by rule when there is
// no model, the prompt for the model, the checks on what the model wrote, and
// the check-ins the coach sends by itself.
//
// Pure. No React, no db. No dashes other than the plain hyphen in any output.

import { cleanCoachText, money, plural, unknownNumbers, wordCount, type CoachBlock, type CoachSnapshot } from "./coach";
import { QUOTES, SCHOOL_IDEA, SCHOOL_LABEL, quoteByKey, quoteLine, quotesIn, type QuoteSchool } from "./coachQuotes";
import { formatTime, minutesOf } from "./dates";
import type { CoachCheckins, CoachTrigger, CoachVoice, DateStr, TimeStr } from "../types";

// ---------- input ----------

export interface ChatTurn {
  sender: "me" | "coach";
  body: string;
}

/** Where today stands at the moment of the message. The snapshot only scores finished days. */
export interface TodaySoFar {
  /** "3:57 PM". */
  time: string;
  done: number;
  total: number;
  /** Names of the daily items still open. */
  left: string[];
}

export interface ChatContext {
  snapshot: CoachSnapshot;
  now: TodaySoFar;
  /** Their own reasons, in their words: board names and notes, the business goal. */
  why: string[];
}

export const VOICE_LABEL: Record<CoachVoice, string> = { stoic: "Stoic", sergeant: "Sergeant", brother: "Brother" };
export const VOICE_SUB: Record<CoachVoice, string> = {
  stoic: "Calm and even. Few words.",
  sergeant: "Hard and blunt. Short orders.",
  brother: "Warm and straight, like a big brother.",
};

export const DEFAULT_VOICE: CoachVoice = "stoic";
export const DEFAULT_CHECKINS: CoachCheckins = { post_workout: true, slip: true, missed_item: true };

export function voiceOf(v: unknown): CoachVoice {
  return v === "sergeant" || v === "brother" || v === "stoic" ? v : DEFAULT_VOICE;
}

export function checkinsOf(v: unknown): CoachCheckins {
  const c = (v && typeof v === "object" ? v : {}) as Partial<CoachCheckins>;
  return { post_workout: c.post_workout !== false, slip: c.slip !== false, missed_item: c.missed_item !== false };
}

/** Longest message the chat takes. */
export const MAX_MESSAGE = 600;
/** How much of the conversation goes to the model. */
export const MAX_TURNS = 16;

// ---------- reading a message ----------

export type Topic =
  | "care"
  | "emergency"
  | "injury"
  | "pain"
  | "urge"
  | "slipped"
  | "hungry"
  | "tired"
  | "money"
  | "study"
  | "unmotivated"
  | "win"
  | "general";

const CARE =
  /\b(kill(ing)? myself|suicid\w*|end it all|end my life|want(ed)? to die|wanna die|don'?t want to (be here|live|be alive|wake up)|hurt(ing)? myself|harm(ing)? myself|self[- ]harm|cutting myself|no reason to live|better off (dead|without me))\b/i;
const EMERGENCY = /\b(chest (pain|hurts|is tight|tightness)|can'?t breathe|trouble breathing|faint(ed|ing)?|pass(ed|ing) out|black(ed|ing) out|coughing (up )?blood)\b/i;
const JOINT = "(knee|elbow|shoulder|wrist|ankle|lower back|spine|neck|hip|achilles|groin|hamstring)s?";
const INJURY = new RegExp(
  [
    "\\b(sharp|stabbing|shooting)\\b",
    "\\b(pop|popp?ed|snapp?ed|tore|torn|tear|sprain(ed)?|pulled (a|my|something)|strained|swollen|swelling|numb(ness)?|tingl(e|ing)|limping|injur(y|ed))\\b",
    "\\bcan'?t (move|walk|bend|lift|straighten|put weight)\\b",
    "\\bone side\\b",
    `\\b${JOINT}\\b.*\\b(pain|hurts?|hurting|aches?|aching)\\b`,
    `\\b(pain|hurts?|hurting|aches?|aching)\\b.*\\b${JOINT}\\b`,
  ].join("|"),
  "i",
);
const VICE_WORD = "(smok\\w*|cig\\w*|vap\\w*|drink(ing)?(?! (more |some )?water)|drunk|beer|liquor|weed|blunt|get(ting)? high|nut|jerk\\w*|masturbat\\w*|porn|bet(s|ting)?|gambl\\w*|scroll\\w*|tiktok|junk food|fast food|energy drink)";
const URGE = new RegExp(`\\b(crav\\w*|urge|tempt\\w*)\\b|\\b(want|wanna|need|about to|going to|gonna|feel like)\\b.*\\b${VICE_WORD}\\b`, "i");
const SLIPPED = /\b(i (just )?(smoked|drank|vaped|relapsed|slipped|caved|gave in|broke|messed up|screwed up|fucked up|failed|skipped|missed|blew it|overslept)|relapse)\b/i;
const PAIN = /\b(sore|soreness|hurts?|hurting|pain|aches?|aching|achy|dead|burn(s|ing)?|cramp\w*|stiff|killing me|destroyed|wrecked)\b/i;
const HUNGRY = /\b(hungry|starving|hunger|appetite)\b/i;
const TIRED = /\b(tired|exhausted|sleepy|no sleep|didn'?t sleep|drained|wiped|burn(ed|t) out|no energy|fatigue\w*)\b/i;
const MONEY = /\b(deliver\w*|doordash|dash(ing)?|uber|instacart|money|broke|floor|orders?|slow night|earn\w*)\b|\$\d/i;
const STUDY = /\b(study\w*|homework|class|exam|assignment|paper|quiz|lecture)\b/i;
const UNMOTIVATED =
  /\b(don'?t (feel like|want to|wanna)|not feeling it|can'?t be bothered|lazy|unmotivated|no motivation|motivat\w*|skip\w*|give up|giving up|quit\w*|what'?s the point|pointless|bored|procrastinat\w*|tomorrow instead)\b/i;
const WIN = /\b(did it|got it done|finished|crushed|killed it|hit (it|my|a)|new pr|personal record|locked in|proud)\b/i;

/** What a message is about. Safety comes first, in this order: care, emergency, injury. */
export function classifyMessage(text: string): Topic {
  if (CARE.test(text)) return "care";
  if (EMERGENCY.test(text)) return "emergency";
  if (INJURY.test(text)) return "injury";
  if (URGE.test(text)) return "urge";
  if (SLIPPED.test(text)) return "slipped";
  if (PAIN.test(text)) return "pain";
  if (HUNGRY.test(text)) return "hungry";
  if (TIRED.test(text)) return "tired";
  if (UNMOTIVATED.test(text)) return "unmotivated";
  if (MONEY.test(text)) return "money";
  if (STUDY.test(text)) return "study";
  if (WIN.test(text)) return "win";
  return "general";
}

/** True when anything they said in the conversation so far reads as more than a bad day. */
export function careInPlay(turns: readonly ChatTurn[]): boolean {
  return turns.some((t) => t.sender === "me" && CARE.test(t.body));
}

// ---------- the fixed lines ----------

/** These three never go through a voice and never carry a quote. */
export const CARE_REPLY =
  "That sounds like more than a bad day, and I am not going to push you through it. This is bigger than a checklist. Talk to someone who can be with you right now: someone you trust, or call or text 988, any time. The list can wait.";
export const EMERGENCY_REPLY = "Stop now. Chest pain, trouble breathing or passing out is not something to push through. Call 911 or get to urgent care.";
export const INJURY_REPLY =
  "Stop the session. Sharp pain, pain in a joint or pain on one side is not soreness, and it is not something to push through. Rest it, ice it, and get it checked if it is still there tomorrow. Tick what you finished and leave the rest.";

// ---------- answering by rule ----------

const PREFER: Record<Exclude<Topic, "care" | "emergency" | "injury">, string[]> = {
  pain: ["pain_optional", "second_arrow", "ali_count", "goggins_forty", "seneca_difficulties", "marcus_endure"],
  urge: ["epictetus_master", "seneca_imagination", "second_arrow", "musashi_use", "epictetus_views"],
  slipped: ["musashi_yesterday", "jordan_fail", "frankl_change", "marcus_obstacle"],
  hungry: ["epictetus_views", "seneca_imagination", "pain_optional"],
  tired: ["marcus_dawn", "goggins_forty", "kobe_rest", "marcus_endure", "ali_champion"],
  unmotivated: ["musashi_difficult", "nietzsche_why", "ali_champion", "seneca_time", "marcus_obstacle", "musashi_use"],
  money: ["kobe_rest", "ali_champion", "marcus_obstacle", "seneca_time"],
  study: ["seneca_time", "musashi_difficult", "musashi_use", "marcus_obstacle"],
  win: ["musashi_yesterday", "kobe_rest", "seneca_difficulties"],
  general: ["nietzsche_why", "epictetus_views", "marcus_obstacle", "musashi_yesterday"],
};

const DO_NOW: Record<keyof typeof PREFER, Record<CoachVoice, string>> = {
  pain: {
    stoic: "Walk for five minutes and drink water. The soreness does not get a vote on tomorrow.",
    sergeant: "Five minute walk, water, stretch. Then you show up tomorrow.",
    brother: "Walk it out for five minutes and get some water in you. You will be glad you did not sit in it.",
  },
  urge: {
    stoic: "Set a timer for ten minutes and leave the room you are in. The urge passes whether you obey it or not.",
    sergeant: "Ten minutes on a timer. Get up, leave the room, do pushups. Message me when it ends.",
    brother: "Give it ten minutes and get out of the room you are in. Hit me when the timer is up.",
  },
  slipped: {
    stoic: "Log it with the time and what set it off, then do the next thing on the list.",
    sergeant: "Log it. Time and trigger. Then hit the next item. No sulking.",
    brother: "Log it with what set it off so we can see the pattern, then knock out the next thing on the list.",
  },
  hungry: {
    stoic: "Eat to the target, not under it. Protein first, then a full glass of water.",
    sergeant: "Eat to the target, not under it. Protein first, then water.",
    brother: "Eat to the target, not under it. Get some protein in first and a full glass of water.",
  },
  tired: {
    stoic: "Do the first ten minutes of the next block, then decide. And be in bed on time tonight.",
    sergeant: "Ten minutes of the next block. Start now. Bed on time tonight, no excuses.",
    brother: "Just start the next block and give it ten minutes. Then get to bed on time tonight.",
  },
  unmotivated: {
    stoic: "Do the smallest part of it now, two minutes. Motion comes before the mood.",
    sergeant: "Nobody asked how you feel. Two minutes of it, now.",
    brother: "You do not have to feel like it. Start with two minutes and see what happens.",
  },
  money: {
    stoic: "Open the app and take the first order. One order, then the next.",
    sergeant: "Get in the car. First order. Go.",
    brother: "Get out there and take the first order. It always moves once you start.",
  },
  study: {
    stoic: "Phone in another room. Start the focus timer for ten minutes.",
    sergeant: "Phone away. Timer on. Ten minutes. Now.",
    brother: "Put the phone in another room and start the timer. Ten minutes is all I am asking.",
  },
  win: {
    stoic: "Good. Tick it and move to the next thing.",
    sergeant: "Good. That is the standard now. Next item.",
    brother: "That is what I am talking about. Tick it and keep moving.",
  },
  general: {
    stoic: "Tell me what is in the way right now, in one line.",
    sergeant: "What is in the way right now? One line.",
    brother: "Talk to me. What is in the way right now?",
  },
};

function itemLine(s: CoachSnapshot, key: string) {
  return s.items.find((i) => i.key === key) ?? null;
}

/** Other words for a vice, by a piece of its name. */
const VICE_ALIASES: [string, RegExp][] = [
  ["smok", /smok|cig|blunt/],
  ["drink", /drink|drunk|beer|liquor/],
  ["masturb", /\bnut\b|jerk|masturb/],
  ["weed", /weed|blunt|high/],
  ["vap", /vap/],
  ["gambl", /\bbet|gambl/],
  ["scroll", /scroll|tiktok/],
];

/** The vice a message names, else the one with the longest clean run. */
function viceFor(text: string, s: CoachSnapshot): CoachSnapshot["vices"][number] | null {
  const t = text.toLowerCase();
  const named = s.vices.find((v) => {
    const name = v.name.toLowerCase();
    const alias = VICE_ALIASES.find(([match]) => name.includes(match));
    if (alias && alias[1].test(t)) return true;
    const root = name.split(/\s+/)[0];
    return root.length >= 4 && t.includes(root.slice(0, 4));
  });
  if (named) return named;
  return s.vices.slice().sort((a, b) => b.cleanStreak - a.cleanStreak)[0] ?? null;
}

function countToday(now: TodaySoFar): string {
  return now.total > 0 ? `${now.done} of ${now.total} done today.` : "";
}

/** One line from their own numbers that fits the topic. Empty when there is nothing worth saying. */
export function dataLine(topic: Topic, text: string, ctx: ChatContext): string {
  const s = ctx.snapshot;
  const now = ctx.now;
  switch (topic) {
    case "pain": {
      const w = itemLine(s, "workout");
      if (w && w.streak >= 2) return `You have hit ${w.streak} workout days straight. Soreness is the receipt.`;
      return s.plan.workout ? `Today is ${s.plan.workout.name}. Soreness means the work landed.` : "Soreness means the work landed.";
    }
    case "urge": {
      const v = viceFor(text, s);
      if (v && v.cleanStreak > 0) return `${plural(v.cleanStreak, "day")} clean on ${v.name}. That is what the next ten minutes protect.`;
      return "An urge is a wave. It peaks and it drops.";
    }
    case "slipped":
      return s.today.consistency.days >= 3 ? `${s.today.consistency.label} locked in. One slip is one day. Nothing resets.` : "One slip is one day. Nothing resets.";
    case "hungry": {
      const t = s.macros.targets;
      return t.calories ? `Your target is ${t.calories}${t.protein ? `, protein ${t.protein}` : ""}.` : "";
    }
    case "tired": {
      const bed = itemLine(s, "bed");
      return bed && bed.days7 > 0 ? `Bed on time ${bed.hits7} of the last ${plural(bed.days7, "day")}.` : "";
    }
    case "unmotivated": {
      const head = s.today.dayNumber !== null && s.today.lengthDays !== null ? `Day ${s.today.dayNumber} of ${s.today.lengthDays}. ` : "";
      const left = now.left.slice(0, 3);
      return left.length > 0 ? `${head}${now.left.length} left today: ${left.join(", ")}.` : `${head}${countToday(now)}`.trim();
    }
    case "money":
      return `${money(s.money.earnedToday)} of the ${money(s.money.floor)} floor today.`;
    case "study": {
      const today = s.focus.days.find((d) => d.date === s.today.date);
      return s.focus.goalMinutes > 0 ? `${today?.minutes ?? 0} of ${s.focus.goalMinutes} focus minutes today.` : "";
    }
    case "win":
    case "general":
      return countToday(now);
    default:
      return "";
  }
}

export interface ChatReply {
  body: string;
  /** Key of the library line it used. */
  quote: string | null;
  topic: Topic;
}

/**
 * The reply written from rules: one line from the library, one line from
 * their own numbers, one thing to do now. Runs with no API key, when the
 * model call fails and offline, so it has to be worth reading on its own.
 */
export function chatFallback(text: string, ctx: ChatContext, voice: CoachVoice, usedQuotes: readonly string[] = []): ChatReply {
  const topic = classifyMessage(text);
  if (topic === "care") return { body: CARE_REPLY, quote: null, topic };
  if (topic === "emergency") return { body: EMERGENCY_REPLY, quote: null, topic };
  if (topic === "injury") return { body: INJURY_REPLY, quote: null, topic };
  const used = new Set(usedQuotes);
  const key = PREFER[topic].find((k) => !used.has(k)) ?? null;
  const quote = quoteByKey(key);
  const lines = [quote ? quoteLine(quote) : "", dataLine(topic, text, ctx), DO_NOW[topic][voice]].filter(Boolean);
  return { body: cleanCoachText(lines.join("\n")), quote: quote?.key ?? null, topic };
}

// ---------- the prompt ----------

const VOICE_PROMPT: Record<CoachVoice, string> = {
  stoic: "Calm stoic. Even and unhurried, few words, no heat. You state things as they are and leave the person to act on them.",
  sergeant: "Drill sergeant. Hard, blunt, short orders, no cushioning. You are tough on excuses and never on the person: no insults, no shaming, no name calling.",
  brother: "Big brother. Warm and straight, like an older brother who has been through it. Plain talk, a little dry humor is fine, and you still do not let them off the hook.",
};

const SCHOOLS: QuoteSchool[] = ["stoic", "arrow", "why", "athlete", "samurai"];

const SYSTEM = [
  "You are the coach inside Lock In, an app one person uses to stay consistent in life over the long run: body, money, school, their brand, staying clean. They message you the way they would message a coach, in the moment: sore after a workout, wanting to smoke, not feeling like working. You have read their data. Write to them as \"you\".",
  "",
  "What a reply is",
  "Two or three short lines, 60 words at most. First one idea that reframes the moment. Then one thing to do right now: small, concrete, doable in the next ten minutes. When their own data makes the point land, use it: a streak, today's count, the plan, the money floor. No lectures, no lists, no paragraphs. At most one question, and only when you need the answer.",
  "You remember the conversation below. Pick up what they said earlier when it matters.",
  "",
  "Where the ideas come from",
  ...SCHOOLS.map((k) => `${SCHOOL_LABEL[k]}: ${SCHOOL_IDEA[k]}`),
  "",
  "Quotes",
  "You may quote one line from the \"quotes\" list, word for word, with the name after it. Never quote a line that is not on that list, never reword one, never credit one to someone else. Do not quote in every reply: when your last message carried a quote, make the point in your own words this time.",
  "",
  "Their why",
  "Lines under \"why\" are their own goals in their own words. When motivation is the problem, point back at those, not at a quote.",
  "",
  "Hard lines",
  "Soreness is not injury. Sharp pain, pain in a joint, pain on one side, swelling, numbness, or pain that changes how they move: tell them to stop and get it checked. No quote and no pushing through.",
  "Chest pain, trouble breathing or fainting: tell them to stop and call 911 or get to urgent care.",
  "Never tell them to eat under their calorie target, skip a meal, burn food off, train through illness or cut sleep. Hungry on a cut: eat to the target.",
  "A slip is one day and it never resets anything. No moralizing about any vice and no comment on what it says about them.",
  "If a message, or the conversation so far, sounds like more than a bad day (hopeless, hating themselves, not wanting to be here, hurting themselves, starving themselves or purging), drop the coach voice completely. No quote, no data, no push. Say plainly that you hear it, that this is bigger than a checklist, and that they should talk to a real person now: someone they trust, or call or text 988. Stay that way until they are clearly out of it.",
  "You are a coach in an app, not a doctor or a therapist. Do not diagnose anything.",
  "",
  "Facts",
  "Use only what is in the data. A number you write must appear in the data, in the quotes list or in their own messages, except small counts up to ten. Do not do arithmetic to make a new number. Do not invent events, causes or feelings.",
  "\"today_so_far\" is where today stands right now. \"data.yesterday\" and \"data.days\" are finished days.",
  "",
  "Format",
  "Plain sentences. No markdown, bullets, headings, emoji or exclamation marks. Never use an em dash or an en dash. Use a period, a comma or the word \"to\".",
].join("\n");

const CARE_SYSTEM = [
  "You are the coach inside Lock In, a personal consistency app. The person just wrote something that sounds like more than a bad day.",
  "Drop the coach voice completely. No quotes, no data, no push, no advice about habits.",
  "In three or four plain sentences: say you hear it and take it seriously, say this is bigger than a checklist, and ask them to talk to a real person now: someone they trust who can be with them, or call or text 988, which is open any time. If they may be in immediate danger, say to call 911. Say the list can wait.",
  "Do not diagnose, do not lecture, do not promise anything about what a helpline will or will not do. Never use an em dash or an en dash. No markdown.",
].join("\n");

export interface ChatPrompt {
  system: string;
  user: string;
  maxTokens: number;
  /** True when the reply must be the plain, careful one. */
  care: boolean;
}

function transcript(turns: readonly ChatTurn[]): string {
  return turns
    .slice(-MAX_TURNS)
    .map((t) => `${t.sender === "me" ? "Them" : "Coach"}: ${t.body.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE)}`)
    .join("\n");
}

/** What goes to the model. `usedQuotes` are left off the list, so a line cannot come back within the week. */
export function chatPrompt(ctx: ChatContext, turns: readonly ChatTurn[], voice: CoachVoice, usedQuotes: readonly string[] = []): ChatPrompt {
  const care = careInPlay(turns.slice(-6));
  if (care) {
    return { system: CARE_SYSTEM, user: `<conversation>\n${transcript(turns)}\n</conversation>\n\nReply to their last message. Reply with the message only.`, maxTokens: 300, care };
  }
  const used = new Set(usedQuotes);
  const quotes = QUOTES.filter((q) => !used.has(q.key)).map((q) => `${SCHOOL_LABEL[q.school]}: "${q.text}" ${q.by}`);
  const user = [
    `<data>\n${JSON.stringify(ctx.snapshot)}\n</data>`,
    `<today_so_far>\n${JSON.stringify(ctx.now)}\n</today_so_far>`,
    `<why>\n${ctx.why.length > 0 ? ctx.why.join("\n") : "Nothing written yet."}\n</why>`,
    `<quotes>\n${quotes.length > 0 ? quotes.join("\n") : "None left this week. Use your own words."}\n</quotes>`,
    `<conversation>\n${transcript(turns)}\n</conversation>`,
    "Reply to their last message. Reply with the message only.",
  ].join("\n\n");
  return { system: `${SYSTEM}\n\nVoice\n${VOICE_PROMPT[voice]}`, user, maxTokens: 300, care };
}

// ---------- checking what the model wrote ----------

/** Hard ceilings, well above what the prompt asks for. */
export const MAX_REPLY_WORDS = 110;

export type ReplyProblem = { kind: "empty" } | { kind: "too_long" } | { kind: "numbers"; numbers: number[] } | { kind: "quote_repeat"; keys: string[] } | { kind: "quote_unknown"; text: string };

/**
 * What is wrong with a reply, or null. A number has to be in the data, the
 * library or their messages. A quoted line has to be from the library and not
 * one used this week.
 */
export function replyProblem(body: string, ctx: ChatContext, turns: readonly ChatTurn[], usedQuotes: readonly string[], care = false): ReplyProblem | null {
  if (!body.trim()) return { kind: "empty" };
  if (wordCount(body) > MAX_REPLY_WORDS) return { kind: "too_long" };
  if (care) return null;
  // 988 and 911 are always allowed: the coach may point at them at any time.
  const known = { ctx, quotes: QUOTES.map((q) => q.text), said: turns.map((t) => t.body), lines: ["988", "911"] };
  const numbers = unknownNumbers(body, known);
  if (numbers.length > 0) return { kind: "numbers", numbers };
  const quoted = quotesIn(body);
  const repeat = quoted.filter((k) => usedQuotes.includes(k));
  if (repeat.length > 0) return { kind: "quote_repeat", keys: repeat };
  const theirs = turns.filter((t) => t.sender === "me").map((t) => t.body.toLowerCase());
  for (const m of body.matchAll(/"([^"]{24,})"/g)) {
    const inner = m[1];
    if (quotesIn(inner).length > 0) continue;
    if (theirs.some((t) => t.includes(inner.toLowerCase().slice(0, 24)))) continue;
    return { kind: "quote_unknown", text: inner };
  }
  return null;
}

/** Sent back to the model once. */
export function chatCorrection(p: ReplyProblem): string {
  if (p.kind === "numbers") return `These numbers are not in the data: ${p.numbers.join(", ")}. Rewrite it using only numbers from the data, the quotes list or their messages. Reply with the rewritten message only.`;
  if (p.kind === "quote_repeat") return "You already used that quote this week. Rewrite it in your own words, or with a different line from the quotes list. Reply with the rewritten message only.";
  if (p.kind === "quote_unknown") return "That quoted line is not on the quotes list. Rewrite it in your own words, or quote a line from the list word for word. Reply with the rewritten message only.";
  if (p.kind === "too_long") return "Too long. Three short lines at most, 60 words. Reply with the rewritten message only.";
  return "Reply with the message only.";
}

/** The least a request must carry before the server writes from it. */
export function isChatContext(v: unknown): v is ChatContext {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<ChatContext>;
  const s = c.snapshot as Partial<CoachSnapshot> | undefined;
  return (
    !!s && s.version === 1 &&
    !!s.today && typeof s.today.date === "string" && !!s.today.consistency &&
    !!s.plan && Array.isArray(s.items) && Array.isArray(s.vices) &&
    !!s.money && typeof s.money.floor === "number" && typeof s.money.earnedToday === "number" &&
    !!s.macros && !!s.macros.targets && !!s.focus && Array.isArray(s.focus.days) &&
    !!c.now && typeof c.now.done === "number" && typeof c.now.total === "number" && Array.isArray(c.now.left) &&
    Array.isArray(c.why)
  );
}

export function isTurns(v: unknown): v is ChatTurn[] {
  return Array.isArray(v) && v.length > 0 && v.every((t) => !!t && typeof t === "object" && ((t as ChatTurn).sender === "me" || (t as ChatTurn).sender === "coach") && typeof (t as ChatTurn).body === "string");
}

// ---------- check-ins ----------

export interface CheckinInput {
  today: DateStr;
  time: TimeStr;
  enabled: CoachCheckins;
  voice: CoachVoice;
  /** Today's blocks, clock times. */
  blocks: readonly CoachBlock[];
  /** Today's workout by name, when there is one. */
  workoutName: string | null;
  /** True once today's workout item is ticked. */
  workoutDone: boolean;
  /** Slips logged today. */
  slips: readonly { id: string; vice: string; time: TimeStr; trigger: string | null }[];
  yesterday: CoachSnapshot["yesterday"];
  /** check_key of every check-in already sent. */
  sent: ReadonlySet<string>;
}

export interface Checkin {
  trigger: Exclude<CoachTrigger, "chat">;
  check_key: string;
  body: string;
}

/** How long after the workout block ends the coach still asks about it. */
const WORKOUT_WINDOW_MIN = 180;

const ASK: Record<Checkin["trigger"], Record<CoachVoice, string>> = {
  post_workout: { stoic: "How did it go?", sergeant: "Report. How did it go?", brother: "How did it go? What was the hardest part?" },
  slip: { stoic: "What set it off?", sergeant: "What set it off? One line.", brother: "What set it off? No judgment, I just want the pattern." },
  missed_item: { stoic: "What got in the way?", sergeant: "What got in the way? Facts, not excuses.", brother: "What got in the way?" },
};

/**
 * The check-ins that are due right now and have not been sent: one after
 * today's workout block, one per slip logged today, one for yesterday's
 * misses. Written by rule, so they arrive with no key and offline.
 */
export function dueCheckins(input: CheckinInput): Checkin[] {
  const out: Checkin[] = [];
  const nowMin = minutesOf(input.time);
  const add = (c: Checkin) => {
    if (!input.sent.has(c.check_key)) out.push({ ...c, body: cleanCoachText(c.body) });
  };

  if (input.enabled.missed_item && input.yesterday && input.yesterday.misses.length > 0) {
    const y = input.yesterday;
    const names = y.misses.slice(0, 3).map((m) => m.name);
    const more = y.misses.length - names.length;
    add({
      trigger: "missed_item",
      check_key: `missed:${y.date}`,
      body:
        y.done === 0
          ? `Nothing was ticked yesterday. One day, nothing resets. ${ASK.missed_item[input.voice]}`
          : `Yesterday closed at ${y.done} of ${y.total}. Missed: ${names.join(", ")}${more > 0 ? `, plus ${more} more` : ""}. One day, nothing resets. ${ASK.missed_item[input.voice]}`,
    });
  }

  if (input.enabled.post_workout) {
    const block = input.blocks.filter((b) => b.kind === "workout").sort((a, b) => (a.end < b.end ? -1 : 1))[0];
    if (block) {
      const since = nowMin - minutesOf(block.end);
      if (since >= 0 && since <= WORKOUT_WINDOW_MIN) {
        const name = input.workoutName ?? "The workout";
        add({
          trigger: "post_workout",
          check_key: `post_workout:${input.today}`,
          body: input.workoutDone
            ? `${name} is ticked. ${ASK.post_workout[input.voice]}`
            : `The workout block ended at ${formatTime(block.end)} and ${input.workoutName ?? "the workout"} is not ticked. Did it happen?`,
        });
      }
    }
  }

  if (input.enabled.slip) {
    for (const s of input.slips) {
      const head = `Logged: ${s.vice} at ${formatTime(s.time)}`;
      add({
        trigger: "slip",
        check_key: `slip:${s.id}`,
        body: s.trigger
          ? `${head}, set off by ${s.trigger.replace(/[.\s]+$/, "")}. One slip is one day, nothing resets. What do you do the next time that comes up?`
          : `${head}. One slip is one day, nothing resets. ${ASK.slip[input.voice]}`,
      });
    }
  }
  return out;
}

/** Quote keys used by coach messages sent on or after `since`. */
export function quotesUsedSince(messages: readonly { sender: string; quote: string | null; date: DateStr }[], since: DateStr): string[] {
  return [...new Set(messages.filter((m) => m.sender === "coach" && m.quote && m.date >= since).map((m) => m.quote as string))];
}
