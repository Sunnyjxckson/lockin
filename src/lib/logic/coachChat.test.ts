import { describe, expect, it } from "vitest";
import { SEED_ITEMS, SEED_VICE_LIBRARY, SEED_WORKOUTS } from "../seed/data";
import type { ChecklistItem, DayLog, Workout } from "../types";
import { buildSnapshot, type CoachData } from "./coach";
import {
  CARE_REPLY,
  DEFAULT_CHECKINS,
  EMERGENCY_REPLY,
  INJURY_REPLY,
  chatCorrection,
  chatFallback,
  chatPrompt,
  checkinsOf,
  classifyMessage,
  classifyMode,
  cleanContext,
  cleanTurns,
  dueCheckins,
  scheduleNow,
  supportDepth,
  MAX_SUPPORT_WORDS,
  isChatContext,
  isTurns,
  quotesUsedSince,
  replyProblem,
  voiceOf,
  quotedKey,
  type ChatContext,
  type ChatTurn,
  type CheckinInput,
} from "./coachChat";
import { ASK_PUSH_OR_TALK, THERAPIST_REPLY, slipThought } from "./coachSupport";
import { QUOTES, pickQuote, quoteLine, quotesIn } from "./coachQuotes";
import { addDays } from "./dates";

const DASHES = /[‒–—―−]/;
const TODAY = "2026-10-07"; // a Wednesday
const CREATED = "2026-09-01T12:00:00.000Z";

const ITEMS: ChecklistItem[] = [...SEED_ITEMS, ...SEED_VICE_LIBRARY].map((s, i) => ({
  ...s,
  id: s.key as string,
  created_at: CREATED,
  sort_order: (i + 1) * 10,
  archived: false,
}));
const WORKOUTS: Workout[] = SEED_WORKOUTS.map((w, i) => ({ ...w, id: `w${i}`, created_at: CREATED }));

let seq = 0;
function log(date: string, item: string, p: Partial<DayLog> = {}): DayLog {
  return { id: `l${++seq}`, created_at: CREATED, date, item_id: item, value: null, checked: true, text: null, completed_at: null, slips: 0, ...p };
}

/** Four finished days with the workout and the vices held, and nothing else. */
function data(): CoachData {
  const logs: DayLog[] = [];
  for (let n = 4; n >= 1; n--) {
    const d = addDays(TODAY, -n);
    for (const key of ["workout", "core", "vice_smoking", "vice_drinking", "vice_masturbation"]) logs.push(log(d, key));
  }
  return {
    today: TODAY,
    historyStart: "2026-10-01",
    floor: 100,
    challenge: null,
    settings: { carbs_target: 180, fat_target: 60, weight_unit: "lb", focus_goal_minutes: 60 },
    items: ITEMS,
    versions: [],
    logs,
    earnings: [],
    meals: [],
    bodyLogs: [],
    setLogs: [],
    slips: [],
    workouts: WORKOUTS,
    blocks: [
      { block_name: "Workout + core", start: "06:30", end: "07:30", kind: "workout" },
      { block_name: "Class", start: "09:30", end: "16:00", kind: "class" },
    ],
  };
}

function ctx(): ChatContext {
  return { snapshot: buildSnapshot(data(), []), now: { time: "3:57 PM", done: 4, total: 12, left: ["Protein", "Earned today", "Study or homework block"] }, why: ["Sedition: the first collection"] };
}

describe("the quote library", () => {
  it("has unique keys, a name on every line and no dash", () => {
    expect(new Set(QUOTES.map((q) => q.key)).size).toBe(QUOTES.length);
    for (const q of QUOTES) {
      expect(q.by.length).toBeGreaterThan(2);
      expect(quoteLine(q)).not.toMatch(DASHES);
    }
  });

  it("finds each line in a text, and only that line", () => {
    for (const q of QUOTES) expect(quotesIn(`Here it is. ${quoteLine(q)} Now move.`)).toEqual([q.key]);
    expect(quotesIn("Walk for five minutes and drink water.")).toEqual([]);
  });

  it("covers the five schools", () => {
    expect(new Set(QUOTES.map((q) => q.school))).toEqual(new Set(["stoic", "arrow", "why", "athlete", "samurai"]));
  });

  it("does not hand back a line used this week", () => {
    const first = pickQuote(["arrow"], []);
    const second = pickQuote(["arrow"], [first?.key ?? ""]);
    expect(first).not.toBeNull();
    expect(second?.key).not.toBe(first?.key);
    expect(pickQuote(["arrow"], QUOTES.filter((q) => q.school === "arrow").map((q) => q.key))).toBeNull();
  });
});

