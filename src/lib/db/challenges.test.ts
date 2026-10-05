// Starting, ending, finishing and restarting a challenge through the helpers,
// on a seeded store. The ongoing history underneath must never change.

import { beforeEach, describe, expect, it } from "vitest";
import { db, setBackend } from "./index";
import {
  endChallenge,
  finishChallenge,
  getChallenge,
  getChallenges,
  getItemByKey,
  getScoringVersions,
  getSettings,
  getVersions,
  restartChallenge,
  setChecked,
  setDailyFloor,
  setValue,
  startChallenge,
} from "./helpers";
import { LocalBackend, memoryStore } from "./local";
import { modeOn, pastChallenges } from "../logic/challenge";
import { summarizeDay } from "../logic/day";
import { targetOn } from "../logic/targets";
import { ensureSeeded } from "../seed";
import { TABLE_NAMES, type TableName } from "../types";

const HISTORY: TableName[] = ["day_log", "earning", "meal", "set_log", "vice_slip", "body_log", "target_version", "checklist_item", "schedule_block", "coach_note"];

async function snapshot(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const t of HISTORY) out[t] = await db.list(t, { orderBy: "id" });
  return out;
}

beforeEach(async () => {
  setBackend(new LocalBackend(memoryStore(), "memory"));
  await ensureSeeded("2026-10-05");
  const workout = (await getItemByKey("workout"))!;
  const calories = (await getItemByKey("calories"))!;
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]) {
    await setChecked(workout.id, d, true);
    await setValue(calories.id, d, 2000);
  }
  await db.insert("earning", { date: "2026-10-06", amount: 120, app: "DoorDash", hours: 3, screenshot_url: null });
});

describe("the seeded challenge", () => {
  it("is the one active challenge, and the history starts with it", async () => {
    expect(await getChallenge()).toMatchObject({ id: "challenge", status: "active", start_date: "2026-10-05", length_days: 30, rules: null });
    expect((await getSettings())?.history_start).toBe("2026-10-05");
  });
});

describe("ending a challenge", () => {
  it("keeps it as a record and leaves the history exactly as it was", async () => {
    const before = await snapshot();
    const ended = await endChallenge("2026-10-08");
    expect(ended).toMatchObject({ id: "challenge", status: "ended", ended_on: "2026-10-08" });
    expect(await getChallenge()).toBeNull();
    expect(await getChallenges()).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
    const s = (await getSettings())!;
    expect(modeOn(await getChallenges(), s.history_start, "2026-10-09")).toMatchObject({ mode: "ongoing", challenge: null, historyStart: "2026-10-05" });
  });

  it("throws when there is nothing to end", async () => {
    await endChallenge("2026-10-08");
    await expect(endChallenge("2026-10-08")).rejects.toThrow(/No active challenge/);
  });
});

describe("starting a challenge", () => {
  it("refuses while another one is active", async () => {
    await expect(startChallenge({ name: "Diet", start_date: "2026-10-08", length_days: 7, rules: null, daily_floor: 100 }, "2026-10-08")).rejects.toThrow(/already active/);
    expect(await getChallenges()).toHaveLength(1);
  });

  it("refuses bad input without writing anything", async () => {
    await endChallenge("2026-10-08");
    await expect(startChallenge({ name: "", start_date: "2026-10-09", length_days: 7, rules: null, daily_floor: 100 }, "2026-10-09")).rejects.toThrow(/name/);
    expect(await getChallenges()).toHaveLength(1);
  });

  it("adds a second row with its own rules, and writes nothing else", async () => {
    await endChallenge("2026-10-08");
    const before = await snapshot();
    const calories = (await getItemByKey("calories"))!;
    const workout = (await getItemByKey("workout"))!;
    const strict = { kind: "range", min: 1500, max: 1700 } as const;
    const c = await startChallenge(
      { name: "Strict diet", start_date: "2026-10-09", length_days: 14, rules: [{ item_id: calories.id, target: strict }, { item_id: workout.id, target: null }], daily_floor: 100 },
      "2026-10-09",
    );
    expect(c).toMatchObject({ name: "Strict diet", status: "active", start_date: "2026-10-09", length_days: 14, money_target: null, restart_of: null });
    expect(c.id).not.toBe("challenge");
    expect(await snapshot()).toEqual(before);
    expect((await getChallenges()).map((x) => [x.name, x.status])).toEqual([
      ["30 day lock in", "ended"],
      ["Strict diet", "active"],
    ]);

    // Its target applies on its own days only. The saved versions are untouched.
    const scoring = await getScoringVersions();
    expect(targetOn(calories, scoring, "2026-10-08")).toEqual({ kind: "range", min: 1900, max: 2100 });
    expect(targetOn(calories, scoring, "2026-10-09")).toEqual(strict);
    expect(targetOn(calories, scoring, "2026-10-22")).toEqual(strict);
    expect(targetOn(calories, scoring, "2026-10-23")).toEqual({ kind: "range", min: 1900, max: 2100 });
    expect(await getVersions()).toHaveLength((before.target_version as unknown[]).length);
    expect(await db.list("target_version", { orderBy: "id" })).toEqual(before.target_version);

    // Days logged before it started score as they always did.
    const items = await db.list("checklist_item");
    const logs = await db.list("day_log");
    expect(summarizeDay("2026-10-06", items, scoring, logs).done).toBe(2);
  });
});

