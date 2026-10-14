import XCTest
@testable import LockInKit

final class FocusTests: XCTestCase {
    let MIN = 60_000.0
    var HOUR: Double { return 60 * MIN }
    // 2026-10-05 20:00 in New York (EDT, UTC-4). A Monday.
    var T0: Double { return iso("2026-10-06T00:00:00.000Z").timeIntervalSince1970 * 1000.0 }

    func live0(planned: Double? = nil) -> FocusLiveTimer {
        return Focus.newLive(id: "s1", startedAt: T0, label: "Study", plannedSeconds: planned)
    }

    func session(_ id: String, createdAt: String, label: String? = nil, blockId: String? = nil, live: FocusLive? = nil) -> FocusSession {
        return FocusSession(id: id, createdAt: createdAt, date: "2026-10-05", start: "20:00", end: nil, minutes: 0, label: label, source: .timer, blockId: blockId, live: live)
    }

    func liveRow(_ l: FocusLiveTimer, rev: Double) -> FocusSession {
        let state = FocusLive(startedAt: l.startedAt, plannedSeconds: l.plannedSeconds, pauses: l.pauses, aways: l.aways, rev: rev)
        return session(l.id, createdAt: LIDate.nowIso(Date(timeIntervalSince1970: (l.startedAt + 400) / 1000.0)), label: l.label, live: state)
    }

    // MARK: clock

    func testCountsFromTimestamps() {
        let c = Focus.clockOf(live0(), now: T0 + 25 * MIN + 7000)
        XCTAssertEqual(c.focusedSeconds, 25 * 60 + 7)
        XCTAssertNil(c.remaining)
    }

    func testPauseAndResumeTakeThePausedTimeOut() {
        var l = Focus.pause(live0(), now: T0 + 10 * MIN)
        XCTAssertEqual(Focus.clockOf(l, now: T0 + 30 * MIN).focusedSeconds, 600)
        XCTAssertTrue(Focus.clockOf(l, now: T0 + 30 * MIN).paused)
        l = Focus.resume(l, now: T0 + 30 * MIN)
        let c = Focus.clockOf(l, now: T0 + 40 * MIN)
        XCTAssertEqual(c.focusedSeconds, 20 * 60)
        XCTAssertEqual(c.pausedSeconds, 20 * 60)
        XCTAssertEqual(c.clockSeconds, 40 * 60)
        XCTAssertEqual(Focus.pause(Focus.pause(live0(), now: T0), now: T0 + 5).pauses.count, 1)
    }

    func testCountsDownAgainstFocusedTime() {
        let l = live0(planned: 25 * 60)
        XCTAssertEqual(Focus.clockOf(l, now: T0 + 10 * MIN).remaining, 15 * 60)
        let over = Focus.clockOf(l, now: T0 + 27 * MIN)
        XCTAssertEqual(over.remaining, 0)
        XCTAssertEqual(over.overBy, 120)
        XCTAssertEqual(over.progress, 1)
    }

    func testRebuildsFromTheRowOnADeviceWithNoSavedState() {
        let row = session("r", createdAt: LIDate.nowIso(Date(timeIntervalSince1970: T0 / 1000.0)), label: nil, blockId: "b")
        let l = Focus.liveFromRow(row)
        XCTAssertEqual(l.startedAt, T0)
        XCTAssertEqual(l.label, "Study")
        XCTAssertEqual(l.blockId, "b")
    }

    func testPausingAtTheInstantOnScreenKeepsTheNumber() {
        let drawn = T0 + 10 * MIN + 200
        let l = Focus.pause(live0(), now: drawn)
        for at in [drawn, drawn + 700, drawn + 1300, drawn + 60000] {
            XCTAssertEqual(Focus.clockOf(l, now: at).focusedSeconds, 600)
        }
        let counting = Focus.pause(live0(planned: 25 * 60), now: drawn)
        XCTAssertEqual(Focus.clockOf(counting, now: drawn + 5000).remaining, Focus.clockOf(counting, now: drawn).remaining)
    }

    func testAPauseNeverStartsBeforeTheLastOneEnded() {
        let once = Focus.resume(Focus.pause(live0(), now: T0 + 5 * MIN), now: T0 + 6 * MIN)
        let again = Focus.pause(once, now: T0 + 6 * MIN - 800)
        XCTAssertEqual(again.pauses[1].from, T0 + 6 * MIN)
        XCTAssertEqual(Focus.clockOf(again, now: T0 + 9 * MIN).pausedSeconds, 4 * 60)
        XCTAssertEqual(Focus.clockOf(again, now: T0 + 9 * MIN).focusedSeconds, 5 * 60)
    }