describe("classifyMessage", () => {
  it.each([
    ["my legs are dead from that workout", "pain"],
    ["im so sore", "pain"],
    ["i want to smoke so bad", "urge"],
    ["craving a drink", "urge"],
    ["i just smoked", "slipped"],
    ["I skipped the workout", "slipped"],
    ["dont feel like delivering tonight", "unmotivated"],
    ["I'm exhausted", "tired"],
    ["im starving on this cut", "hungry"],
    ["slow night on doordash", "money"],
    ["cant focus on this homework", "study"],
    ["crushed it today", "win"],
    ["hey", "general"],
  ])("%s is %s", (text, topic) => {
    expect(classifyMessage(text)).toBe(topic);
  });

  it("does not read everyday words as an urge", () => {
    expect(classifyMessage("i want to do better")).not.toBe("urge");
    expect(classifyMessage("i need to drink more water")).not.toBe("urge");
    expect(classifyMessage("i want a high protein snack")).not.toBe("urge");
  });

  it("puts injury ahead of soreness", () => {
    expect(classifyMessage("sharp pain in my shoulder on the last set")).toBe("injury");
    expect(classifyMessage("my knee hurts when I squat")).toBe("injury");
    expect(classifyMessage("felt something pop in my elbow")).toBe("injury");
    expect(classifyMessage("it only hurts on one side")).toBe("injury");
    expect(classifyMessage("chest pain during cardio")).toBe("emergency");
  });

  it("puts a real low ahead of everything", () => {
    expect(classifyMessage("im sore and honestly i want to die")).toBe("care");
    expect(classifyMessage("what is the point i should just kill myself")).toBe("care");
    // A hard workout is not a crisis.
    expect(classifyMessage("this workout is killing me")).toBe("pain");
  });
});

describe("chatFallback", () => {
  it("answers soreness with a line, their streak and one thing to do", () => {
    const r = chatFallback("my legs are dead", ctx(), "stoic");
    const lines = r.body.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('"Pain is inevitable. Suffering is optional." Buddhist saying.');
    expect(lines[1]).toBe("You have hit 4 workout days straight. Soreness is the receipt.");
    expect(r.quote).toBe("pain_optional");
  });

  it("moves to another line when that one was used this week", () => {
    const r = chatFallback("my legs are dead", ctx(), "stoic", ["pain_optional"]);
    expect(r.quote).toBe("second_arrow");
    expect(r.body).not.toContain("Pain is inevitable");
  });

  it("drops the quote when every line for the topic was used, and still answers", () => {
    const r = chatFallback("my legs are dead", ctx(), "stoic", QUOTES.map((q) => q.key));
    expect(r.quote).toBeNull();
    expect(r.body.split("\n")).toHaveLength(2);
  });

  it("names the clean streak for the vice they mention", () => {
    const r = chatFallback("i want to smoke", ctx(), "brother");
    expect(r.body).toContain("4 days clean on smoking");
  });

  it("speaks in the chosen voice", () => {
    const a = chatFallback("dont feel like it", ctx(), "stoic").body;
    const b = chatFallback("dont feel like it", ctx(), "sergeant").body;
    const c = chatFallback("dont feel like it", ctx(), "brother").body;
    expect(new Set([a, b, c]).size).toBe(3);
    expect(b).toContain("Nobody asked how you feel");
  });

  it("never tells a hungry person to eat less", () => {
    for (const v of ["stoic", "sergeant", "brother"] as const) {
      const r = chatFallback("starving", ctx(), v);
      expect(r.body).toContain("Eat to the target, not under it");
      expect(r.body).toContain("1,900 to 2,100");
    }
  });

  it("gives injury, an emergency and a real low the fixed line in every voice, with no quote", () => {
    for (const v of ["stoic", "sergeant", "brother"] as const) {
      expect(chatFallback("sharp pain in my knee", ctx(), v)).toMatchObject({ body: INJURY_REPLY, quote: null });
      expect(chatFallback("i cant breathe", ctx(), v)).toMatchObject({ body: EMERGENCY_REPLY, quote: null });
      expect(chatFallback("i want to die", ctx(), v)).toMatchObject({ body: CARE_REPLY, quote: null });
    }
    expect(CARE_REPLY).toContain("988");
  });

  it("writes no dash and stays short, for every topic and voice", () => {
    const asks = ["legs dead", "want to smoke", "i just smoked", "starving", "exhausted", "dont feel like it", "slow night dashing", "homework", "crushed it", "hey", "sharp pain", "cant breathe", "want to die"];
    for (const v of ["stoic", "sergeant", "brother"] as const) {
      for (const a of asks) {
        const r = chatFallback(a, ctx(), v);
        expect(r.body, a).not.toMatch(DASHES);
        expect(r.body.split(/\s+/).length, a).toBeLessThanOrEqual(70);
        expect(replyProblem(r.body, ctx(), [{ sender: "me", body: a }], []), `${v}: ${a}`).toBeNull();
      }
    }
  });
});

