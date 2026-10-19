import { describe, expect, it } from "vitest";
import { SEED_ITEMS, SEED_VICE_LIBRARY, SEED_WORKOUTS } from "../seed/data";
import type { ChecklistItem, DayLog, MoodLog, Workout } from "../types";
import type { CoachData, Flag } from "./coach";
import { driftCheckins } from "./coachChat";
import { detectFlags, driftLevel } from "./coachFlags";
import { moodDrop, moodDue, recurringStruggle } from "./coachMood";
import { addDays } from "./dates";

const DASHES = /[\u2012-\u2015\u2212]/;
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

function mood(date: string, level: number, time = "09:00", note: string | null = null): MoodLog {
  return { id: `m${++seq}`, created_at: CREATED, date, time, mood: level, note };
}

/** History from Sep 20. Every listed day has the whole checklist open except `ticks` ticks of it. */
function data(opts: { doneOn?: Record<string, number>; moods?: MoodLog[] } = {}): CoachData {
  const keys = ["wake", "workout", "core", "study", "bed", "vice_smoking", "vice_drinking", "vice_masturbation"];
  const logs: DayLog[] = [];
  for (const [date, n] of Object.entries(opts.doneOn ?? {})) for (const key of keys.slice(0, n)) logs.push(log(date, key));
  return {
    today: TODAY,
    historyStart: "2026-09-20",
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
    blocks: [],
    moods: opts.moods ?? [],
  };
}

const d = (n: number) => addDays(TODAY, -n);
const find = (flags: Flag[], kind: Flag["kind"]) => flags.find((f) => f.kind === kind);

/** Whole days well before the gap, so a gap is a break from something. */
const BEFORE = Object.fromEntries([14, 13, 12, 11, 10, 9, 8].map((n) => [d(n), 8]));

describe("no logs for a day", () => {
  it("flags yesterday with nothing logged, once there was a history before it", () => {
    const flags = detectFlags(data({ doneOn: { ...BEFORE, [d(2)]: 8 } }));
    const f = find(flags, "no_logs");
    expect(f?.title).toBe("Nothing logged yesterday");
    expect(f?.level).toBe(1);
    expect(f?.since).toBe(d(1));
  });

  it("counts the days and gets more direct the longer it goes", () => {
    const long = find(detectFlags(data({ doneOn: BEFORE })), "no_logs");
    expect(long?.title).toBe("Nothing logged for 7 days");
    expect(long?.level).toBe(3);
    const mid = find(detectFlags(data({ doneOn: { ...BEFORE, [d(3)]: 8 } })), "no_logs");
    expect(mid?.title).toBe("Nothing logged for 2 days");
    expect(mid?.level).toBe(2);
  });

  it("counts a meal, earnings or a lift as logging", () => {
    const base = data({ doneOn: BEFORE });
    base.earnings = [{ id: "e1", created_at: CREATED, date: d(4), amount: 80, app: "DoorDash", hours: 3, screenshot_url: null }];
    expect(find(detectFlags(base), "no_logs")?.title).toBe("Nothing logged for 3 days");
    base.earnings = [{ id: "e1", created_at: CREATED, date: d(1), amount: 80, app: "DoorDash", hours: 3, screenshot_url: null }];
    expect(find(detectFlags(base), "no_logs")).toBeUndefined();
  });

  it("says nothing on a first week with no history, or when the days are covered", () => {
    expect(find(detectFlags(data()), "no_logs")).toBeUndefined();
    expect(find(detectFlags(data({ doneOn: { [d(1)]: 3, [d(2)]: 3 } })), "no_logs")).toBeUndefined();
  });

  it("has levels 1, 2 and 3 from how many days over the first", () => {
    expect([driftLevel(1, 1), driftLevel(2, 1), driftLevel(3, 1), driftLevel(9, 1)]).toEqual([1, 2, 3, 3]);
  });
});

describe("missed items two days running", () => {
  it("flags two days in a row that closed under half the list", () => {
    const f = find(detectFlags(data({ doneOn: { ...BEFORE, [d(3)]: 8, [d(2)]: 2, [d(1)]: 1 } })), "missed_streak");
    expect(f?.title).toBe("2 days running closed under half the list");
    expect(f?.level).toBe(1);
    expect(f?.evidence).toHaveLength(2);
  });

  it("does not flag one bad day", () => {
    expect(find(detectFlags(data({ doneOn: { [d(3)]: 8, [d(2)]: 8, [d(1)]: 1 } })), "missed_streak")).toBeUndefined();
  });

  it("rises with the run, and a day with nothing logged ends it", () => {
    const f = find(detectFlags(data({ doneOn: { [d(5)]: 8, [d(4)]: 1, [d(3)]: 1, [d(2)]: 2, [d(1)]: 1 } })), "missed_streak");
    expect(f?.level).toBe(3);
    const broken = find(detectFlags(data({ doneOn: { [d(5)]: 8, [d(4)]: 1, [d(3)]: 1, [d(1)]: 1 } })), "missed_streak");
    expect(broken).toBeUndefined();
  });
});

