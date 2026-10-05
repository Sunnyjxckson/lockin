import { describe, expect, it } from "vitest";
import {
  businessSummary,
  businessWeeks,
  clockOf,
  comeBack,
  editPatch,
  finish,
  formatAway,
  leave,
  liveFromRow,
  liveStudyBlock,
  manualProblem,
  manualRow,
  minutesOn,
  newLive,
  pause,
  pendingAway,
  resume,
  reviewAways,
  staleInfo,
  startRow,
  strictBreach,
  studyTick,
  weekByDay,
} from "./focus";

const MIN = 60_000;
const HOUR = 60 * MIN;
// 2026-10-05 20:00 in New York (EDT, UTC-4). A Monday.
const T0 = Date.parse("2026-10-06T00:00:00.000Z");
const live0 = () => newLive({ id: "s1", startedAt: T0, label: "Study" });

describe("clock", () => {
  it("counts from timestamps", () => {
    const c = clockOf(live0(), T0 + 25 * MIN + 7000);
    expect(c.focusedSeconds).toBe(25 * 60 + 7);
    expect(c.remaining).toBeNull();
  });

  it("pause and resume take the paused time out", () => {
    let l = pause(live0(), T0 + 10 * MIN);
    expect(clockOf(l, T0 + 30 * MIN).focusedSeconds).toBe(600);
    expect(clockOf(l, T0 + 30 * MIN).paused).toBe(true);
    l = resume(l, T0 + 30 * MIN);
    const c = clockOf(l, T0 + 40 * MIN);
    expect(c.focusedSeconds).toBe(20 * 60);
    expect(c.pausedSeconds).toBe(20 * 60);
    expect(c.clockSeconds).toBe(40 * 60);
    expect(pause(pause(live0(), T0), T0 + 5).pauses).toHaveLength(1);
  });

  it("counts down against focused time", () => {
    const l = newLive({ id: "s", startedAt: T0, label: "Study", plannedSeconds: 25 * 60 });
    expect(clockOf(l, T0 + 10 * MIN).remaining).toBe(15 * 60);
    const over = clockOf(l, T0 + 27 * MIN);
    expect(over.remaining).toBe(0);
    expect(over.overBy).toBe(120);
    expect(over.progress).toBe(1);
  });

  it("rebuilds from the row on a device with no saved state", () => {
    const l = liveFromRow({ id: "r", created_at: new Date(T0).toISOString(), label: null, block_id: "b" });
    expect(l.startedAt).toBe(T0);
    expect(l.label).toBe("Study");
    expect(l.blockId).toBe("b");
  });
});

describe("leaving the app", () => {
  it("records time away and takes it off focused time", () => {
    let l = leave(live0(), T0 + 10 * MIN);
    l = comeBack(l, T0 + 14 * MIN);
    const c = clockOf(l, T0 + 20 * MIN);
    expect(c.awayCount).toBe(1);
    expect(c.awaySeconds).toBe(240);
    expect(c.focusedSeconds).toBe(16 * 60);
    expect(pendingAway(l)?.from).toBe(T0 + 10 * MIN);
  });

  it("gives the time back when the user says they were working", () => {
    let l = comeBack(leave(live0(), T0 + 10 * MIN), T0 + 14 * MIN);
    l = reviewAways(l, true);
    const c = clockOf(l, T0 + 20 * MIN);
    expect(c.focusedSeconds).toBe(20 * 60);
    expect(c.awaySeconds).toBe(240);
    expect(pendingAway(l)).toBeNull();
  });

  it("drops a blip and ignores leaving while paused", () => {
    const blip = comeBack(leave(live0(), T0 + MIN), T0 + MIN + 3000);
    expect(blip.aways).toHaveLength(0);
    const paused = leave(pause(live0(), T0 + MIN), T0 + 2 * MIN);
    expect(paused.aways).toHaveLength(0);
  });

  it("an open away is already off the clock", () => {
    const l = leave(live0(), T0 + 10 * MIN);
    expect(clockOf(l, T0 + 30 * MIN).focusedSeconds).toBe(600);
  });
});