describe("chatPrompt", () => {
  const turns = [
    { sender: "coach" as const, body: "Upper A is ticked. How did it go?" },
    { sender: "me" as const, body: "arms are dead" },
  ];

  it("carries the data, where today stands, their why, the voice and the conversation", () => {
    const p = chatPrompt(ctx(), turns, "sergeant");
    expect(p.care).toBe(false);
    expect(p.system).toContain("Drill sergeant");
    expect(p.system).toContain("Soreness is not injury");
    expect(p.system).toContain("988");
    expect(p.user).toContain('"time":"3:57 PM"');
    expect(p.user).toContain("Sedition: the first collection");
    expect(p.user).toContain("Coach: Upper A is ticked. How did it go?");
    expect(p.user).toContain("Them: arms are dead");
    expect(p.system + p.user).not.toMatch(DASHES);
  });

  it("leaves out the lines used this week", () => {
    const p = chatPrompt(ctx(), turns, "stoic", ["pain_optional"]);
    expect(p.user).not.toContain("Pain is inevitable");
    expect(p.user).toContain("We suffer more often in imagination");
  });

  it("switches to the careful prompt when the conversation calls for it, and stays there", () => {
    const p = chatPrompt(ctx(), [{ sender: "me", body: "honestly i want to die" }, { sender: "coach", body: CARE_REPLY }, { sender: "me", body: "idk" }], "sergeant");
    expect(p.care).toBe(true);
    expect(p.system).not.toContain("Drill sergeant");
    expect(p.system).toContain("988");
    expect(p.user).not.toContain("<data>");
  });
});

describe("replyProblem", () => {
  const turns = [{ sender: "me" as const, body: "legs are dead, did 225 today" }];

  it("passes a reply that uses their numbers and a library line", () => {
    const body = '"Pain is inevitable. Suffering is optional." Buddhist saying.\n4 workout days straight and 225 on the bar. Walk for five minutes.';
    expect(replyProblem(body, ctx(), turns, [])).toBeNull();
  });

  it("catches a number that is nowhere in the data", () => {
    const p = replyProblem("You have 37 days clean. Keep going.", ctx(), turns, []);
    expect(p).toEqual({ kind: "numbers", numbers: [37] });
    expect(chatCorrection(p!)).toContain("37");
  });

  it("allows the number inside a library line, and 988", () => {
    expect(replyProblem('"When your mind is telling you that you\'re done, you\'re only 40 percent done." David Goggins. Call or text 988 if it is more than that.', ctx(), turns, [])).toBeNull();
  });

  it("catches a line already used this week", () => {
    expect(replyProblem('"Pain is inevitable. Suffering is optional." Walk it out.', ctx(), turns, ["pain_optional"])).toEqual({ kind: "quote_repeat", keys: ["pain_optional"] });
  });

  it("catches a quote that is not in the library", () => {
    const p = replyProblem('"The only easy day was yesterday, so get moving." Walk it out.', ctx(), turns, []);
    expect(p?.kind).toBe("quote_unknown");
  });

  it("lets the coach quote their own words back", () => {
    expect(replyProblem('You said "legs are dead, did 225 today". Good. Walk for five minutes.', ctx(), turns, [])).toBeNull();
  });

  it("catches a reply that is empty or a lecture", () => {
    expect(replyProblem("  ", ctx(), turns, [])).toEqual({ kind: "empty" });
    expect(replyProblem(Array(140).fill("word").join(" "), ctx(), turns, [])).toEqual({ kind: "too_long" });
  });
});

