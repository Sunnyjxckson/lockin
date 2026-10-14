import XCTest
@testable import LockInKit

final class ChallengesTests: XCTestCase {
    // MARK: dates

    func testEndsOnStartPlusLength() {
        XCTAssertEqual(Challenges.plannedEnd(makeChallenge()), "2026-11-03")
        XCTAssertEqual(Challenges.plannedEnd(makeChallenge(length: 1)), "2026-10-05")
    }

    func testKnowsTheLastDayItRan() {
        XCTAssertEqual(Challenges.lastDay(makeChallenge()), "2026-11-03")
        XCTAssertEqual(Challenges.lastDay(makeChallenge(status: .ended, endedOn: "2026-10-12")), "2026-10-12")
        XCTAssertEqual(Challenges.lastDay(makeChallenge(status: .succeeded, endedOn: "2026-11-03")), "2026-11-03")
        // A stored end past the plan is held to the plan.
        XCTAssertEqual(Challenges.lastDay(makeChallenge(status: .ended, endedOn: "2026-12-25")), "2026-11-03")
    }

    func testSaysWhichDaysItCovered() {
        let ended = makeChallenge(status: .ended, endedOn: "2026-10-12")
        XCTAssertTrue(Challenges.ranOn(ended, "2026-10-05"))
        XCTAssertTrue(Challenges.ranOn(ended, "2026-10-12"))
        XCTAssertFalse(Challenges.ranOn(ended, "2026-10-13"))
        XCTAssertFalse(Challenges.ranOn(ended, "2026-10-04"))
        let never = makeChallenge(status: .abandoned, endedOn: "2026-10-04")
        XCTAssertFalse(Challenges.ranOn(never, "2026-10-05"))
    }

    func testPhases() {
        XCTAssertEqual(Challenges.challengePhase(makeChallenge(), "2026-10-04"), .upcoming)
        XCTAssertEqual(Challenges.challengePhase(makeChallenge(), "2026-10-05"), .running)
        XCTAssertEqual(Challenges.challengePhase(makeChallenge(), "2026-11-03"), .running)
        XCTAssertEqual(Challenges.challengePhase(makeChallenge(), "2026-11-04"), .finished)
        XCTAssertEqual(Challenges.challengePhase(makeChallenge(status: .succeeded, endedOn: "2026-11-03"), "2026-10-10"), .closed)
    }

    // MARK: mode

    func testChallengeModeOnlyWhileOneIsRunningToday() {
        let m = Challenges.modeOn([makeChallenge()], historyStart: "2026-10-05", today: "2026-10-16")
        XCTAssertEqual(m.mode, .challenge)
        XCTAssertEqual(m.day, 12)
        XCTAssertEqual(m.length, 30)
        XCTAssertEqual(m.lastDay, "2026-11-03")
        XCTAssertNil(m.finished)
        XCTAssertNil(m.upcoming)
        XCTAssertEqual(m.historyStart, "2026-10-05")
        XCTAssertEqual(m.challenge?.id, "c1")
    }

    func testOngoingWithNoChallengeAtAll() {
        let m = Challenges.modeOn([], historyStart: "2026-10-05", today: "2026-12-01")
        XCTAssertEqual(m.mode, .ongoing)
        XCTAssertNil(m.challenge)
        XCTAssertNil(m.day)
        XCTAssertNil(m.length)
        XCTAssertNil(m.finished)
        XCTAssertNil(m.upcoming)
    }

    func testOngoingBeforeAChallengeStarts() {
        let m = Challenges.modeOn([makeChallenge(start: "2026-10-12")], historyStart: "2026-10-05", today: "2026-10-08")
        XCTAssertEqual(m.mode, .ongoing)
        XCTAssertEqual(m.upcoming?.id, "c1")
        XCTAssertNil(m.challenge)
    }

    func testOngoingOnceTheLastDayHasPassed() {
        let m = Challenges.modeOn([makeChallenge()], historyStart: "2026-10-05", today: "2026-11-04")
        XCTAssertEqual(m.mode, .ongoing)
        XCTAssertEqual(m.finished?.id, "c1")
        XCTAssertNil(m.day)
    }