    func testKeepsPausesAndTimeAwayOnTheRow() {
        var l = Focus.pause(Focus.newLive(id: "s1", startedAt: T0, label: "Study", plannedSeconds: 45 * 60), now: T0 + 5 * MIN)
        l.rev = T0
        l = Focus.resume(l, now: T0 + 8 * MIN)
        l = Focus.comeBack(Focus.leave(l, now: T0 + 10 * MIN), now: T0 + 12 * MIN)
        let there = Focus.liveFromRow(liveRow(l, rev: T0 + 12 * MIN))
        XCTAssertEqual(there.startedAt, T0)
        XCTAssertEqual(there.plannedSeconds, 45 * 60)
        XCTAssertEqual(Focus.clockOf(there, now: T0 + 20 * MIN), Focus.clockOf(l, now: T0 + 20 * MIN))
        let c = Focus.clockOf(there, now: T0 + 20 * MIN)
        XCTAssertEqual(c.pausedSeconds, 180)
        XCTAssertEqual(c.awayCount, 1)
        XCTAssertEqual(c.awaySeconds, 120)
        XCTAssertEqual(c.focusedSeconds, 15 * 60)
    }

    func testStateJSONKeepsAnExplicitNullForAnOpenPause() {
        let l = Focus.pause(live0(), now: T0 + MIN)
        guard case .object(let o) = Focus.stateJSON(l), case .array(let pauses)? = o["pauses"], case .object(let p)? = pauses.first else {
            return XCTFail("state should be an object with pauses")
        }
        XCTAssertEqual(p["to"], .null)
        XCTAssertEqual(p["from"], .number(T0 + MIN))
        XCTAssertEqual(o["planned_seconds"], .null)
        XCTAssertEqual(o["started_at"], .number(T0))
        XCTAssertEqual(o["rev"], .number(T0))
    }

    func testBelievesTheNewerOfTheDeviceCopyAndTheRow() {
        var base = live0()
        base.rev = T0 + 1000
        let paused = Focus.pause(base, now: T0 + 2000)
        func row(_ rev: Double?) -> FocusSession {
            var r = session(base.id, createdAt: LIDate.nowIso(Date(timeIntervalSince1970: T0 / 1000.0)), label: "Study")
            if let rev = rev {
                r.live = FocusLive(startedAt: paused.startedAt, plannedSeconds: nil, pauses: paused.pauses, aways: [], rev: rev)
            }
            return r
        }
        XCTAssertEqual(Focus.pickLive(saved: base, row: row(T0 + 500)).from, .device)
        XCTAssertEqual(Focus.pickLive(saved: base, row: row(T0 + 1000)).from, .device)
        XCTAssertEqual(Focus.pickLive(saved: base, row: row(nil)).from, .device)
        let newer = Focus.pickLive(saved: base, row: row(T0 + 5000))
        XCTAssertEqual(newer.from, .row)
        XCTAssertTrue(Focus.isPaused(newer.live))
        XCTAssertEqual(Focus.pickLive(saved: nil, row: row(T0 + 500)).from, .row)
        var other = base
        other.id = "another"
        XCTAssertEqual(Focus.pickLive(saved: other, row: row(T0 + 500)).from, .row)
    }

    // MARK: leaving the app

    func testRecordsTimeAwayAndTakesItOffFocusedTime() {
        var l = Focus.leave(live0(), now: T0 + 10 * MIN)
        l = Focus.comeBack(l, now: T0 + 14 * MIN)
        let c = Focus.clockOf(l, now: T0 + 20 * MIN)
        XCTAssertEqual(c.awayCount, 1)
        XCTAssertEqual(c.awaySeconds, 240)
        XCTAssertEqual(c.focusedSeconds, 16 * 60)
        XCTAssertEqual(Focus.pendingAway(l)?.from, T0 + 10 * MIN)
    }

    func testGivesTheTimeBackWhenTheUserSaysTheyWereWorking() {
        var l = Focus.comeBack(Focus.leave(live0(), now: T0 + 10 * MIN), now: T0 + 14 * MIN)
        l = Focus.reviewAways(l, counted: true)
        let c = Focus.clockOf(l, now: T0 + 20 * MIN)
        XCTAssertEqual(c.focusedSeconds, 20 * 60)
        XCTAssertEqual(c.awaySeconds, 240)
        XCTAssertNil(Focus.pendingAway(l))
    }