describe("dueCheckins", () => {
  function input(over: Partial<CheckinInput> = {}): CheckinInput {
    const d = data();
    return {
      today: TODAY,
      time: "08:00",
      enabled: DEFAULT_CHECKINS,
      voice: "stoic",
      blocks: d.blocks,
      workoutName: "Light basketball",
      workoutDone: true,
      slips: [],
      yesterday: null,
      sent: new Set(),
      ...over,
    };
  }

  it("asks how the workout went once the block has ended", () => {
    expect(dueCheckins(input({ time: "07:10" }))).toEqual([]);
    const due = dueCheckins(input({ time: "07:35" }));
    expect(due).toEqual([{ trigger: "post_workout", check_key: `post_workout:${TODAY}`, body: "Light basketball is ticked. How did it go?" }]);
  });

  it("asks whether it happened when the block ended and it is not ticked", () => {
    const [c] = dueCheckins(input({ time: "07:45", workoutDone: false }));
    expect(c.body).toBe("The workout block ended at 7:30 AM and Light basketball is not ticked. Did it happen?");
  });

  it("lets the workout go after three hours, and never asks twice", () => {
    expect(dueCheckins(input({ time: "11:00" }))).toEqual([]);
    expect(dueCheckins(input({ time: "07:35", sent: new Set([`post_workout:${TODAY}`]) }))).toEqual([]);
  });

  it("checks in once per slip, and asks for the trigger only when there is none", () => {
    const slips = [
      { id: "s1", vice: "smoking", time: "22:40", trigger: null },
      { id: "s2", vice: "drinking", time: "23:10", trigger: "After the delivery shift." },
    ];
    const due = dueCheckins(input({ time: "23:30", slips }));
    expect(due.map((c) => c.check_key)).toEqual(["slip:s1", "slip:s2"]);
    expect(due[0].body).toBe("Logged: smoking at 10:40 PM. One slip is one day, nothing resets. What set it off?");
    expect(due[1].body).toBe("Logged: drinking at 11:10 PM, set off by After the delivery shift. One slip is one day, nothing resets. What do you do the next time that comes up?");
    expect(dueCheckins(input({ time: "23:30", slips, sent: new Set(["slip:s1"]) })).map((c) => c.check_key)).toEqual(["slip:s2"]);
  });

  it("checks in on yesterday's misses once", () => {
    const d = data();
    d.logs = d.logs.filter((l) => !(l.date === addDays(TODAY, -1) && l.item_id === "core"));
    const yesterday = buildSnapshot(d, []).yesterday;
    const [c] = dueCheckins(input({ time: "06:00", yesterday }));
    expect(c.trigger).toBe("missed_item");
    expect(c.check_key).toBe(`missed:${addDays(TODAY, -1)}`);
    expect(c.body).toMatch(/^Yesterday closed at 4 of \d+\. Missed: /);
    expect(c.body).toMatch(/One day, nothing resets\. What got in the way\?$/);
    expect(c.body).not.toMatch(DASHES);
  });

  it("says it plainly when nothing at all was ticked yesterday", () => {
    const d = data();
    d.logs = d.logs.filter((l) => l.date !== addDays(TODAY, -1));
    const [c] = dueCheckins(input({ time: "06:00", yesterday: buildSnapshot(d, []).yesterday }));
    expect(c.body).toBe("Nothing was ticked yesterday. One day, nothing resets. What got in the way?");
  });

  it("sends nothing that is switched off", () => {
    const slips = [{ id: "s1", vice: "smoking", time: "07:40", trigger: null }];
    const yesterday = buildSnapshot(data(), []).yesterday;
    expect(dueCheckins(input({ time: "07:45", slips, yesterday, enabled: { post_workout: false, slip: false, missed_item: false } }))).toEqual([]);
  });

  it("asks in the chosen voice", () => {
    expect(dueCheckins(input({ time: "07:35", voice: "sergeant" }))[0].body).toBe("Light basketball is ticked. Report. How did it go?");
  });
});

describe("settings and requests", () => {
  it("reads an old row as the defaults", () => {
    expect(voiceOf(undefined)).toBe("stoic");
    expect(voiceOf("sergeant")).toBe("sergeant");
    expect(voiceOf("nope")).toBe("stoic");
    expect(checkinsOf(undefined)).toEqual(DEFAULT_CHECKINS);
    expect(checkinsOf({ slip: false })).toEqual({ post_workout: true, slip: false, missed_item: true, commitment: true, drift: true });
  });

  it("knows a usable request from a broken one", () => {
    expect(isChatContext(ctx())).toBe(true);
    expect(isChatContext({ snapshot: {}, now: {}, why: [] })).toBe(false);
    expect(isChatContext(null)).toBe(false);
    expect(isTurns([{ sender: "me", body: "hey" }])).toBe(true);
    expect(isTurns([])).toBe(false);
    expect(isTurns([{ sender: "them", body: "hey" }])).toBe(false);
  });

  it("collects the lines the coach used since a date", () => {
    const msgs = [
      { sender: "coach", quote: "pain_optional", date: "2026-10-06" },
      { sender: "coach", quote: "kobe_rest", date: "2026-09-20" },
      { sender: "coach", quote: null, date: "2026-10-07" },
      { sender: "me", quote: null, date: "2026-10-07" },
    ];
    expect(quotesUsedSince(msgs, "2026-10-01")).toEqual(["pain_optional"]);
  });
});

describe("library lines in the coach", () => {
  const LIB = [{ key: "lib:seneca-letters-letter-13-a1b2c3", text: "Begin at once to live, and count each separate day as a separate life.", by: "Seneca" }];
  const turns = [{ sender: "me" as const, body: "I am so worried about the exam" }];

  it("puts the candidates in the prompt, and not in the careful one", () => {
    expect(chatPrompt(ctx(), turns, "stoic", [], LIB).user).toContain(LIB[0].text);
    const care = [{ sender: "me" as const, body: "I want to kill myself" }];
    expect(chatPrompt(ctx(), care, "stoic", [], LIB).user).not.toContain(LIB[0].text);
  });

  it("accepts a candidate word for word and refuses it reworded, cut or repeated", () => {
    expect(replyProblem(`"${LIB[0].text}" Seneca. Open the notes.`, ctx(), turns, [], false, LIB)).toBeNull();
    expect(replyProblem('"Begin at once to live, and count each day." Seneca.', ctx(), turns, [], false, LIB)?.kind).toBe("quote_unknown");
    expect(replyProblem(`"${LIB[0].text}" Seneca.`, ctx(), turns, [LIB[0].key], false, LIB)?.kind).toBe("quote_repeat");
  });

  it("names the key of the line a reply used", () => {
    expect(quotedKey(`"${LIB[0].text}" Seneca. Go.`, LIB)).toBe(LIB[0].key);
  });

  it("can use a library line in the rule-based answer, and never for safety topics", () => {
    const r = chatFallback("worried about the exam", ctx(), "stoic", [], LIB);
    expect(r.quote === LIB[0].key || r.quote === null || typeof r.quote === "string").toBe(true);
    for (const t of ["I want to kill myself", "my knee is torn and swollen", "chest pain, cannot breathe"]) {
      const f = chatFallback(t, ctx(), "stoic", [], LIB);
      expect(f.quote).toBeNull();
      expect(f.body).not.toContain(LIB[0].text);
    }
  });
});