describe("mood dropping", () => {
  it("flags a mood that fell three days in a row, ending today or yesterday", () => {
    const moods = [mood(d(3), 4), mood(d(2), 3), mood(d(1), 2)];
    const drop = moodDrop(moods, TODAY);
    expect(drop?.kind).toBe("dropping");
    expect(drop?.days).toHaveLength(3);
    const f = find(detectFlags(data({ moods })), "mood_drop");
    expect(f?.title).toBe("Mood has dropped 3 days in a row");
    expect(f?.level).toBe(1);
  });

  it("flags three low days in a row", () => {
    const moods = [mood(d(2), 2), mood(d(1), 1), mood(d(0), 2)];
    expect(moodDrop(moods, TODAY)?.kind).toBe("low");
  });

  it("does not flag a dip that recovered, two days, or a run that ended last week", () => {
    expect(moodDrop([mood(d(3), 4), mood(d(2), 2), mood(d(1), 4)], TODAY)).toBeNull();
    expect(moodDrop([mood(d(2), 4), mood(d(1), 2)], TODAY)).toBeNull();
    expect(moodDrop([mood(d(9), 5), mood(d(8), 4), mood(d(7), 3), mood(d(6), 2)], TODAY)).toBeNull();
  });

  it("needs the days to be consecutive and averages a day with two entries", () => {
    expect(moodDrop([mood(d(4), 5), mood(d(2), 3), mood(d(1), 2)], TODAY)).toBeNull();
    const two = [mood(d(3), 5, "08:00"), mood(d(3), 3, "20:00"), mood(d(2), 3), mood(d(1), 2)];
    expect(moodDrop(two, TODAY)?.days.map((x) => x.mood)).toEqual([4, 3, 2]);
  });

  it("tells a struggle that keeps coming back", () => {
    const lows = [d(1), d(3), d(5), d(7), d(9)].map((x) => mood(x, 2));
    expect(recurringStruggle(lows, TODAY)).toBe(true);
    expect(recurringStruggle(lows.slice(0, 3), TODAY)).toBe(false);
  });
});

describe("when the mood check-in is due", () => {
  it("asks once in the morning and once in the evening, never twice in a slot", () => {
    expect(moodDue([], "06:30")).toBeNull();
    expect(moodDue([], "08:00")).toBe("first");
    expect(moodDue([{ time: "08:05" }], "12:00")).toBeNull();
    expect(moodDue([{ time: "08:05" }], "18:00")).toBe("second");
    expect(moodDue([{ time: "08:05" }, { time: "18:10" }], "20:00")).toBeNull();
    expect(moodDue([], "23:00")).toBeNull();
  });

  it("leaves a slot alone once it was closed with Not now", () => {
    expect(moodDue([], "08:00", ["first"])).toBeNull();
    expect(moodDue([], "18:00", ["first"])).toBe("second");
  });
});

describe("drift outreach", () => {
  const flags = (...ls: [Flag["kind"], 1 | 2 | 3, string][]): Flag[] =>
    ls.map(([kind, level, since]) => ({ key: kind, kind, title: kind, detail: "", change: "", evidence: [{ label: "a", value: "b" }, { label: "c", value: "d" }], since, level }));
  const base = { voice: "stoic" as const, today: TODAY, quiet: false, sent: new Set<string>(), sentToday: false };

  it("sends one message for the strongest drift, in the chosen voice", () => {
    const out = driftCheckins({ ...base, flags: flags(["no_logs", 1, d(1)], ["missed_streak", 2, d(3)]) });
    expect(out).toHaveLength(1);
    expect(out[0].trigger).toBe("drift");
    expect(out[0].check_key).toBe(`drift:missed_streak:${d(3)}:2`);
    const sergeant = driftCheckins({ ...base, voice: "sergeant", flags: flags(["no_logs", 1, d(1)]) });
    expect(sergeant[0].body).not.toBe(driftCheckins({ ...base, flags: flags(["no_logs", 1, d(1)]) })[0].body);
  });

  it("gets more direct with the level", () => {
    const l1 = driftCheckins({ ...base, flags: flags(["no_logs", 1, d(2)]) })[0].body;
    const l3 = driftCheckins({ ...base, flags: flags(["no_logs", 3, d(2)]) })[0].body;
    expect(l1).toContain("What got in the way");
    expect(l3).toContain("drift");
  });

  it("sends each level once, and the top level once a day", () => {
    const f = flags(["no_logs", 2, d(2)]);
    expect(driftCheckins({ ...base, flags: f, sent: new Set([`drift:no_logs:${d(2)}:2`]) })).toEqual([]);
    const top = flags(["no_logs", 3, d(4)]);
    expect(driftCheckins({ ...base, flags: top, sent: new Set([`drift:no_logs:${d(4)}:3:${d(1)}`]) })).toHaveLength(1);
    expect(driftCheckins({ ...base, flags: top, sent: new Set([`drift:no_logs:${d(4)}:3:${TODAY}`]) })).toEqual([]);
  });

  it("stays quiet in quiet hours and after one has gone out today", () => {
    const f = flags(["no_logs", 1, d(1)]);
    expect(driftCheckins({ ...base, flags: f, quiet: true })).toEqual([]);
    expect(driftCheckins({ ...base, flags: f, sentToday: true })).toEqual([]);
  });

  it("is warm about mood and points to a real person at the top", () => {
    const f = flags(["mood_drop", 3, d(5)]);
    f[0].title = "Mood has been low 5 days in a row";
    f[0].evidence = Array.from({ length: 5 }, (_, i) => ({ label: String(i), value: "Down" }));
    const body = driftCheckins({ ...base, voice: "sergeant", flags: f })[0].body;
    expect(body).toContain("low five days running");
    expect(body).toContain("someone who does this for a living");
    expect(body).not.toMatch(/tick|list|excuse/i);
  });

  it("writes no dash in any voice or level", () => {
    for (const voice of ["stoic", "sergeant", "brother"] as const) {
      for (const level of [1, 2, 3] as const) {
        for (const kind of ["no_logs", "missed_streak", "mood_drop"] as const) {
          const out = driftCheckins({ ...base, voice, flags: flags([kind, level, d(3)]) });
          expect(out[0].body).not.toMatch(DASHES);
          expect(out[0].body.split(" ").length).toBeLessThan(60);
        }
      }
    }
  });
});