    func testDropsABlipAndIgnoresLeavingWhilePaused() {
        let blip = Focus.comeBack(Focus.leave(live0(), now: T0 + MIN), now: T0 + MIN + 3000)
        XCTAssertEqual(blip.aways.count, 0)
        let paused = Focus.leave(Focus.pause(live0(), now: T0 + MIN), now: T0 + 2 * MIN)
        XCTAssertEqual(paused.aways.count, 0)
    }

    func testAnOpenAwayIsAlreadyOffTheClock() {
        let l = Focus.leave(live0(), now: T0 + 10 * MIN)
        XCTAssertEqual(Focus.clockOf(l, now: T0 + 30 * MIN).focusedSeconds, 600)
    }

    // MARK: strict mode

    func gone(_ ms: Double) -> FocusLiveTimer {
        return Focus.comeBack(Focus.leave(live0(), now: T0 + 10 * MIN), now: T0 + 10 * MIN + ms)
    }

    func testStrictIsOffByDefaultAndLetsAShortLeaveThrough() {
        XCTAssertNil(Focus.strictBreach(gone(5 * MIN), mode: .off, graceSeconds: 30, now: T0 + HOUR))
        XCTAssertNil(Focus.strictBreach(gone(20_000), mode: .end, graceSeconds: 30, now: T0 + HOUR))
    }

    func testStrictEndsAtTheMomentOfLeavingOrVoids() {
        XCTAssertEqual(Focus.strictBreach(gone(5 * MIN), mode: .end, graceSeconds: 30, now: T0 + HOUR), FocusStrictResult(action: .end, at: T0 + 10 * MIN, awaySeconds: 300))
        XCTAssertEqual(Focus.strictBreach(gone(5 * MIN), mode: .void, graceSeconds: 60, now: T0 + HOUR)?.action, .void)
    }

    func testStrictDoesNotFireAgainForAnAwayAlreadyAnswered() {
        XCTAssertNil(Focus.strictBreach(Focus.reviewAways(gone(5 * MIN), counted: false), mode: .end, graceSeconds: 30, now: T0 + HOUR))
    }

    // MARK: left running overnight

    func testCaughtByTheLongAwayAndCappedAtWhenTheUserLeft() {
        let l = Focus.leave(live0(), now: T0 + 50 * MIN)
        let s = Focus.staleInfo(l, now: T0 + 9 * HOUR)
        XCTAssertEqual(s?.reason, .away)
        XCTAssertEqual(s?.suggestedMinutes, 50)
        XCTAssertEqual(s?.endedAt, T0 + 50 * MIN)
        XCTAssertEqual(s?.clockMinutes, 540)
    }

    func testStillAsksAfterTheAppHasComeBack() {
        let l = Focus.comeBack(Focus.leave(live0(), now: T0 + 50 * MIN), now: T0 + 9 * HOUR)
        XCTAssertEqual(Focus.staleInfo(l, now: T0 + 9 * HOUR + 5000)?.suggestedMinutes, 50)
    }

    func testCapsASessionWithNoAwayRecordAtSixHoursOrItsPlannedLength() {
        let s = Focus.staleInfo(live0(), now: T0 + 9 * HOUR)
        XCTAssertEqual(s?.reason, .long)
        XCTAssertEqual(s?.suggestedMinutes, 360)
        XCTAssertEqual(Focus.staleInfo(live0(planned: 45 * 60), now: T0 + 9 * HOUR)?.suggestedMinutes, 45)
    }

    func testLeavesAnHonestSessionAlone() {
        XCTAssertNil(Focus.staleInfo(live0(), now: T0 + 3 * HOUR))
        XCTAssertNil(Focus.staleInfo(Focus.comeBack(Focus.leave(live0(), now: T0 + MIN), now: T0 + 20 * MIN), now: T0 + HOUR))
    }

    // MARK: finish

