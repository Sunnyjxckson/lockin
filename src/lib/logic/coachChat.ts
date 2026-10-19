// The coach as a chat: reading a message, answering it by rule when there is
// no model, the prompt for the model, the checks on what the model wrote, and
// the check-ins the coach sends by itself.
//
// Pure. No React, no db. No dashes other than the plain hyphen in any output.

import { cleanCoachText, money, plural, unknownNumbers, wordCount, type CoachBlock, type CoachSnapshot, type Flag } from "./coach";
import { candidateLine, libraryQuotesIn, misquotedFrom, type LibCandidate } from "./coachLibrary";
import { QUOTES, SCHOOL_IDEA, SCHOOL_LABEL, quoteByKey, quoteLine, quotesIn, type QuoteSchool } from "./coachQuotes";
import { ASK_PUSH_OR_TALK, THERAPIST_REPLY, URGE_WALK, afterCheckinReply, slipThought, supportReply, wasAsked } from "./coachSupport";
import { diffDays, formatTime, minutesOf } from "./dates";
import type { CoachCheckins, CoachTrigger, CoachVoice, DateStr, ProfileKind, TimeStr } from "../types";

// ---------- input ----------

export interface ChatTurn {
  sender: "me" | "coach";
  body: string;
  /** Coach turns only: why it was written ("slip" for the check-in after a slip). Optional, older clients leave it out. */
  trigger?: string;
}

/** Where today stands at the moment of the message. The snapshot only scores finished days. */
export interface TodaySoFar {
  /** "3:57 PM". */
  time: string;
  done: number;
  total: number;
  /** Names of the daily items still open. */
  left: string[];
  /** The schedule block it is right now, and the next one. Optional, older clients leave them out. */
  block?: { name: string; kind: string; start: string; end: string } | null;
  next?: { name: string; start: string } | null;
}

/** What the coach has been told about them, kept between conversations. */
export interface ProfileItem {
  kind: ProfileKind;
  body: string;
}

/** Something they said they would do. `waiting` is true once it is due and unanswered. */
export interface CommitmentItem {
  what: string;
  when: string;
  status: "open" | "done" | "missed" | "dropped";
  waiting: boolean;
}

/** One day of mood, 1 (low) to 5 (high). */
export interface MoodItem {
  date: DateStr;
  label: string;
  mood: number;
  note: string | null;
}

export interface ChatContext {
  snapshot: CoachSnapshot;
  now: TodaySoFar;
  /** Their own reasons, in their words: board names and notes, the business goal. */
  why: string[];
  /** The running profile (coach_profile). Optional: older clients and a database without the table send none. */
  profile?: ProfileItem[];
  /** Open commitments and the last few days of them. */
  commitments?: CommitmentItem[];
  /** Mood over the last 7 days. */
  moods?: MoodItem[];
  /** True when low days keep coming back: the coach may suggest a real therapist. */
  recurring?: boolean;
}

export const VOICE_LABEL: Record<CoachVoice, string> = { stoic: "Stoic", sergeant: "Sergeant", brother: "Brother" };
export const VOICE_SUB: Record<CoachVoice, string> = {
  stoic: "Calm and even. Few words.",
  sergeant: "Hard and blunt. Short orders.",
  brother: "Warm and straight, like a big brother.",
};

export const DEFAULT_VOICE: CoachVoice = "stoic";
export const DEFAULT_CHECKINS: Required<CoachCheckins> = { post_workout: true, slip: true, missed_item: true, commitment: true, drift: true };

export function voiceOf(v: unknown): CoachVoice {
  return v === "sergeant" || v === "brother" || v === "stoic" ? v : DEFAULT_VOICE;
}

export function checkinsOf(v: unknown): Required<CoachCheckins> {
  const c = (v && typeof v === "object" ? v : {}) as Partial<CoachCheckins>;
  return { post_workout: c.post_workout !== false, slip: c.slip !== false, missed_item: c.missed_item !== false, commitment: c.commitment !== false, drift: c.drift !== false };
}

/**
 * The schedule block it is right now, and the next one, from today's blocks.
 * Blocks that cross midnight are read as ending at 24:00.
 */
export function scheduleNow(blocks: readonly CoachBlock[], time: TimeStr): { block: TodaySoFar["block"]; next: TodaySoFar["next"] } {
  const now = minutesOf(time);
  const ordered = [...blocks].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  const end = (b: CoachBlock) => (minutesOf(b.end) <= minutesOf(b.start) ? 1440 : minutesOf(b.end));
  const current = ordered.find((b) => minutesOf(b.start) <= now && now < end(b)) ?? null;
  const upcoming = ordered.find((b) => minutesOf(b.start) > now) ?? null;
  return {
    block: current ? { name: current.block_name, kind: current.kind, start: formatTime(current.start), end: formatTime(current.end) } : null,
    next: upcoming ? { name: upcoming.block_name, start: formatTime(upcoming.start) } : null,
  };
}

