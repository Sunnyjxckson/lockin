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
  dueCheckins,
  isChatContext,
  isTurns,
  quotesUsedSince,
  replyProblem,
  voiceOf,
  type ChatContext,
  type CheckinInput,
} from "./coachChat";
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
    expect(checkinsOf({ slip: false })).toEqual({ post_workout: true, slip: false, missed_item: true });
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