// ---------- part coach, part therapist ----------

const me = (body: string): ChatTurn => ({ sender: "me", body });
const coach = (body: string, trigger?: string): ChatTurn => ({ sender: "coach", body, ...(trigger ? { trigger } : {}) });

describe("classifyMode", () => {
  it.each([
    ["my legs are dead", "push"],
    ["im so sore", "push"],
    ["I'm tired", "push"],
    ["dont feel like it today", "push"],
    ["I'll just skip the workout and do it tomorrow instead", "push"],
    ["i want to smoke so bad", "push"],
    ["slow night on doordash", "push"],
    ["hey", "push"],
    ["i'm so stressed about rent", "support"],
    ["I feel like a failure", "support"],
    ["I've been so lonely lately", "support"],
    ["I'm ashamed of how last night went", "support"],
    ["I feel stuck and don't know what to do", "support"],
    ["i need to talk", "support"],
    ["I already messed up today so it doesn't matter", "support"],
    ["ugh", "unclear"],
    ["rough day", "unclear"],
    ["I'm having a bad day", "unclear"],
    ["I'm tired and stressed out", "unclear"],
    ["too sore and honestly really down", "unclear"],
  ])("%s is %s", (text, mode) => {
    expect(classifyMode(text)).toBe(mode);
  });

  it("reads anything heavy as support, and a fixed-line message as itself", () => {
    expect(classifyMode("i want to die")).toBe("support");
    expect(classifyMode("sharp pain in my knee")).toBe("push");
  });

  it("takes the answer to 'push or talk?' as the answer", () => {
    const asked = [coach(ASK_PUSH_OR_TALK.stoic)];
    expect(classifyMode("talk", [...asked, me("talk")])).toBe("support");
    expect(classifyMode("i just need to vent", [...asked, me("i just need to vent")])).toBe("support");
    expect(classifyMode("push me", [...asked, me("push me")])).toBe("push");
    expect(classifyMode("kick my ass", [...asked, me("kick my ass")])).toBe("push");
  });

  it("stays in support while someone is working through something, until they ask for a push", () => {
    const turns = [me("I feel so alone lately"), coach("Feeling alone makes everything weigh more. When did it start?"), me("it started last week")];
    expect(classifyMode("it started last week", turns)).toBe("support");
    expect(supportDepth("it started last week", turns)).toBe(1);
    const asked = [...turns, coach("Thank you for telling me."), me("ok but I need a push, I have to lift")];
    expect(classifyMode("ok but I need a push, I have to lift", asked)).toBe("push");
    // A plain message with nothing before it is a push.
    expect(classifyMode("it started last week", [me("it started last week")])).toBe("push");
  });
});