    func testIgnoresClosedChallenges() {
        let closed = [makeChallenge(status: .ended, endedOn: "2026-10-12"), makeChallenge(id: "c0", status: .abandoned, endedOn: "2026-10-04")]
        XCTAssertEqual(Challenges.modeOn(closed, historyStart: "2026-10-05", today: "2026-10-10").mode, .ongoing)
        XCTAssertNil(Challenges.activeChallenge(closed))
    }

    func testNeverReportsAHistoryThatStartsAfterToday() {
        XCTAssertEqual(Challenges.modeOn([], historyStart: "2026-10-09", today: "2026-10-05").historyStart, "2026-10-05")
    }

    // MARK: rules and floor

    func testRuleTargetsAndTheFloor() {
        let rules = [
            ChallengeRule(itemId: "a", target: .range(1500, 1700)),
            ChallengeRule(itemId: "b", target: nil),
            ChallengeRule(itemId: "earned", target: .min(150)),
        ]
        let ch = makeChallenge(rules: rules)
        XCTAssertEqual(Challenges.ruleTarget(ch, itemId: "a"), .range(1500, 1700))
        XCTAssertNil(Challenges.ruleTarget(ch, itemId: "b"))
        XCTAssertNil(Challenges.ruleTarget(ch, itemId: "c"))
        XCTAssertNil(Challenges.ruleTarget(makeChallenge(), itemId: "a"))
        XCTAssertEqual(Challenges.floorOn(base: 100, challenge: ch, earnedItemId: "earned"), 150)
        XCTAssertEqual(Challenges.floorOn(base: 100, challenge: ch, earnedItemId: "b"), 100)
        XCTAssertEqual(Challenges.floorOn(base: 100, challenge: nil, earnedItemId: "earned"), 100)
        XCTAssertEqual(Challenges.floorOn(base: 100, challenge: makeChallenge(), earnedItemId: "earned"), 100)
    }

    func testScoresAChallengeDayFromItsOwnItemsOnly() {
        let a = makeItem(id: "a", type: .number, target: .range(1900, 2100))
        let b = makeItem(id: "b")
        let c = makeItem(id: "c")
        let logs = [makeLog("a", "2026-10-06", value: 2000, checked: true), tick("b", "2026-10-06")]
        let day = Scoring.summarizeDay("2026-10-06", [a, b, c], [], logs)
        XCTAssertEqual(day.status, .partial)
        XCTAssertEqual(day.done, 2)
        XCTAssertEqual(day.total, 3)
        let scoped = Challenges.challengeDay(makeChallenge(rules: [ChallengeRule(itemId: "a", target: nil), ChallengeRule(itemId: "b", target: nil)]), day)
        XCTAssertEqual(scoped.status, .full)
        XCTAssertEqual(scoped.done, 2)
        XCTAssertEqual(scoped.total, 2)
        XCTAssertEqual(scoped.percent, 100)
        XCTAssertEqual(Challenges.challengeDay(makeChallenge(), day).total, 3)
    }

    // MARK: scoringVersions

    let strict = Target.range(1500, 1700)
    let normal = Target.range(1900, 2100)

    func diet() -> Challenge {
        return makeChallenge(id: "diet", start: "2026-10-10", length: 5, rules: [ChallengeRule(itemId: "cal", target: strict)])
    }

    func testScoringVersionsChangeNothingWithoutRuleTargets() {
        let base = [makeVersion("cal", "2000-01-01", normal)]
        XCTAssertEqual(Challenges.scoringVersions(base, [makeChallenge()]), base)
        XCTAssertEqual(Challenges.scoringVersions(base, [makeChallenge(rules: [ChallengeRule(itemId: "cal", target: nil)])]), base)
        XCTAssertEqual(Challenges.scoringVersions(base, []), base)
    }

