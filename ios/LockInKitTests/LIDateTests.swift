import XCTest
@testable import LockInKit

final class LIDateTests: XCTestCase {
    func testUsesNewYorkDateLateInTheEvening() {
        // 11:30 PM Oct 5 in New York is 03:30 UTC on Oct 6.
        let at = iso("2026-10-06T03:30:00Z")
        XCTAssertEqual(LIDate.todayNY(at), "2026-10-05")
        XCTAssertEqual(LIDate.timeNY(at), "23:30")
    }

    func testRollsOverAtNewYorkMidnight() {
        XCTAssertEqual(LIDate.todayNY(iso("2026-10-06T03:59:59Z")), "2026-10-05")
        XCTAssertEqual(LIDate.todayNY(iso("2026-10-06T04:00:00Z")), "2026-10-06")
        XCTAssertEqual(LIDate.timeNY(iso("2026-10-06T04:00:00Z")), "00:00")
    }

    func testFollowsTheClockChange() {
        XCTAssertEqual(LIDate.todayNY(iso("2026-11-02T04:30:00Z")), "2026-11-01")
        XCTAssertEqual(LIDate.todayNY(iso("2026-11-02T05:00:00Z")), "2026-11-02")
    }

    func testParts() {
        let p = LIDate.nyParts(iso("2026-10-05T10:15:00Z"))
        XCTAssertEqual(p, NYParts(date: "2026-10-05", time: "06:15", hour: 6, minute: 15, minutes: 375, weekday: 1))
        XCTAssertEqual(LIDate.nyParts(iso: "2026-10-05T10:15:00Z").time, "06:15")
        XCTAssertEqual(LIDate.nyParts(iso: "2026-10-05T10:15:00.123456+00:00").time, "06:15")
    }

    func testAddDays() {
        XCTAssertEqual(LIDate.addDays("2026-10-05", 1), "2026-10-06")
        XCTAssertEqual(LIDate.addDays("2026-10-31", 1), "2026-11-01")
        XCTAssertEqual(LIDate.addDays("2026-11-01", 1), "2026-11-02")
        XCTAssertEqual(LIDate.addDays("2026-12-31", 1), "2027-01-01")
        XCTAssertEqual(LIDate.addDays("2026-03-01", -1), "2026-02-28")
        XCTAssertEqual(LIDate.addDays("2028-03-01", -1), "2028-02-29")
        XCTAssertEqual(LIDate.addDays("2026-10-05", 0), "2026-10-05")
    }

    func testDiffDays() {
        XCTAssertEqual(LIDate.diffDays("2026-10-05", "2026-10-05"), 0)
        XCTAssertEqual(LIDate.diffDays("2026-10-05", "2026-11-03"), 29)
        XCTAssertEqual(LIDate.diffDays("2026-10-05", "2026-10-01"), -4)
    }

    func testWeekdays() {
        XCTAssertEqual(LIDate.weekdayOf("2026-10-05"), 1)
        XCTAssertEqual(LIDate.weekdayOf("2026-10-04"), 0)
        XCTAssertEqual(LIDate.weekdayOf("2026-10-10"), 6)
        XCTAssertEqual(LIDate.weekdayOf("1970-01-01"), 4)
        XCTAssertEqual(LIDate.weekdayOf("1969-12-31"), 3)
    }