describe("the coach in support mode, by rule", () => {
  it("listens: reflects, asks one open question, and quotes no one", () => {
    const r = chatFallback("I'm so stressed, everything is piling up", ctx(), "stoic", [], [], [me("I'm so stressed, everything is piling up")]);
    expect(r.mode).toBe("support");
    expect(r.quote).toBeNull();
    expect(r.body.split("\n").length).toBeLessThanOrEqual(3);
    expect(r.body.trim().endsWith("?")).toBe(true);
    expect(r.body).not.toMatch(/\bdo (the|a) /i);
    expect(r.body).not.toContain('"');
    expect(r.body).not.toMatch(DASHES);
  });

  it("is warm in every voice, even the sergeant", () => {
    for (const v of ["stoic", "sergeant", "brother"] as const) {
      const r = chatFallback("I feel like a failure", ctx(), v, [], [], [me("I feel like a failure")]);
      expect(r.body).not.toMatch(/excuse|nobody asked|no sulking|soft/i);
      expect(r.body).toContain("?");
    }
  });

  it("asks something different each turn and looks under it: sleep, food, being alone, money", () => {
    const turns: ChatTurn[] = [];
    const asked: string[] = [];
    for (const t of ["I feel really down", "I just feel off all the time lately", "i guess work has been slow", "not sure why it keeps happening"]) {
      turns.push(me(t));
      const r = chatFallback(t, ctx(), "brother", [], [], turns);
      asked.push(r.body.split("\n").pop() as string);
      turns.push(coach(r.body));
    }
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.join(" ")).toMatch(/sleep/);
  });

  it("plays their own why back later, from the profile", () => {
    const withWhy = { ...ctx(), profile: [{ kind: "why" as const, body: "Wants to finish his degree" }] };
    const turns: ChatTurn[] = [me("I feel stuck"), coach("Being stuck wears on you. What are you stuck on, exactly?"), me("school, work, everything"), coach("Thank you for telling me that. How have you been sleeping the last few days?"), me("badly")];
    const r = chatFallback("badly", withWhy, "stoic", [], [], turns);
    expect(r.body).toContain("Wants to finish his degree");
  });

  it("connects mood and sleep from their own numbers", () => {
    const moods = [1, 2, 2].map((m, i) => ({ date: addDays(TODAY, -i - 1), label: "Down", mood: m, note: null }));
    const r = chatFallback("I'm so stressed", { ...ctx(), moods }, "stoic", [], [], [me("I'm so stressed")]);
    expect(r.body).toContain("Your mood has been low on 3 of the last 3 days you logged");
  });

  it("catches the thought behind a slip and gives a reset for the next 24 hours", () => {
    expect(slipThought("I already messed up today so it doesn't matter")).toBe(true);
    expect(slipThought("fuck it, might as well")).toBe(true);
    expect(slipThought("I messed up my order at lunch")).toBe(false);
    const r = chatFallback("I already messed up today so it doesn't matter", ctx(), "stoic", [], [], [me("I already messed up today so it doesn't matter")]);
    expect(r.body).toContain("That thought is the real risk, not the slip");
    expect(r.body).toContain("next 24 hours");
    expect(r.body).toContain("One bad day is data, not a verdict");
    expect(r.body).not.toMatch(/fail|weak|pathetic|disappoint/i);
  });

  it("gives the reset plan when they answer the check-in after a slip, or a missed item", () => {
    const slip = [coach("Logged: smoking at 10:00 PM. What set it off?", "slip"), me("work was slow and I was bored")];
    const r = chatFallback("work was slow and I was bored", ctx(), "sergeant", [], [], slip);
    expect(r.body).toContain("next 24 hours");
    expect(r.body).toContain("Log what set it off");
    const missed = [coach("Nothing was ticked yesterday. What got in the way?", "missed_item"), me("I just crashed after work")];
    const m = chatFallback("I just crashed after work", ctx(), "stoic", [], [], missed);
    expect(m.body).toContain("next 24 hours");
    expect(m.body).toContain("tomorrow's schedule");
    expect(m.body).toContain("One bad day is data, not a verdict");
  });

  it("names the next block on the schedule in the reset", () => {
    const withNext = { ...ctx(), now: { ...ctx().now, next: { name: "Class", start: "9:30 AM" } } };
    const r = chatFallback("I already messed up today so it doesn't matter", withNext, "stoic", [], [], []);
    expect(r.body).toContain("Next on the schedule is Class at 9:30 AM");
  });

  it("suggests a real therapist when the same struggle keeps coming back, once", () => {
    const recurring = { ...ctx(), recurring: true };
    const first = chatFallback("I feel so low again", recurring, "stoic", [], [], [me("I feel so low again")]);
    expect(first.body).toContain("real therapist");
    expect(first.body).toContain("not a licensed one");
    const again = chatFallback("it is the same as always", recurring, "stoic", [], [], [me("I feel so low again"), coach(first.body), me("it is the same as always, I feel low")]);
    expect(again.body).not.toContain("real therapist");
    expect(chatFallback("I feel so low again", ctx(), "stoic", [], [], []).body).not.toContain("therapist");
  });

  it("says it is not a licensed therapist when asked, and points to 988", () => {
    for (const q of ["are you a real therapist?", "should I see a therapist", "is this therapy", "do I need a therapist"]) {
      const r = chatFallback(q, ctx(), "sergeant", [], [], [me(q)]);
      expect(r.body).toBe(THERAPIST_REPLY);
    }
    expect(THERAPIST_REPLY).toContain("not a licensed therapist");
    expect(THERAPIST_REPLY).toContain("988");
  });

  it("walks through a craving: it rises, peaks and passes, with something to do", () => {
    for (const v of ["stoic", "sergeant", "brother"] as const) {
      const r = chatFallback("i want to smoke", ctx(), v);
      expect(r.body).toMatch(/peak/);
      expect(r.body).toMatch(/timer|ten minutes/);
      expect(r.body).toMatch(/water/);
    }
  });
});

describe("when it cannot tell", () => {
  it("asks 'you want a push or you want to talk?' in every voice", () => {
    for (const v of ["stoic", "sergeant", "brother"] as const) {
      const r = chatFallback("rough day", ctx(), v, [], [], [me("rough day")]);
      expect(r.mode).toBe("unclear");
      expect(r.body).toBe(ASK_PUSH_OR_TALK[v]);
      expect(r.body).toContain("You want a push or you want to talk?");
      expect(r.quote).toBeNull();
    }
    expect(new Set(Object.values(ASK_PUSH_OR_TALK)).size).toBe(3);
  });

  it("follows the answer", () => {
    const talk = [coach(ASK_PUSH_OR_TALK.stoic), me("talk")];
    expect(chatFallback("talk", ctx(), "stoic", [], [], talk)).toMatchObject({ mode: "support", quote: null });
    const push = [coach(ASK_PUSH_OR_TALK.stoic), me("push me")];
    const r = chatFallback("push me", ctx(), "sergeant", [], [], push);
    expect(r.mode).toBe("push");
    expect(r.body).toContain("Nobody asked how you feel");
  });
});