/** Longest message the chat takes. */
export const MAX_MESSAGE = 600;
/** How much of the conversation goes to the model. */
export const MAX_TURNS = 16;

// ---------- reading a message ----------

export type Topic =
  | "care"
  | "emergency"
  | "therapist"
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
  /\b(kill(ing)? myself|suicid\w*|end it all|end(ing)? my life|take my own life|want(ed)? to die|wanna die|don'?t want to (be here|live|be alive|wake up)|hurt(ing)? myself|harm(ing)? myself|self[- ]harm|cutting myself|no reason to live|no point (in )?(living|going on)|can'?t go on|want to disappear|better off (dead|without me))\b/i;
const THERAPIST = /\b(are you (a |an )?(real |licensed |actual )?(therapist|doctor|psychologist|counsel+or|human|person)|is this (therapy|a therapist)|(are|aren'?t) you (licensed|qualified)|(do|should|would) i (need|see|get) (a |to see a )?(therapist|counsel+or|therapy)|replace (my |a )?therapist|you('re| are) not a (real )?(therapist|doctor))\b/i;
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
  if (THERAPIST.test(text)) return "therapist";
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

/** True when the text names a vice. Used to keep a "gonna smoke at 8" from being saved as a commitment. */
export function mentionsVice(text: string): boolean {
  return new RegExp(`\\b${VICE_WORD}\\b`, "i").test(text);
}

// ---------- push or support ----------

/**
 * Push: tired, sore or bargaining. One reframe, then one thing to do.
 * Support: down, stressed, ashamed or stuck. Slow down and listen.
 * Unclear: it cannot tell, so it asks.
 */
export type CoachMode = "push" | "support" | "unclear";

