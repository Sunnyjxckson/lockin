import { describe, expect, it } from "vitest";
import { nyInstant } from "./dates";
import {
  dueNotifications,
  isQuiet,
  planDay,
  upcoming,
  urlFor,
  windowDates,
  windowStart,
  type DueInput,
  type ReminderBlock,
  type ReminderDay,
} from "./reminders";
import type { Reminder } from "../types";

function rem(p: Partial<Reminder> & Pick<Reminder, "id" | "kind">): Reminder {
  return {
    created_at: "2026-10-05T00:00:00.000Z",
    label: p.kind,
    body: null,
    time: null,
    block_name: null,
    item_id: null,
    offset_minutes: 0,
    enabled: true,
    sort_order: 0,
    ...p,
  };
}

const WAKE = rem({ id: "r-wake", kind: "wake", label: "Wake", body: "5:45. Feet on the floor.", time: "05:45" });
const WORKOUT = rem({ id: "r-workout", kind: "workout", label: "Workout", body: "Workout starts in 15 minutes.", time: "06:15" });
const DELIVERY = rem({ id: "r-del", kind: "delivery", label: "Delivery block", block_name: "Delivery", offset_minutes: -10 });
const NUDGE = rem({ id: "r-nudge", kind: "earnings_nudge", label: "Earnings nudge", body: "Get back out.", time: "20:00" });
const CHECKIN = rem({ id: "r-check", kind: "checkin", label: "End of day check-in", body: "Close out the day.", time: "22:30" });
const ALL = [WAKE, WORKOUT, DELIVERY, NUDGE, CHECKIN];

const LUNCH: ReminderBlock = { id: "template:t1", template_id: "t1", block_name: "Delivery: lunch", start: "11:30", kind: "delivery" };
const DINNER: ReminderBlock = { id: "template:t2", template_id: "t2", block_name: "Delivery: dinner", start: "17:00", kind: "delivery" };
const STUDY: ReminderBlock = { id: "template:t3", template_id: "t3", block_name: "Study", start: "14:00", kind: "study" };

const OPTS = { floor: 100, quiet_start: "23:00", quiet_end: "05:30" };
const D = "2026-10-06";

function day(p: Partial<ReminderDay> = {}): ReminderDay {
  return { date: D, blocks: [LUNCH, STUDY, DINNER], earned: 0, ...p };
}

function at(time: string, date = D): Date {
  return nyInstant(date, time);
}

function due(p: Partial<DueInput> & Pick<DueInput, "now">): string[] {
  return dueNotifications({ reminders: ALL, days: [day()], sent: [], lastRun: null, ...OPTS, ...p }).map((n) => n.key);
}

describe("isQuiet", () => {
  it("wraps past midnight, start is quiet and end is not", () => {
    expect(isQuiet("23:00", "23:00", "05:30")).toBe(true);
    expect(isQuiet("02:00", "23:00", "05:30")).toBe(true);
    expect(isQuiet("05:29", "23:00", "05:30")).toBe(true);
    expect(isQuiet("05:30", "23:00", "05:30")).toBe(false);
    expect(isQuiet("22:59", "23:00", "05:30")).toBe(false);
  });
  it("handles a window inside one day and an empty window", () => {
    expect(isQuiet("13:00", "12:00", "14:00")).toBe(true);
    expect(isQuiet("14:00", "12:00", "14:00")).toBe(false);
    expect(isQuiet("03:00", "00:00", "00:00")).toBe(false);
  });
});

