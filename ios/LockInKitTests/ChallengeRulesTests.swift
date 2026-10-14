import XCTest
@testable import LockInKit

final class ChallengeRulesTests: XCTestCase {
    typealias R = ChallengeRules

    func challenge(_ id: String = "c1", status: ChallengeStatus = .active, start: String = "2026-10-05", length: Int = 30, endedOn: String? = nil, rules: [ChallengeRule]? = nil, moneyTarget: Double? = 1000, moneyDeadline: String? = "2026-10-14") -> Challenge {
        return Challenge(id: id, createdAt: "2026-10-01T12:00:00.000Z", name: "30 day lock in", status: status, startDate: start, lengthDays: length, endedOn: endedOn, rules: rules, restartOf: nil, moneyTarget: moneyTarget, moneyDeadline: moneyDeadline, dailyFloor: 100, moneyTargetStart: nil)
    }

    // MARK: dates

    func testDaysRun() {
        let ended = challenge(status: .ended, endedOn: "2026-10-12")
        XCTAssertEqual(R.daysRun(ended, "2026-12-01"), 8)
        XCTAssertEqual(R.daysRun(challenge(), "2026-10-07"), 3)
        XCTAssertEqual(R.daysRun(challenge(), "2026-10-01"), 0)
        let never = challenge(status: .abandoned, endedOn: "2026-10-04")
        XCTAssertEqual(R.daysRun(never, "2026-10-20"), 0)
    }

    func testListsPastChallengesNewestFirst() {
        let list = [
            challenge("a", status: .abandoned, start: "2026-10-05", endedOn: "2026-10-09"),
            challenge("b", status: .succeeded, start: "2026-10-10", endedOn: "2026-11-08"),
            challenge("c", start: "2026-11-20"),
        ]
        XCTAssertEqual(R.pastChallenges(list).map { $0.id }, ["b", "a"])
    }

    func testStatusLabels() {
        XCTAssertEqual(R.statusLabel(.active), "Active")
        XCTAssertEqual(R.statusLabel(.succeeded), "Finished")
        XCTAssertEqual(R.statusLabel(.ended), "Ended early")
        XCTAssertEqual(R.statusLabel(.abandoned), "Restarted")
    }

    func testChallengeItems() {
        let a = makeItem(id: "a")
        let b = makeItem(id: "b")
        XCTAssertEqual(R.challengeItems(challenge(), [a, b]).map { $0.id }, ["a", "b"])
        XCTAssertEqual(R.challengeItems(challenge(rules: [ChallengeRule(itemId: "b", target: nil)]), [a, b]).map { $0.id }, ["b"])
    }

    // MARK: starting

    func input(_ f: (inout ChallengeInput) -> Void = { _ in }) -> ChallengeInput {
        var i = ChallengeInput(name: "Strict diet", startDate: "2026-11-10", lengthDays: 30, rules: nil, dailyFloor: 100)
        f(&i)
        return i
    }

    func testAcceptsAPlainInputAndBuildsAnActiveRow() {
        XCTAssertNil(R.problem(input(), today: "2026-11-10"))
        let row = R.newRow(input())
        XCTAssertEqual(row["name"], .string("Strict diet"))
        XCTAssertEqual(row["status"], .string("active"))
        XCTAssertEqual(row["start_date"], .string("2026-11-10"))
        XCTAssertEqual(row["length_days"], .number(30))
        XCTAssertEqual(row["ended_on"], .null)
        XCTAssertEqual(row["rules"], .null)
        XCTAssertEqual(row["restart_of"], .null)
        XCTAssertEqual(row["money_target"], .null)
        XCTAssertEqual(row["money_deadline"], .null)
        XCTAssertEqual(row["daily_floor"], .number(100))
        XCTAssertEqual(row["money_target_start"], .null)
        XCTAssertEqual(row.count, 11)
    }

    func testKeepsRulesAndAnOptionalMoneyTarget() {
        let rules = [ChallengeRule(itemId: "a", target: .max(30)), ChallengeRule(itemId: "b", target: nil)]
        let row = R.newRow(input { $0.rules = rules; $0.moneyTarget = 500; $0.moneyDeadline = "2026-11-30" })
        XCTAssertEqual(row["money_target"], .number(500))
        XCTAssertEqual(row["money_deadline"], .string("2026-11-30"))
        guard case .array(let arr)? = row["rules"] else { return XCTFail("rules") }
        XCTAssertEqual(arr.count, 2)
        if case .object(let first) = arr[0] {
            XCTAssertEqual(first["item_id"], .string("a"))
            XCTAssertEqual(first["target"], .object(["kind": .string("max"), "max": .number(30)]))
        } else {
            XCTFail("rule")
        }
        if case .object(let second) = arr[1] { XCTAssertEqual(second["target"], .null) } else { XCTFail("rule") }
    }

