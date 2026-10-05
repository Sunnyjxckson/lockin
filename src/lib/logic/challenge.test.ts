import { describe, expect, it } from "vitest";
import type { Challenge, ChallengeRule } from "../types";
import {
  activeChallenge,
  canFinish,
  challengeDay,
  challengeItems,
  challengePhase,
  challengeProblem,
  challengeRecord,
  consistency,
  consistencyLabel,
  dayWindow,
  daysRun,
  endPatch,
  finishPatch,
  lastDay,
  modeOn,
  newChallengeRow,
  pastChallenges,
  plannedEnd,
  ranOn,
  restartRows,
  ruleTarget,
  scoringVersions,
} from "./challenge";
import { addDays, dateRange } from "./dates";
import { summarizeDay, type DayStatus } from "./day";
import { allStreaks, fullDayStreak } from "./streaks";
import { targetOn, isActiveOn } from "./targets";
import { makeItem, makeLog, makeVersion, tick } from "./testkit";

function challenge(p: Partial<Challenge> = {}): Challenge {
  return {
    id: "c1",
    created_at: "2026-10-01T12:00:00.000Z",
    name: "30 day lock in",
    status: "active",
    start_date: "2026-10-05",
    length_days: 30,
    ended_on: null,
    rules: null,
    restart_of: null,
    money_target: 1000,
    money_deadline: "2026-10-14",
    daily_floor: 100,
    money_target_start: null,
    ...p,
  };
}

describe("dates of a challenge", () => {
  it("ends on start plus length", () => {
    expect(plannedEnd(challenge())).toBe("2026-11-03");
    expect(plannedEnd(challenge({ length_days: 1 }))).toBe("2026-10-05");
  });

  it("knows the last day it ran", () => {
    expect(lastDay(challenge())).toBe("2026-11-03");
    expect(lastDay(challenge({ status: "ended", ended_on: "2026-10-12" }))).toBe("2026-10-12");
    expect(lastDay(challenge({ status: "succeeded", ended_on: "2026-11-03" }))).toBe("2026-11-03");
    // A stored end past the plan is held to the plan.
    expect(lastDay(challenge({ status: "ended", ended_on: "2026-12-25" }))).toBe("2026-11-03");
  });

  it("says which days it covered", () => {
    const ended = challenge({ status: "ended", ended_on: "2026-10-12" });
    expect(ranOn(ended, "2026-10-05")).toBe(true);
    expect(ranOn(ended, "2026-10-12")).toBe(true);
    expect(ranOn(ended, "2026-10-13")).toBe(false);
    expect(ranOn(ended, "2026-10-04")).toBe(false);
    expect(daysRun(ended, "2026-12-01")).toBe(8);
    expect(daysRun(challenge(), "2026-10-07")).toBe(3);
    expect(daysRun(challenge(), "2026-10-01")).toBe(0);
    // Abandoned on the day it started: it never ran a day.
    const never = challenge({ status: "abandoned", ended_on: "2026-10-04" });
    expect(ranOn(never, "2026-10-05")).toBe(false);
    expect(daysRun(never, "2026-10-20")).toBe(0);
  });

  it("has a phase", () => {
    expect(challengePhase(challenge(), "2026-10-04")).toBe("upcoming");
    expect(challengePhase(challenge(), "2026-10-05")).toBe("running");
    expect(challengePhase(challenge(), "2026-11-03")).toBe("running");
    expect(challengePhase(challenge(), "2026-11-04")).toBe("finished");
    expect(challengePhase(challenge({ status: "succeeded", ended_on: "2026-11-03" }), "2026-10-10")).toBe("closed");
  });
});