describe("planDay", () => {
  it("plans wake, workout, each delivery block, the nudge and the check-in in time order", () => {
    const plan = planDay(ALL, day(), OPTS);
    expect(plan.map((n) => [n.time, n.kind])).toEqual([
      ["05:45", "wake"],
      ["06:15", "workout"],
      ["11:20", "delivery"],
      ["16:50", "delivery"],
      ["20:00", "earnings_nudge"],
      ["22:30", "checkin"],
    ]);
  });

  it("names the block and its start time for delivery", () => {
    const n = planDay([DELIVERY], day(), OPTS)[0];
    expect(n.title).toBe("Delivery: lunch");
    expect(n.body).toBe("Starts in 10 min, at 11:30 AM.");
    expect(n.key).toBe(`${D}:r-del:t.t1`);
  });

  it("only matches blocks whose name starts with block_name", () => {
    const plan = planDay([DELIVERY], day({ blocks: [STUDY, { id: "x", block_name: "Late delivery", start: "21:00" }] }), OPTS);
    expect(plan).toEqual([]);
  });

  it("leaves out a disabled reminder", () => {
    const plan = planDay([{ ...WAKE, enabled: false }, CHECKIN], day(), OPTS);
    expect(plan.map((n) => n.kind)).toEqual(["checkin"]);
  });

  it("leaves out anything inside quiet hours", () => {
    const late = { ...CHECKIN, time: "23:15" };
    const early = { ...WAKE, time: "05:00" };
    const lateBlock: ReminderBlock = { id: "b9", block_name: "Delivery: late night", start: "23:05" };
    const plan = planDay([late, early, DELIVERY], day({ blocks: [lateBlock, DINNER] }), OPTS);
    // 23:05 block minus 10 is 22:55, which is before quiet starts.
    expect(plan.map((n) => n.time)).toEqual(["16:50", "22:55"]);
    const plan2 = planDay([DELIVERY], day({ blocks: [{ ...lateBlock, start: "23:30" }] }), OPTS);
    expect(plan2).toEqual([]);
  });

  it("skips the workout reminder on a rest day", () => {
    expect(planDay([WORKOUT], day({ restDay: true }), OPTS)).toEqual([]);
    expect(planDay([WORKOUT], day(), OPTS)).toHaveLength(1);
  });

  it("drops a block offset that would cross midnight", () => {
    const b: ReminderBlock = { id: "b1", block_name: "Delivery", start: "00:05" };
    expect(planDay([DELIVERY], day({ blocks: [b] }), { ...OPTS, quiet_start: "00:00", quiet_end: "00:00" })).toEqual([]);
  });

  it("lists the nudge for the screen but not for sending once the floor is met", () => {
    expect(planDay([NUDGE], day({ earned: 100 }), OPTS)).toHaveLength(1);
    expect(planDay([NUDGE], day({ earned: 100 }), OPTS, true)).toEqual([]);
    expect(planDay([NUDGE], day({ earned: 150 }), OPTS, true)).toEqual([]);
    const under = planDay([NUDGE], day({ earned: 62.5 }), OPTS, true);
    expect(under).toHaveLength(1);
    expect(under[0].body).toBe("$62.50 of $100 today. $37.50 to go. Get back out.");
  });

  it("never lets a dash through", () => {
    const r = { ...WAKE, label: "Wake \u2014 now", body: "Up \u2013 go" };
    const n = planDay([r], day(), OPTS)[0];
    expect(n.title + n.body).not.toMatch(/[\u2012-\u2015]/);
  });

  it("sends each kind to the right screen", () => {
    expect(urlFor("wake")).toBe("/today");
    expect(urlFor("checkin")).toBe("/today");
    expect(urlFor("workout")).toBe("/body/workout");
    expect(urlFor("delivery")).toBe("/money");
    expect(urlFor("earnings_nudge")).toBe("/money");
  });
});

