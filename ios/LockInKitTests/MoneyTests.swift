import XCTest
@testable import LockInKit

final class MoneyTests: XCTestCase {
    var week: [Earning] {
        return [
            makeEarning("2026-10-05", 60, hours: 2),
            makeEarning("2026-10-05", 80.5, hours: 3),
            makeEarning("2026-10-06", 70, hours: 2.5),
            makeEarning("2026-10-07", 100),
            makeEarning("2026-10-08", 210, hours: 6),
        ]
    }

    func testTotals() {
        let w = week
        XCTAssertEqual(Money.totalForDate(w, "2026-10-05"), 140.5)
        XCTAssertEqual(Money.totalForDate(w, "2026-10-09"), 0)
        XCTAssertEqual(Money.totalForDate([makeEarning("2026-10-05", 0.1), makeEarning("2026-10-05", 0.2)], "2026-10-05"), 0.3)
        let by = Money.totalsByDate(w)
        XCTAssertEqual(by["2026-10-05"], 140.5)
        XCTAssertEqual(by["2026-10-08"], 210)
        XCTAssertEqual(by.count, 4)
    }

    func testRunningTotalCountsFromTheStartDateOn() {
        let w = week
        XCTAssertEqual(Money.runningTotal(w), 520.5)
        XCTAssertEqual(Money.runningTotal(w, from: "2026-10-06"), 380)
        XCTAssertEqual(Money.runningTotal(w, from: "2026-10-06", to: "2026-10-07"), 170)
        XCTAssertEqual(Money.runningTotal([]), 0)
    }

    func testTargetStart() {
        var c = makeChallenge()
        XCTAssertEqual(Money.targetStart(c), "2026-10-05")
        c.moneyTargetStart = "2026-10-12"
        XCTAssertEqual(Money.targetStart(c), "2026-10-12")
        c.moneyTargetStart = "2026-10-01"
        XCTAssertEqual(Money.targetStart(c), "2026-10-05")
    }

    func testWorkDaysIncludeToday() {
        XCTAssertEqual(Money.workDaysLeft(today: "2026-10-05", deadline: "2026-10-14"), 10)
        XCTAssertEqual(Money.workDaysLeft(today: "2026-10-14", deadline: "2026-10-14"), 1)
        XCTAssertEqual(Money.workDaysLeft(today: "2026-10-15", deadline: "2026-10-14"), 0)
    }

    func testFloor() {
        let short = Money.floorStatus(earned: 60, floor: 100)
        XCTAssertFalse(short.met)
        XCTAssertEqual(short.short, 40)
        XCTAssertEqual(short.over, 0)
        XCTAssertEqual(short.progress, 0.6, accuracy: 0.0001)
        let met = Money.floorStatus(earned: 100, floor: 100)
        XCTAssertTrue(met.met)
        XCTAssertEqual(met.progress, 1)
        let over = Money.floorStatus(earned: 210, floor: 100)
        XCTAssertEqual(over.over, 110)
        XCTAssertEqual(over.short, 0)
    }

    func testTheFloorNeverDropsWhenAhead() {
        let ahead = Money.floorStatus(earned: 20, floor: 100, banked: 900)
        XCTAssertEqual(ahead.floor, 100)
        XCTAssertFalse(ahead.met)
        XCTAssertEqual(ahead.short, 80)
        XCTAssertTrue(Money.floorStatus(earned: 0, floor: 0).met)
    }

    func testSurplusBanked() {
        let w = week
        XCTAssertEqual(Money.surplusBanked(w, floor: 100), 150.5)
        XCTAssertEqual(Money.surplusBanked(w, floor: 100, from: "2026-10-06"), 110)
        XCTAssertEqual(Money.surplusBanked(w, floor: 100, to: "2026-10-07"), 40.5)
        XCTAssertEqual(Money.surplusBanked([makeEarning("2026-10-05", 99)], floor: 100), 0)
        XCTAssertEqual(Money.surplusBanked([], floor: 100), 0)
    }

    func testFormatsMoney() {
        XCTAssertEqual(Money.formatMoney(1000), "$1,000")
        XCTAssertEqual(Money.formatMoney(42.5), "$42.50")
        XCTAssertEqual(Money.formatMoney(0), "$0")
    }
}