    func testLaysTheChallengeTargetOverTheDaysItRuns() {
        let cal = makeItem(id: "cal", type: .number, target: normal)
        let base = [makeVersion("cal", "2000-01-01", normal)]
        let v = Challenges.scoringVersions(base, [diet()])
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-09"), normal)
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-10"), strict)
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-14"), strict)
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-15"), normal)
        XCTAssertEqual(base.count, 1)
        XCTAssertEqual(v.map { $0.effectiveFrom }, ["2000-01-01", "2026-10-10", "2026-10-15"])
    }

    func testStopsAtTheDayAChallengeWasEndedEarly() {
        let cal = makeItem(id: "cal", type: .number, target: normal)
        let base = [makeVersion("cal", "2000-01-01", normal)]
        var ended = diet()
        ended.status = .ended
        ended.endedOn = "2026-10-11"
        let v = Challenges.scoringVersions(base, [ended])
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-11"), strict)
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-12"), normal)
    }

    func testAChallengeThatNeverRanHasNoEffect() {
        let base = [makeVersion("cal", "2000-01-01", normal)]
        var never = diet()
        never.status = .abandoned
        never.endedOn = "2026-10-09"
        XCTAssertEqual(Challenges.scoringVersions(base, [never]), base)
    }

    func testRespectsASettingChangedInTheMiddleOfAChallenge() {
        let cal = makeItem(id: "cal", type: .number, target: normal)
        let changed = [makeVersion("cal", "2000-01-01", normal), makeVersion("cal", "2026-10-12", .range(2000, 2200))]
        let v = Challenges.scoringVersions(changed, [diet()])
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-12"), strict)
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-15"), .range(2000, 2200))
    }

    func testKeepsAnItemOffWhenItWasSwitchedOffDuringTheChallenge() {
        let cal = makeItem(id: "cal", type: .number, target: normal)
        let off = [makeVersion("cal", "2000-01-01", normal), makeVersion("cal", "2026-10-12", normal, active: false)]
        let v = Challenges.scoringVersions(off, [diet()])
        XCTAssertTrue(Targets.isActiveOn(cal, v, "2026-10-11"))
        XCTAssertFalse(Targets.isActiveOn(cal, v, "2026-10-13"))
        XCTAssertFalse(Targets.isActiveOn(cal, v, "2026-10-16"))
    }

    func testAChallengeDayIsScoredTheSameBeforeDuringAndAfter() {
        let cal = makeItem(id: "cal", type: .number, target: normal)
        let base = [makeVersion("cal", "2000-01-01", normal)]
        let logs = [
            makeLog("cal", "2026-10-08", value: 2000, checked: true),
            makeLog("cal", "2026-10-12", value: 2000, checked: true),
            makeLog("cal", "2026-10-16", value: 2000, checked: true),
        ]
        let during = Challenges.scoringVersions(base, [diet()])
        XCTAssertEqual(Scoring.summarizeDay("2026-10-08", [cal], during, logs).status, .full)
        XCTAssertEqual(Scoring.summarizeDay("2026-10-12", [cal], during, logs).status, .missed)
        XCTAssertEqual(Scoring.summarizeDay("2026-10-16", [cal], during, logs).status, .full)
    }

    func testHandlesARestart() {
        let cal = makeItem(id: "cal", type: .number, target: normal)
        let base = [makeVersion("cal", "2000-01-01", normal)]
        var first = diet()
        first.id = "one"
        first.status = .abandoned
        first.endedOn = "2026-10-11"
        first.createdAt = "2026-10-09T12:00:00.000Z"
        var second = diet()
        second.id = "two"
        second.startDate = "2026-10-12"
        second.restartOf = "one"
        second.createdAt = "2026-10-12T12:00:00.000Z"
        let v = Challenges.scoringVersions(base, [second, first])
        for d in LIDate.dateRange("2026-10-10", "2026-10-16") {
            XCTAssertEqual(Targets.targetOn(cal, v, d), strict, d)
        }
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-17"), normal)
        XCTAssertEqual(Targets.targetOn(cal, v, "2026-10-09"), normal)
    }

