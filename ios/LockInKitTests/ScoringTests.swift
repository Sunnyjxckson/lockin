import XCTest
@testable import LockInKit

final class ScoringTests: XCTestCase {
    let D = "2026-10-05" // a Monday

    func testRangeIsInclusive() {
        let t = Target.range(1900, 2100)
        XCTAssertFalse(Scoring.meetsNumber(t, 1899))
        XCTAssertTrue(Scoring.meetsNumber(t, 1900))
        XCTAssertTrue(Scoring.meetsNumber(t, 2000))
        XCTAssertTrue(Scoring.meetsNumber(t, 2100))
        XCTAssertFalse(Scoring.meetsNumber(t, 2101))
    }

    func testMinimumAndMaximum() {
        let m = Target.min(180)
        XCTAssertFalse(Scoring.meetsNumber(m, 179.9))
        XCTAssertTrue(Scoring.meetsNumber(m, 180))
        XCTAssertTrue(Scoring.meetsNumber(m, 240))
        let c = Target.max(30)
        XCTAssertTrue(Scoring.meetsNumber(c, 0))
        XCTAssertTrue(Scoring.meetsNumber(c, 30))
        XCTAssertFalse(Scoring.meetsNumber(c, 31))
    }

    func testNothingEnteredIsNeverDone() {
        XCTAssertFalse(Scoring.meetsNumber(.min(0), nil))
        XCTAssertFalse(Scoring.meetsNumber(.min(0), Double.nan))
        XCTAssertFalse(Scoring.meetsNumber(.check, 5))
    }

    func testItemStateForNumbers() {
        let item = makeItem(type: .number)
        let t = Target.range(1900, 2100)
        XCTAssertEqual(Scoring.itemState(item, t, nil), .open)
        XCTAssertEqual(Scoring.itemState(item, t, makeLog(item.id, D)), .open)
        XCTAssertEqual(Scoring.itemState(item, t, makeLog(item.id, D, value: 1500, checked: true)), .off)
        XCTAssertEqual(Scoring.itemState(item, t, makeLog(item.id, D, value: 2050, checked: true)), .done)
        XCTAssertEqual(Scoring.itemState(item, .max(30), makeLog(item.id, D, value: 0, checked: true)), .done)
    }

    func testPlainCheck() {
        let item = makeItem()
        XCTAssertFalse(Scoring.isItemDone(item, .check, nil))
        XCTAssertFalse(Scoring.isItemDone(item, .check, makeLog(item.id, D)))
        XCTAssertTrue(Scoring.isItemDone(item, .check, tick(item.id, D)))
    }

    func testTimeGate() {
        let item = makeItem()
        let t = Target.checkBy("06:00")
        // Oct 5 is daylight time, UTC-4.
        XCTAssertEqual(Scoring.itemState(item, t, tick(item.id, D, "2026-10-05T09:50:00Z")), .done)
        XCTAssertEqual(Scoring.itemState(item, t, tick(item.id, D, "2026-10-05T10:00:59Z")), .done)
        XCTAssertEqual(Scoring.itemState(item, t, tick(item.id, D, "2026-10-05T10:01:00Z")), .off)
        XCTAssertEqual(Scoring.itemState(item, t, tick(item.id, D, "2026-10-06T02:00:00Z")), .off)
        XCTAssertEqual(Scoring.itemState(item, t, tick(item.id, D, "2026-10-07T18:00:00Z")), .done)
        XCTAssertEqual(Scoring.itemState(item, t, tick(item.id, D, nil)), .done)
        XCTAssertEqual(Scoring.itemState(item, t, makeLog(item.id, D)), .open)
        // Nov 2 is standard time, UTC-5. 5:55 AM is 10:55 UTC.
        XCTAssertTrue(Scoring.checkedInTime(tick(item.id, "2026-11-02", "2026-11-02T10:55:00Z"), by: "06:00"))
        XCTAssertFalse(Scoring.checkedInTime(tick(item.id, "2026-11-02", "2026-11-02T11:05:00Z"), by: "06:00"))
    }

    func testTextPlusYesNo() {
        let item = makeItem(type: .text)
        let t = Target.text
        XCTAssertEqual(Scoring.itemState(item, t, nil), .open)
        XCTAssertEqual(Scoring.itemState(item, t, makeLog(item.id, D, text: "Emailed the dean")), .off)
        XCTAssertEqual(Scoring.itemState(item, t, makeLog(item.id, D, checked: true)), .off)
        XCTAssertEqual(Scoring.itemState(item, t, makeLog(item.id, D, checked: true, text: "   ")), .off)
        XCTAssertEqual(Scoring.itemState(item, t, makeLog(item.id, D, checked: true, text: "Emailed the dean")), .done)
    }

    func testASlipSettlesTheDay() {
        let item = makeItem()
        XCTAssertEqual(Scoring.itemState(item, .check, makeLog(item.id, D, checked: true, slips: 1)), .off)
    }

