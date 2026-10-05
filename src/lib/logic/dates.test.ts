import { describe, expect, it } from "vitest";
import {
  addDays,
  addMinutes,
  challengeDates,
  challengeEndDate,
  dateOfDay,
  dateRange,
  dayNumber,
  diffDays,
  durationMinutes,
  formatDateLong,
  formatDateShort,
  formatDuration,
  formatTime,
  isDateStr,
  isDayEditable,
  isDayLocked,
  isInChallenge,
  isTimeStr,
  lockInstant,
  minutesOf,
  nyInstant,
  nyParts,
  timeFromMinutes,
  timeNY,
  todayNY,
  weekDates,
  weekEnd,
  weekStart,
  weekdayOf,
} from "./dates";

describe("New York calendar dates", () => {
  it("uses the New York date, not the UTC date, late in the evening", () => {
    // 11:30 PM Oct 5 in New York is 03:30 UTC on Oct 6.
    const at = new Date("2026-10-06T03:30:00Z");
    expect(todayNY(at)).toBe("2026-10-05");
    expect(timeNY(at)).toBe("23:30");
  });

  it("rolls over at New York midnight", () => {
    expect(todayNY(new Date("2026-10-06T03:59:59Z"))).toBe("2026-10-05");
    expect(todayNY(new Date("2026-10-06T04:00:00Z"))).toBe("2026-10-06");
    expect(timeNY(new Date("2026-10-06T04:00:00Z"))).toBe("00:00");
  });

  it("follows the clock change on Nov 1, 2026", () => {
    // After the change New York is UTC-5.
    expect(todayNY(new Date("2026-11-02T04:30:00Z"))).toBe("2026-11-01");
    expect(todayNY(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });

  it("gives parts with weekday and minutes", () => {
    const p = nyParts(new Date("2026-10-05T10:15:00Z"));
    expect(p).toEqual({ date: "2026-10-05", time: "06:15", hour: 6, minute: 15, minutes: 375, weekday: 1 });
    expect(nyParts("2026-10-05T10:15:00Z").time).toBe("06:15");
  });
});

describe("day arithmetic", () => {
  it("adds days across months, years and the clock change", () => {
    expect(addDays("2026-10-05", 1)).toBe("2026-10-06");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-10-05", 0)).toBe("2026-10-05");
  });

  it("diffs days", () => {
    expect(diffDays("2026-10-05", "2026-10-05")).toBe(0);
    expect(diffDays("2026-10-05", "2026-11-03")).toBe(29);
    expect(diffDays("2026-10-05", "2026-10-01")).toBe(-4);
  });

  it("knows weekdays", () => {
    expect(weekdayOf("2026-10-05")).toBe(1);
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(weekdayOf("2026-10-10")).toBe(6);
    expect(weekdayOf("1970-01-01")).toBe(4);
    expect(weekdayOf("1969-12-31")).toBe(3);
  });

  it("lists ranges", () => {
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(dateRange("2026-10-05", "2026-10-04")).toEqual([]);
  });

  it("validates date strings", () => {
    expect(isDateStr("2026-10-05")).toBe(true);
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(isDateStr("2026-1-5")).toBe(false);
    expect(isDateStr(null)).toBe(false);
  });
});

describe("challenge days", () => {
  const start = "2026-10-05";

  it("day number comes from the start date", () => {
    expect(dayNumber(start, "2026-10-05")).toBe(1);
    expect(dayNumber(start, "2026-10-06")).toBe(2);
    expect(dayNumber(start, "2026-11-03")).toBe(30);
    expect(dayNumber(start, "2026-10-04")).toBe(0);
    expect(dayNumber(start, "2026-11-04")).toBe(31);
  });

  it("day 30 is Nov 3", () => {
    expect(challengeEndDate(start, 30)).toBe("2026-11-03");
    expect(dateOfDay(start, 30)).toBe("2026-11-03");
    expect(dateOfDay(start, 1)).toBe(start);
    expect(challengeDates(start, 30)).toHaveLength(30);
  });

  it("knows what is inside the challenge", () => {
    expect(isInChallenge(start, 30, "2026-10-04")).toBe(false);
    expect(isInChallenge(start, 30, "2026-10-05")).toBe(true);
    expect(isInChallenge(start, 30, "2026-11-03")).toBe(true);
    expect(isInChallenge(start, 30, "2026-11-04")).toBe(false);
  });
});

describe("weeks run Monday to Sunday", () => {
  it("finds the start and end", () => {
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-08")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekEnd("2026-10-05")).toBe("2026-10-11");
    expect(weekdayOf(weekEnd("2026-10-07"))).toBe(0);
    expect(weekDates("2026-10-07")).toHaveLength(7);
  });
});

describe("clock times", () => {
  it("converts and formats", () => {
    expect(minutesOf("06:30")).toBe(390);
    expect(timeFromMinutes(390)).toBe("06:30");
    expect(timeFromMinutes(1440 + 5)).toBe("00:05");
    expect(addMinutes("23:30", 45)).toBe("00:15");
    expect(addMinutes("06:30", -15)).toBe("06:15");
    expect(durationMinutes("06:30", "07:30")).toBe(60);
    expect(durationMinutes("23:00", "05:45")).toBe(405);
    expect(formatTime("05:45")).toBe("5:45 AM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("23:00")).toBe("11:00 PM");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(95)).toBe("1h 35m");
    expect(isTimeStr("06:30")).toBe(true);
    expect(isTimeStr("6:30")).toBe(false);
    expect(isTimeStr("24:00")).toBe(false);
  });

  it("formats dates", () => {
    expect(formatDateLong("2026-10-05")).toBe("Monday, Oct 5");
    expect(formatDateShort("2026-11-03")).toBe("Nov 3");
  });
});

describe("New York instants", () => {
  it("handles daylight time and standard time", () => {
    expect(nyInstant("2026-10-06", "12:00").toJSON()).toBe("2026-10-06T16:00:00.000Z");
    expect(nyInstant("2026-11-02", "12:00").toJSON()).toBe("2026-11-02T17:00:00.000Z");
    expect(nyInstant("2026-11-01", "12:00").toJSON()).toBe("2026-11-01T17:00:00.000Z");
    expect(nyInstant("2026-10-05", "00:00").toJSON()).toBe("2026-10-05T04:00:00.000Z");
  });

  it("round trips through nyParts", () => {
    for (const [d, t] of [
      ["2026-10-05", "05:45"],
      ["2026-11-01", "06:00"],
      ["2026-11-01", "23:59"],
      ["2027-03-14", "12:00"],
    ] as const) {
      const p = nyParts(nyInstant(d, t));
      expect([p.date, p.time]).toEqual([d, t]);
    }
  });
});

describe("edit lock", () => {
  it("locks at noon New York time the next day", () => {
    expect(lockInstant("2026-10-05").toJSON()).toBe("2026-10-06T16:00:00.000Z");
    expect(isDayLocked("2026-10-05", new Date("2026-10-06T15:59:59Z"))).toBe(false);
    expect(isDayLocked("2026-10-05", new Date("2026-10-06T16:00:00Z"))).toBe(true);
  });

  it("stays open all of its own day and the next morning", () => {
    expect(isDayEditable("2026-10-05", new Date("2026-10-05T10:00:00Z"))).toBe(true);
    expect(isDayEditable("2026-10-05", new Date("2026-10-06T03:30:00Z"))).toBe(true);
    expect(isDayEditable("2026-10-05", new Date("2026-10-06T13:00:00Z"))).toBe(true);
    expect(isDayEditable("2026-10-05", new Date("2026-10-06T17:00:00Z"))).toBe(false);
  });

  it("uses the right offset the day after the clock change", () => {
    // Nov 1 locks at noon EST on Nov 2, which is 17:00 UTC.
    expect(isDayLocked("2026-11-01", new Date("2026-11-02T16:30:00Z"))).toBe(false);
    expect(isDayLocked("2026-11-01", new Date("2026-11-02T17:00:00Z"))).toBe(true);
  });

  it("never lets a future day be edited", () => {
    expect(isDayEditable("2026-10-06", new Date("2026-10-05T15:00:00Z"))).toBe(false);
  });

  it("keeps days before the install open for backfill until the install day locks", () => {
    // App first opened on day 3 (Oct 7). Days 1 and 2 were logged on paper.
    const installed = "2026-10-07";
    const eveningOfInstall = new Date("2026-10-08T01:00:00Z");
    expect(isDayLocked("2026-10-05", eveningOfInstall)).toBe(true);
    expect(isDayLocked("2026-10-05", eveningOfInstall, installed)).toBe(false);
    expect(isDayEditable("2026-10-06", eveningOfInstall, installed)).toBe(true);
    const afterNoonNextDay = new Date("2026-10-08T16:00:00Z");
    expect(isDayEditable("2026-10-05", afterNoonNextDay, installed)).toBe(false);
    expect(isDayEditable("2026-10-07", afterNoonNextDay, installed)).toBe(false);
  });

  it("does not reopen days after the install", () => {
    const installed = "2026-10-05";
    expect(isDayLocked("2026-10-06", new Date("2026-10-07T16:00:00Z"), installed)).toBe(true);
  });
});