describe("modeOn", () => {
  it("is challenge mode only while one is running today", () => {
    const m = modeOn([challenge()], "2026-10-05", "2026-10-16");
    expect(m).toMatchObject({ mode: "challenge", day: 12, length: 30, lastDay: "2026-11-03", finished: null, upcoming: null, historyStart: "2026-10-05" });
    expect(m.challenge?.id).toBe("c1");
  });

  it("is ongoing with no challenge at all", () => {
    expect(modeOn([], "2026-10-05", "2026-12-01")).toEqual({
      mode: "ongoing",
      challenge: null,
      day: null,
      length: null,
      lastDay: null,
      finished: null,
      upcoming: null,
      historyStart: "2026-10-05",
    });
  });

  it("is ongoing before a challenge starts and names it as upcoming", () => {
    const m = modeOn([challenge({ start_date: "2026-10-12" })], "2026-10-05", "2026-10-08");
    expect(m.mode).toBe("ongoing");
    expect(m.upcoming?.id).toBe("c1");
    expect(m.challenge).toBeNull();
  });

  it("is ongoing once the last day has passed, with the challenge waiting to be closed", () => {
    const m = modeOn([challenge()], "2026-10-05", "2026-11-04");
    expect(m.mode).toBe("ongoing");
    expect(m.finished?.id).toBe("c1");
    expect(m.day).toBeNull();
  });

  it("ignores closed challenges", () => {
    const closed = [challenge({ status: "ended", ended_on: "2026-10-12" }), challenge({ id: "c0", status: "abandoned", ended_on: "2026-10-04" })];
    expect(modeOn(closed, "2026-10-05", "2026-10-10").mode).toBe("ongoing");
    expect(activeChallenge(closed)).toBeNull();
  });

  it("never reports a history that starts after today", () => {
    expect(modeOn([], "2026-10-09", "2026-10-05").historyStart).toBe("2026-10-05");
  });

  it("lists past challenges newest first", () => {
    const list = [
      challenge({ id: "a", status: "abandoned", start_date: "2026-10-05", ended_on: "2026-10-09" }),
      challenge({ id: "b", status: "succeeded", start_date: "2026-10-10", ended_on: "2026-11-08" }),
      challenge({ id: "c", start_date: "2026-11-20" }),
    ];
    expect(pastChallenges(list).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("dayWindow", () => {
  it("is the challenge while one runs", () => {
    const m = modeOn([challenge()], "2026-09-01", "2026-10-16");
    expect(dayWindow(m, "2026-10-16")).toEqual({ start: "2026-10-05", length: 30, numbered: true, name: "30 day lock in" });
  });

  it("starts at the history start, then rolls along ending today", () => {
    const early = modeOn([], "2026-10-05", "2026-10-09");
    expect(dayWindow(early, "2026-10-09")).toEqual({ start: "2026-10-05", length: 30, numbered: false, name: null });
    const later = modeOn([], "2026-10-05", "2027-02-01");
    expect(dayWindow(later, "2027-02-01", 35)).toEqual({ start: "2026-12-29", length: 35, numbered: false, name: null });
  });
});

describe("rules", () => {
  const a = makeItem({ id: "a", name: "Calories", type: "number", target: { kind: "range", min: 1900, max: 2100 } });
  const b = makeItem({ id: "b", name: "Workout" });
  const c = makeItem({ id: "c", name: "Read" });
  const rules: ChallengeRule[] = [
    { item_id: "a", target: { kind: "range", min: 1500, max: 1700 } },
    { item_id: "b", target: null },
  ];

  it("counts the whole checklist when there are no rules", () => {
    expect(challengeItems(challenge(), [a, b, c]).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(ruleTarget(challenge(), "a")).toBeNull();
  });

  it("counts only the items the rules name", () => {
    const ch = challenge({ rules });
    expect(challengeItems(ch, [a, b, c]).map((i) => i.id)).toEqual(["a", "b"]);
    expect(ruleTarget(ch, "a")).toEqual({ kind: "range", min: 1500, max: 1700 });
    expect(ruleTarget(ch, "b")).toBeNull();
    expect(ruleTarget(ch, "c")).toBeNull();
  });

  it("scores a challenge day from its own items only", () => {
    const logs = [makeLog("a", "2026-10-06", { value: 2000, checked: true }), tick("b", "2026-10-06")];
    const day = summarizeDay("2026-10-06", [a, b, c], [], logs);
    expect(day).toMatchObject({ status: "partial", done: 2, total: 3 });
    const scoped = challengeDay(challenge({ rules: [{ item_id: "a", target: null }, { item_id: "b", target: null }] }), day);
    expect(scoped).toMatchObject({ status: "full", done: 2, total: 2, percent: 100 });
    expect(challengeDay(challenge(), day)).toBe(day);
  });
});

describe("scoringVersions", () => {
  const cal = makeItem({ id: "cal", type: "number", target: { kind: "range", min: 1900, max: 2100 } });
  const base = [makeVersion("cal", "2000-01-01", { kind: "range", min: 1900, max: 2100 })];
  const strict = { kind: "range", min: 1500, max: 1700 } as const;
  const diet = challenge({ id: "diet", start_date: "2026-10-10", length_days: 5, rules: [{ item_id: "cal", target: strict }] });

  it("changes nothing without rule targets", () => {
    expect(scoringVersions(base, [challenge()])).toEqual(base);
    expect(scoringVersions(base, [challenge({ rules: [{ item_id: "cal", target: null }] })])).toEqual(base);
    expect(scoringVersions(base, [])).toEqual(base);
  });

  it("lays the challenge target over the days it runs and gives the item's own target back after", () => {
    const v = scoringVersions(base, [diet]);
    expect(targetOn(cal, v, "2026-10-09")).toEqual({ kind: "range", min: 1900, max: 2100 });
    expect(targetOn(cal, v, "2026-10-10")).toEqual(strict);
    expect(targetOn(cal, v, "2026-10-14")).toEqual(strict);
    expect(targetOn(cal, v, "2026-10-15")).toEqual({ kind: "range", min: 1900, max: 2100 });
    // The saved versions are not changed.
    expect(base).toHaveLength(1);
  });

  it("stops at the day a challenge was ended early", () => {
    const v = scoringVersions(base, [{ ...diet, status: "ended", ended_on: "2026-10-11" }]);
    expect(targetOn(cal, v, "2026-10-11")).toEqual(strict);
    expect(targetOn(cal, v, "2026-10-12")).toEqual({ kind: "range", min: 1900, max: 2100 });
  });

  it("has no effect for a challenge that never ran a day", () => {
    const v = scoringVersions(base, [{ ...diet, status: "abandoned", ended_on: "2026-10-09" }]);
    expect(v).toEqual(base);
  });

  it("keeps a day scored the same way before, during and after the challenge exists", () => {
    const logs = [makeLog("cal", "2026-10-08", { value: 2000, checked: true }), makeLog("cal", "2026-10-12", { value: 2000, checked: true }), makeLog("cal", "2026-10-16", { value: 2000, checked: true })];
    const during = scoringVersions(base, [diet]);
    expect(summarizeDay("2026-10-08", [cal], during, logs).status).toBe("full");
    expect(summarizeDay("2026-10-12", [cal], during, logs).status).toBe("missed");
    expect(summarizeDay("2026-10-16", [cal], during, logs).status).toBe("full");
    // Once it is closed the days it ran keep the target they were scored against.
    const after = scoringVersions(base, [{ ...diet, status: "succeeded", ended_on: "2026-10-14" }]);
    expect(summarizeDay("2026-10-12", [cal], after, logs).status).toBe("missed");
    expect(summarizeDay("2026-10-16", [cal], after, logs).status).toBe("full");
  });

  it("respects a setting changed in the middle of a challenge once it is over", () => {
    const changed = [...base, makeVersion("cal", "2026-10-12", { kind: "range", min: 2000, max: 2200 })];
    const v = scoringVersions(changed, [diet]);
    expect(targetOn(cal, v, "2026-10-12")).toEqual(strict);
    expect(targetOn(cal, v, "2026-10-15")).toEqual({ kind: "range", min: 2000, max: 2200 });
  });

  it("keeps an item off when it was switched off during the challenge", () => {
    const off = [...base, makeVersion("cal", "2026-10-12", { kind: "range", min: 1900, max: 2100 }, false)];
    const v = scoringVersions(off, [diet]);
    expect(isActiveOn(cal, v, "2026-10-11")).toBe(true);
    expect(isActiveOn(cal, v, "2026-10-13")).toBe(false);
    expect(isActiveOn(cal, v, "2026-10-16")).toBe(false);
  });

  it("handles a restart: the abandoned run and the new one each cover their own days", () => {
    const first = { ...diet, id: "one", status: "abandoned" as const, ended_on: "2026-10-11", created_at: "2026-10-09T12:00:00.000Z" };
    const second = { ...diet, id: "two", start_date: "2026-10-12", restart_of: "one", created_at: "2026-10-12T12:00:00.000Z" };
    const v = scoringVersions(base, [second, first]);
    for (const d of dateRange("2026-10-10", "2026-10-16")) expect(targetOn(cal, v, d), d).toEqual(strict);
    expect(targetOn(cal, v, "2026-10-17")).toEqual({ kind: "range", min: 1900, max: 2100 });
    expect(targetOn(cal, v, "2026-10-09")).toEqual({ kind: "range", min: 1900, max: 2100 });
  });

  it("returns versions in date order", () => {
    const v = scoringVersions(base, [diet]);
    expect(v.map((x) => x.effective_from)).toEqual(["2000-01-01", "2026-10-10", "2026-10-15"]);
  });
});

describe("ongoing history under a challenge", () => {
  const item = makeItem({ id: "w", name: "Workout" });
  const days = dateRange("2026-10-01", "2026-10-20");
  const logs = days.filter((d) => d !== "2026-10-09").map((d) => tick("w", d));

  it("streaks run across the start and the end of a challenge", () => {
    const from = "2026-10-01";
    const none = allStreaks([item], scoringVersions([], []), logs, "2026-10-20", from).w;
    const ch = challenge({ start_date: "2026-10-12", length_days: 5 });
    const running = allStreaks([item], scoringVersions([], [ch]), logs, "2026-10-14", from).w;
    const over = allStreaks([item], scoringVersions([], [{ ...ch, status: "succeeded", ended_on: "2026-10-16" }]), logs, "2026-10-20", from).w;
    expect(none).toEqual({ current: 11, best: 11, doneNow: true });
    // Day 3 of the challenge, and the streak already counts the days before it.
    expect(running.current).toBe(5);
    expect(over).toEqual(none);
  });

  it("ending, finishing or restarting never changes how a day is scored", () => {
    const ch = challenge({ start_date: "2026-10-12", length_days: 5 });
    const variants: Challenge[][] = [
      [],
      [ch],
      [{ ...ch, ...endPatch(ch, "2026-10-13") }],
      [{ ...ch, ...finishPatch(ch) }],
      [{ ...ch, ...(restartRows(ch, "2026-10-14").close as object) }, { ...ch, ...restartRows(ch, "2026-10-14").next, id: "c2", created_at: "2026-10-14T12:00:00.000Z" } as Challenge],
    ];
    const score = (cs: Challenge[]) => days.map((d) => summarizeDay(d, [item], scoringVersions([], cs), logs).status);
    for (const v of variants) expect(score(v)).toEqual(score([]));
  });
});

describe("consistency", () => {
  const status = (full: string[], partial: string[] = []): Record<string, DayStatus> => {
    const out: Record<string, DayStatus> = {};
    for (const d of full) out[d] = "full";
    for (const d of partial) out[d] = "partial";
    return out;
  };
  const today = "2026-11-10";
  const last30 = dateRange(addDays(today, -30), addDays(today, -1));

  it("counts full days in the last 30, ending yesterday while today is open", () => {
    const s = status(last30.filter((_, i) => i % 8 !== 0));
    expect(consistency(s, today, "2026-08-01")).toEqual({ full: 26, partial: 0, days: 30, window: 30, percent: 87 });
    expect(consistencyLabel(consistency(s, today, "2026-08-01"))).toBe("26 of the last 30 days");
  });

  it("counts today once it is full, and the window moves with it", () => {
    const s = status([...last30, today]);
    expect(consistency(s, today, "2026-08-01")).toMatchObject({ full: 30, days: 30 });
    const open = status(last30);
    expect(consistency(open, today, "2026-08-01")).toMatchObject({ full: 30, days: 30 });
  });

  it("one slip costs one day and nothing more, where a streak goes to zero", () => {
    const slipDay = addDays(today, -1);
    const s = status(last30.filter((d) => d !== slipDay), [slipDay]);
    expect(consistency(s, today, "2026-08-01")).toMatchObject({ full: 29, partial: 1, days: 30 });
    expect(fullDayStreak(s, today, "2026-08-01")).toBe(0);
  });

  it("is honest early on: it only counts the days there have been", () => {
    const s = status(["2026-11-07", "2026-11-08"], ["2026-11-09"]);
    const c = consistency(s, today, "2026-11-07");
    expect(c).toMatchObject({ full: 2, partial: 1, days: 3, window: 30, percent: 67 });
    expect(consistencyLabel(c)).toBe("2 of 3 days");
    expect(consistencyLabel(consistency({}, today, today))).toBe("First day");
    expect(consistencyLabel(consistency(status([today]), today, today))).toBe("1 of 1 day");
  });

  it("takes another window size", () => {
    expect(consistency(status(last30), today, "2026-08-01", 7)).toMatchObject({ full: 7, days: 7, window: 7 });
  });
});

describe("starting a challenge", () => {
  const input = { name: "Strict diet", start_date: "2026-11-10", length_days: 30, rules: null, daily_floor: 100 };

  it("accepts a plain input and builds an active row", () => {
    expect(challengeProblem(input, "2026-11-10")).toBeNull();
    expect(newChallengeRow(input)).toEqual({
      name: "Strict diet",
      status: "active",
      start_date: "2026-11-10",
      length_days: 30,
      ended_on: null,
      rules: null,
      restart_of: null,
      money_target: null,
      money_deadline: null,
      daily_floor: 100,
      money_target_start: null,
    });
  });

  it("keeps rules and an optional money target", () => {
    const row = newChallengeRow({ ...input, rules: [{ item_id: "a", target: { kind: "max", max: 30 } }, { item_id: "b", target: null }], money_target: 500, money_deadline: "2026-11-30" });
    expect(row.rules).toEqual([{ item_id: "a", target: { kind: "max", max: 30 } }, { item_id: "b", target: null }]);
    expect(row).toMatchObject({ money_target: 500, money_deadline: "2026-11-30" });
  });

  it("refuses what cannot work", () => {
    expect(challengeProblem({ ...input, name: " " }, "2026-11-10")).toMatch(/name/);
    expect(challengeProblem({ ...input, start_date: "2026-11-09" }, "2026-11-10")).toMatch(/today or later/);
    expect(challengeProblem({ ...input, start_date: "soon" }, "2026-11-10")).toMatch(/start date/);
    expect(challengeProblem({ ...input, length_days: 0 }, "2026-11-10")).toMatch(/at least 1/);
    expect(challengeProblem({ ...input, length_days: 2.5 }, "2026-11-10")).toMatch(/at least 1/);
    expect(challengeProblem({ ...input, length_days: 400 }, "2026-11-10")).toMatch(/365/);
    expect(challengeProblem({ ...input, rules: [] }, "2026-11-10")).toMatch(/at least one item/);
    expect(challengeProblem({ ...input, money_target: 500 }, "2026-11-10")).toMatch(/deadline/);
    expect(challengeProblem({ ...input, money_target: 0, money_deadline: "2026-11-20" }, "2026-11-10")).toMatch(/above zero/);
    expect(challengeProblem({ ...input, money_target: 500, money_deadline: "2026-11-01" }, "2026-11-10")).toMatch(/on or after/);
    expect(challengeProblem({ ...input, start_date: "2026-11-20" }, "2026-11-10")).toBeNull();
  });
});

describe("ending, finishing and restarting", () => {
  it("ends early on today and keeps the days it ran", () => {
    expect(endPatch(challenge(), "2026-10-12")).toEqual({ status: "ended", ended_on: "2026-10-12" });
    expect(endPatch(challenge(), "2026-12-01")).toEqual({ status: "ended", ended_on: "2026-11-03" });
    // Ended before it began: no days.
    expect(endPatch(challenge(), "2026-10-01")).toEqual({ status: "ended", ended_on: "2026-10-04" });
  });

  it("finishes only from the last day on", () => {
    expect(canFinish(challenge(), "2026-11-02")).toBe(false);
    expect(canFinish(challenge(), "2026-11-03")).toBe(true);
    expect(canFinish(challenge(), "2026-11-20")).toBe(true);
    expect(canFinish(challenge({ status: "ended", ended_on: "2026-10-09" }), "2026-11-20")).toBe(false);
    expect(finishPatch(challenge())).toEqual({ status: "succeeded", ended_on: "2026-11-03" });
  });

  it("restarts the active one: the old run is abandoned the day before, the new one starts today", () => {
    const rules: ChallengeRule[] = [{ item_id: "a", target: { kind: "max", max: 30 } }];
    const { close, next } = restartRows(challenge({ rules }), "2026-10-12");
    expect(close).toEqual({ status: "abandoned", ended_on: "2026-10-11" });
    expect(next).toMatchObject({ name: "30 day lock in", status: "active", start_date: "2026-10-12", length_days: 30, rules, restart_of: "c1", ended_on: null, money_target_start: null });
    // The money target moves forward by the same seven days.
    expect(next).toMatchObject({ money_target: 1000, money_deadline: "2026-10-21" });
  });

  it("restarting on the start day leaves the old run with no days", () => {
    const { close } = restartRows(challenge(), "2026-10-05");
    expect(close).toEqual({ status: "abandoned", ended_on: "2026-10-04" });
  });

  it("restarts a past one without touching it", () => {
    const past = challenge({ status: "succeeded", ended_on: "2026-11-03", money_target: null, money_deadline: null });
    const { close, next } = restartRows(past, "2026-12-01");
    expect(close).toBeNull();
    expect(next).toMatchObject({ start_date: "2026-12-01", restart_of: "c1", money_target: null, money_deadline: null });
  });
});

describe("challengeRecord", () => {
  it("counts the days a challenge covered, leaving today open until it is full", () => {
    const s: Record<string, DayStatus> = { "2026-10-05": "full", "2026-10-06": "partial", "2026-10-07": "missed", "2026-10-08": "partial" };
    expect(challengeRecord(challenge(), s, "2026-10-08")).toEqual({ days: 4, length: 30, full: 1, partial: 1, missed: 1 });
    expect(challengeRecord(challenge(), { ...s, "2026-10-08": "full" }, "2026-10-08")).toMatchObject({ full: 2, partial: 1, missed: 1 });
    const ended = challenge({ status: "ended", ended_on: "2026-10-06" });
    expect(challengeRecord(ended, s, "2026-10-20")).toEqual({ days: 2, length: 30, full: 1, partial: 1, missed: 0 });
  });
});