    // MARK: day status

    func testDayStatus() {
        let a = makeItem(id: "a")
        let b = makeItem(id: "b", type: .number, target: .min(180))
        let weekly = makeItem(id: "w", cadence: .weekly)
        let items = [a, b, weekly]

        let missed = Scoring.summarizeDay(D, items, [], [])
        XCTAssertEqual(missed.status, .missed)
        XCTAssertEqual(missed.done, 0)
        XCTAssertEqual(missed.total, 2)
        XCTAssertEqual(missed.percent, 0)

        let partial = Scoring.summarizeDay(D, items, [], [tick("a", D)])
        XCTAssertEqual(partial.status, .partial)
        XCTAssertEqual(partial.done, 1)
        XCTAssertEqual(partial.percent, 50)

        let full = Scoring.summarizeDay(D, items, [], [tick("a", D), makeLog("b", D, value: 190, checked: true)])
        XCTAssertEqual(full.status, .full)
        XCTAssertEqual(full.percent, 100)

        let short = Scoring.summarizeDay(D, items, [], [tick("a", D), makeLog("b", D, value: 120, checked: true)])
        XCTAssertEqual(short.status, .partial)
        XCTAssertEqual(short.items.first(where: { $0.item.id == "b" })?.state, .off)

        XCTAssertEqual(Scoring.summarizeDay(D, items, [], [tick("a", "2026-10-06")]).status, .missed)
    }

    func testIgnoresItemsThatAreOff() {
        let a = makeItem(id: "a")
        let off = makeItem(id: "off", active: false)
        XCTAssertEqual(Scoring.summarizeDay(D, [a, off], [], [tick("a", D)]).status, .full)
    }

    func testADayWithNoItemsIsMissedNotFull() {
        XCTAssertEqual(Scoring.statusFromCounts(done: 0, total: 0), .missed)
        XCTAssertEqual(Scoring.summarizeDay(D, [], [], []).status, .missed)
    }

    func testRoundsThePercent() {
        let three = [makeItem(id: "x"), makeItem(id: "y"), makeItem(id: "z")]
        XCTAssertEqual(Scoring.summarizeDay(D, three, [], [tick("x", D)]).percent, 33)
        XCTAssertEqual(Scoring.summarizeDay(D, three, [], [tick("x", D), tick("y", D)]).percent, 67)
    }

    // MARK: weekly

    func testWeeklyItemsRollUpMondayToSunday() {
        let talk = makeItem(id: "talk", cadence: .weekly)
        let weigh = makeItem(id: "weigh", type: .number, cadence: .weekly, target: .min(1))
        let daily = makeItem(id: "daily")
        let items = [talk, weigh, daily]
        let logs = [tick("talk", "2026-10-07")]
        for d in ["2026-10-05", "2026-10-07", "2026-10-11"] {
            let w = Scoring.summarizeWeek(d, items, [], logs)
            XCTAssertEqual(w.weekStart, "2026-10-05")
            XCTAssertEqual(w.weekEnd, "2026-10-11")
            let t = w.items.first(where: { $0.item.id == "talk" })
            XCTAssertEqual(t?.done, true)
            XCTAssertEqual(t?.doneOn, "2026-10-07")
            XCTAssertEqual(w.items.first(where: { $0.item.id == "weigh" })?.done, false)
            XCTAssertEqual(w.done, 1)
            XCTAssertEqual(w.total, 2)
            XCTAssertFalse(w.complete)
        }
        XCTAssertEqual(Scoring.summarizeWeek("2026-10-12", items, [], logs).done, 0)

        let both = [tick("talk", "2026-10-06"), makeLog("weigh", "2026-10-09", value: 182.4, checked: true)]
        let sunday = Scoring.summarizeWeek("2026-10-11", items, [], both)
        XCTAssertTrue(sunday.complete)
        XCTAssertEqual(sunday.items.map { $0.item.id }, ["talk", "weigh"])
    }

    func testWeeklyItemsNeverChangeADaysStatus() {
        let talk = makeItem(id: "talk", cadence: .weekly)
        let weigh = makeItem(id: "weigh", cadence: .weekly)
        let daily = makeItem(id: "daily")
        XCTAssertEqual(Scoring.summarizeDay("2026-10-07", [talk, weigh, daily], [], [tick("talk", "2026-10-07")]).status, .missed)
    }

    func testAWeeklyItemAddedMidWeekShowsFromThatDay() {
        let talk = makeItem(id: "talk", cadence: .weekly)
        let v = [makeVersion("talk", "2026-10-08", .check)]
        XCTAssertEqual(Scoring.summarizeWeek("2026-10-06", [talk], v, [], asOf: "2026-10-06").total, 0)
        XCTAssertEqual(Scoring.summarizeWeek("2026-10-09", [talk], v, [], asOf: "2026-10-09").total, 1)
        XCTAssertEqual(Scoring.summarizeWeek("2026-10-06", [talk], v, []).total, 1)
    }
}