describe("strict mode", () => {
  const gone = (ms: number) => comeBack(leave(live0(), T0 + 10 * MIN), T0 + 10 * MIN + ms);
  it("is off by default", () => {
    expect(strictBreach(gone(5 * MIN), "off", 30, T0 + HOUR)).toBeNull();
  });
  it("lets a short leave through", () => {
    expect(strictBreach(gone(20_000), "end", 30, T0 + HOUR)).toBeNull();
  });
  it("ends at the moment of leaving, or voids", () => {
    expect(strictBreach(gone(5 * MIN), "end", 30, T0 + HOUR)).toEqual({ action: "end", at: T0 + 10 * MIN, awaySeconds: 300 });
    expect(strictBreach(gone(5 * MIN), "void", 60, T0 + HOUR)?.action).toBe("void");
  });
  it("does not fire again for an away already answered", () => {
    expect(strictBreach(reviewAways(gone(5 * MIN), false), "end", 30, T0 + HOUR)).toBeNull();
  });
});

describe("left running overnight", () => {
  it("is caught by the long away and capped at when the user left", () => {
    // Started 8 PM, phone put down at 8:50, opened again at 5 AM.
    const l = leave(live0(), T0 + 50 * MIN);
    const s = staleInfo(l, T0 + 9 * HOUR);
    expect(s).toMatchObject({ reason: "away", suggestedMinutes: 50, endedAt: T0 + 50 * MIN, clockMinutes: 540 });
  });

  it("still asks after the app has come back", () => {
    const l = comeBack(leave(live0(), T0 + 50 * MIN), T0 + 9 * HOUR);
    expect(staleInfo(l, T0 + 9 * HOUR + 5000)?.suggestedMinutes).toBe(50);
  });

  it("caps a session with no away record at six hours, or its planned length", () => {
    expect(staleInfo(live0(), T0 + 9 * HOUR)).toMatchObject({ reason: "long", suggestedMinutes: 360 });
    const planned = newLive({ id: "s", startedAt: T0, label: "Study", plannedSeconds: 45 * 60 });
    expect(staleInfo(planned, T0 + 9 * HOUR)?.suggestedMinutes).toBe(45);
  });

  it("leaves an honest session alone", () => {
    expect(staleInfo(live0(), T0 + 3 * HOUR)).toBeNull();
    expect(staleInfo(comeBack(leave(live0(), T0 + MIN), T0 + 20 * MIN), T0 + HOUR)).toBeNull();
  });
});

describe("finish", () => {
  it("logs focused minutes and keeps clock and away time apart", () => {
    let l = comeBack(leave(live0(), T0 + 10 * MIN), T0 + 14 * MIN);
    l = resume(pause(l, T0 + 20 * MIN), T0 + 26 * MIN);
    const f = finish(l, T0 + 60 * MIN);
    expect(f.log).toBe(true);
    expect(f.patch).toEqual({ end: "21:00", minutes: 50 });
    expect(f.meta).toMatchObject({ clock_minutes: 60, away_count: 1, away_minutes: 4, paused_minutes: 6, completed: false, planned_minutes: null });
  });

  it("closes an open pause at the finish", () => {
    const f = finish(pause(live0(), T0 + 30 * MIN), T0 + 50 * MIN);
    expect(f.patch.minutes).toBe(30);
  });

  it("does not log under a minute", () => {
    expect(finish(live0(), T0 + 40_000).log).toBe(false);
  });

  it("marks a countdown completed", () => {
    const l = newLive({ id: "s", startedAt: T0, label: "Study", plannedSeconds: 25 * 60, blockId: "b" });
    expect(finish(l, T0 + 25 * MIN).meta.completed).toBe(true);
    expect(finish(l, T0 + 12 * MIN).meta.completed).toBe(false);
  });

  it("a session crossing midnight keeps its start date", () => {
    const start = Date.parse("2026-10-06T03:30:00.000Z"); // 11:30 PM Oct 5 in New York
    const row = startRow(start, "Study", null);
    expect(row).toMatchObject({ date: "2026-10-05", start: "23:30", end: null, minutes: 0, source: "timer" });
    expect(Date.parse(row.created_at)).toBe(start);
    const f = finish(newLive({ id: "s", startedAt: start, label: "Study" }), start + 75 * MIN);
    expect(f.patch).toEqual({ end: "00:45", minutes: 75 });
    expect(minutesOn([{ ...row, ...f.patch }], "2026-10-05")).toBe(75);
    expect(minutesOn([{ ...row, ...f.patch }], "2026-10-06")).toBe(0);
  });
});

