import { beforeEach, describe, expect, it } from "vitest";
import { getBlocksForDate, nowAndNext, resolveBlocks } from "../blocks";
import { db, setBackend } from "../db";
import {
  addItem,
  getChallenge,
  getItemByKey,
  getItems,
  getLogs,
  getVersions,
  getWorkouts,
  logWeight,
  removeItem,
  reorderItems,
  resetAllData,
  setChecked,
  setItemActive,
  setItemTarget,
  setText,
  setValue,
  setValueByKey,
  workoutsFor,
} from "../db/helpers";
import { LocalBackend, memoryStore } from "../db/local";
import { COLUMNS } from "../db/schema";
import { challengeEndDate, durationMinutes, isTimeStr, minutesOf } from "../logic/dates";
import { summarizeDay, summarizeWeek } from "../logic/day";
import { scoredItems } from "../logic/targets";
import { TABLE_NAMES, type Weekday } from "../types";
import { ensureSeeded } from "./index";

// Built from char codes so this file holds neither character itself.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

beforeEach(async () => {
  setBackend(new LocalBackend(memoryStore(), "memory"));
  await ensureSeeded("2026-10-05");
});

describe("seed", () => {
  it("runs once", async () => {
    expect(await ensureSeeded()).toBe(false);
    expect(await db.list("challenge")).toHaveLength(1);
    expect(await db.list("checklist_item")).toHaveLength(23);
  });

  it("writes the challenge from the PRD", async () => {
    const c = await getChallenge();
    expect(c).toMatchObject({ start_date: "2026-10-05", length_days: 30, money_target: 1000, money_deadline: "2026-10-14", daily_floor: 100 });
    expect(challengeEndDate(c!.start_date, c!.length_days)).toBe("2026-11-03");
  });

  it("writes the 14 checklist items in PRD order with their types and targets", async () => {
    const active = (await getItems()).filter((i) => i.active);
    expect(active.map((i) => [i.name, i.type, i.cadence, i.target])).toEqual([
      ["Up by 5:45", "yesno", "daily", { kind: "check_by", by: "06:00" }],
      ["Workout", "yesno", "daily", { kind: "check" }],
      ["Core", "yesno", "daily", { kind: "check" }],
      ["Calories", "number", "daily", { kind: "range", min: 1900, max: 2100 }],
      ["Protein", "number", "daily", { kind: "min", min: 180 }],
      ["Earned today", "number", "daily", { kind: "min", min: 100 }],
      ["No smoking", "yesno", "daily", { kind: "check" }],
      ["No drinking", "yesno", "daily", { kind: "check" }],
      ["No masturbation", "yesno", "daily", { kind: "check" }],
      ["Study or homework block", "yesno", "daily", { kind: "check" }],
      ["Business move", "text", "daily", { kind: "text" }],
      ["In bed on time", "yesno", "daily", { kind: "check" }],
      ["Talk to one girl at school", "yesno", "weekly", { kind: "check" }],
      ["Weigh-in and photo", "number", "weekly", { kind: "min", min: 1 }],
    ]);
    expect(active.filter((i) => i.cadence === "daily")).toHaveLength(12);
    expect(active.find((i) => i.key === "weighin")).toMatchObject({ weekly_day: 5, with_photo: true });
  });

  it("writes the vice library with only the three checklist vices on", async () => {
    const vices = (await getItems()).filter((i) => i.category === "vice");
    expect(vices).toHaveLength(12);
    expect(vices.every((v) => v.mode === "quit")).toBe(true);
    expect(vices.filter((v) => v.active).map((v) => v.key)).toEqual(["vice_smoking", "vice_drinking", "vice_masturbation"]);
    expect(vices.filter((v) => v.tracks_money).map((v) => v.key).sort()).toEqual(["vice_gambling", "vice_impulse_spending"]);
  });

  it("gives every item a baseline version that matches it", async () => {
    const items = await getItems();
    const versions = await getVersions();
    expect(versions).toHaveLength(items.length);
    for (const item of items) {
      const v = versions.find((x) => x.item_id === item.id);
      expect(v).toMatchObject({ target: item.target, active: item.active });
    }
    expect(scoredItems(items, versions, "2026-10-05")).toHaveLength(14);
  });

  it("writes a template for every weekday with valid, ordered times", async () => {
    const rows = await db.list("schedule_template");
    for (let d = 0; d < 7; d++) {
      const day = rows.filter((r) => r.weekday === d).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
      expect(day.length).toBeGreaterThanOrEqual(7);
      expect(day[0]).toMatchObject({ block_name: "Wake", start: "05:45" });
      expect(day[day.length - 1]).toMatchObject({ block_name: "Bed", start: "23:00" });
      expect(day.find((r) => r.kind === "workout")?.start).toBe("06:30");
      for (const r of day) {
        expect(isTimeStr(r.start) && isTimeStr(r.end)).toBe(true);
        expect(minutesOf(r.end)).toBeGreaterThan(minutesOf(r.start));
      }
      // No block starts before the one ahead of it has ended.
      for (let i = 1; i < day.length; i++) expect(minutesOf(day[i].start)).toBeGreaterThanOrEqual(minutesOf(day[i - 1].end));
    }
    const tue = rows.filter((r) => r.weekday === 2);
    expect(tue.find((r) => r.kind === "class")).toMatchObject({ start: "10:00", end: "14:30" });
    expect(tue.find((r) => r.kind === "delivery")).toMatchObject({ start: "17:00", end: "21:00" });
    expect(rows.filter((r) => r.weekday === 0).some((r) => r.kind === "class")).toBe(false);
  });

  it("writes a main workout and a core routine for all seven days", async () => {
    const all = await getWorkouts();
    expect(all).toHaveLength(14);
    const names = ([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => workoutsFor(all, d).main?.name);
    expect(names).toEqual(["Upper A", "Lower", "Light basketball", "Upper B", "Lower", "Jump rope", "Jump rope"]);
    expect(all.filter((w) => w.slot === "main" && w.kind === "lift").map((w) => w.weekday).sort()).toEqual([1, 2, 4, 5]);
    expect(workoutsFor(all, 6).main?.detail).toBe("15 to 20 min");
    expect(workoutsFor(all, 0).main?.detail).toBe("10 min");
    for (const w of all) {
      expect(w.exercises.length).toBeGreaterThan(0);
      for (const e of w.exercises) expect(e.name && e.sets >= 1 && e.reps).toBeTruthy();
    }
    expect(new Set(all.filter((w) => w.slot === "core").map((w) => w.name)).size).toBe(7);
  });

  it("writes the default reminders", async () => {
    const r = await db.list("reminder", { orderBy: "sort_order" });
    expect(r.map((x) => [x.kind, x.time, x.enabled])).toEqual([
      ["wake", "05:45", true],
      ["workout", "06:15", true],
      ["delivery", null, true],
      ["earnings_nudge", "20:00", true],
      ["checkin", "22:30", true],
    ]);
    expect(r[2]).toMatchObject({ block_name: "Delivery", offset_minutes: -10 });
  });

  it("only writes columns the migration has", async () => {
    for (const table of TABLE_NAMES) {
      const allowed = Object.keys(COLUMNS[table]).sort();
      for (const row of await db.list(table)) expect(Object.keys(row).sort(), table).toEqual(allowed);
    }
  });

  it("has no em dash or en dash anywhere in seeded text", async () => {
    for (const table of TABLE_NAMES) expect(JSON.stringify(await db.list(table))).not.toMatch(DASHES);
  });
});

describe("checklist helpers", () => {
  const D = "2026-10-05";

  it("ticks, unticks and keeps one row per item per day", async () => {
    const core = (await getItemByKey("core"))!;
    const a = await setChecked(core.id, D, true, new Date("2026-10-05T11:00:00Z"));
    expect(a).toMatchObject({ checked: true, completed_at: "2026-10-05T11:00:00.000Z" });
    const b = await setChecked(core.id, D, false);
    expect(b).toMatchObject({ id: a.id, checked: false, completed_at: null });
    expect(await getLogs(D)).toHaveLength(1);
  });

  it("sets and clears numbers", async () => {
    const p = (await getItemByKey("protein"))!;
    expect(await setValue(p.id, D, 185)).toMatchObject({ value: 185, checked: true });
    expect(await setValue(p.id, D, null)).toMatchObject({ value: null, checked: false, completed_at: null });
    expect(await setValueByKey("earned", D, 120)).toMatchObject({ value: 120 });
    expect(await setValueByKey("no_such_key", D, 1)).toBeNull();
  });

  it("text and tick survive each other, in any order and when fired together", async () => {
    const biz = (await getItemByKey("business"))!;
    await Promise.all([setText(biz.id, D, "  Emailed the dean  "), setChecked(biz.id, D, true)]);
    const [log] = await getLogs(D);
    expect(log).toMatchObject({ text: "Emailed the dean", checked: true });
    expect((await setText(biz.id, D, "Called a client")).checked).toBe(true);
    expect(await setText(biz.id, D, "  ")).toMatchObject({ text: null, checked: false });
  });

  it("a full day scores full, straight from the helpers", async () => {
    const items = await getItems();
    const at = new Date("2026-10-05T09:50:00Z");
    for (const i of items.filter((x) => x.active && x.cadence === "daily")) {
      if (i.type === "yesno") await setChecked(i.id, D, true, at);
      else if (i.type === "text") {
        await setText(i.id, D, "Pitched the cohort");
        await setChecked(i.id, D, true, at);
      } else await setValue(i.id, D, i.key === "calories" ? 2000 : 200);
    }
    const s = summarizeDay(D, items, await getVersions(), await getLogs(D));
    expect(s).toMatchObject({ status: "full", done: 12, total: 12, percent: 100 });
  });

  it("a weigh-in writes body_log and completes the weekly item", async () => {
    await logWeight("2026-10-09", 182.4);
    expect(await db.first("body_log", { eq: { date: "2026-10-09" } })).toMatchObject({ weight: 182.4 });
    const w = summarizeWeek("2026-10-10", await getItems(), await getVersions(), await getLogs("2026-10-05", "2026-10-11"));
    expect(w.items.find((r) => r.item.key === "weighin")).toMatchObject({ done: true, doneOn: "2026-10-09" });
    await logWeight("2026-10-09", 181);
    expect(await db.list("body_log")).toHaveLength(1);
  });

  it("a target change applies from today and leaves earlier days alone", async () => {
    const cal = (await getItemByKey("calories"))!;
    await setValue(cal.id, "2026-10-06", 2000);
    await setValue(cal.id, "2026-10-08", 2000);
    await setItemTarget(cal.id, { kind: "range", min: 1700, max: 1900 }, "2026-10-08");
    const items = await getItems();
    const versions = await getVersions();
    const logs = await getLogs("2026-10-05", "2026-10-09");
    const state = (d: string) => summarizeDay(d, items, versions, logs).items.find((r) => r.item.key === "calories")?.state;
    expect(state("2026-10-06")).toBe("done");
    expect(state("2026-10-08")).toBe("off");
    expect(versions.filter((v) => v.item_id === cal.id)).toHaveLength(2);
    // A second change the same day replaces that day's version.
    await setItemTarget(cal.id, { kind: "range", min: 1800, max: 2000 }, "2026-10-08");
    expect((await getVersions()).filter((v) => v.item_id === cal.id)).toHaveLength(2);
    // A rename writes no version.
    const { saveItem } = await import("../db/helpers");
    await saveItem(cal.id, { name: "Kcal" }, "2026-10-09");
    expect((await getVersions()).filter((v) => v.item_id === cal.id)).toHaveLength(2);
  });

  it("added items count from today, removed items stop today", async () => {
    const added = await addItem({ name: " Read 20 pages ", type: "yesno" }, "2026-10-08");
    expect(added).toMatchObject({ name: "Read 20 pages", sort_order: 150, active: true });
    const wake = (await getItemByKey("wake"))!;
    await removeItem(wake.id, "2026-10-08");
    const items = await getItems();
    const versions = await getVersions();
    const names = (d: string) => scoredItems(items, versions, d).map((s) => s.item.name);
    expect(names("2026-10-07")).toContain("Up by 5:45");
    expect(names("2026-10-07")).not.toContain("Read 20 pages");
    expect(names("2026-10-08")).not.toContain("Up by 5:45");
    expect(names("2026-10-08")).toContain("Read 20 pages");
    expect(items.find((i) => i.id === wake.id)).toMatchObject({ archived: true, active: false });
  });

  it("turning on a library vice adds it from that day", async () => {
    const vape = (await getItemByKey("vice_vaping"))!;
    await setItemActive(vape.id, true, "2026-10-10");
    const items = await getItems();
    const versions = await getVersions();
    expect(summarizeDay("2026-10-09", items, versions, []).total).toBe(12);
    expect(summarizeDay("2026-10-10", items, versions, []).total).toBe(13);
  });

  it("reorders", async () => {
    const active = (await getItems()).filter((i) => i.active);
    const ids = active.map((i) => i.id);
    ids.unshift(ids.pop()!);
    await reorderItems(ids);
    const after = scoredItems(await getItems(), await getVersions(), "2026-10-05");
    expect(after[0].item.key).toBe("weighin");
    expect(after[1].item.key).toBe("wake");
  });

  it("reset wipes logs and brings the defaults back", async () => {
    const core = (await getItemByKey("core"))!;
    await setChecked(core.id, D, true);
    await removeItem(core.id, D);
    await resetAllData();
    expect(await db.list("day_log")).toEqual([]);
    expect((await getItems()).filter((i) => i.active)).toHaveLength(14);
  });
});

describe("schedule blocks for Today", () => {
  it("builds a day from the weekday template, sorted, with durations", async () => {
    const blocks = await getBlocksForDate("2026-10-06"); // Tuesday
    expect(blocks.map((b) => b.block_name)).toEqual([
      "Wake",
      "Lift + core",
      "Home, shower, eat",
      "Class",
      "Basketball",
      "Delivery: dinner",
      "Study, homework, business",
      "Bed",
    ]);
    expect(blocks.every((b) => b.source === "template" && !b.persisted && b.date === "2026-10-06")).toBe(true);
    for (const b of blocks) expect(b.duration).toBe(durationMinutes(b.start, b.end));
  });

  it("uses per-day rows instead as soon as the day has any", async () => {
    await db.insert("schedule_block", {
      date: "2026-10-06",
      block_name: "TV",
      start: "20:00",
      end: "21:00",
      duration: 60,
      flexible: true,
      kind: "free",
      note: null,
      calendar_event_id: null,
      template_id: null,
      source: "manual",
    });
    const blocks = await getBlocksForDate("2026-10-06");
    expect(blocks.map((b) => b.block_name)).toEqual(["TV"]);
    expect(blocks[0].persisted).toBe(true);
    expect((await getBlocksForDate("2026-10-13")).length).toBe(8);
    expect(resolveBlocks("2026-10-07", [], [])).toEqual([]);
  });

  it("finds now and next", async () => {
    const blocks = await getBlocksForDate("2026-10-06");
    expect(nowAndNext(blocks, "05:00")).toMatchObject({ now: null, minutesUntilNext: 45 });
    expect(nowAndNext(blocks, "05:00").next?.block_name).toBe("Wake");
    const mid = nowAndNext(blocks, "11:30");
    expect(mid.now?.block_name).toBe("Class");
    expect(mid.minutesLeft).toBe(180);
    expect(mid.next?.block_name).toBe("Basketball");
    expect(mid.minutesUntilNext).toBe(210);
    const gap = nowAndNext(blocks, "09:45");
    expect(gap.now).toBeNull();
    expect(gap.next?.block_name).toBe("Class");
    const end = nowAndNext(blocks, "23:30");
    expect(end.now?.block_name).toBe("Bed");
    expect(end.next).toBeNull();
    expect(nowAndNext(blocks, "07:30").now?.block_name).toBe("Home, shower, eat");
  });
});