describe("dueNotifications", () => {
  it("returns exactly what came due since the last run", () => {
    expect(due({ lastRun: at("05:40"), now: at("05:45") })).toEqual([`${D}:r-wake`]);
    expect(due({ lastRun: at("05:45"), now: at("05:50") })).toEqual([]);
    expect(due({ lastRun: at("05:50"), now: at("06:14") })).toEqual([]);
    expect(due({ lastRun: at("06:14"), now: at("06:19") })).toEqual([`${D}:r-workout`]);
  });

  it("includes a reminder due exactly now and excludes one due exactly at the last run", () => {
    expect(due({ lastRun: at("22:25"), now: at("22:30") })).toEqual([`${D}:r-check`]);
    expect(due({ lastRun: at("22:30"), now: at("22:35") })).toEqual([]);
  });

  it("does not send twice when a key is already recorded, even if runs overlap", () => {
    expect(due({ lastRun: at("05:40"), now: at("05:46"), sent: [`${D}:r-wake`] })).toEqual([]);
    expect(due({ lastRun: null, now: at("05:46"), sent: new Set([`${D}:r-wake`]) })).toEqual([]);
  });

  it("walks a whole day of five minute runs and sends each reminder once", () => {
    const sent = new Set<string>();
    const order: string[] = [];
    let last: Date | null = null;
    for (let t = at("00:00").getTime(); t <= at("23:55").getTime(); t += 5 * 60_000) {
      const now = new Date(t);
      for (const n of dueNotifications({ reminders: ALL, days: [day()], sent, lastRun: last, now, ...OPTS })) {
        expect(sent.has(n.key)).toBe(false);
        sent.add(n.key);
        order.push(n.kind);
      }
      last = now;
    }
    expect(order).toEqual(["wake", "workout", "delivery", "delivery", "earnings_nudge", "checkin"]);
  });

  it("on a first run sends only what is inside the grace period", () => {
    expect(due({ lastRun: null, now: at("06:00") })).toEqual([`${D}:r-wake`]);
    expect(due({ lastRun: null, now: at("06:10") })).toEqual([]);
  });

  it("drops stale reminders after a long gap instead of sending them late", () => {
    // The job was down from 05:00 to 12:00. Wake, workout and lunch delivery are long gone.
    expect(due({ lastRun: at("05:00"), now: at("12:00") })).toEqual([]);
    expect(due({ lastRun: at("05:00"), now: at("11:35") })).toEqual([`${D}:r-del:t.t1`]);
  });

  it("skips a disabled reminder", () => {
    const reminders = ALL.map((r) => (r.id === "r-wake" ? { ...r, enabled: false } : r));
    expect(due({ reminders, lastRun: at("05:40"), now: at("05:50") })).toEqual([]);
  });

  it("stays quiet after bedtime until wake", () => {
    const reminders = [{ ...CHECKIN, time: "23:30" }, { ...WAKE, time: "05:15" }, WORKOUT];
    expect(due({ reminders, lastRun: at("23:25"), now: at("23:35") })).toEqual([]);
    expect(due({ reminders, lastRun: at("05:10"), now: at("05:20") })).toEqual([]);
    expect(due({ reminders, lastRun: at("06:10"), now: at("06:20") })).toEqual([`${D}:r-workout`]);
  });

  it("follows a delivery block that was moved", () => {
    // Dinner moved from 17:00 to 18:30 for today. The row is now a schedule_block with the template id kept.
    const moved: ReminderBlock = { id: "blk-77", template_id: "t2", block_name: "Delivery: dinner", start: "18:30" };
    const days = [day({ blocks: [LUNCH, STUDY, moved] })];
    expect(due({ days, lastRun: at("16:45"), now: at("16:50") })).toEqual([]);
    expect(due({ days, lastRun: at("18:15"), now: at("18:20") })).toEqual([`${D}:r-del:t.t2`]);
  });

  it("does not remind again for a block that is moved after its reminder went out", () => {
    const sent = [`${D}:r-del:t.t2`];
    const moved: ReminderBlock = { id: "blk-77", template_id: "t2", block_name: "Delivery: dinner", start: "18:30" };
    expect(due({ days: [day({ blocks: [moved] })], sent, lastRun: at("18:15"), now: at("18:20") })).toEqual([]);
  });

  it("reminds for a delivery block added by hand", () => {
    const extra: ReminderBlock = { id: "blk-90", template_id: null, block_name: "Delivery", start: "21:00" };
    expect(due({ days: [day({ blocks: [extra] })], lastRun: at("20:45"), now: at("20:50") })).toEqual([`${D}:r-del:b.blk-90`]);
  });

  it("uses the offset from the reminder row", () => {
    const reminders = [{ ...DELIVERY, offset_minutes: -30 }];
    expect(due({ reminders, lastRun: at("10:55"), now: at("11:00") })).toEqual([`${D}:r-del:t.t1`]);
  });

  it("nudges at 8:00 pm when under the floor", () => {
    const days = [day({ earned: 99.99 })];
    const out = dueNotifications({ reminders: ALL, days, sent: [], lastRun: at("19:55"), now: at("20:00"), ...OPTS });
    expect(out.map((n) => n.kind)).toEqual(["earnings_nudge"]);
    expect(out[0].url).toBe("/money");
  });

  it("does not nudge at or over the floor", () => {
    expect(due({ days: [day({ earned: 100 })], lastRun: at("19:55"), now: at("20:00") })).toEqual([]);
    expect(due({ days: [day({ earned: 240 })], lastRun: at("19:55"), now: at("20:00") })).toEqual([]);
  });

  it("uses the floor it is given", () => {
    expect(due({ days: [day({ earned: 120 })], floor: 150, lastRun: at("19:55"), now: at("20:00") })).toEqual([`${D}:r-nudge`]);
  });

  it("looks at both days when the window crosses midnight", () => {
    const opts = { quiet_start: "02:00", quiet_end: "05:00", floor: 100 };
    const reminders = [rem({ id: "a", kind: "custom", label: "Late", time: "23:58" }), rem({ id: "b", kind: "custom", label: "Early", time: "00:02" })];
    const next = "2026-10-07";
    const lastRun = at("23:55");
    const now = at("00:05", next);
    expect(windowDates(lastRun, now)).toEqual([D, next]);
    const out = dueNotifications({ reminders, days: [day({ blocks: [] }), day({ date: next, blocks: [] })], sent: [], lastRun, now, ...opts });
    expect(out.map((n) => n.key)).toEqual([`${D}:a`, `${next}:b`]);
  });
});

