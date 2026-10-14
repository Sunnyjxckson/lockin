import XCTest
@testable import LockInKit

final class ViceRulesTests: XCTestCase {
    var n = 0
    let start = "2026-10-05"

    func slip(_ itemId: String, _ date: String, _ time: String = "21:30", _ trigger: String? = nil, _ amount: Double? = nil) -> ViceSlip {
        n += 1
        return ViceSlip(id: "slip\(n)", createdAt: "2026-10-01T12:00:00.000Z", itemId: itemId, date: date, time: time, trigger: trigger, amount: amount)
    }

    func vice(_ id: String, mode: ViceMode, type: ItemType = .yesno, target: Target = .check, unit: String? = nil) -> ChecklistItem {
        var item = ChecklistItem(id: id, createdAt: "2026-10-01T12:00:00.000Z", name: id, type: type, target: target, category: .vice, mode: mode, unit: unit)
        item.active = true
        return item
    }

    func quit(_ id: String = "q") -> (item: ChecklistItem, versions: [TargetVersion]) {
        return (vice(id, mode: .quit), [makeVersion(id, "2000-01-01", .check)])
    }

    func cap(_ id: String = "c", max: Double = 30) -> (item: ChecklistItem, versions: [TargetVersion]) {
        return (vice(id, mode: .cap, type: .number, target: .max(max), unit: "min"), [makeVersion(id, "2000-01-01", .max(max))])
    }

    func testIsCleanDay() {
        XCTAssertTrue(ViceRules.isCleanDay(.check, tick("q", start)))
        XCTAssertFalse(ViceRules.isCleanDay(.check, makeLog("q", start)))
        XCTAssertFalse(ViceRules.isCleanDay(.check, nil))
        XCTAssertFalse(ViceRules.isCleanDay(.check, tick("q", start), slipCount: 1))
        let t = Target.max(30)
        XCTAssertTrue(ViceRules.isCleanDay(t, makeLog("c", start, value: 30, checked: true)))
        XCTAssertTrue(ViceRules.isCleanDay(t, makeLog("c", start, value: 0, checked: true)))
        XCTAssertFalse(ViceRules.isCleanDay(t, makeLog("c", start, value: 31, checked: true)))
        XCTAssertFalse(ViceRules.isCleanDay(t, makeLog("c", start)))
        XCTAssertFalse(ViceRules.isCleanDay(t, makeLog("c", start, value: 10, checked: true), slipCount: 1))
    }