    func testLogsFocusedMinutesAndKeepsClockAndAwayTimeApart() {
        var l = Focus.comeBack(Focus.leave(live0(), now: T0 + 10 * MIN), now: T0 + 14 * MIN)
        l = Focus.resume(Focus.pause(l, now: T0 + 20 * MIN), now: T0 + 26 * MIN)
        let f = Focus.finish(l, at: T0 + 60 * MIN)
        XCTAssertTrue(f.log)
        XCTAssertEqual(f.end, "21:00")
        XCTAssertEqual(f.minutes, 50)
        XCTAssertEqual(f.meta, FocusSessionMeta(clockMinutes: 60, awayCount: 1, awayMinutes: 4, plannedMinutes: nil, completed: false))
        let p = f.patch()
        XCTAssertEqual(p["live"], .null)
        XCTAssertEqual(p["minutes"], .number(50))
        XCTAssertEqual(p["planned_minutes"], .null)
    }

    func testClosesAnOpenPauseAtTheFinish() {
        XCTAssertEqual(Focus.finish(Focus.pause(live0(), now: T0 + 30 * MIN), at: T0 + 50 * MIN).minutes, 30)
    }

    func testDoesNotLogUnderAMinute() {
        XCTAssertFalse(Focus.finish(live0(), at: T0 + 40_000).log)
    }

    func testMarksACountdownCompleted() {
        let l = Focus.newLive(id: "s", startedAt: T0, label: "Study", plannedSeconds: 25 * 60, blockId: "b")
        XCTAssertTrue(Focus.finish(l, at: T0 + 25 * MIN).meta.completed)
        XCTAssertFalse(Focus.finish(l, at: T0 + 12 * MIN).meta.completed)
        // A length the user typed in is their word, so the countdown no longer vouches for it.
        XCTAssertEqual(Focus.finish(l, at: T0 + 25 * MIN).patch(minutes: 30)["completed"], .bool(false))
    }

    func testASessionCrossingMidnightKeepsItsStartDate() {
        let start = iso("2026-10-06T03:30:00.000Z").timeIntervalSince1970 * 1000.0
        let row = Focus.startRow(now: start, label: "Study", blockId: nil)
        XCTAssertEqual(row["date"], .string("2026-10-05"))
        XCTAssertEqual(row["start"], .string("23:30"))
        XCTAssertEqual(row["end"], .null)
        XCTAssertEqual(row["source"], .string("timer"))
        XCTAssertEqual(row["created_at"]?.stringValue.flatMap { iso($0).timeIntervalSince1970 * 1000.0 }, start)
        let f = Focus.finish(Focus.newLive(id: "s", startedAt: start, label: "Study"), at: start + 75 * MIN)
        XCTAssertEqual(f.end, "00:45")
        XCTAssertEqual(f.minutes, 75)
        let done = FocusSession(id: "s", createdAt: "", date: "2026-10-05", start: "23:30", end: f.end, minutes: f.minutes)
        XCTAssertEqual(Focus.minutesOn([done], "2026-10-05"), 75)
        XCTAssertEqual(Focus.minutesOn([done], "2026-10-06"), 0)
    }

    func testStartRowCarriesTheLiveState() {
        let l = Focus.newLive(id: "s", startedAt: T0, label: "Study", plannedSeconds: 45 * 60)
        let row = Focus.startRow(now: T0, label: "Study", blockId: "b1", live: l)
        XCTAssertEqual(row["planned_minutes"], .number(45))
        XCTAssertEqual(row["block_id"], .string("b1"))
        XCTAssertNotEqual(row["live"], .null)
    }

    // MARK: by hand

    func testValidatesAManualEntry() {
        XCTAssertTrue((Focus.manualProblem(date: "2026-10-06", minutes: 30, today: "2026-10-05") ?? "").contains("not happened"))
        XCTAssertTrue((Focus.manualProblem(date: "2026-10-05", minutes: nil, today: "2026-10-05") ?? "").contains("minutes"))
        XCTAssertTrue((Focus.manualProblem(date: "2026-10-05", minutes: 2000, today: "2026-10-05") ?? "").contains("16 hours"))
        XCTAssertNil(Focus.manualProblem(date: "2026-10-04", minutes: 90, today: "2026-10-05"))
    }

    func testBuildsAndEditsRows() {
        let row = Focus.manualRow(date: "2026-10-05", minutes: 90, label: "  ", start: "23:00")
        XCTAssertEqual(row["end"], .string("00:30"))
        XCTAssertEqual(row["minutes"], .number(90))
        XCTAssertEqual(row["label"], .string("Study"))
        XCTAssertEqual(row["source"], .string("manual"))
        let patch = Focus.editPatch(start: "20:00", date: "2026-10-04", minutes: 45, label: "Homework")
        XCTAssertEqual(patch["end"], .string("20:45"))
        XCTAssertEqual(patch["label"], .string("Homework"))
        XCTAssertEqual(patch["date"], .string("2026-10-04"))
    }

