import XCTest
@testable import LockInKit

final class StreaksTests: XCTestCase {
    let start = "2026-10-05"
    func day(_ n: Int) -> String { return LIDate.addDays(start, n - 1) }

    func testZeroWithNoLogs() {
        let item = makeItem(id: "a")
        XCTAssertEqual(Streaks.itemStreak(item, [], [], today: day(5), from: start), Streak(current: 0, best: 0, doneNow: false))
    }

    func testCountsDaysInARowEndingToday() {
        let item = makeItem(id: "a")
        let logs = [1, 2, 3].map { tick("a", day($0)) }
        XCTAssertEqual(Streaks.itemStreak(item, [], logs, today: day(3), from: start), Streak(current: 3, best: 3, doneNow: true))
    }

    func testTodayNotDoneYetDoesNotBreakIt() {
        let item = makeItem(id: "a")
        let logs = [1, 2, 3].map { tick("a", day($0)) }
        XCTAssertEqual(Streaks.itemStreak(item, [], logs, today: day(4), from: start), Streak(current: 3, best: 3, doneNow: false))
    }

    func testAMissedDayResetsThatItemsStreak() {
        let item = makeItem(id: "a")
        let logs = [1, 2, 4, 5].map { tick("a", day($0)) }
        XCTAssertEqual(Streaks.itemStreak(item, [], logs, today: day(5), from: start), Streak(current: 2, best: 2, doneNow: true))
        XCTAssertEqual(Streaks.itemStreak(item, [], logs, today: day(7), from: start).current, 0)
    }

    func testRemembersTheBestRun() {
        let item = makeItem(id: "a")
        let logs = [1, 2, 3, 4, 6].map { tick("a", day($0)) }
        XCTAssertEqual(Streaks.itemStreak(item, [], logs, today: day(6), from: start), Streak(current: 1, best: 4, doneNow: true))
    }

    func testAnUntickedRowCountsAsNotDone() {
        let item = makeItem(id: "a")
        let logs = [tick("a", day(1)), makeLog("a", day(2)), tick("a", day(3))]
        XCTAssertEqual(Streaks.itemStreak(item, [], logs, today: day(3), from: start).current, 1)
    }

    func testNeverCountsDaysBeforeTheStart() {
        let item = makeItem(id: "a")
        let logs = [tick("a", LIDate.addDays(start, -1)), tick("a", day(1)), tick("a", day(2))]
        XCTAssertEqual(Streaks.itemStreak(item, [], logs, today: day(2), from: start).current, 2)
    }

    func testIsPerItem() {
        let a = makeItem(id: "a")
        let b = makeItem(id: "b")
        let logs = [tick("a", day(1)), tick("a", day(2)), tick("b", day(2))]
        let s = Streaks.allStreaks([a, b], [], logs, today: day(2), from: start)
        XCTAssertEqual(s["a"]?.current, 2)
        XCTAssertEqual(s["b"]?.current, 1)
    }

    func testScoresNumbersAgainstTheTargetOfEachDay() {
        let cal = makeItem(id: "cal", type: .number, target: .range(1700, 1900))
        let versions = [
            makeVersion("cal", Targets.baselineDate, .range(1900, 2100)),
            makeVersion("cal", day(3), .range(1700, 1900)),
        ]
        let logs = [
            makeLog("cal", day(1), value: 2000, checked: true),
            makeLog("cal", day(2), value: 2000, checked: true),
            makeLog("cal", day(3), value: 1800, checked: true),
        ]
        XCTAssertEqual(Streaks.itemStreak(cal, versions, logs, today: day(3), from: start).current, 3)
        XCTAssertEqual(Streaks.itemStreak(cal, [], logs, today: day(3), from: start).current, 1)
    }

    func testStartsFromTheDayAnItemWasAdded() {
        let added = makeItem(id: "n")
        let versions = [makeVersion("n", day(3), .check)]
        let logs = [tick("n", day(2)), tick("n", day(3)), tick("n", day(4))]
        XCTAssertEqual(Streaks.itemStreak(added, versions, logs, today: day(4), from: start), Streak(current: 2, best: 2, doneNow: true))
    }

    func testRespectsTheWakeTimeGate() {
        let wake = makeItem(id: "wake", target: .checkBy("06:00"))
        let logs = [tick("wake", day(1), "2026-10-05T09:50:00Z"), tick("wake", day(2), "2026-10-06T11:30:00Z")]
        XCTAssertEqual(Streaks.itemStreak(wake, [], logs, today: day(2), from: start), Streak(current: 1, best: 1, doneNow: false))
        XCTAssertEqual(Streaks.itemStreak(wake, [], logs, today: day(3), from: start), Streak(current: 0, best: 1, doneNow: false))
    }

    func testASlipTodayEndsTheRun() {
        let item = makeItem(id: "a")
        let logs = [tick("a", day(1)), tick("a", day(2)), makeLog("a", day(3), checked: true, slips: 1)]
        XCTAssertEqual(Streaks.itemStreak(item, [], logs, today: day(3), from: start).current, 0)
    }

    // MARK: weekly

    func testWeeklyStreaks() {
        let talk = makeItem(id: "talk", cadence: .weekly)
        let counts = [tick("talk", "2026-10-07"), tick("talk", "2026-10-16"), tick("talk", "2026-10-19")]
        XCTAssertEqual(Streaks.itemStreak(talk, [], counts, today: "2026-10-20", from: start), Streak(current: 3, best: 3, doneNow: true))

        let open = [tick("talk", "2026-10-07"), tick("talk", "2026-10-16")]
        XCTAssertEqual(Streaks.itemStreak(talk, [], open, today: "2026-10-20", from: start), Streak(current: 2, best: 2, doneNow: false))

        let missed = [tick("talk", "2026-10-07"), tick("talk", "2026-10-21")]
        XCTAssertEqual(Streaks.itemStreak(talk, [], missed, today: "2026-10-22", from: start), Streak(current: 1, best: 1, doneNow: true))
    }

    func testFullDayStreak() {
        let s: [String: DayStatus] = [day(1): .full, day(2): .partial, day(3): .full, day(4): .full]
        XCTAssertEqual(Streaks.fullDayStreak(s, today: day(4), from: start), 2)
        XCTAssertEqual(Streaks.fullDayStreak(s, today: day(5), from: start), 2)
        XCTAssertEqual(Streaks.fullDayStreak(s, today: day(6), from: start), 0)
    }
}