describe("a real low", () => {
  it("keeps the careful reply for the rest of the conversation, and never pushes", () => {
    const turns = [me("honestly i want to die"), coach(CARE_REPLY), me("idk")];
    const r = chatFallback("idk", ctx(), "sergeant", [], [], turns);
    expect(r.body).toBe(CARE_REPLY);
    expect(r.mode).toBe("support");
  });

  it("points to 988 and to someone you trust, and to 911 for danger right now", () => {
    expect(CARE_REPLY).toContain("call or text 988");
    expect(CARE_REPLY).toContain("someone you trust");
    expect(CARE_REPLY).toContain("911");
    expect(CARE_REPLY).not.toMatch(DASHES);
    for (const text of ["i don't want to be alive", "i can't go on", "thinking about ending my life", "i want to take my own life"]) {
      expect(classifyMessage(text), text).toBe("care");
    }
  });
});

describe("the prompt", () => {
  const turnsSupport = [me("I feel like a failure, I messed up again")];

  it("carries both modes, the therapist techniques and the guardrails", () => {
    const p = chatPrompt(ctx(), [me("my legs are dead")], "stoic");
    expect(p.mode).toBe("push");
    for (const part of ["push:", "support:", "Catch the thought behind a slip", "Cravings", "Look under the slip", "reset plan for the next 24 hours", "One bad day is data, not a verdict", "Notice wins", "not a licensed therapist", "988"]) {
      expect(p.system).toContain(part);
    }
    expect(p.system + p.user).not.toMatch(DASHES);
  });

  it("tells the model which mode, and gives no quotes in support mode", () => {
    const push = chatPrompt(ctx(), [me("my legs are dead")], "stoic");
    expect(push.user).toContain("<mode>\npush\n</mode>");
    expect(push.user).toContain("We suffer more often in imagination");
    const support = chatPrompt(ctx(), turnsSupport, "stoic");
    expect(support.mode).toBe("support");
    expect(support.user).toContain("<mode>\nsupport\n</mode>");
    expect(support.user).toContain("Support mode: no quotes.");
    expect(support.user).not.toContain("We suffer more often in imagination");
    expect(support.maxTokens).toBeGreaterThan(push.maxTokens);
  });

  it("includes the profile, the open commitments, the last week of mood, and the current block", () => {
    const full: ChatContext = {
      ...ctx(),
      now: { ...ctx().now, block: { name: "Class", kind: "class", start: "9:30 AM", end: "4:00 PM" }, next: { name: "Delivery", start: "5:00 PM" } },
      profile: [
        { kind: "why", body: "Wants to finish his degree" },
        { kind: "trigger", body: "Slips after a late delivery shift" },
      ],
      commitments: [{ what: "lifting", when: "today 6:30 AM", status: "open", waiting: true }],
      moods: [{ date: addDays(TODAY, -1), label: "Down", mood: 2, note: "slept badly" }],
      recurring: true,
    };
    const p = chatPrompt(full, [me("my legs are dead")], "brother");
    expect(p.user).toContain("why: Wants to finish his degree");
    expect(p.user).toContain("trigger: Slips after a late delivery shift");
    expect(p.user).toContain('"what":"lifting"');
    expect(p.user).toContain('"waiting":true');
    expect(p.user).toContain('"label":"Down"');
    expect(p.user).toContain('"note":"slept badly"');
    expect(p.user).toContain('"block":{"name":"Class"');
    expect(p.user).toContain("<recurring>\nyes\n</recurring>");
  });

  it("says plainly when there is no profile yet, so the model asks why", () => {
    const p = chatPrompt(ctx(), [me("my legs are dead")], "stoic");
    expect(p.user).toContain("Nothing yet. You do not know their why.");
    expect(p.user).toContain("None logged.");
  });

  it("asks the question and nothing else when it cannot tell", () => {
    const p = chatPrompt(ctx(), [me("rough day")], "stoic");
    expect(p.mode).toBe("unclear");
    expect(p.user).toContain("Ask exactly that");
  });
});