describe("finishing a challenge", () => {
  it("is refused while days are left", async () => {
    await expect(finishChallenge("2026-10-20")).rejects.toThrow(/days left/);
  });

  it("marks it succeeded on its last day, with the history untouched", async () => {
    const before = await snapshot();
    const done = await finishChallenge("2026-11-04");
    expect(done).toMatchObject({ status: "succeeded", ended_on: "2026-11-03" });
    expect(await snapshot()).toEqual(before);
    expect(pastChallenges(await getChallenges()).map((c) => c.status)).toEqual(["succeeded"]);
  });
});

describe("restarting a challenge", () => {
  it("abandons the active run and starts the same one again today", async () => {
    const before = await snapshot();
    const next = await restartChallenge(null, "2026-10-08");
    expect(next).toMatchObject({ name: "30 day lock in", status: "active", start_date: "2026-10-08", length_days: 30, restart_of: "challenge", money_target: 1000, money_deadline: "2026-10-17" });
    const all = await getChallenges();
    expect(all.map((c) => [c.status, c.start_date, c.ended_on])).toEqual([
      ["abandoned", "2026-10-05", "2026-10-07"],
      ["active", "2026-10-08", null],
    ]);
    expect(await snapshot()).toEqual(before);
    const s = (await getSettings())!;
    // Day 1 again, with the history still starting where it always did.
    expect(modeOn(all, s.history_start, "2026-10-08")).toMatchObject({ mode: "challenge", day: 1, historyStart: "2026-10-05" });
  });

  it("restarts a past one by id", async () => {
    await endChallenge("2026-10-08");
    const next = await restartChallenge("challenge", "2026-10-20");
    expect(next).toMatchObject({ status: "active", start_date: "2026-10-20", restart_of: "challenge" });
    expect((await db.get("challenge", "challenge"))?.status).toBe("ended");
  });

  it("will not start a past one over an active one", async () => {
    await endChallenge("2026-10-08");
    await startChallenge({ name: "Diet", start_date: "2026-10-09", length_days: 7, rules: null, daily_floor: 100 }, "2026-10-09");
    await expect(restartChallenge("challenge", "2026-10-10")).rejects.toThrow(/already active/);
  });

  it("can be done over and over without piling up active rows", async () => {
    await restartChallenge(null, "2026-10-08");
    await restartChallenge(null, "2026-10-09");
    await restartChallenge(null, "2026-10-09");
    const all = await getChallenges();
    expect(all.filter((c) => c.status === "active")).toHaveLength(1);
    expect(all).toHaveLength(4);
  });
});

describe("setDailyFloor", () => {
  it("keeps settings, the earned item and the active challenge in step", async () => {
    await setDailyFloor(150, "2026-10-08");
    expect((await getSettings())?.daily_floor).toBe(150);
    expect((await getItemByKey("earned"))?.target).toEqual({ kind: "min", min: 150 });
    expect((await getChallenge())?.daily_floor).toBe(150);
    // From that day on only: earlier days keep the floor they were scored against.
    const earned = (await getItemByKey("earned"))!;
    const v = await getScoringVersions();
    expect(targetOn(earned, v, "2026-10-07")).toEqual({ kind: "min", min: 100 });
    expect(targetOn(earned, v, "2026-10-08")).toEqual({ kind: "min", min: 150 });
  });

  it("works with no challenge", async () => {
    await endChallenge("2026-10-08");
    await setDailyFloor(80, "2026-10-09");
    expect((await getSettings())?.daily_floor).toBe(80);
    expect((await db.get("challenge", "challenge"))?.daily_floor).toBe(100);
  });
});

describe("seeding", () => {
  it("skips the first challenge when its days are already over, and starts in ongoing mode", async () => {
    setBackend(new LocalBackend(memoryStore(), "memory"));
    await ensureSeeded("2027-01-10");
    expect(await getChallenges()).toEqual([]);
    expect((await getSettings())?.history_start).toBe("2027-01-10");
    expect((await db.list("checklist_item")).length).toBe(23);
  });

  it("opens the history on the challenge start for a late install, so earlier days can be backfilled", async () => {
    setBackend(new LocalBackend(memoryStore(), "memory"));
    await ensureSeeded("2026-10-07");
    expect((await getSettings())?.history_start).toBe("2026-10-05");
  });

  it("opens the history on the install day when the challenge has not started", async () => {
    setBackend(new LocalBackend(memoryStore(), "memory"));
    await ensureSeeded("2026-10-01");
    expect((await getSettings())?.history_start).toBe("2026-10-01");
    expect(await getChallenge()).toMatchObject({ start_date: "2026-10-05" });
  });

  it("has every table reachable", async () => {
    for (const t of TABLE_NAMES) expect(Array.isArray(await db.list(t)), t).toBe(true);
  });
});