const SUPPORT =
  /\b(depress\w*|anxi\w*|stress\w*|overwhelm\w*|ashamed|shame|embarrass\w*|guilt\w*|lonely|(feel(ing)?|so|all) alone|isolated|nobody (cares|gets|to talk)|sad|crying|cried|hopeless|worthless|hate myself|numb|empty|scared|afraid|panic\w*|struggl\w*|heartbroken|breakup|broke up|grie\w*|died|passed away|stuck|unhappy|miserable|falling apart|too much|can'?t handle|spiral\w*|failure|loser|disappointed in myself|let (everyone|myself|them) down|need to talk|want to talk|wanna talk|can we talk|vent|going through|rough (time|patch)|hard time|tough time|so much going on|family (stuff|drama)|money (stress|problems|pressure)|can'?t pay|behind on (rent|bills)|in debt|evict\w*|feel(ing)? (lost|down|low|off|heavy|terrible|awful|like (a )?(failure|loser|shit|trash)|so bad)|i('| a)?m not (okay|ok)|don'?t know what to do|no one (cares|gets it)|(feel|feeling|been|am|i'?m) (so |really |pretty |kinda |very )?(down|low)(?! on\b)|(so|really|pretty|kinda|very) (down|low)(?! on\b))\b/i;
const EXTRA_PUSH =
  /\b(skip\w*|tomorrow instead|just this once|cheat day|rest day|too (tired|sore|cold|hot|late|busy)|can'?t be bothered|procrastinat\w*|bored|lazy|give up|giving up|don'?t (feel like|want to|wanna)|not feeling it|cut corners|one day won'?t)\b/i;
/** A bad day said in a few words, with no way to tell which kind it is. */
const VAGUE =
  /^\s*(ugh+|idk|i don'?t know|meh|rough( day)?|bad day|not (great|good|okay|ok|doing (great|good|well))|(today|this) (sucks|is rough|is hard)|i('| a)?m (off|not (great|good|okay|ok)|struggling|having a (rough|bad|hard) (day|time))|just (not )?(great|good)|whatever)\W*$|\b(rough|bad|hard|long|terrible|shitty|shit) (day|night|week)\b/i;
/** Asking for a push outright, even in the middle of a hard moment. */
const ASKS_PUSH = /\b(i need|give me|just|please) (a )?(push|kick)|\bpush me\b|kick my ass|(be|get) (hard|tough) on me|tough love/i;
const WANTS_TALK = /\b(talk|vent|listen|hear me|need to say|both|someone to)\b/i;
const WANTS_PUSH = /\b(push|kick|tough|hard|yell|boot|go off|motivate)\b/i;

type Raw = "push" | "support" | "unclear" | "neutral";

function rawMode(text: string): Raw {
  const topic = classifyMessage(text);
  if (topic === "care" || topic === "therapist") return "support";
  if (topic === "emergency" || topic === "injury") return "push";
  const support = SUPPORT.test(text) || slipThought(text);
  const push = ["pain", "urge", "tired", "unmotivated", "hungry"].includes(topic) || EXTRA_PUSH.test(text);
  if (support && push) return "unclear";
  if (support) return "support";
  if (push) return "push";
  if (VAGUE.test(text)) return "unclear";
  return "neutral";
}

/** The conversation before the last message: drop it when the last turn is the message being read. */
function before(text: string, turns: readonly ChatTurn[]): readonly ChatTurn[] {
  const last = turns[turns.length - 1];
  return last && last.sender === "me" && last.body.trim() === text.trim() ? turns.slice(0, -1) : turns;
}

/**
 * How many of their earlier messages were part of the same hard moment: the
 * run of messages back from this one that were support, or plain answers
 * inside it. A message that asks for a push ends the run.
 */
export function supportDepth(text: string, turns: readonly ChatTurn[]): number {
  const prior = before(text, turns).slice(-8);
  let depth = 0;
  for (let i = 0; i < prior.length; i++) {
    const t = prior[i];
    if (t.sender !== "me") continue;
    const answeredAsk = i > 0 && prior[i - 1].sender === "coach" && wasAsked(prior[i - 1].body);
    if (answeredAsk) {
      depth = WANTS_PUSH.test(t.body) && !WANTS_TALK.test(t.body) ? 0 : depth + 1;
      continue;
    }
    const raw = rawMode(t.body);
    if (raw === "support") depth += 1;
    else if (raw === "neutral") depth = depth > 0 ? depth + 1 : 0;
    else if (raw === "push") depth = 0;
  }
  return depth;
}

/**
 * Which one a message needs. Safety first: anything heavy is support. If the
 * last thing the coach said was the question "push or talk?", the answer
 * decides. A message with both kinds of signal, or only a vague bad day, is
 * unclear. A plain message in the middle of a hard moment stays support.
 */
export function classifyMode(text: string, turns: readonly ChatTurn[] = []): CoachMode {
  const raw = rawMode(text);
  const prior = before(text, turns);
  const last = prior[prior.length - 1];
  if (last && last.sender === "coach" && wasAsked(last.body) && raw !== "support") {
    if (WANTS_TALK.test(text)) return "support";
    if (WANTS_PUSH.test(text) || raw === "push") return "push";
  }
  if (raw === "support" || raw === "push" || raw === "unclear") return raw;
  if (ASKS_PUSH.test(text)) return "push";
  return supportDepth(text, turns) > 0 ? "support" : "push";
}

/** The check-in the last coach message was, when they are answering one after a slip or a missed item. */
function answeringCheckin(text: string, turns: readonly ChatTurn[]): "slip" | "missed" | null {
  const last = before(text, turns).slice(-1)[0];
  if (!last || last.sender !== "coach") return null;
  if (last.trigger === "slip") return "slip";
  if (last.trigger === "missed_item") return "missed";
  return null;
}

/** True when anything they said in the conversation so far reads as more than a bad day. */
export function careInPlay(turns: readonly ChatTurn[]): boolean {
  return turns.some((t) => t.sender === "me" && CARE.test(t.body));
}

// ---------- the fixed lines ----------

/** These never go through a voice and never carry a quote. The reply to "are you a therapist" is `THERAPIST_REPLY` in coachSupport. */
export const CARE_REPLY =
  "That sounds like more than a bad day, and I am not going to push you through it. This is bigger than a checklist. Talk to someone who can be with you right now: someone you trust, or call or text 988, any time. If you are in danger right now, call 911. The list can wait.";
export const EMERGENCY_REPLY = "Stop now. Chest pain, trouble breathing or passing out is not something to push through. Call 911 or get to urgent care.";
export const INJURY_REPLY =
  "Stop the session. Sharp pain, pain in a joint or pain on one side is not soreness, and it is not something to push through. Rest it, ice it, and get it checked if it is still there tomorrow. Tick what you finished and leave the rest.";

// ---------- answering by rule ----------

const PREFER: Record<Exclude<Topic, "care" | "emergency" | "injury" | "therapist">, string[]> = {
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
  urge: URGE_WALK,
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
  /** Which one the message needed. Missing on replies from an older build. */
  mode?: CoachMode;
}

/**
 * The reply written from rules: one line from the library, one line from
 * their own numbers, one thing to do now. Runs with no API key, when the
 * model call fails and offline, so it has to be worth reading on its own.
 */
export function chatFallback(
  text: string,
  ctx: ChatContext,
  voice: CoachVoice,
  usedQuotes: readonly string[] = [],
  library: readonly LibCandidate[] = [],
  turns: readonly ChatTurn[] = [],
): ChatReply {
  let topic = classifyMessage(text);
  if (topic === "care") return { body: CARE_REPLY, quote: null, topic, mode: "support" };
  if (topic === "emergency") return { body: EMERGENCY_REPLY, quote: null, topic, mode: "push" };
  if (topic === "injury") return { body: INJURY_REPLY, quote: null, topic, mode: "push" };
  if (topic === "therapist") return { body: THERAPIST_REPLY, quote: null, topic, mode: "support" };
  // Care in the conversation so far keeps the careful reply, not a coach's.
  if (careInPlay(turns.slice(-6))) return { body: CARE_REPLY, quote: null, topic: "care", mode: "support" };

  const mode = classifyMode(text, turns);
  if (mode === "unclear") return { body: ASK_PUSH_OR_TALK[voice], quote: null, topic, mode };
  const after = answeringCheckin(text, turns);
  // "Push me" in answer to the question is a push with nothing else to go on.
  const last = before(text, turns).slice(-1)[0];
  if (mode === "push" && topic === "general" && last?.sender === "coach" && wasAsked(last.body)) topic = "unmotivated";
  if (mode === "support") {
    return { body: supportReply({ text, ctx, voice, turns, stage: supportDepth(text, turns), after }), quote: null, topic, mode };
  }
  if (after && topic !== "urge") return { body: afterCheckinReply(after, voice, ctx), quote: null, topic, mode: "support" };
  const used = new Set(usedQuotes);
  const key = PREFER[topic].find((k) => !used.has(k)) ?? null;
  const quote = quoteByKey(key);
  // A line from the Library comes first when he saved it, when the topic is open ended (an angry or lonely
  // message has no line of the coach's own), and when the coach's own lines for it are all used this week.
  const lib = library.find((c) => !used.has(c.key)) ?? null;
  const libraryFirst = !!lib && (!!lib.saved || topic === "general" || !quote);
  const line = libraryFirst && lib ? { text: candidateLine(lib), key: lib.key } : quote ? { text: quoteLine(quote), key: quote.key } : lib ? { text: candidateLine(lib), key: lib.key } : null;
  const lines = [line?.text ?? "", dataLine(topic, text, ctx), DO_NOW[topic][voice]].filter(Boolean);
  return { body: cleanCoachText(lines.join("\n")), quote: line?.key ?? null, topic, mode };
}

// ---------- the prompt ----------

const VOICE_PROMPT: Record<CoachVoice, string> = {
  stoic: "Calm stoic. Even and unhurried, few words, no heat. You state things as they are and leave the person to act on them.",
  sergeant: "Drill sergeant. Hard, blunt, short orders, no cushioning. You are tough on excuses and never on the person: no insults, no shaming, no name calling.",
  brother: "Big brother. Warm and straight, like an older brother who has been through it. Plain talk, a little dry humor is fine, and you still do not let them off the hook.",
};

const SCHOOLS: QuoteSchool[] = ["stoic", "arrow", "why", "athlete", "samurai"];

const SYSTEM = [
  "You are the coach inside Lock In, an app one person uses to stay consistent in life over the long run: body, money, school, their brand, staying clean. You are part coach and part therapist: someone in their corner who keeps them going. You know them and their numbers, you listen when they are low, you push when they are making excuses, and you notice them slipping before they say anything. They message you the way they would message a coach, in the moment. Write to them as \"you\".",
  "",
  "Two modes",
  "The <mode> tag says which one this message needs. Follow it.",
  "push: they are tired, sore or bargaining. Two or three short lines, 60 words at most. First one idea that reframes the moment. Then one thing to do right now: small, concrete, doable in the next ten minutes. When their own data makes the point land, use it: a streak, today's count, the plan, the money floor. Hard on the excuse, never on the person. No lectures, no lists, no paragraphs. At most one question, and only when you need the answer.",
  "support: they are down, stressed, ashamed or stuck. Slow down. Warm, never hard. Up to 100 words, plain sentences, one question at the end. Listen before you coach: say back what you heard in your own words, then ask what is going on or what the hardest part is. No quotes, no tough talk, no to-do list and no data dump until you understand what is actually happening. Offer one small step only after they have told you more, or if they ask what to do.",
  "You remember the conversation below. Pick up what they said earlier when it matters. Do not repeat a line or an opening you already used in the conversation; say it a different way.",
  "",
  "How to help like a therapist would",
  "Ask open questions, one at a time. Reflect back what they said before you give any advice.",
  "Catch the thought behind a slip, like \"I already messed up today so it doesn't matter\". Call it a thought, not a fact, and help them see it differently: one slip does not cancel the day.",
  "Use their own reasons. <profile> holds their why and what has worked. If there is no why yet, ask once why this matters to them. Later, play their own words back to them instead of preaching.",
  "Cravings: walk them through riding out the urge. It rises, peaks and passes whether they obey it or not. Give them something to do with their body for ten minutes, and ask them to tell you when it drops.",
  "Look under the slip: sleep, stress, food, being alone, money pressure. Use <moods> and the data to connect days, for example mood low for three days and bed on time missed. Ask about one of these, do not list them.",
  "No shame after a slip. Name it plainly, give a reset plan for the next 24 hours in three small concrete steps, and move on. One bad day is data, not a verdict. If your last message was a check-in after a slip or a missed item and they answered it, give the reset plan now.",
  "Notice wins too, not just misses. When they did the thing, say so in a line.",
  "",
  "Holding them to things",
  "<commitments> are things they told you they would do. If one is waiting (the time has passed and they have not said how it went), ask about it first. When one was kept, say so. When one was missed, no shame: ask what got in the way and what time they will do it instead.",
  "<today_so_far> says what is on their schedule right now (block) and what is next. Talk to that when it fits.",
  "",
  "Where the ideas come from (push mode only)",
  ...SCHOOLS.map((k) => `${SCHOOL_LABEL[k]}: ${SCHOOL_IDEA[k]}`),
  "",
  "Quotes",
  "In push mode you may quote one line from the \"quotes\" list, word for word, with the name after it. Never quote a line that is not on that list, never reword one, never credit one to someone else. Do not quote in every reply: when your last message carried a quote, make the point in your own words this time. In support mode never quote anyone.",
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
  "You are not a licensed therapist and you do not diagnose anything. If they ask, say so plainly. If <recurring> says yes, the same low days keep coming back: say once, gently, that talking to a real therapist is worth it.",
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
  /** Which one the last message needs. Support replies have a higher length limit and no quotes. */
  mode: CoachMode;
}

function transcript(turns: readonly ChatTurn[]): string {
  return turns
    .slice(-MAX_TURNS)
    .map((t) => `${t.sender === "me" ? "Them" : "Coach"}: ${t.body.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE)}`)
    .join("\n");
}

/** What goes to the model. `usedQuotes` are left off the list, so a line cannot come back within the week. */
export function chatPrompt(ctx: ChatContext, turns: readonly ChatTurn[], voice: CoachVoice, usedQuotes: readonly string[] = [], library: readonly LibCandidate[] = []): ChatPrompt {
  const care = careInPlay(turns.slice(-6));
  if (care) {
    return { system: CARE_SYSTEM, user: `<conversation>\n${transcript(turns)}\n</conversation>\n\nReply to their last message. Reply with the message only.`, maxTokens: 300, care, mode: "support" };
  }
  const last = turns[turns.length - 1];
  const mode = last && last.sender === "me" ? classifyMode(last.body, turns) : "push";
  const used = new Set(usedQuotes);
  const quotes =
    mode === "support"
      ? []
      : [
          ...QUOTES.filter((q) => !used.has(q.key)).map((q) => `${SCHOOL_LABEL[q.school]}: "${q.text}" ${q.by}`),
          // Real lines from his own library, picked for what he wrote. The ones he saved are marked: he chose those.
          ...library.filter((c) => !used.has(c.key)).map((c) => `${c.saved ? "Saved by them" : "The Library"}: "${c.text}" ${c.by}`),
        ];
  const quoteNote = mode === "support" ? "Support mode: no quotes." : quotes.length > 0 ? quotes.join("\n") : "None left this week. Use your own words.";
  const profile = ctx.profile ?? [];
  const user = [
    `<mode>\n${mode === "unclear" ? "unclear: you cannot tell if they want a push or want to talk. Ask exactly that, in one line, and nothing else." : mode}\n</mode>`,
    `<data>\n${JSON.stringify(ctx.snapshot)}\n</data>`,
    `<today_so_far>\n${JSON.stringify(ctx.now)}\n</today_so_far>`,
    `<why>\n${ctx.why.length > 0 ? ctx.why.join("\n") : "Nothing written yet."}\n</why>`,
    `<profile>\n${profile.length > 0 ? profile.map((p) => `${p.kind}: ${p.body}`).join("\n") : "Nothing yet. You do not know their why."}\n</profile>`,
    `<commitments>\n${ctx.commitments && ctx.commitments.length > 0 ? JSON.stringify(ctx.commitments) : "None."}\n</commitments>`,
    `<moods>\n${ctx.moods && ctx.moods.length > 0 ? JSON.stringify(ctx.moods) : "None logged."}\n</moods>`,
    `<recurring>\n${ctx.recurring ? "yes" : "no"}\n</recurring>`,
    `<quotes>\n${quoteNote}\n</quotes>`,
    `<conversation>\n${transcript(turns)}\n</conversation>`,
    "Reply to their last message. Reply with the message only.",
  ].join("\n\n");
  return { system: `${SYSTEM}\n\nVoice\n${VOICE_PROMPT[voice]}\nIn support mode every voice is warm and gentle: the voice changes the words, never the warmth.`, user, maxTokens: mode === "support" ? 450 : 300, care, mode };
}

// ---------- checking what the model wrote ----------

/** Hard ceilings, well above what the prompt asks for. Support replies may run longer and ask questions. */
export const MAX_REPLY_WORDS = 110;
export const MAX_SUPPORT_WORDS = 180;

export type ReplyProblem =
  | { kind: "empty" }
  | { kind: "too_long"; mode?: CoachMode }
  | { kind: "numbers"; numbers: number[] }
  | { kind: "quote_repeat"; keys: string[] }
  | { kind: "quote_unknown"; text: string }
  | { kind: "quote_in_support" };

/** True when a reply quotes a line from the library, or any long quoted passage that is not something they said. */
function quotesSomeone(body: string, turns: readonly ChatTurn[], library: readonly LibCandidate[]): boolean {
  if (quotesIn(body).length > 0 || libraryQuotesIn(body, library).length > 0) return true;
  const theirs = turns.filter((t) => t.sender === "me").map((t) => t.body.toLowerCase());
  return [...body.matchAll(/"([^"]{24,})"/g)].some((m) => !theirs.some((t) => t.includes(m[1].toLowerCase().slice(0, 24))));
}

/**
 * What is wrong with a reply, or null. A number has to be in the data, the
 * library or their messages. A quoted line has to be from the library and not
 * one used this week.
 */
export function replyProblem(
  body: string,
  ctx: ChatContext,
  turns: readonly ChatTurn[],
  usedQuotes: readonly string[],
  care = false,
  library: readonly LibCandidate[] = [],
  mode: CoachMode = "push",
): ReplyProblem | null {
  if (!body.trim()) return { kind: "empty" };
  if (wordCount(body) > (mode === "support" ? MAX_SUPPORT_WORDS : MAX_REPLY_WORDS)) return mode === "support" ? { kind: "too_long", mode } : { kind: "too_long" };
  if (care) return null;
  // 988 and 911 are always allowed: the coach may point at them at any time.
  const known = { ctx, quotes: [...QUOTES.map((q) => q.text), ...library.map((c) => c.text)], said: turns.map((t) => t.body), lines: ["988", "911"] };
  const numbers = unknownNumbers(body, known);
  if (numbers.length > 0) return { kind: "numbers", numbers };
  // A line from the Library has to be there whole, word for word. Its opening without the rest is a line that was cut or reworded.
  // Support mode listens first. A quote there, from anyone, is a lecture. Their own words played back are fine.
  if (mode === "support" && quotesSomeone(body, turns, library)) return { kind: "quote_in_support" };
  const reworded = misquotedFrom(body, library)[0];
  if (reworded) return { kind: "quote_unknown", text: reworded.text };
  const quoted = [...quotesIn(body), ...libraryQuotesIn(body, library)];
  const repeat = quoted.filter((k) => usedQuotes.includes(k));
  if (repeat.length > 0) return { kind: "quote_repeat", keys: repeat };
  const theirs = turns.filter((t) => t.sender === "me").map((t) => t.body.toLowerCase());
  for (const m of body.matchAll(/"([^"]{24,})"/g)) {
    const inner = m[1];
    if (quotesIn(inner).length > 0 || libraryQuotesIn(inner, library).length > 0) continue;
    if (theirs.some((t) => t.includes(inner.toLowerCase().slice(0, 24)))) continue;
    return { kind: "quote_unknown", text: inner };
  }
  return null;
}

/** The key of the first line a reply quotes, from the coach's own lines or the candidates, in the order it appears. */
export function quotedKey(body: string, library: readonly LibCandidate[] = []): string | null {
  const at = (key: string, text: string): number => {
    const i = body.toLowerCase().indexOf(text.toLowerCase().slice(0, 24));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const own = quotesIn(body).map((k) => ({ k, i: at(k, quoteByKey(k)?.text ?? "") }));
  const lib = libraryQuotesIn(body, library).map((k) => ({ k, i: at(k, library.find((c) => c.key === k)?.text ?? "") }));
  const all = [...own, ...lib].sort((a, b) => a.i - b.i);
  return all[0]?.k ?? null;
}

/** Sent back to the model once. */
export function chatCorrection(p: ReplyProblem): string {
  if (p.kind === "numbers") return `These numbers are not in the data: ${p.numbers.join(", ")}. Rewrite it using only numbers from the data, the quotes list or their messages. Reply with the rewritten message only.`;
  if (p.kind === "quote_repeat") return "You already used that quote this week. Rewrite it in your own words, or with a different line from the quotes list. Reply with the rewritten message only.";
  if (p.kind === "quote_unknown") return "That quoted line is not on the quotes list. Rewrite it in your own words, or quote a line from the list word for word. Reply with the rewritten message only.";
  if (p.kind === "quote_in_support") return "No quotes in support mode. Say it in your own words, warm, and ask one question. Reply with the rewritten message only.";
  if (p.kind === "too_long" && p.mode === "support") return "Too long. About 100 words at most, one question at the end. Reply with the rewritten message only.";
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

/** Turns from a request, cleaned: the optional trigger is kept only when it is a short string. */
export function cleanTurns(turns: readonly ChatTurn[]): ChatTurn[] {
  return turns.map((t) => (typeof t.trigger === "string" && t.trigger.length <= 20 ? { sender: t.sender, body: t.body, trigger: t.trigger } : { sender: t.sender, body: t.body }));
}

const PROFILE_KIND_SET: ReadonlySet<string> = new Set(["why", "trigger", "what_works", "working_on", "said"]);
const COMMIT_STATUS: ReadonlySet<string> = new Set(["open", "done", "missed", "dropped"]);

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * The optional parts of a request's context, cleaned: shapes checked, text cut
 * to a sensible length and stripped of dashes. Whatever is wrong is dropped, so
 * a bad extra can never turn a good request into an error.
 */
export function cleanContext(ctx: ChatContext): ChatContext {
  const out: ChatContext = { snapshot: ctx.snapshot, now: { time: ctx.now.time, done: ctx.now.done, total: ctx.now.total, left: ctx.now.left }, why: ctx.why };
  const block = ctx.now.block as Partial<NonNullable<TodaySoFar["block"]>> | null | undefined;
  if (block && typeof block === "object" && str(block.name, 80)) {
    out.now.block = { name: cleanCoachText(str(block.name, 80)), kind: str(block.kind, 20), start: str(block.start, 12), end: str(block.end, 12) };
  }
  const next = ctx.now.next as Partial<NonNullable<TodaySoFar["next"]>> | null | undefined;
  if (next && typeof next === "object" && str(next.name, 80)) out.now.next = { name: cleanCoachText(str(next.name, 80)), start: str(next.start, 12) };

  if (Array.isArray(ctx.profile)) {
    out.profile = ctx.profile
      .filter((p): p is ProfileItem => !!p && typeof p === "object" && PROFILE_KIND_SET.has((p as ProfileItem).kind) && !!str((p as ProfileItem).body, 200))
      .slice(0, 24)
      .map((p) => ({ kind: p.kind, body: cleanCoachText(str(p.body, 200)) }));
  }
  if (Array.isArray(ctx.commitments)) {
    out.commitments = ctx.commitments
      .filter((c): c is CommitmentItem => !!c && typeof c === "object" && !!str((c as CommitmentItem).what, 100) && COMMIT_STATUS.has((c as CommitmentItem).status))
      .slice(0, 8)
      .map((c) => ({ what: cleanCoachText(str(c.what, 100)), when: str(c.when, 40), status: c.status, waiting: c.waiting === true }));
  }
  if (Array.isArray(ctx.moods)) {
    out.moods = ctx.moods
      .filter((m): m is MoodItem => !!m && typeof m === "object" && typeof (m as MoodItem).mood === "number" && (m as MoodItem).mood >= 1 && (m as MoodItem).mood <= 5)
      .slice(0, 8)
      .map((m) => ({ date: str(m.date, 10) as DateStr, label: str(m.label, 12), mood: m.mood, note: m.note ? cleanCoachText(str(m.note, 120)) : null }));
  }
  if (ctx.recurring === true) out.recurring = true;
  return out;
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
  /** True when a drift flag already covers the missed days, so the plain "yesterday" check-in is left out. */
  driftCoversMisses?: boolean;
}

export interface Checkin {
  trigger: Exclude<CoachTrigger, "chat">;
  check_key: string;
  body: string;
}

/** How long after the workout block ends the coach still asks about it. */
const WORKOUT_WINDOW_MIN = 180;

const ASK: Record<"post_workout" | "slip" | "missed_item", Record<CoachVoice, string>> = {
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

  if (input.enabled.missed_item && !input.driftCoversMisses && input.yesterday && input.yesterday.misses.length > 0) {
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

// ---------- drifting ----------

export interface DriftInput {
  flags: readonly Flag[];
  voice: CoachVoice;
  today: DateStr;
  /** True during quiet hours: nothing is sent. */
  quiet: boolean;
  /** check_key of every check-in already sent. */
  sent: ReadonlySet<string>;
  /** True when a drift message already went out today. At most one a day. */
  sentToday: boolean;
}

const DAYS: Record<number, string> = { 1: "one day", 2: "two days", 3: "three days", 4: "four days", 5: "five days" };
function days(n: number): string {
  return DAYS[n] ?? `${n} days`;
}

/** How many days a drift flag has run. The run reaches yesterday, except mood, whose evidence is the run itself. */
function runOf(f: Flag, today: DateStr): number {
  return f.kind === "mood_drop" ? f.evidence.length : diffDays(f.since, today);
}

type DriftText = Record<1 | 2 | 3, Record<CoachVoice, (n: number) => string>>;

const DRIFT_TEXT: Record<"no_logs" | "missed_streak", DriftText> = {
  no_logs: {
    1: {
      stoic: () => "Nothing was logged yesterday. One quiet day happens. What got in the way?",
      sergeant: () => "Nothing logged yesterday. What happened?",
      brother: () => "I did not see anything logged yesterday. Everything okay? What got in the way?",
    },
    2: {
      stoic: (n) => `${days(n)} with nothing logged. Quiet days add up faster than they feel. Tick one thing today, and tell me what is going on.`,
      sergeant: (n) => `${days(n)} dark. That is a pattern starting. Tick one thing today and tell me what is going on.`,
      brother: (n) => `${days(n)} with nothing logged now. I am not mad, I just want to know where your head is. What is going on?`,
    },
    3: {
      stoic: (n) => `${days(n)} with nothing logged. This is no longer a day off, it is a drift, and it is easier to stop now than later. Tell me what is going on, then do one item.`,
      sergeant: (n) => `${days(n)} with nothing logged. That is drift. No speeches: tell me what happened and tick one item right now.`,
      brother: (n) => `${days(n)} with nothing logged. I would rather say it straight than let it slide. What is going on with you? Start with one small item.`,
    },
  },
  missed_streak: {
    1: {
      stoic: (n) => `${days(n)} in a row closed under half the list. One day is data, two is the start of a trend. What is getting in the way?`,
      sergeant: (n) => `${days(n)} in a row under half the list. What is getting in the way?`,
      brother: (n) => `${days(n)} in a row closed under half the list. Not a verdict, just a trend. What is getting in the way?`,
    },
    2: {
      stoic: (n) => `${days(n)} under half the list. Pick the one item that matters most and give it a time tomorrow. Start there. What is in the way?`,
      sergeant: (n) => `${days(n)} under half the list. Pick the one item that matters most, put a time on it for tomorrow. What is in the way?`,
      brother: (n) => `${days(n)} under half the list now. Let's not try to fix all of it. Pick the one that matters most and give it a time tomorrow. What is in the way?`,
    },
    3: {
      stoic: (n) => `${days(n)} under half the list. This is the point where it either turns or sets in. One item, a fixed time, tomorrow morning. Tell me what is really going on.`,
      sergeant: (n) => `${days(n)} under half the list. That is where it sets in. One item, a fixed time, tomorrow morning. Tell me what is really going on.`,
      brother: (n) => `${days(n)} under half the list. I care too much to let this slide. One item, a fixed time, tomorrow morning. And tell me what is really going on.`,
    },
  },
};

/** Mood is never pushed on. The levels only add what to look at, and at the top, a real person. */
function moodDriftText(f: Flag, level: 1 | 2 | 3, n: number): string {
  const head = f.title.startsWith("Mood has dropped") ? `Your mood has dropped ${days(n)} in a row.` : `Your mood has been low ${days(n)} running.`;
  if (level === 1) return `${head} I would rather hear about that than talk about the list. What has been going on?`;
  if (level === 2) return `${head} Is it sleep, food, stress, being on your own, or money? Tell me which one is loudest.`;
  return `${head} If it has been like this for a while, it is worth talking to someone who does this for a living. I am here too. What is the heaviest part right now?`;
}

/**
 * One message when you are drifting: no logs for a day, missed days running,
 * a mood sliding for days. Gentle at first, more direct the longer it goes,
 * and about mood always warm. At most one a day, never in quiet hours. Each
 * step up in level is sent once; the top level is sent once a day while it lasts.
 */
export function driftCheckins(input: DriftInput): Checkin[] {
  if (input.quiet || input.sentToday) return [];
  const live = input.flags.filter((f) => f.level && DRIFT_ORDER.includes(f.kind));
  const candidates = live
    .map((f) => {
      const level = f.level as 1 | 2 | 3;
      // The date it began is in the key: the key is unique for good, and a drift next month is a new one.
      const key = `drift:${f.key}:${f.since}:${level}${level === 3 ? `:${input.today}` : ""}`;
      return { f, level, key };
    })
    .filter((c) => !input.sent.has(c.key))
    .sort((a, b) => b.level - a.level || DRIFT_ORDER.indexOf(a.f.kind) - DRIFT_ORDER.indexOf(b.f.kind));
  const pick = candidates[0];
  if (!pick) return [];
  const n = runOf(pick.f, input.today);
  const body = pick.f.kind === "mood_drop" ? moodDriftText(pick.f, pick.level, n) : DRIFT_TEXT[pick.f.kind as "no_logs" | "missed_streak"][pick.level][input.voice](n);
  return [{ trigger: "drift", check_key: pick.key, body: cleanCoachText(body) }];
}

const DRIFT_ORDER: Flag["kind"][] = ["mood_drop", "no_logs", "missed_streak"];
