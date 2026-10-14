import XCTest
@testable import LockInKit

final class MoneyRulesTests: XCTestCase {
    private var week: [Earning] {
        return [
            makeEarning("2026-10-05", 60, hours: 2),
            makeEarning("2026-10-05", 80.5, hours: 3),
            makeEarning("2026-10-06", 70, hours: 2.5),
            makeEarning("2026-10-07", 100),
            makeEarning("2026-10-08", 210, hours: 6),
        ]
    }

    func testDaysLeft() {
        XCTAssertEqual(Money.daysLeft(today: "2026-10-14", deadline: "2026-10-14"), 0)
        XCTAssertEqual(Money.daysLeft(today: "2026-10-20", deadline: "2026-10-14"), 0)
        XCTAssertEqual(Money.daysLeft(today: "2026-10-30", deadline: "2026-11-03"), 4)
        XCTAssertEqual(Money.workDaysLeft(today: "2026-10-05", deadline: "2026-10-14"), 10)
        XCTAssertEqual(Money.workDaysLeft(today: "2026-10-14", deadline: "2026-10-14"), 1)
        XCTAssertEqual(Money.workDaysLeft(today: "2026-10-15", deadline: "2026-10-14"), 0)
    }

    func testFloorNeverDropsWhenAhead() {
        let ahead = Money.floorStatus(earned: 20, floor: 100, banked: 900)
        XCTAssertEqual(ahead.floor, 100)
        XCTAssertFalse(ahead.met)
        XCTAssertEqual(ahead.short, 80)
        XCTAssertTrue(Money.floorStatus(earned: 0, floor: 0).met)
    }

    func testSurplusBanked() {
        XCTAssertEqual(Money.surplusBanked(week, floor: 100), 150.5)
        XCTAssertEqual(Money.surplusBanked(week, floor: 100, from: "2026-10-06"), 110)
        XCTAssertEqual(Money.surplusBanked(week, floor: 100, to: "2026-10-07"), 40.5)
        XCTAssertEqual(Money.surplusBanked([makeEarning("2026-10-05", 99)], floor: 100), 0)
        XCTAssertEqual(Money.surplusBanked([], floor: 100), 0)
    }

    func testHourlyRateOnlyCountsEntriesWithHours() {
        XCTAssertEqual(Money.hourlyRate(week), 31.15)
        XCTAssertNil(Money.hourlyRate([makeEarning("2026-10-05", 50)]))
        XCTAssertEqual(Money.totalHours(week), 13.5)
    }

    func testNeededPerDay() {
        let a = Money.neededPerDay(target: 1000, total: 400, today: "2026-10-09", deadline: "2026-10-14", floor: 100)
        XCTAssertEqual(a, MoneyNeeded(remaining: 600, days: 6, perDay: 100, aim: 100))
        let b = Money.neededPerDay(target: 1000, total: 100, today: "2026-10-12", deadline: "2026-10-14", floor: 100)
        XCTAssertEqual(b, MoneyNeeded(remaining: 900, days: 3, perDay: 300, aim: 300))
        let c = Money.neededPerDay(target: 1000, total: 900, today: "2026-10-05", deadline: "2026-10-14", floor: 100)
        XCTAssertEqual(c.perDay, 10)
        XCTAssertEqual(c.aim, 100)
        let d = Money.neededPerDay(target: 1000, total: 700, today: "2026-10-15", deadline: "2026-10-14", floor: 100)
        XCTAssertEqual(d, MoneyNeeded(remaining: 300, days: 0, perDay: nil, aim: nil))
        let e = Money.neededPerDay(target: 1000, total: 1200, today: "2026-10-10", deadline: "2026-10-14", floor: 100)
        XCTAssertEqual(e.remaining, 0)
        XCTAssertEqual(e.perDay, 0)
        XCTAssertEqual(e.aim, 100)
    }

    func testTargetState() {
        XCTAssertEqual(Money.targetState(target: 1000, total: 500, today: "2026-10-14", deadline: "2026-10-14"), .active)
        XCTAssertFalse(Money.canResetTarget(.active))
        XCTAssertEqual(Money.targetState(target: 1000, total: 1000, today: "2026-10-08", deadline: "2026-10-14"), .hit)
        XCTAssertEqual(Money.targetState(target: 1000, total: 1500, today: "2026-10-20", deadline: "2026-10-14"), .hit)
        XCTAssertTrue(Money.canResetTarget(.hit))
        XCTAssertEqual(Money.targetState(target: 1000, total: 500, today: "2026-10-15", deadline: "2026-10-14"), .past)
        XCTAssertTrue(Money.canResetTarget(.past))
    }