describe("by hand", () => {
  it("validates", () => {
    expect(manualProblem({ date: "2026-10-06", minutes: 30 }, "2026-10-05")).toMatch(/not happened/);
    expect(manualProblem({ date: "2026-10-05", minutes: null }, "2026-10-05")).toMatch(/minutes/);
    expect(manualProblem({ date: "2026-10-05", minutes: 2000 }, "2026-10-05")).toMatch(/16 hours/);
    expect(manualProblem({ date: "2026-10-04", minutes: 90 }, "2026-10-05")).toBeNull();
  });
  it("builds and edits rows", () => {
    const row = manualRow({ date: "2026-10-05", minutes: 90, label: "  ", start: "23:00" });
    expect(row).toMatchObject({ end: "00:30", minutes: 90, label: "Study", source: "manual" });
    expect(editPatch({ start: "20:00" }, { date: "2026-10-04", minutes: 45, label: "Homework" })).toEqual({ date: "2026-10-04", minutes: 45, label: "Homework", end: "20:45" });
  });
});

describe("totals", () => {
  const s = [
    { date: "2026-10-05", minutes: 30, end: "10:00" },
    { date: "2026-10-05", minutes: 45, end: "21:00" },
    { date: "2026-10-05", minutes: 0, end: null },
    { date: "2026-10-07", minutes: 20, end: "09:00" },
  ];
  it("sums a day, skipping the running timer", () => {
    expect(minutesOn(s, "2026-10-05")).toBe(75);
  });
  it("lays the week out Monday to Sunday", () => {
    const w = weekByDay(s, "2026-10-07", 60, { date: "2026-10-07", minutes: 10 });
    expect(w.map((d) => d.minutes)).toEqual([75, 0, 30, 0, 0, 0, 0]);
    expect(w[0].met).toBe(true);
    expect(w[2]).toMatchObject({ today: true, met: false });
    expect(w[3].future).toBe(true);
  });
});

describe("study tick", () => {
  const base = { minutes: 0, goal: 60, blockCompleted: false, checked: false, autoTicked: false };
  it("ticks at the goal or on a completed block", () => {
    expect(studyTick({ ...base, minutes: 60 })).toBe("tick");
    expect(studyTick({ ...base, minutes: 20, blockCompleted: true })).toBe("tick");
    expect(studyTick({ ...base, minutes: 59 })).toBe("none");
    expect(studyTick({ ...base, minutes: 90, checked: true })).toBe("none");
  });
  it("never unticks a tick made by hand", () => {
    expect(studyTick({ ...base, minutes: 0, checked: true })).toBe("none");
  });
  it("takes back its own tick when the minutes are gone", () => {
    expect(studyTick({ ...base, minutes: 10, checked: true, autoTicked: true })).toBe("untick");
  });
});

describe("live study block", () => {
  const blocks = [
    { id: "a", kind: "delivery", block_name: "Delivery", start: "17:00", end: "20:00" },
    { id: "b", kind: "study", block_name: "Study, homework, business", start: "20:00", end: "23:00" },
  ];
  it("finds it with the time left", () => {
    expect(liveStudyBlock(blocks, 20 * 3600 + 1800)).toMatchObject({ block: { id: "b" }, remainingSeconds: 9000 });
    expect(liveStudyBlock(blocks, 19 * 3600)).toBeNull();
    expect(liveStudyBlock(blocks, 23 * 3600 - 20)).toBeNull();
  });
});

describe("business log", () => {
  const logs = [
    { date: "2026-10-05", item_id: "biz", text: "Called the dean" },
    { date: "2026-10-01", item_id: "biz", text: "Sent the deck" },
    { date: "2026-09-29", item_id: "biz", text: "Demo with a clinic" },
    { date: "2026-10-02", item_id: "biz", text: "  " },
    { date: "2026-10-02", item_id: "other", text: "nope" },
  ];
  it("groups by week, newest first", () => {
    const w = businessWeeks(logs, "biz");
    expect(w.map((x) => x.weekStart)).toEqual(["2026-10-05", "2026-09-28"]);
    expect(w[1].moves.map((m) => m.date)).toEqual(["2026-10-01", "2026-09-29"]);
    expect(businessSummary(w, "2026-10-05")).toEqual({ total: 3, thisWeek: 1, activeWeeks: 2 });
  });
});

describe("formatAway", () => {
  it("reads plainly", () => {
    expect(formatAway(45)).toBe("45s");
    expect(formatAway(250)).toBe("4m 10s");
    expect(formatAway(3900)).toBe("1h 5m");
  });
});