    func testStreaksRunAcrossTheStartAndEndOfAChallenge() {
        let item = makeItem(id: "w", name: "Workout")
        let days = LIDate.dateRange("2026-10-01", "2026-10-20")
        let logs = days.filter { $0 != "2026-10-09" }.map { tick("w", $0) }
        let from = "2026-10-01"
        let none = Streaks.allStreaks([item], Challenges.scoringVersions([], []), logs, today: "2026-10-20", from: from)["w"]
        XCTAssertEqual(none, Streak(current: 11, best: 11, doneNow: true))
    }

    // MARK: consistency

    func status(_ full: [String], _ partial: [String] = []) -> [String: DayStatus] {
        var out: [String: DayStatus] = [:]
        for d in full { out[d] = .full }
        for d in partial { out[d] = .partial }
        return out
    }

    func testCountsFullDaysInTheLast30() {
        let today = "2026-11-10"
        let last30 = LIDate.dateRange(LIDate.addDays(today, -30), LIDate.addDays(today, -1))
        var full: [String] = []
        for (i, d) in last30.enumerated() where i % 8 != 0 { full.append(d) }
        let c = Challenges.consistency(status(full), today: today, from: "2026-08-01")
        XCTAssertEqual(c, Consistency(full: 26, partial: 0, days: 30, window: 30, percent: 87))
        XCTAssertEqual(Challenges.consistencyLabel(c), "26 of the last 30 days")
    }

    func testTodayCountsOnceItIsFull() {
        let today = "2026-11-10"
        let last30 = LIDate.dateRange(LIDate.addDays(today, -30), LIDate.addDays(today, -1))
        let c = Challenges.consistency(status(last30 + [today]), today: today, from: "2026-08-01")
        XCTAssertEqual(c.full, 30)
        XCTAssertEqual(c.days, 30)
        let open = Challenges.consistency(status(last30), today: today, from: "2026-08-01")
        XCTAssertEqual(open.full, 30)
        XCTAssertEqual(open.days, 30)
    }

    func testOneSlipCostsOneDayNotTheWholeStreak() {
        let today = "2026-11-10"
        let slipDay = LIDate.addDays(today, -1)
        let last30 = LIDate.dateRange(LIDate.addDays(today, -30), LIDate.addDays(today, -1))
        let s = status(last30.filter { $0 != slipDay }, [slipDay])
        let c = Challenges.consistency(s, today: today, from: "2026-08-01")
        XCTAssertEqual(c.full, 29)
        XCTAssertEqual(c.partial, 1)
        XCTAssertEqual(c.days, 30)
        XCTAssertEqual(Streaks.fullDayStreak(s, today: today, from: "2026-08-01"), 0)
    }

    func testIsHonestEarlyOn() {
        let today = "2026-11-10"
        let s = status(["2026-11-07", "2026-11-08"], ["2026-11-09"])
        let c = Challenges.consistency(s, today: today, from: "2026-11-07")
        XCTAssertEqual(c, Consistency(full: 2, partial: 1, days: 3, window: 30, percent: 67))
        XCTAssertEqual(Challenges.consistencyLabel(c), "2 of 3 days")
        XCTAssertEqual(Challenges.consistencyLabel(Challenges.consistency([:], today: today, from: today)), "First day")
    }

    func testStatusByDateScoresTheHistory() {
        let a = makeItem(id: "a")
        let logs = [tick("a", "2026-10-05"), tick("a", "2026-10-07")]
        let s = Challenges.statusByDate(historyStart: "2026-10-05", today: "2026-10-07", items: [a], versions: [], logs: logs)
        XCTAssertEqual(s["2026-10-05"], .full)
        XCTAssertEqual(s["2026-10-06"], .missed)
        XCTAssertEqual(s["2026-10-07"], .full)
        XCTAssertTrue(Challenges.statusByDate(historyStart: "2026-10-09", today: "2026-10-07", items: [a], versions: [], logs: logs).isEmpty)
    }
}