    func testRefusesWhatCannotWork() {
        let today = "2026-11-10"
        XCTAssertTrue(R.problem(input { $0.name = " " }, today: today)!.contains("name"))
        XCTAssertTrue(R.problem(input { $0.startDate = "2026-11-09" }, today: today)!.contains("today or later"))
        XCTAssertTrue(R.problem(input { $0.startDate = "soon" }, today: today)!.contains("start date"))
        XCTAssertTrue(R.problem(input { $0.lengthDays = 0 }, today: today)!.contains("at least 1"))
        XCTAssertTrue(R.problem(input { $0.lengthDays = 400 }, today: today)!.contains("365"))
        XCTAssertTrue(R.problem(input { $0.rules = [] }, today: today)!.contains("at least one item"))
        XCTAssertTrue(R.problem(input { $0.moneyTarget = 500 }, today: today)!.contains("deadline"))
        XCTAssertTrue(R.problem(input { $0.moneyTarget = 0; $0.moneyDeadline = "2026-11-20" }, today: today)!.contains("above zero"))
        XCTAssertTrue(R.problem(input { $0.moneyTarget = 500; $0.moneyDeadline = "2026-11-01" }, today: today)!.contains("on or after"))
        XCTAssertNil(R.problem(input { $0.startDate = "2026-11-20" }, today: today))
    }

    // MARK: ending, finishing, restarting

    func testEndsEarlyOnToday() {
        XCTAssertEqual(R.endPatch(challenge(), "2026-10-12"), ChallengeClosing(status: .ended, endedOn: "2026-10-12"))
        XCTAssertEqual(R.endPatch(challenge(), "2026-12-01"), ChallengeClosing(status: .ended, endedOn: "2026-11-03"))
        XCTAssertEqual(R.endPatch(challenge(), "2026-10-01"), ChallengeClosing(status: .ended, endedOn: "2026-10-04"))
    }

    func testFinishesOnlyFromTheLastDayOn() {
        XCTAssertFalse(R.canFinish(challenge(), "2026-11-02"))
        XCTAssertTrue(R.canFinish(challenge(), "2026-11-03"))
        XCTAssertTrue(R.canFinish(challenge(), "2026-11-20"))
        XCTAssertFalse(R.canFinish(challenge(status: .ended, endedOn: "2026-10-09"), "2026-11-20"))
        XCTAssertEqual(R.finishPatch(challenge()), ChallengeClosing(status: .succeeded, endedOn: "2026-11-03"))
    }

    func testRestartsTheActiveOne() {
        let rules = [ChallengeRule(itemId: "a", target: .max(30))]
        let r = R.restartRows(challenge(rules: rules), "2026-10-12")
        XCTAssertEqual(r.close, ChallengeClosing(status: .abandoned, endedOn: "2026-10-11"))
        XCTAssertEqual(r.next["name"], .string("30 day lock in"))
        XCTAssertEqual(r.next["status"], .string("active"))
        XCTAssertEqual(r.next["start_date"], .string("2026-10-12"))
        XCTAssertEqual(r.next["length_days"], .number(30))
        XCTAssertEqual(r.next["restart_of"], .string("c1"))
        XCTAssertEqual(r.next["ended_on"], .null)
        XCTAssertEqual(r.next["money_target"], .number(1000))
        XCTAssertEqual(r.next["money_deadline"], .string("2026-10-21"))
    }

    func testRestartingOnTheStartDayLeavesNoDays() {
        XCTAssertEqual(R.restartRows(challenge(), "2026-10-05").close, ChallengeClosing(status: .abandoned, endedOn: "2026-10-04"))
    }

    func testRestartsAPastOneWithoutTouchingIt() {
        let past = challenge(status: .succeeded, endedOn: "2026-11-03", moneyTarget: nil, moneyDeadline: nil)
        let r = R.restartRows(past, "2026-12-01")
        XCTAssertNil(r.close)
        XCTAssertEqual(r.next["start_date"], .string("2026-12-01"))
        XCTAssertEqual(r.next["restart_of"], .string("c1"))
        XCTAssertEqual(r.next["money_target"], .null)
        XCTAssertEqual(r.next["money_deadline"], .null)
    }

    // MARK: record

    func testRecordLeavesTodayOpenUntilFull() {
        let s: [DateStr: DayStatus] = ["2026-10-05": .full, "2026-10-06": .partial, "2026-10-07": .missed, "2026-10-08": .partial]
        XCTAssertEqual(R.record(challenge(), s, "2026-10-08"), ChallengeRecord(days: 4, length: 30, full: 1, partial: 1, missed: 1))
        var s2 = s
        s2["2026-10-08"] = .full
        let r2 = R.record(challenge(), s2, "2026-10-08")
        XCTAssertEqual(r2.full, 2)
        XCTAssertEqual(r2.partial, 1)
        XCTAssertEqual(r2.missed, 1)
        let ended = challenge(status: .ended, endedOn: "2026-10-06")
        XCTAssertEqual(R.record(ended, s, "2026-10-20"), ChallengeRecord(days: 2, length: 30, full: 1, partial: 1, missed: 0))
    }
}