describe("the clock change on Nov 1, 2026", () => {
  const SAT = "2026-10-31";
  const SUN = "2026-11-01";
  const MON = "2026-11-02";

  it("fires wake at 5:45 New York time on each side of the change", () => {
    const plan = (d: string) => planDay([WAKE], day({ date: d, blocks: [] }), OPTS)[0];
    expect(new Date(plan(SAT).at).toISOString()).toBe("2026-10-31T09:45:00.000Z");
    expect(new Date(plan(SUN).at).toISOString()).toBe("2026-11-01T10:45:00.000Z");
    expect(new Date(plan(MON).at).toISOString()).toBe("2026-11-02T10:45:00.000Z");
  });

  it("sends every reminder once across the 25 hour day", () => {
    const sent = new Set<string>();
    const fired: string[] = [];
    let last: Date | null = null;
    const start = nyInstant(SAT, "23:00").getTime();
    const end = nyInstant(MON, "00:30").getTime();
    // 25 hours and 30 minutes of wall clock, 26.5 hours of real time.
    expect((end - start) / 3_600_000).toBe(26.5);
    for (let t = start; t <= end; t += 5 * 60_000) {
      const now = new Date(t);
      const days = windowDates(last, now).map((d) => day({ date: d }));
      for (const n of dueNotifications({ reminders: ALL, days, sent, lastRun: last, now, ...OPTS })) {
        sent.add(n.key);
        fired.push(`${n.date} ${n.time} ${n.kind} ${new Date(n.at).toISOString().slice(11, 16)}Z`);
      }
      last = now;
    }
    expect(fired).toEqual([
      `${SUN} 05:45 wake 10:45Z`,
      `${SUN} 06:15 workout 11:15Z`,
      `${SUN} 11:20 delivery 16:20Z`,
      `${SUN} 16:50 delivery 21:50Z`,
      `${SUN} 20:00 earnings_nudge 01:00Z`,
      `${SUN} 22:30 checkin 03:30Z`,
    ]);
  });

  it("does not fire during the repeated 1:00 hour when it is quiet", () => {
    const r = rem({ id: "x", kind: "custom", label: "X", time: "01:30" });
    let count = 0;
    let last: Date | null = null;
    for (let t = nyInstant(SUN, "00:00").getTime(); t <= nyInstant(SUN, "04:00").getTime(); t += 5 * 60_000) {
      const now = new Date(t);
      count += dueNotifications({ reminders: [r], days: [day({ date: SUN, blocks: [] })], sent: [], lastRun: last, now, ...OPTS }).length;
      last = now;
    }
    expect(count).toBe(0);
  });

  it("fires once, not twice, for a time inside the repeated hour when quiet hours are off", () => {
    const r = rem({ id: "x", kind: "custom", label: "X", time: "01:30" });
    const sent = new Set<string>();
    let last: Date | null = null;
    for (let t = nyInstant(SUN, "00:00").getTime(); t <= nyInstant(SUN, "04:00").getTime(); t += 5 * 60_000) {
      const now = new Date(t);
      for (const n of dueNotifications({ reminders: [r], days: [day({ date: SUN, blocks: [] })], sent, lastRun: last, now, floor: 100, quiet_start: "00:00", quiet_end: "00:00" })) sent.add(n.key);
      last = now;
    }
    expect(sent.size).toBe(1);
  });

  it("also holds on the spring change, when 2:30 does not exist", () => {
    const r = rem({ id: "x", kind: "custom", label: "X", time: "02:30" });
    const n = planDay([r], day({ date: "2027-03-14", blocks: [] }), { floor: 100, quiet_start: "00:00", quiet_end: "00:00" });
    expect(n).toHaveLength(1);
    expect(Number.isFinite(n[0].at)).toBe(true);
  });
});

describe("window helpers", () => {
  it("never reaches further back than the grace period", () => {
    const now = at("12:00");
    expect(windowStart(null, now)).toBe(now.getTime() - 20 * 60_000);
    expect(windowStart(at("11:55"), now)).toBe(at("11:55").getTime());
    expect(windowStart(at("08:00"), now)).toBe(now.getTime() - 20 * 60_000);
    // A last run in the future (clock skew) does not open a negative window.
    expect(windowStart(at("12:05"), now)).toBe(now.getTime());
  });

  it("lists what is still to come", () => {
    const plan = planDay(ALL, day(), OPTS);
    expect(upcoming(plan, at("12:00")).map((n) => n.kind)).toEqual(["delivery", "earnings_nudge", "checkin"]);
    expect(upcoming(plan, at("22:30"))).toEqual([]);
  });
});