    func testRanges() {
        XCTAssertEqual(LIDate.dateRange("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])
        XCTAssertEqual(LIDate.dateRange("2026-10-05", "2026-10-04"), [])
    }

    func testValidatesDateStrings() {
        XCTAssertTrue(LIDate.isDateStr("2026-10-05"))
        XCTAssertFalse(LIDate.isDateStr("2026-02-30"))
        XCTAssertFalse(LIDate.isDateStr("2026-1-5"))
        XCTAssertFalse(LIDate.isDateStr(""))
    }

    func testDayNumbersComeFromTheStart() {
        let start = "2026-10-05"
        XCTAssertEqual(LIDate.dayNumber(start, "2026-10-05"), 1)
        XCTAssertEqual(LIDate.dayNumber(start, "2026-10-06"), 2)
        XCTAssertEqual(LIDate.dayNumber(start, "2026-11-03"), 30)
        XCTAssertEqual(LIDate.dayNumber(start, "2026-10-04"), 0)
        XCTAssertEqual(LIDate.dayNumber(start, "2026-11-04"), 31)
        XCTAssertEqual(LIDate.challengeEndDate(start, 30), "2026-11-03")
        XCTAssertEqual(LIDate.dateOfDay(start, 30), "2026-11-03")
        XCTAssertEqual(LIDate.dateOfDay(start, 1), start)
        XCTAssertEqual(LIDate.challengeDates(start, 30).count, 30)
        XCTAssertFalse(LIDate.isInChallenge(start, 30, "2026-10-04"))
        XCTAssertTrue(LIDate.isInChallenge(start, 30, "2026-10-05"))
        XCTAssertTrue(LIDate.isInChallenge(start, 30, "2026-11-03"))
        XCTAssertFalse(LIDate.isInChallenge(start, 30, "2026-11-04"))
    }

    func testWeeksRunMondayToSunday() {
        XCTAssertEqual(LIDate.weekStart("2026-10-05"), "2026-10-05")
        XCTAssertEqual(LIDate.weekStart("2026-10-08"), "2026-10-05")
        XCTAssertEqual(LIDate.weekStart("2026-10-11"), "2026-10-05")
        XCTAssertEqual(LIDate.weekStart("2026-10-12"), "2026-10-12")
        XCTAssertEqual(LIDate.weekEnd("2026-10-05"), "2026-10-11")
        XCTAssertEqual(LIDate.weekdayOf(LIDate.weekEnd("2026-10-07")), 0)
        XCTAssertEqual(LIDate.weekDates("2026-10-07").count, 7)
    }

    func testMonths() {
        XCTAssertEqual(LIDate.monthStart("2026-10-17"), "2026-10-01")
        XCTAssertEqual(LIDate.monthEnd("2026-10-17"), "2026-10-31")
        XCTAssertEqual(LIDate.monthEnd("2028-02-10"), "2028-02-29")
        XCTAssertEqual(LIDate.addMonths("2026-11-17", 2), "2027-01-01")
        XCTAssertEqual(LIDate.addMonths("2026-01-17", -1), "2025-12-01")
    }

    func testClockTimes() {
        XCTAssertEqual(LIDate.minutesOf("06:30"), 390)
        XCTAssertEqual(LIDate.timeFromMinutes(390), "06:30")
        XCTAssertEqual(LIDate.timeFromMinutes(1445), "00:05")
        XCTAssertEqual(LIDate.addMinutes("23:30", 45), "00:15")
        XCTAssertEqual(LIDate.addMinutes("06:30", -15), "06:15")
        XCTAssertEqual(LIDate.durationMinutes("06:30", "07:30"), 60)
        XCTAssertEqual(LIDate.durationMinutes("23:00", "05:45"), 405)
        XCTAssertEqual(LIDate.formatTime("05:45"), "5:45 AM")
        XCTAssertEqual(LIDate.formatTime("00:05"), "12:05 AM")
        XCTAssertEqual(LIDate.formatTime("12:00"), "12:00 PM")
        XCTAssertEqual(LIDate.formatTime("23:00"), "11:00 PM")
        XCTAssertEqual(LIDate.formatDuration(45), "45m")
        XCTAssertEqual(LIDate.formatDuration(120), "2h")
        XCTAssertEqual(LIDate.formatDuration(95), "1h 35m")
        XCTAssertTrue(LIDate.isTimeStr("06:30"))
        XCTAssertFalse(LIDate.isTimeStr("6:30"))
        XCTAssertFalse(LIDate.isTimeStr("24:00"))
    }

    func testFormatsDates() {
        XCTAssertEqual(LIDate.formatDateLong("2026-10-05"), "Monday, Oct 5")
        XCTAssertEqual(LIDate.formatDateShort("2026-11-03"), "Nov 3")
        XCTAssertEqual(LIDate.formatDateFull("2026-10-08"), "Thursday, October 8")
        XCTAssertEqual(LIDate.formatMonth("2026-10-08"), "October 2026")
    }

    func testNewYorkInstants() {
        XCTAssertEqual(LIDate.nyInstant("2026-10-06", "12:00"), iso("2026-10-06T16:00:00Z"))
        XCTAssertEqual(LIDate.nyInstant("2026-11-02", "12:00"), iso("2026-11-02T17:00:00Z"))
        XCTAssertEqual(LIDate.nyInstant("2026-11-01", "12:00"), iso("2026-11-01T17:00:00Z"))
        XCTAssertEqual(LIDate.nyInstant("2026-10-05", "00:00"), iso("2026-10-05T04:00:00Z"))
    }

    func testInstantsRoundTripThroughParts() {
        let cases: [(String, String)] = [("2026-10-05", "05:45"), ("2026-11-01", "06:00"), ("2026-11-01", "23:59"), ("2027-03-14", "12:00")]
        for (d, t) in cases {
            let p = LIDate.nyParts(LIDate.nyInstant(d, t))
            XCTAssertEqual(p.date, d)
            XCTAssertEqual(p.time, t)
        }
    }

    func testQuietHours() {
        XCTAssertTrue(LIDate.isQuiet("23:00", quietStart: "22:00", quietEnd: "07:00"))
        XCTAssertTrue(LIDate.isQuiet("06:59", quietStart: "22:00", quietEnd: "07:00"))
        XCTAssertFalse(LIDate.isQuiet("07:00", quietStart: "22:00", quietEnd: "07:00"))
        XCTAssertFalse(LIDate.isQuiet("12:00", quietStart: "22:00", quietEnd: "07:00"))
    }

    // MARK: edit lock

    func testLocksAtNoonNewYorkTimeTheNextDay() {
        XCTAssertEqual(LIDate.lockInstant("2026-10-05"), iso("2026-10-06T16:00:00Z"))
        XCTAssertFalse(LIDate.isDayLocked("2026-10-05", now: iso("2026-10-06T15:59:59Z")))
        XCTAssertTrue(LIDate.isDayLocked("2026-10-05", now: iso("2026-10-06T16:00:00Z")))
    }

    func testStaysOpenAllOfItsOwnDayAndTheNextMorning() {
        XCTAssertTrue(LIDate.isDayEditable("2026-10-05", now: iso("2026-10-05T10:00:00Z")))
        XCTAssertTrue(LIDate.isDayEditable("2026-10-05", now: iso("2026-10-06T03:30:00Z")))
        XCTAssertTrue(LIDate.isDayEditable("2026-10-05", now: iso("2026-10-06T13:00:00Z")))
        XCTAssertFalse(LIDate.isDayEditable("2026-10-05", now: iso("2026-10-06T17:00:00Z")))
    }

    func testUsesTheRightOffsetTheDayAfterTheClockChange() {
        XCTAssertFalse(LIDate.isDayLocked("2026-11-01", now: iso("2026-11-02T16:30:00Z")))
        XCTAssertTrue(LIDate.isDayLocked("2026-11-01", now: iso("2026-11-02T17:00:00Z")))
    }

    func testNeverLetsAFutureDayBeEdited() {
        XCTAssertFalse(LIDate.isDayEditable("2026-10-06", now: iso("2026-10-05T15:00:00Z")))
    }

    func testBackfillKeepsDaysBeforeInstallOpen() {
        let installed = "2026-10-07"
        let evening = iso("2026-10-08T01:00:00Z")
        XCTAssertTrue(LIDate.isDayLocked("2026-10-05", now: evening))
        XCTAssertFalse(LIDate.isDayLocked("2026-10-05", now: evening, installedOn: installed))
        XCTAssertTrue(LIDate.isDayEditable("2026-10-06", now: evening, installedOn: installed))
        let afterNoon = iso("2026-10-08T16:00:00Z")
        XCTAssertFalse(LIDate.isDayEditable("2026-10-05", now: afterNoon, installedOn: installed))
        XCTAssertFalse(LIDate.isDayEditable("2026-10-07", now: afterNoon, installedOn: installed))
    }

    func testInstallDoesNotReopenLaterDays() {
        XCTAssertTrue(LIDate.isDayLocked("2026-10-06", now: iso("2026-10-07T16:00:00Z"), installedOn: "2026-10-05"))
    }
}