    func testStreakResetsOnlyThatVice() {
        let a = quit("a")
        let b = quit("b")
        let versions = a.versions + b.versions
        let days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]
        var logs: [DayLog] = []
        for d in days {
            logs.append(tick("a", d))
            logs.append(tick("b", d))
        }
        let slips = [slip("a", "2026-10-07")]
        let sa = ViceRules.viceStreak(a.item, versions, logs, slips, today: "2026-10-08", from: start)
        XCTAssertEqual(sa.current, 1)
        XCTAssertEqual(sa.best, 2)
        let sb = ViceRules.viceStreak(b.item, versions, logs, slips, today: "2026-10-08", from: start)
        XCTAssertEqual(sb.current, 4)
        XCTAssertEqual(sb.best, 4)
    }

    func testSlipTodayEndsTheRun() {
        let q = quit()
        let logs = [tick("q", "2026-10-05"), tick("q", "2026-10-06")]
        XCTAssertEqual(ViceRules.viceStreak(q.item, q.versions, logs, [slip("q", "2026-10-06")], today: "2026-10-06", from: start).current, 0)
    }

    func testTodayNotCheckedYetDoesNotBreak() {
        let q = quit()
        let logs = [tick("q", "2026-10-05"), tick("q", "2026-10-06")]
        let s = ViceRules.viceStreak(q.item, q.versions, logs, [], today: "2026-10-07", from: start)
        XCTAssertEqual(s.current, 2)
        XCTAssertFalse(s.doneNow)
    }

    func testCapOverBreaks() {
        let c = cap()
        let logs = [
            makeLog("c", "2026-10-05", value: 20, checked: true),
            makeLog("c", "2026-10-06", value: 45, checked: true),
            makeLog("c", "2026-10-07", value: 30, checked: true),
        ]
        let s = ViceRules.viceStreak(c.item, c.versions, logs, [], today: "2026-10-07", from: start)
        XCTAssertEqual(s.current, 1)
        XCTAssertEqual(s.best, 1)
        let over = logs + [makeLog("c", "2026-10-08", value: 31, checked: true)]
        let s2 = ViceRules.viceStreak(c.item, c.versions, over, [], today: "2026-10-08", from: start)
        XCTAssertEqual(s2.current, 0)
        XCTAssertEqual(s2.best, 1)
    }

    func testLogsWithSlips() {
        let c = cap()
        let logs = [makeLog("c", "2026-10-05", value: 20, checked: true), tick("other", "2026-10-05")]
        XCTAssertEqual(ViceRules.logsWithSlips(c.item, logs, []), [logs[0]])
        XCTAssertEqual(ViceRules.logsWithSlips(c.item, logs, [slip("c", "2026-10-05")])[0].value, Double.infinity)
    }

    func testCalendarStates() {
        let item = vice("v", mode: .quit)
        let versions = [makeVersion("v", "2000-01-01", .check, active: false), makeVersion("v", "2026-10-06", .check, active: true)]
        let logs = [tick("v", "2026-10-06"), tick("v", "2026-10-07")]
        let slips = [slip("v", "2026-10-07"), slip("v", "2026-10-07", "23:00")]
        let cal = ViceRules.viceCalendar(item, versions, logs, slips, startDate: start, lengthDays: 30, today: "2026-10-08")
        XCTAssertEqual(cal.count, 30)
        XCTAssertEqual(cal.prefix(5).map { $0.state }, [.off, .clean, .slip, .open, .future])
        XCTAssertEqual(cal[2].slips, 2)
        XCTAssertEqual(cal[3].day, 4)
        XCTAssertTrue(cal[3].isToday)
        XCTAssertEqual(ViceRules.cleanDayCount(item, versions, logs, slips, from: start, today: "2026-10-08"), 1)
    }

    func testCapOverWithNoSlipRowIsASlipDay() {
        let c = cap()
        let logs = [makeLog("c", start, value: 50, checked: true)]
        XCTAssertEqual(ViceRules.viceCalendar(c.item, c.versions, logs, [], startDate: start, lengthDays: 30, today: start)[0].state, .slip)
    }

    func testPastDaysKeepTheirRule() {
        let item = vice("v", mode: .cap, type: .number, target: .max(30))
        let versions = [makeVersion("v", "2000-01-01", .check), makeVersion("v", "2026-10-07", .max(30))]
        let logs = [tick("v", "2026-10-05"), makeLog("v", "2026-10-07", value: 10, checked: true)]
        let cal = ViceRules.viceCalendar(item, versions, logs, [], startDate: start, lengthDays: 30, today: "2026-10-07")
        XCTAssertEqual(cal.prefix(3).map { $0.state }, [.clean, .open, .clean])
    }

    func testTypicalSpend() {
        func item(_ amount: Double?, _ period: SpendPeriod?) -> ChecklistItem {
            var i = vice("v", mode: .quit)
            i.typicalSpend = amount
            i.spendPeriod = period
            return i
        }
        XCTAssertEqual(ViceRules.spendOf(item(20, .day)), TypicalSpend(amount: 20, period: .day))
        XCTAssertEqual(ViceRules.spendOf(item(87.5, .week)), TypicalSpend(amount: 87.5, period: .week))
        XCTAssertEqual(ViceRules.spendOf(item(40, nil)), TypicalSpend(amount: 40, period: .week))
        XCTAssertNil(ViceRules.spendOf(item(nil, .week)))
        XCTAssertNil(ViceRules.spendOf(item(0, .week)))
        XCTAssertEqual(ViceRules.describeSpend(TypicalSpend(amount: 87.5, period: .week)), "$87.5 a week")
    }

    func testDollarsKept() {
        let a = ViceRules.dollarsKept(cleanDays: 5, spend: TypicalSpend(amount: 20, period: .day), slipAmounts: [])
        XCTAssertEqual(a.saved, 100)
        XCTAssertEqual(a.spent, 0)
        XCTAssertEqual(a.kept, 100)
        let b = ViceRules.dollarsKept(cleanDays: 7, spend: TypicalSpend(amount: 70, period: .week), slipAmounts: [25, nil])
        XCTAssertEqual(b.saved, 70)
        XCTAssertEqual(b.spent, 25)
        XCTAssertEqual(b.kept, 45)
        XCTAssertEqual(ViceRules.dollarsKept(cleanDays: 1, spend: TypicalSpend(amount: 10, period: .day), slipAmounts: [60]).kept, -50)
        let c = ViceRules.dollarsKept(cleanDays: 4, spend: nil, slipAmounts: [15])
        XCTAssertEqual(c.saved, 0)
        XCTAssertEqual(c.kept, -15)
    }

    func testFormatDollars() {
        XCTAssertEqual(ViceRules.formatDollars(1240), "$1,240")
        XCTAssertEqual(ViceRules.formatDollars(12.5), "$12.50")
        XCTAssertEqual(ViceRules.formatDollars(-40), "-$40")
    }

    func testTriggers() {
        XCTAssertEqual(ViceRules.joinTriggers(["bored", "late night"], text: "After the game, Bored"), "bored, late night, after the game")
        XCTAssertNil(ViceRules.joinTriggers([], text: "  "))
        XCTAssertEqual(ViceRules.splitTriggers("bored, late night"), ["bored", "late night"])
        XCTAssertEqual(ViceRules.splitTriggers(nil), [])
    }

    func testTimeBuckets() {
        XCTAssertEqual(ViceRules.timeBucket("05:00"), .morning)
        XCTAssertEqual(ViceRules.timeBucket("11:59"), .morning)
        XCTAssertEqual(ViceRules.timeBucket("12:00"), .afternoon)
        XCTAssertEqual(ViceRules.timeBucket("17:00"), .evening)
        XCTAssertEqual(ViceRules.timeBucket("21:00"), .lateNight)
        XCTAssertEqual(ViceRules.timeBucket("02:30"), .lateNight)
    }

    func testSlipPattern() {
        let p = ViceRules.slipPattern([
            slip("v", "2026-10-09", "22:30", "bored, late night"),
            slip("v", "2026-10-10", "23:10", "with friends"),
            slip("v", "2026-10-16", "01:15", "bored"),
            slip("v", "2026-10-14", "15:00", "stressed"),
        ])
        XCTAssertEqual(p.total, 4)
        XCTAssertEqual(p.timeOfDay, ViceTop(value: .lateNight, count: 3))
        XCTAssertEqual(p.trigger, ViceTop(value: "bored", count: 2))
        XCTAssertEqual(p.weekday, ViceTop(value: 5, count: 2))
    }

    func testPatternTiesAndEmpty() {
        let p = ViceRules.slipPattern([slip("v", "2026-10-06", "09:00", "tired"), slip("v", "2026-10-08", "19:00", "stressed")])
        XCTAssertEqual(p.trigger?.value, "stressed")
        XCTAssertEqual(p.timeOfDay?.value, .evening)
        let e = ViceRules.slipPattern([])
        XCTAssertEqual(e.total, 0)
        XCTAssertNil(e.timeOfDay)
        XCTAssertNil(e.trigger)
        XCTAssertNil(e.weekday)
    }

    func testRuleText() {
        XCTAssertEqual(ViceRules.describeRule(vice("a", mode: .quit), .check), "Quit completely")
        XCTAssertEqual(ViceRules.describeRule(vice("a", mode: .cap, type: .number, target: .max(30), unit: "min"), .max(30)), "30 min or less a day")
        XCTAssertEqual(ViceRules.formatAmount(1, unit: "times"), "1 time")
        XCTAssertEqual(ViceRules.formatAmount(40, unit: "$"), "$40")
    }
}
