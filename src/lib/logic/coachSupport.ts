// What the coach says when you need to be heard more than pushed, written by
// rule. It runs with no API key, when the model call fails and offline, so
// it has to be worth reading on its own: reflect first, ask one open
// question, no quotes, no to-do list until it understands what is going on.
// Also the reset plan after a slip and the question it asks when it cannot
// tell which one you need.
//
// Pure. No React, no db. Types only from coachChat, so there is no import cycle.

import type { CoachVoice } from "../types";
import { cleanCoachText } from "./coach";
import type { ChatContext, ChatTurn } from "./coachChat";

// ---------- when it cannot tell ----------

/** The question, in the three voices. The words "push or you want to talk" are how a later turn knows it was asked. */
export const ASK_PUSH_OR_TALK: Record<CoachVoice, string> = {
  stoic: "I can tell today is not simple. You want a push or you want to talk?",
  sergeant: "Something is off. You want a push or you want to talk?",
  brother: "Sounds like a lot. You want a push or you want to talk? Either one is fine.",
};

/** True when a coach message was that question. */
export function wasAsked(body: string): boolean {
  return /push or you want to talk/i.test(body);
}

// ---------- the thought behind a slip ----------

const SLIP_THOUGHT =
  /\b(already|ruined|blew it|messed up|screwed up|fucked up|failed|slipped)\b[^.!?]*\b(doesn'?t matter|does not matter|might as well|may as well|what'?s the point|no point|whatever|screw it|fuck it|why bother|why even)\b|\b(might as well|may as well|screw it|fuck it|why bother|what'?s the point of (even )?trying|no point (in )?trying)\b/i;

/** "I already messed up today so it doesn't matter": the thought that turns one slip into a lost day. */
export function slipThought(text: string): boolean {
  return SLIP_THOUGHT.test(text);
}

// ---------- the reset plan ----------

const RESET: Record<CoachVoice, string> = {
  stoic: "Reset for the next 24 hours: water and a real meal, the next block on the schedule on time, and bed on time tonight. Log what set it off so you can see it coming.",
  sergeant: "Reset, next 24 hours: water, a real meal, the next block on time, bed on time tonight. Log what set it off.",
  brother: "Here is the reset for the next 24 hours: water and a real meal, the next block on the schedule on time, and bed on time tonight. Log what set it off so we can catch it next time.",
};

const RESET_MISSED: Record<CoachVoice, string> = {
  stoic: "Reset for the next 24 hours: pick the one item you missed and give it a time on tomorrow's schedule. Eat a real meal, drink water, and be in bed on time.",
  sergeant: "Reset, next 24 hours: the item you missed goes on tomorrow's schedule with a time. Real meal, water, bed on time.",
  brother: "Here is the reset for the next 24 hours: give the item you missed a time on tomorrow's schedule, eat a real meal, drink water, and get to bed on time.",
};

const NOT_A_VERDICT = "One bad day is data, not a verdict.";

function nextUp(ctx: ChatContext): string {
  const n = ctx.now.next;
  return n ? ` Next on the schedule is ${n.name} at ${n.start}.` : "";
}

/** The reset plan for the next 24 hours, after a slip or a missed item. */
export function resetPlan(kind: "slip" | "missed", voice: CoachVoice, ctx: ChatContext): string {
  return `${(kind === "slip" ? RESET : RESET_MISSED)[voice]}${nextUp(ctx)} ${NOT_A_VERDICT}`;
}

/** The reply when they have just told the coach what set off a slip or got in the way. */
export function afterCheckinReply(kind: "slip" | "missed", voice: CoachVoice, ctx: ChatContext): string {
  const heard = kind === "slip" ? "That makes sense. Thank you for telling me straight." : "Okay. That is useful to know.";
  return cleanCoachText(`${heard}\n${resetPlan(kind, voice, ctx)}`);
}

/** The thought "it already counts as a bad day, so it does not matter", answered. */
export function slipThoughtReply(voice: CoachVoice, ctx: ChatContext): string {
  const lead = {
    stoic: "That thought is the real risk, not the slip. A slip is one event. \"So it doesn't matter\" is a story you add to it.",
    sergeant: "Hold on. The slip is done. \"So it doesn't matter\" is the part that costs you the rest of the day, and it is wrong.",
    brother: "I hear you. But listen to the thought: \"I already messed up, so it doesn't matter.\" That is the thing that turns one slip into a lost day.",
  }[voice];
  return cleanCoachText(`${lead}\n${resetPlan("slip", voice, ctx)}\nWhat was going on right before?`);
}

// ---------- listening ----------

export type SupportTheme = "shame" | "lonely" | "stress" | "money" | "sad" | "stuck" | "general";

const THEMES: [SupportTheme, RegExp][] = [
  ["shame", /\b(ashamed|shame|embarrass\w*|guilt\w*|disgust\w*|hate myself|failure|loser|let (everyone|myself|them|him|her) down|disappointed in myself|pathetic)\b/i],
  ["lonely", /\b(lonely|alone|isolated|nobody|no one (cares|gets|there|to talk))\b/i],
  ["money", /\b(rent|bills?|broke|debt|can'?t pay|behind on|evict\w*|money (stress|problems|pressure|is tight)|no money)\b/i],
  ["stress", /\b(stress\w*|overwhelm\w*|anxi\w*|panic\w*|too much|pressure|spiral\w*|can'?t handle|falling apart|so much going on)\b/i],
  ["sad", /\b(sad|depress\w*|cry\w*|cried|numb|empty|hopeless|unhappy|miserable|heartbroken|grie\w*|died|passed away|breakup|broke up|down)\b/i],
  ["stuck", /\b(stuck|lost|nothing works|going nowhere|no direction|don'?t know what to do)\b/i],
];

export function supportTheme(text: string): SupportTheme {
  return THEMES.find(([, rx]) => rx.test(text))?.[0] ?? "general";
}

const OPENER: Record<SupportTheme, string> = {
  shame: "I hear you. That feeling is heavy, and it does not say what you think it says about you.",
  lonely: "Feeling alone with it makes everything weigh more.",
  stress: "That is a lot to carry at once.",
  money: "Money pressure gets into everything else.",
  sad: "I am sorry it is sitting this heavy.",
  stuck: "Being stuck wears on you.",
  general: "I hear you.",
};

const FIRST_QUESTION: Record<SupportTheme, string> = {
  shame: "What happened? Start anywhere, I am not going anywhere.",
  lonely: "When did it start feeling like this?",
  stress: "What is the biggest piece of it right now?",
  money: "What is the pressure exactly? Rent, a bill, a number you are chasing?",
  sad: "What has been going on?",
  stuck: "What are you stuck on, exactly?",
  general: "What is going on? Start anywhere.",
};

/** Questions that look under the surface, one at a time: sleep, food, being alone, money, what changed. */
const UNDER: string[] = [
  "How have you been sleeping the last few days?",
  "Have you eaten properly today?",
  "Have you been around people, or mostly on your own?",
  "Is money weighing on this too?",
  "What changed in the last few days?",
];

const SMALL_STEP = "If it helps, we can pick one small thing for the next hour. Or we can keep talking. Your call.";

const THERAPIST_NUDGE = "If this keeps coming back week after week, it is worth talking to a real therapist. I am a coach in an app, not a licensed one, and you deserve more than I can give on that.";

/** What they said, cut to a short phrase at a word boundary. Empty when there is not enough to quote. */
function snippet(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.split(" ").length < 5) return "";
  if (t.length <= 70) return t.replace(/[.!?,\s]+$/, "");
  const cut = t.slice(0, 70);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[.!?,\s]+$/, "");
}

/** Mood and sleep from their own numbers, when they point the same way. Empty when there is nothing to connect. */
export function connectLine(ctx: ChatContext): string {
  const moods = ctx.moods ?? [];
  const low = moods.filter((m) => m.mood <= 2).length;
  const bed = ctx.snapshot.items.find((i) => i.key === "bed");
  const bedBad = !!bed && bed.days7 >= 3 && bed.hits7 * 2 < bed.days7;
  if (low >= 2 && bedBad && bed) return `Your mood has been low on ${low} of the last ${moods.length} days you logged, and bed on time is ${bed.hits7} of the last ${bed.days7} nights. Those two tend to move together.`;
  if (low >= 2) return `Your mood has been low on ${low} of the last ${moods.length} days you logged.`;
  return "";
}

export interface SupportInput {
  text: string;
  ctx: ChatContext;
  voice: CoachVoice;
  /** The conversation so far, with their message last. */
  turns: readonly ChatTurn[];
  /** How many of their earlier messages were part of this same hard moment (`supportDepth`). */
  stage: number;
  /** Set when they are answering a check-in after a slip or a missed item. */
  after?: "slip" | "missed" | null;
}

/**
 * A listening reply. First message of a heavy moment: reflect, then one open
 * question. After they answer: reflect their words, then a question that
 * looks under it, one at a time. A few turns in: offer one small step, and
 * play their own why back when the profile has one. No quotes, no orders.
 */
export function supportReply(input: SupportInput): string {
  const { text, ctx, voice, turns, after } = input;
  const stage = Math.min(4, input.stage);
  if (slipThought(text)) return slipThoughtReply(voice, ctx);
  if (after) return afterCheckinReply(after, voice, ctx);

  const said = turns.filter((t) => t.sender === "coach").map((t) => t.body).join("\n");
  const theme = supportTheme(text);
  const lines: string[] = [];

  const quoted = snippet(text);
  if (stage === 0) {
    lines.push(OPENER[theme]);
    const link = connectLine(ctx);
    if (link) lines.push(link);
    lines.push(FIRST_QUESTION[theme]);
  } else {
    lines.push(quoted ? `You said "${quoted}". Thank you for telling me.` : "Thank you for telling me that.");
    const why = ctx.profile?.find((p) => p.kind === "why");
    if (stage >= 2 && why && !said.includes(why.body)) {
      lines.push(`Earlier you told me why this matters: ${why.body}. Does that still feel true right now?`);
    } else if (stage >= 3 && !said.includes(SMALL_STEP)) {
      lines.push(SMALL_STEP);
    } else {
      const next = UNDER.find((q) => !said.includes(q)) ?? FIRST_QUESTION[theme];
      lines.push(next);
    }
  }
  if (ctx.recurring && !/therapist/i.test(said)) lines.push(THERAPIST_NUDGE);
  return cleanCoachText(lines.join("\n"));
}

// ---------- when they ask what the coach is ----------

export const THERAPIST_REPLY =
  "I am not a licensed therapist. I am a coach in an app: I know your numbers, I will listen, and I will keep you honest. For anything heavy, or anything that keeps coming back, talk to a real therapist. If you are in crisis, call or text 988 any time.";

// ---------- cravings ----------

/** Riding out an urge: it rises, peaks and passes. Something to do in the meantime. */
export const URGE_WALK: Record<CoachVoice, string> = {
  stoic: "Set a timer for ten minutes and leave the room you are in. Notice the urge rise, peak and fall. It passes whether you obey it or not. Drink water, move, and tell me when it drops.",
  sergeant: "Ten minutes on a timer. Get up, leave the room, water, pushups. Watch it rise, peak and drop. Message me when it ends.",
  brother: "Give it ten minutes and get out of the room you are in. Drink some water and keep your hands busy. It rises, it peaks, it passes. Hit me when it drops.",
};