    func testCleanLabelRemovesDashesAndCapsLength() {
        XCTAssertEqual(Focus.cleanLabel("a\u{2014}b"), "a, b")
        XCTAssertEqual(Focus.cleanLabel(nil), "Study")
        XCTAssertEqual(Focus.cleanLabel(String(repeating: "x", count: 80)).count, 40)
    }

    // MARK: totals

    var sessions: [FocusSession] {
        return [
            FocusSession(id: "a", date: "2026-10-05", start: "09:00", end: "10:00", minutes: 30),
            FocusSession(id: "b", date: "2026-10-05", start: "20:00", end: "21:00", minutes: 45),
            FocusSession(id: "c", date: "2026-10-05", start: "22:00", end: nil, minutes: 0),
            FocusSession(id: "d", date: "2026-10-07", start: "08:00", end: "09:00", minutes: 20),
        ]
    }

    func testSumsADaySkippingTheRunningTimer() {
        XCTAssertEqual(Focus.minutesOn(sessions, "2026-10-05"), 75)
    }

    func testLaysTheWeekOutMondayToSunday() {
        let w = Focus.weekByDay(sessions, today: "2026-10-07", goal: 60, live: ("2026-10-07", 10))
        XCTAssertEqual(w.map { $0.minutes }, [75, 0, 30, 0, 0, 0, 0])
        XCTAssertTrue(w[0].met)
        XCTAssertTrue(w[2].today)
        XCTAssertFalse(w[2].met)
        XCTAssertTrue(w[3].future)
    }

    func testGoalProgress() {
        XCTAssertEqual(Focus.goalProgress(minutes: 30, goal: 60), 0.5)
        XCTAssertEqual(Focus.goalProgress(minutes: 90, goal: 60), 1)
        XCTAssertEqual(Focus.goalProgress(minutes: 5, goal: 0), 1)
        XCTAssertEqual(Focus.goalProgress(minutes: 0, goal: 0), 0)
    }

    // MARK: study tick

    func testStudyTick() {
        func d(_ minutes: Int = 0, blockCompleted: Bool = false, checked: Bool = false, auto: Bool = false) -> FocusTickDecision {
            return Focus.studyTick(minutes: minutes, goal: 60, blockCompleted: blockCompleted, checked: checked, autoTicked: auto)
        }
        XCTAssertEqual(d(60), .tick)
        XCTAssertEqual(d(20, blockCompleted: true), .tick)
        XCTAssertEqual(d(59), .none)
        XCTAssertEqual(d(90, checked: true), .none)
        // Never unticks a tick made by hand.
        XCTAssertEqual(d(0, checked: true), .none)
        // Takes back its own tick when the minutes are gone.
        XCTAssertEqual(d(10, checked: true, auto: true), .untick)
    }

    // MARK: live study block

    func testFindsTheLiveStudyBlockWithTheTimeLeft() {
        let blocks = Blocks.blocksFromRows([
            ScheduleBlock(id: "a", date: "2026-10-05", blockName: "Delivery", start: "17:00", end: "20:00", duration: 180, kind: .delivery),
            ScheduleBlock(id: "b", date: "2026-10-05", blockName: "Study, homework, business", start: "20:00", end: "23:00", duration: 180, kind: .study),
        ])
        let hit = Focus.liveStudyBlock(blocks, nowSeconds: 20 * 3600 + 1800)
        XCTAssertEqual(hit?.block.id, "b")
        XCTAssertEqual(hit?.remainingSeconds, 9000)
        XCTAssertNil(Focus.liveStudyBlock(blocks, nowSeconds: 19 * 3600))
        XCTAssertNil(Focus.liveStudyBlock(blocks, nowSeconds: 23 * 3600 - 20))
    }

    // MARK: formatting

    func testFormatsPlainly() {
        XCTAssertEqual(Focus.formatAway(45), "45s")
        XCTAssertEqual(Focus.formatAway(250), "4m 10s")
        XCTAssertEqual(Focus.formatAway(3900), "1h 5m")
        XCTAssertEqual(Focus.formatCountdown(754), "12:34")
        XCTAssertEqual(Focus.formatCountdown(3909), "1:05:09")
        XCTAssertEqual(Focus.formatCountdown(-5), "0:00")
    }
}