describe("checking a support reply", () => {
  const turns: ChatTurn[] = [me("I feel like a failure")];

  it("lets a support reply run longer than a push", () => {
    const body = `${Array(130).fill("word").join(" ")}?`;
    expect(replyProblem(body, ctx(), turns, [], false, [], "push")).toEqual({ kind: "too_long" });
    expect(replyProblem(body, ctx(), turns, [], false, [], "support")).toBeNull();
    expect(replyProblem(Array(MAX_SUPPORT_WORDS + 5).fill("word").join(" "), ctx(), turns, [], false, [], "support")).toEqual({ kind: "too_long", mode: "support" });
    expect(chatCorrection({ kind: "too_long", mode: "support" })).toContain("100 words");
  });

  it("refuses a quote in support mode, from the library or from anyone, but not their own words", () => {
    const q = QUOTES[0];
    expect(replyProblem(`${quoteLine(q)} That sounds hard. What happened?`, ctx(), turns, [], false, [], "support")).toEqual({ kind: "quote_in_support" });
    expect(replyProblem('As someone said, "the only way out is through, my friend, always". What happened?', ctx(), turns, [], false, [], "support")).toEqual({ kind: "quote_in_support" });
    expect(replyProblem('You said "I feel like a failure". What happened today?', ctx(), turns, [], false, [], "support")).toBeNull();
    expect(chatCorrection({ kind: "quote_in_support" })).toContain("No quotes");
  });

  it("still holds a support reply to the data for numbers", () => {
    expect(replyProblem("You have missed 37 days. What happened?", ctx(), turns, [], false, [], "support")?.kind).toBe("numbers");
  });
});

describe("requests from the app", () => {
  it("accepts the old shape and the new one", () => {
    expect(isChatContext(ctx())).toBe(true);
    expect(isChatContext({ ...ctx(), profile: [], commitments: [], moods: [], recurring: false })).toBe(true);
    expect(isTurns([{ sender: "coach", body: "x", trigger: "slip" }, { sender: "me", body: "y" }])).toBe(true);
  });

  it("cleans the extra parts and drops what is the wrong shape", () => {
    const messy = {
      ...ctx(),
      profile: [{ kind: "why", body: "Finish school \u2014 for good" }, { kind: "bogus", body: "x" }, null, { kind: "said", body: 4 }],
      commitments: [{ what: "lifting", when: "today 6:30 AM", status: "open", waiting: true }, { what: "x", status: "weird" }],
      moods: [{ date: "2026-10-06", label: "Down", mood: 2, note: "tired" }, { date: "2026-10-05", label: "?", mood: 9, note: null }],
      recurring: "yes",
      now: { ...ctx().now, block: { name: "Class", kind: "class", start: "9:30 AM", end: "4:00 PM" }, next: { nope: 1 } },
    } as unknown as ChatContext;
    const c = cleanContext(messy);
    expect(c.profile).toEqual([{ kind: "why", body: "Finish school, for good" }]);
    expect(c.commitments).toEqual([{ what: "lifting", when: "today 6:30 AM", status: "open", waiting: true }]);
    expect(c.moods).toHaveLength(1);
    expect(c.recurring).toBeUndefined();
    expect(c.now.block?.name).toBe("Class");
    expect(c.now.next).toBeUndefined();
  });

  it("keeps a turn's trigger only when it is a short string", () => {
    expect(cleanTurns([{ sender: "coach", body: "x", trigger: "slip" }, { sender: "coach", body: "y", trigger: "z".repeat(40) }, { sender: "me", body: "q" }])).toEqual([
      { sender: "coach", body: "x", trigger: "slip" },
      { sender: "coach", body: "y" },
      { sender: "me", body: "q" },
    ]);
  });

  it("finds the block it is right now and the next one", () => {
    const blocks = data().blocks;
    expect(scheduleNow(blocks, "10:00")).toEqual({ block: { name: "Class", kind: "class", start: "9:30 AM", end: "4:00 PM" }, next: null });
    expect(scheduleNow(blocks, "08:00")).toEqual({ block: null, next: { name: "Class", start: "9:30 AM" } });
    expect(scheduleNow(blocks, "06:45").block?.name).toBe("Workout + core");
    expect(scheduleNow([], "10:00")).toEqual({ block: null, next: null });
  });
});

describe("check-ins and drift", () => {
  it("leaves out the plain 'yesterday' check-in when a drift message covers the misses", () => {
    const y = { date: addDays(TODAY, -1), label: "Tuesday", status: "partial" as const, done: 1, total: 8, misses: [{ key: "study", name: "Study", state: "open", gap: null, value: null, target: "check", detail: null }], pending: [] };
    const base = { today: TODAY, time: "08:00", enabled: DEFAULT_CHECKINS, voice: "stoic" as const, blocks: [], workoutName: null, workoutDone: false, slips: [], yesterday: y as never, sent: new Set<string>() };
    expect(dueCheckins(base).map((c) => c.trigger)).toEqual(["missed_item"]);
    expect(dueCheckins({ ...base, driftCoversMisses: true })).toEqual([]);
  });

  it("turns the two new check-ins on for a row that predates them, and off when they are off", () => {
    expect(checkinsOf({ post_workout: true, slip: true, missed_item: true })).toEqual(DEFAULT_CHECKINS);
    expect(checkinsOf({ drift: false, commitment: false })).toMatchObject({ drift: false, commitment: false });
  });
});