    func testValidNewTarget() {
        XCTAssertTrue(Money.validNewTarget(2000, deadline: "2026-11-03", total: 1000, today: "2026-10-15"))
        XCTAssertFalse(Money.validNewTarget(900, deadline: "2026-11-03", total: 1000, today: "2026-10-15"))
        XCTAssertFalse(Money.validNewTarget(2000, deadline: "2026-10-14", total: 1000, today: "2026-10-15"))
        XCTAssertFalse(Money.validNewTarget(nil, deadline: "2026-11-03", total: 1000, today: "2026-10-15"))
        XCTAssertFalse(Money.validNewTarget(2000, deadline: "", total: 1000, today: "2026-10-15"))
    }

    func testGroupByDayNewestFirst() {
        let g = Money.groupByDay(week)
        XCTAssertEqual(g.map { $0.date }, ["2026-10-08", "2026-10-07", "2026-10-06", "2026-10-05"])
        XCTAssertEqual(g[3].total, 140.5)
        XCTAssertEqual(g[3].hours, 5)
        XCTAssertEqual(g[3].rate, 28.1)
        XCTAssertEqual(g[3].entries.count, 2)
        XCTAssertNil(g[1].rate)
    }

    func testFormatHours() {
        XCTAssertEqual(Money.formatHours(1.5), "1.5h")
        XCTAssertEqual(Money.formatHours(2), "2h")
        XCTAssertEqual(Money.formatHours(0.333), "0.33h")
    }

    func testNormalizeApp() {
        XCTAssertEqual(Money.normalizeApp("doordash"), "DoorDash")
        XCTAssertEqual(Money.normalizeApp("Door Dash Dasher"), "DoorDash")
        XCTAssertEqual(Money.normalizeApp("UberEats"), "Uber Eats")
        XCTAssertEqual(Money.normalizeApp("Uber Driver"), "Uber Eats")
        XCTAssertEqual(Money.normalizeApp("instacart shopper"), "Instacart")
        XCTAssertNil(Money.normalizeApp("Lyft"))
        XCTAssertNil(Money.normalizeApp(nil))
        XCTAssertEqual(Money.appChoice("Lyft"), "Other")
        XCTAssertEqual(Money.appChoice("Other"), "Other")
        XCTAssertEqual(Money.appChoice("Uber Eats"), "Uber Eats")
    }

    func testParseEarningRead() {
        let good = Money.parseEarningRead(.object(["amount": .string("$1,084.256"), "app": .string("DOORDASH"), "hours": .number(3.5)]))
        XCTAssertEqual(good, MoneyEarningRead(amount: 1084.26, app: "DoorDash", hours: 3.5))
        let minutes = Money.parseEarningRead(.object(["amount": .number(42), "app": .string("uber eats"), "hours": .null, "minutes": .number(90)]))
        XCTAssertEqual(minutes, MoneyEarningRead(amount: 42, app: "Uber Eats", hours: 1.5))
        let blank = MoneyEarningRead(amount: nil, app: nil, hours: nil)
        XCTAssertEqual(Money.parseEarningRead(.object(["amount": .number(-5), "app": .string("?"), "hours": .number(40)])), blank)
        XCTAssertEqual(Money.parseEarningRead(.string("nope")), blank)
        XCTAssertEqual(Money.parseEarningRead(nil), blank)
    }

    func testSpentBetween() {
        let rows = [
            Expense(id: "1", date: "2026-10-05", amount: 40.25, category: "groceries"),
            Expense(id: "2", date: "2026-10-07", amount: 12, category: "groceries"),
            Expense(id: "3", date: "2026-10-07", amount: 30, category: "eating out"),
            Expense(id: "4", date: "2026-10-12", amount: 99, category: "groceries"),
        ]
        XCTAssertEqual(Money.spentBetween(rows, from: "2026-10-05", to: "2026-10-11", category: "groceries"), 52.25)
        XCTAssertEqual(Money.spentBetween(rows, from: "2026-10-05", to: "2026-10-11"), 82.25)
        XCTAssertEqual(Money.spentBetween([], from: "2026-10-05", to: "2026-10-11"), 0)
    }

    func testTargetStartResetKeepsAllTimeTotal() {
        let rows = [makeEarning("2026-10-05", 400), makeEarning("2026-10-10", 700), makeEarning("2026-10-16", 120)]
        var c = makeChallenge()
        XCTAssertEqual(Money.runningTotal(rows, from: Money.targetStart(c)), 1220)
        c.moneyTargetStart = "2026-10-16"
        XCTAssertEqual(Money.runningTotal(rows, from: Money.targetStart(c)), 120)
        XCTAssertEqual(Money.runningTotal(rows), 1220)
    }
}
