// Coach, step 2: wording. Two ways to turn a snapshot into a note.
//
// - Rule-based templates (morningFallback, weeklyFallback). These run when
//   there is no API key, when the model call fails, and when the phone is
//   offline, so they have to be worth reading on their own.
// - The prompt for the model (coachPrompt). It gets the same snapshot and is
//   held to its numbers.
//
// Pure. No dashes other than the plain hyphen anywhere in the output.

import { cleanCoachText, money, plural, type CoachSnapshot, type MissLine } from "./coach";

export type CoachKind = "morning" | "weekly";

function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function lower(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

const SHORT: Record<string, string> = { wake: "wake time", earned: "earnings", bed: "bedtime", study: "study block", business: "business move" };

/** How an item reads mid sentence: "earnings", "wake time", "no smoking". */
function short(key: string | null, name: string): string {
  return (key && SHORT[key]) || lower(name);
}

/** "6:30 AM" and "7:30 AM" to "6:30 to 7:30 AM". Keeps both halves when they differ. */
function span(start: string, end: string): string {
  const [s, sHalf] = start.split(" ");
  const [, eHalf] = end.split(" ");
  return sHalf === eHalf ? `${s} to ${end}` : `${start} to ${end}`;
}

function planLine(s: CoachSnapshot): string {
  const parts: string[] = [];
  const blocks = s.plan.blocks;
  const workout = blocks.find((b) => b.kind === "workout");
  if (s.plan.workout) parts.push(workout ? `${s.plan.workout.name} at ${workout.start}` : s.plan.workout.name);
  else if (workout) parts.push(`${lower(workout.name)} at ${workout.start}`);
  for (const b of blocks) {
    if (b.kind === "class") parts.push(`class ${span(b.start, b.end)}`);
    if (b.kind === "delivery") parts.push(`${lower(b.name)} ${span(b.start, b.end)}`);
  }
  const study = blocks.find((b) => b.kind === "study");
  if (study) parts.push(`study at ${study.start}`);
  if (parts.length === 0) return "Today: nothing on the schedule yet. Add blocks in Plan.";
  return `Today: ${list(parts.slice(0, 5))}.`;
}

function missText(m: MissLine): string {
  const name = short(m.key, m.name);
  if (m.logged && m.gap) return `${name} (${m.logged}, ${m.gap})`;
  if (m.logged) return `${name} (${m.logged})`;
  if (m.state === "off") return `${name} (logged late or incomplete)`;
  return name;
}

function yesterdayLine(s: CoachSnapshot): string {
  const y = s.yesterday;
  if (!y) return s.days.length === 0 ? "Yesterday: nothing behind you yet. This is day 1." : "";
  const pending = y.pending.length > 0 ? ` Still to check: ${list(y.pending.map(lower))}.` : "";
  if (y.done === 0 && y.misses.every((m) => m.state === "open")) return `Yesterday: nothing logged.${pending}`;
  if (y.misses.length === 0) return `Yesterday: ${y.done} of ${y.total}, nothing missed.${pending}`;
  const shown = y.misses.slice(0, 4).map(missText);
  const more = y.misses.length - shown.length;
  return `Yesterday: ${y.done} of ${y.total}. Missed ${list(shown)}${more > 0 ? `, plus ${more} more` : ""}.${pending}`;
}

function moneyLine(s: CoachSnapshot): string {
  const m = s.money;
  if (m.target <= 0) return `Money: ${money(m.total)} so far. Floor is ${money(m.floor)} today.`;
  if (m.state === "hit") return `Money: ${money(m.total)}, past the ${money(m.target)} target. The ${money(m.floor)} floor still stands today.`;
  if (m.state === "past") return `Money: ${money(m.total)} of ${money(m.target)}, and ${m.deadlineLabel} has passed. Set a new target in Money. Floor is ${money(m.floor)} today.`;
  const head = `Money: ${money(m.total)} of ${money(m.target)}, ${plural(m.daysLeft, "day")} left through ${m.deadlineLabel}.`;
  const need = m.neededPerDay ?? 0;
  if (m.floorCovers) return `${head} ${money(need)} a day gets there, and the floor is still ${money(m.floor)}.`;
  return `${head} That takes ${money(need)} a day, so the ${money(m.floor)} floor is not enough right now.`;
}

function watchLine(s: CoachSnapshot): string {
  if (s.flags.length === 0) return "";
  const first = s.flags[0];
  const rest = s.flags.length - 1;
  return `Watch: ${lower(first.title)}.${rest > 0 ? ` ${plural(rest, "more flag")} in Coach.` : ""}`;
}

/**
 * Where things stand over time. In ongoing mode this is consistency, so one
 * missed day reads as one day and never as starting over. In a challenge it
 * is the day count. Left out until there are a few days to speak of.
 */
function standingLine(s: CoachSnapshot): string {
  const t = s.today;
  if (t.mode === "challenge" && t.dayNumber !== null && t.lengthDays !== null) {
    return t.dayNumber >= t.lengthDays ? `Last day of ${t.lengthDays}.` : "";
  }
  const c = t.consistency;
  if (c.days < 3) return "";
  return `Consistency: ${c.label} locked in.`;
}

/** The morning brief from templates. A few short lines. */
export function morningFallback(s: CoachSnapshot): string {
  if (s.today.phase === "before") return "Nothing is scored yet. Set the schedule and targets, then come back on day 1.";
  return cleanCoachText([planLine(s), yesterdayLine(s), moneyLine(s), standingLine(s), watchLine(s)].filter(Boolean).join("\n"));
}

/** The Sunday review from templates: what held, what slipped, one change. */
export function weeklyFallback(s: CoachSnapshot): string {
  const w = s.week;
  if (w.daysScored === 0) return "No scored days in this week yet.";
  const counts: string[] = [];
  if (w.full > 0) counts.push(plural(w.full, "full day"));
  if (w.partial > 0) counts.push(plural(w.partial, "partial day"));
  if (w.missed > 0) counts.push(plural(w.missed, "missed day"));
  const lines: string[] = [`${w.label}: ${counts.join(", ")}.`];

  const held = w.items.filter((r) => r.of > 0 && r.hits === r.of);
  if (held.length > 0) {
    const shown = held.slice(0, 5).map((r) => short(r.key, r.name));
    lines.push(`Held: ${list(shown)}${held.length > shown.length ? `, plus ${held.length - shown.length} more` : ""}, every day (${held[0].of} of ${held[0].of}).`);
  } else {
    lines.push("Held: nothing went the full week.");
  }

  const slipped = w.items.filter((r) => r.hits < r.of).sort((a, b) => b.of - b.hits - (a.of - a.hits));
  if (slipped.length > 0) {
    const shown = slipped.slice(0, 3).map((r) => `${short(r.key, r.name)} ${r.hits} of ${r.of}${r.note ? ` (${r.note})` : ""}`);
    lines.push(`Slipped: ${shown.join("; ")}.`);
  } else {
    lines.push("Slipped: nothing.");
  }

  const extra: string[] = [`${money(w.earned)} earned, floor hit ${w.floorDays} of ${plural(w.daysScored, "day")}`];
  for (const v of w.slips) extra.push(`${plural(v.count, `${v.vice} slip`)}`);
  if (w.weightChange) extra.push(`weight ${w.weightChange}`);
  const undone = w.weekly.filter((i) => !i.done).map((i) => lower(i.name));
  if (undone.length > 0) extra.push(`not done this week: ${list(undone)}`);
  lines.push(`Also: ${extra.join(", ")}.`);

  lines.push(`One change: ${s.suggestedChange}`);
  return cleanCoachText(lines.join("\n"));
}

export function fallbackFor(kind: CoachKind, s: CoachSnapshot): string {
  return kind === "weekly" ? weeklyFallback(s) : morningFallback(s);
}

// ---------- the prompt ----------

const VOICE = [
  "You are the coach inside Lock In, an app one person uses to stay consistent in life over the long run: structured days, one daily checklist, and sometimes a set challenge on top. You have read their data. Write to them directly as \"you\".",
  "",
  "How to read time",
  "\"today.mode\" is \"ongoing\" or \"challenge\". Ongoing is the default and has no end: there is no day count, so never invent one. In a challenge, \"today.dayNumber\" of \"today.lengthDays\" is the day count for \"today.challenge\".",
  "A missed item or a slip never resets anything and never means starting over. It is one day. \"today.consistency.label\" says how many recent days were full: use that wording when you speak about how it is going over time, and keep streaks as a detail.",
  "",
  "Voice",
  "Direct, short, specific. You sound like a coach who has read the numbers and respects the person reading. Plain words a friend would use.",
  "Never preachy and never clinical. No pep talk, no praise padding, no exclamation marks, no emoji.",
  "No moralizing about the vices. A slip is a data point with a time and a trigger, nothing more. Do not comment on what it says about the person.",
  "No hedging. Do not write \"maybe\", \"it seems\", \"you might consider\", \"try to\". Say what the data shows and what to do.",
  "No bullet points, no numbered lists, no headings, no markdown, no bold. Plain sentences only.",
  "Never use an em dash or an en dash. Use a period, a comma, or the word \"to\".",
  "",
  "Facts",
  "Use only what is in the data block. Every number, date, time, name and streak you mention must appear there exactly as given.",
  "Do not do arithmetic to produce a number that is not already in the data. Do not round or estimate.",
  "Do not invent causes, feelings, events, or anything the person did. If it is not in the data, leave it out.",
  "Patterns: mention only the patterns listed under \"flags\". They were detected by fixed rules. Do not point out any other trend, pattern or link between things, even if you think you see one. If \"flags\" is empty, mention no pattern.",
].join("\n");

const MORNING = [
  "Write this morning's brief.",
  "It has to be read in about 15 seconds on a phone: 70 words at most, 3 or 4 short sentences, no line breaks.",
  "In this order:",
  "1. Today's plan from \"plan\": the workout by name and the fixed blocks with their times. Skip filler blocks like wake, shower and bed.",
  "2. Yesterday from \"yesterday\": what was missed, with the logged number and the gap. If nothing was missed, say so in a few words. Items under \"pending\" are not misses, they just have not been checked yet. If \"yesterday\" is null, skip this.",
  "3. Money from \"money\": the total against the target and the deadline, and what a day needs to bring in. The daily floor never drops, even when ahead. When \"money.target\" is 0 there is no target: give only today's floor and what was earned.",
  "4. If \"flags\" has entries, end with the first one in one short sentence. Otherwise end after the money.",
  "Reply with the brief only.",
].join("\n");

const WEEKLY = [
  "Write the Sunday review for the week in \"week\".",
  "120 words at most. Three short paragraphs separated by a blank line.",
  "First paragraph: what held. Name the items and their counts from \"week.items\".",
  "Second paragraph: what slipped, with the numbers. Bring in a flag from \"flags\" when it explains a slip.",
  "Third paragraph: one change for next week. Exactly one, never a list and never an alternative. It must be concrete: a specific action tied to a time, a block or a number from the data, something that can be done without deciding anything else. Start this paragraph with \"One change:\". \"suggestedChange\" is the rule-based pick. Use it, or write a sharper one that the data supports.",
  "Reply with the review only.",
].join("\n");

export interface CoachPrompt {
  system: string;
  user: string;
  maxTokens: number;
}

/** What gets sent to the model. The snapshot goes in whole, as JSON. */
export function coachPrompt(kind: CoachKind, snapshot: CoachSnapshot): CoachPrompt {
  return {
    system: VOICE,
    user: `<data>\n${JSON.stringify(snapshot)}\n</data>\n\n${kind === "weekly" ? WEEKLY : MORNING}`,
    maxTokens: kind === "weekly" ? 500 : 300,
  };
}

/** Sent back to the model once when it used numbers that are not in the data. */
export function correctionPrompt(numbers: number[]): string {
  return `These numbers are not in the data: ${numbers.join(", ")}. Rewrite it using only numbers that appear in the data block, exactly as given. Reply with the rewritten text only.`;
}

/** The least a snapshot must have before the server will write from it. */
export function isSnapshot(v: unknown): v is CoachSnapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<CoachSnapshot>;
  return (
    s.version === 1 &&
    !!s.today && typeof s.today.date === "string" &&
    !!s.plan && Array.isArray(s.plan.blocks) &&
    !!s.money && typeof s.money.total === "number" &&
    !!s.week && Array.isArray(s.week.items) && Array.isArray(s.week.slips) && Array.isArray(s.week.weekly) &&
    Array.isArray(s.flags) &&
    typeof s.suggestedChange === "string"
  );
}
