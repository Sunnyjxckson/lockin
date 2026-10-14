import XCTest
@testable import LockInKit

final class ProgressRulesTests: XCTestCase {
    // 2026-10-05 is a Monday.
    let start = "2026-10-05"
    func day(_ n: Int) -> String { return LIDate.addDays(start, n - 1) }

    var a: ChecklistItem { return makeItem(id: "a", name: "Workout", sortOrder: 1) }
    var b: ChecklistItem {
        var i = makeItem(id: "b", name: "No smoking", category: .vice, sortOrder: 2)
        i.mode = .quit
        return i
    }
    var p: ChecklistItem { return makeItem(id: "p", name: "Protein", type: .number, target: .min(180), unit: "g", sortOrder: 3) }
    var w: ChecklistItem { return makeItem(id: "w", name: "Weigh-in", cadence: .weekly, sortOrder: 4) }
    var items: [ChecklistItem] { return [a, b, p, w] }

    func input(_ today: String, _ logs: [DayLog], items over: [ChecklistItem]? = nil, versions: [TargetVersion] = [], startDate: String? = nil, length: Int = 30) -> ProgressInput {
        return ProgressInput(startDate: startDate ?? start, lengthDays: length, today: today, items: over ?? items, versions: versions, logs: LogIndex(logs))
    }

    func fullDay(_ n: Int) -> [DayLog] {
        return [tick("a", day(n)), tick("b", day(n)), makeLog("p", day(n), value: 190, checked: true)]
    }

    func testCellKind() {
        XCTAssertEqual(ProgressRules.cellKind(.missed, date: day(3), today: day(3)), .open)
        XCTAssertEqual(ProgressRules.cellKind(.partial, date: day(3), today: day(3)), .partial)
        XCTAssertEqual(ProgressRules.cellKind(.missed, date: day(2), today: day(3)), .missed)
        XCTAssertEqual(ProgressRules.cellKind(.missed, date: day(4), today: day(3)), .future)
    }

    func testGridSize() {
        XCTAssertEqual(ProgressRules.buildGrid(input(day(1), [])).cells.count, 30)
        XCTAssertEqual(ProgressRules.buildGrid(input(day(1), [], length: 45)).cells.count, 45)
        XCTAssertEqual(ProgressRules.buildGrid(input(day(1), [], length: 0)).cells.count, 0)
    }

    func testGridKinds() {
        let logs = fullDay(1) + [tick("a", day(2)), tick("a", day(4))]
        let g = ProgressRules.buildGrid(input(day(4), logs))
        XCTAssertEqual(g.cells.prefix(5).map { $0.kind }, [.full, .partial, .missed, .partial, .future])
        XCTAssertTrue(g.cells[3].isToday)
        XCTAssertEqual(g.cells[1].day, 2)
        XCTAssertEqual(g.cells[1].done, 1)
        XCTAssertEqual(g.cells[1].total, 3)
        XCTAssertEqual(g.cells[1].percent, 33)
        XCTAssertNil(g.cells[4].summary)
        XCTAssertEqual(g.todayDay, 4)
    }

    func testTodayOpenWhenNothingLogged() {
        XCTAssertEqual(ProgressRules.buildGrid(input(day(2), fullDay(1))).cells[1].kind, .open)
    }

    func testLead() {
        XCTAssertEqual(ProgressRules.buildGrid(input(day(1), [])).lead, 0)
        XCTAssertEqual(ProgressRules.buildGrid(input("2026-10-08", [], startDate: "2026-10-08")).lead, 3)
        XCTAssertEqual(ProgressRules.buildGrid(input("2026-10-11", [], startDate: "2026-10-11")).lead, 6)
    }

    func testBeforeStartAndAfterEnd() {
        let before = ProgressRules.buildGrid(input(LIDate.addDays(start, -2), []))
        XCTAssertTrue(before.cells.allSatisfy { $0.kind == .future })
        XCTAssertNil(before.todayDay)
        let after = ProgressRules.buildGrid(input(day(31), []))
        XCTAssertTrue(after.cells.allSatisfy { $0.kind == .missed })
        XCTAssertNil(after.todayDay)
    }

    func testPastDayUsesTargetOfThatDay() {
        let versions = [makeVersion("p", "2000-01-01", .min(150)), makeVersion("p", day(3), .min(180))]
        let logs = [makeLog("p", day(1), value: 160, checked: true), makeLog("p", day(3), value: 160, checked: true)]
        let g = ProgressRules.buildGrid(input(day(4), logs, items: [p], versions: versions))
        XCTAssertEqual(g.cells[0].kind, .full)
        XCTAssertEqual(g.cells[2].kind, .missed)
    }

    func testItemNotCountedBeforeItWasAdded() {
        let versions = [makeVersion("a", "2000-01-01", .check), makeVersion("b", day(3), .check)]
        let g = ProgressRules.buildGrid(input(day(3), [tick("a", day(1))], items: [a, b], versions: versions))
        XCTAssertEqual(g.cells[0].kind, .full)
        XCTAssertEqual(g.cells[0].total, 1)
        XCTAssertEqual(g.cells[2].total, 2)
    }

    func run(_ today: String, _ logs: [DayLog], items over: [ChecklistItem]? = nil, startDate: String? = nil, length: Int = 30) -> ProgressHeadline {
        let i = input(today, logs, items: over, startDate: startDate, length: length)
        return ProgressRules.headline(ProgressRules.buildGrid(i), startDate: i.startDate, today: today)
    }

    func testHeadlineCounts() {
        let logs = fullDay(1) + [tick("a", day(2))] + fullDay(4)
        let h = run(day(5), logs)
        XCTAssertEqual(h.day, 5)
        XCTAssertEqual(h.length, 30)
        XCTAssertEqual(h.lockedIn, 2)
        XCTAssertEqual(h.partial, 1)
        XCTAssertEqual(h.missed, 1)
        XCTAssertEqual(h.remaining, 25)
        XCTAssertTrue(h.started)
        XCTAssertFalse(h.finished)
        XCTAssertEqual(h.percent, 58)
    }

    func testHeadlineTodayRunning() {
        let h = run(day(2), fullDay(1) + [tick("a", day(2))])
        XCTAssertEqual(h.partial, 0)
        XCTAssertEqual(h.missed, 0)
        XCTAssertEqual(h.percent, 100)
        XCTAssertEqual(run(day(2), fullDay(1) + fullDay(2)).lockedIn, 2)
    }

    func testHeadlineDayOne() {
        let h = run(day(1), [tick("a", day(1))])
        XCTAssertEqual(h.percent, 33)
        XCTAssertEqual(h.day, 1)
        XCTAssertEqual(h.lockedIn, 0)
        XCTAssertEqual(h.remaining, 29)
    }

    func testHeadlineEdges() {
        let early = run(LIDate.addDays(start, -3), [])
        XCTAssertEqual(early.day, 0)
        XCTAssertFalse(early.started)
        XCTAssertEqual(early.remaining, 30)
        XCTAssertEqual(early.percent, 0)
        let late = run(day(40), fullDay(1))
        XCTAssertEqual(late.day, 30)
        XCTAssertTrue(late.finished)
        XCTAssertEqual(late.remaining, 0)
        XCTAssertEqual(late.lockedIn, 1)
        XCTAssertEqual(late.missed, 29)
    }

    func testWeeklyRollupsSplit() {
        let i = input(day(1), [])
        let weeks = ProgressRules.weeklyRollups(ProgressRules.buildGrid(i), i)
        XCTAssertEqual(weeks.count, 5)
        XCTAssertEqual(weeks[0].index, 1)
        XCTAssertEqual(weeks[0].from, day(1))
        XCTAssertEqual(weeks[0].to, day(7))
        XCTAssertEqual(weeks[0].state, .current)
        XCTAssertEqual(weeks[4].from, day(29))
        XCTAssertEqual(weeks[4].to, day(30))
        XCTAssertEqual(weeks[4].state, .future)
        XCTAssertNil(weeks[4].percent)
    }

    func testWeeklyRollupsClipFirstWeek() {
        let i = input("2026-10-08", [], startDate: "2026-10-08", length: 10)
        let weeks = ProgressRules.weeklyRollups(ProgressRules.buildGrid(i), i)
        XCTAssertEqual(weeks.map { $0.from }, ["2026-10-08", "2026-10-12"])
        XCTAssertEqual(weeks.map { $0.to }, ["2026-10-11", "2026-10-17"])
        XCTAssertEqual(weeks[0].weekStart, "2026-10-05")
    }

    func testWeeklyRollupNumbers() {
        let logs = fullDay(1) + [tick("a", day(2)), tick("w", day(5))] + fullDay(8)
        let i = input(day(9), logs)
        let weeks = ProgressRules.weeklyRollups(ProgressRules.buildGrid(i), i)
        let w1 = weeks[0]
        XCTAssertEqual(w1.state, .past)
        XCTAssertEqual([w1.full, w1.partial, w1.missed, w1.done, w1.total], [1, 1, 5, 4, 21])
        XCTAssertEqual(w1.percent, 19)
        XCTAssertEqual([w1.weeklyDone, w1.weeklyTotal], [1, 1])
        XCTAssertEqual(w1.weekly[0].doneOn, day(5))
        let w2 = weeks[1]
        XCTAssertEqual(w2.state, .current)
        XCTAssertEqual([w2.full, w2.partial, w2.missed, w2.done, w2.total], [1, 0, 0, 3, 3])
        XCTAssertEqual(w2.percent, 100)
        XCTAssertEqual([w2.weeklyDone, w2.weeklyTotal], [0, 1])
        XCTAssertEqual(weeks[2].state, .future)
        XCTAssertTrue(weeks[2].weekly.isEmpty)
    }

    func rates(_ today: String, _ logs: [DayLog], items over: [ChecklistItem]? = nil, versions: [TargetVersion] = []) -> [ItemRate] {
        let i = input(today, logs, items: over, versions: versions)
        let g = ProgressRules.buildGrid(i)
        return ProgressRules.itemRates(g, ProgressRules.weeklyRollups(g, i), i)
    }

    func rate(_ rows: [ItemRate], _ id: String) -> ItemRate {
        return rows.first(where: { $0.item.id == id })!
    }

    func testItemRates() {
        let logs = [tick("a", day(1)), tick("a", day(2)), tick("a", day(3)), tick("b", day(1)), makeLog("p", day(2), value: 100, checked: true)]
        let rows = rates(day(4), logs)
        XCTAssertEqual(rate(rows, "a").done, 3)
        XCTAssertEqual(rate(rows, "a").total, 3)
        XCTAssertEqual(rate(rows, "a").rate, 1)
        XCTAssertEqual(rate(rows, "a").unit, .day)
        XCTAssertEqual(rate(rows, "b").done, 1)
        XCTAssertEqual(rate(rows, "b").total, 3)
        XCTAssertEqual(rate(rows, "p").done, 0)
        XCTAssertEqual(rate(rows, "p").rate, 0)
        XCTAssertEqual(rows.map { $0.item.id }, ["p", "b", "a", "w"])
    }

    func testTodayCountsOnlyWhenDone() {
        let rows = rates(day(2), [tick("a", day(1)), tick("a", day(2))])
        XCTAssertEqual(rate(rows, "a").done, 2)
        XCTAssertEqual(rate(rows, "a").total, 2)
        XCTAssertEqual(rate(rows, "b").done, 0)
        XCTAssertEqual(rate(rows, "b").total, 1)
    }

    func testWeeklyItemRates() {
        let w3 = rate(rates(day(3), []), "w")
        XCTAssertEqual(w3.total, 0)
        XCTAssertNil(w3.rate)
        XCTAssertEqual(w3.unit, .week)
        let one = rate(rates(day(3), [tick("w", day(2))]), "w")
        XCTAssertEqual([one.done, one.total], [1, 1])
        XCTAssertEqual(one.rate, 1)
        let ten = rate(rates(day(10), [tick("w", day(2))]), "w")
        XCTAssertEqual([ten.done, ten.total], [1, 1])
        let fifteen = rate(rates(day(15), [tick("w", day(2))]), "w")
        XCTAssertEqual([fifteen.done, fifteen.total], [1, 2])
        XCTAssertEqual(fifteen.rate, 0.5)
    }

    func testRemovedItemKeepsPastDays() {
        let versions = [makeVersion("a", "2000-01-01", .check), makeVersion("a", day(3), .check, active: false)]
        var gone = a
        gone.active = false
        gone.archived = true
        let rows = rates(day(5), [tick("a", day(1))], items: [gone, b], versions: versions)
        XCTAssertEqual(rate(rows, "a").done, 1)
        XCTAssertEqual(rate(rows, "a").total, 2)
        XCTAssertFalse(rate(rows, "a").current)
        XCTAssertTrue(rate(rows, "b").current)
    }

    func testViceOffLeftOut() {
        let off = makeItem(id: "off", category: .vice, active: false)
        XCTAssertEqual(rates(day(3), [], items: [a, off]).map { $0.item.id }, ["a"])
    }

    func testStreakRowsOrder() {
        var logs: [DayLog] = [tick("a", day(1)), tick("a", day(2)), tick("a", day(3))]
        for n in 1...5 { logs.append(tick("b", day(n))) }
        for n in [1, 2, 3, 5] { logs.append(makeLog("p", day(n), value: 200, checked: true)) }
        let rows = ProgressRules.streakRows(input(day(6), logs))
        XCTAssertEqual(rows.map { $0.item.id }, ["a", "w", "p", "b"])
        XCTAssertEqual(rows.map { $0.health }, [.broken, .cold, .behind, .best])
        XCTAssertEqual(rows.map { $0.current }, [0, 0, 1, 5])
        XCTAssertEqual(rows.map { $0.best }, [3, 0, 3, 5])
        XCTAssertEqual(rows.first(where: { $0.item.id == "w" })?.unit, .week)
    }

    func testStreakRowsSkipOffAndRemoved() {
        let off = makeItem(id: "off", category: .vice, active: false)
        let gone = makeItem(id: "gone", archived: true)
        let rows = ProgressRules.streakRows(input(day(2), [], items: [a, b, off, gone]))
        XCTAssertEqual(rows.map { $0.item.id }, ["a", "b"])
    }

    func testStreakHealth() {
        XCTAssertEqual(ProgressRules.streakHealth(Streak(current: 0, best: 0, doneNow: false)), .cold)
        XCTAssertEqual(ProgressRules.streakHealth(Streak(current: 0, best: 2, doneNow: false)), .broken)
        XCTAssertEqual(ProgressRules.streakHealth(Streak(current: 1, best: 2, doneNow: true)), .behind)
        XCTAssertEqual(ProgressRules.streakHealth(Streak(current: 2, best: 2, doneNow: true)), .best)
    }

    // MARK: card

    func photo(_ date: String, _ ref: String?) -> BodyLog {
        return BodyLog(id: date, createdAt: "", date: date, weight: nil, photoUrl: ref)
    }

    func testPickPhotos() {
        let logs = [photo(day(12), "c"), photo(day(1), "a"), photo(day(5), nil), photo(day(8), "b")]
        let picked = ProgressRules.pickPhotos(logs, startDate: start, today: day(14))
        XCTAssertEqual(picked.before, CardPhoto(date: day(1), ref: "a", label: "Day 1"))
        XCTAssertEqual(picked.after, CardPhoto(date: day(12), ref: "c", label: "Day 12"))
        let one = ProgressRules.pickPhotos([photo(day(1), "a")], startDate: start, today: day(3))
        XCTAssertEqual(one.before?.label, "Day 1")
        XCTAssertNil(one.after)
        let none = ProgressRules.pickPhotos([photo(day(1), nil)], startDate: start, today: day(3))
        XCTAssertNil(none.before)
        XCTAssertNil(none.after)
        XCTAssertEqual(ProgressRules.pickPhotos([photo("2026-10-03", "a")], startDate: start, today: day(3)).before?.label, "Oct 3")
    }

    func testTopStreaks() {
        let logs = [1, 2, 3].map { tick("a", day($0)) } + [2, 3].map { tick("b", day($0)) } + [tick("w", day(1))]
        let rows = ProgressRules.streakRows(input(day(3), logs))
        XCTAssertEqual(ProgressRules.topStreaks(rows), [
            CardStreak(name: "Workout", current: 3, unit: .day),
            CardStreak(name: "No smoking", current: 2, unit: .day),
            CardStreak(name: "Weigh-in", current: 1, unit: .week),
        ])
        XCTAssertEqual(ProgressRules.topStreaks(rows, max: 1).count, 1)
        XCTAssertEqual(ProgressRules.topStreaks(ProgressRules.streakRows(input(day(1), []))), [])
    }

    func testCardFromModel() {
        let i = input(day(3), fullDay(1) + fullDay(2) + [tick("a", day(3))])
        let card = ProgressRules.cardData(ProgressRules.buildProgress(i), startDate: start, today: day(3), bodyLogs: [photo(day(1), "a")])
        XCTAssertEqual(card.day, 3)
        XCTAssertEqual(card.length, 30)
        XCTAssertEqual(card.percent, 100)
        XCTAssertEqual(card.lockedIn, 2)
        XCTAssertEqual(card.remaining, 27)
        XCTAssertEqual(card.range, "Oct 5 to Nov 3")
        XCTAssertEqual(card.lead, 0)
        XCTAssertTrue(card.started)
        XCTAssertEqual(card.cells.count, 30)
        XCTAssertEqual(card.cells[2], CardCell(kind: .partial, isToday: true))
        XCTAssertEqual(card.streaks[0], CardStreak(name: "Workout", current: 3, unit: .day))
        XCTAssertEqual(card.before?.ref, "a")
        XCTAssertNil(card.after)
    }

    func testCountLabel() {
        XCTAssertEqual(ProgressRules.countLabel(1, .day), "1 day")
        XCTAssertEqual(ProgressRules.countLabel(0, .day), "0 days")
        XCTAssertEqual(ProgressRules.countLabel(2, .week), "2 weeks")
    }
}

final class OngoingRulesTests: XCTestCase {
    func item(_ id: String, weekly: Bool = false) -> ChecklistItem {
        return makeItem(id: id, name: id, cadence: weekly ? .weekly : .daily)
    }

    /// History from Mon Sep 28. Everything done except: Oct 2 partial, Oct 6 missed. Today, Oct 9, is half done.
    func input(_ today: String = "2026-10-09") -> OngoingInput {
        var logs: [DayLog] = []
        for d in LIDate.dateRange("2026-09-28", LIDate.addDays(today, -1)) {
            if d == "2026-10-06" { continue }
            logs.append(tick("a", d))
            if d != "2026-10-02" { logs.append(tick("b", d)) }
        }
        logs.append(tick("a", today))
        logs.append(tick("wk", "2026-09-30"))
        return OngoingInput(historyStart: "2026-09-28", today: today, items: [item("a"), item("b"), item("wk", weekly: true)], versions: [], logs: LogIndex(logs))
    }

    func testCells() {
        let cells = OngoingRules.cells(input(), from: "2026-09-26", to: "2026-10-11")
        func kind(_ d: String) -> ProgressCellKind? { return cells.first(where: { $0.date == d })?.kind }
        XCTAssertEqual(kind("2026-09-27"), .before)
        XCTAssertEqual(kind("2026-09-28"), .full)
        XCTAssertEqual(kind("2026-10-02"), .partial)
        XCTAssertEqual(kind("2026-10-06"), .missed)
        XCTAssertEqual(kind("2026-10-09"), .partial)
        XCTAssertEqual(kind("2026-10-10"), .future)
        let today = cells.first(where: { $0.date == "2026-10-09" })!
        XCTAssertTrue(today.isToday)
        XCTAssertEqual(today.day, 9)
        XCTAssertEqual(today.done, 1)
        XCTAssertEqual(today.total, 2)
        XCTAssertNil(cells.first(where: { $0.date == "2026-09-27" })?.summary)
    }

    func testTodayOpen() {
        var base = input()
        let kept = base.logs.all.filter { $0.date != "2026-10-09" }
        base.logs = LogIndex(kept)
        XCTAssertEqual(OngoingRules.cells(base, from: "2026-10-09", to: "2026-10-09")[0].kind, .open)
    }

    func testTally() {
        let cells = OngoingRules.cells(input(), from: "2026-09-28", to: "2026-10-09")
        XCTAssertEqual(OngoingRules.tally(cells), DayTally(full: 9, partial: 1, missed: 1, days: 11, percent: 82))
        var done = input()
        done.logs = LogIndex(done.logs.all + [tick("b", "2026-10-09")])
        let t = OngoingRules.tally(OngoingRules.cells(done, from: "2026-09-28", to: "2026-10-09"))
        XCTAssertEqual(t.full, 10)
        XCTAssertEqual(t.days, 12)
        XCTAssertNil(OngoingRules.tally(OngoingRules.cells(input("2026-09-28"), from: "2026-09-28", to: "2026-09-28")).percent)
    }

    func testWeeks() {
        let weeks = OngoingRules.weeks(input())
        XCTAssertEqual(weeks.map { $0.weekStart }, ["2026-10-05", "2026-09-28"])
        XCTAssertEqual(weeks.map { $0.isCurrent }, [true, false])
        XCTAssertEqual(weeks[0].label, "Oct 5 to Oct 11")
        XCTAssertEqual([weeks[0].tally.full, weeks[0].tally.partial, weeks[0].tally.missed, weeks[0].tally.days], [3, 0, 1, 4])
        XCTAssertEqual([weeks[1].tally.full, weeks[1].tally.partial, weeks[1].tally.missed, weeks[1].tally.days], [6, 1, 0, 7])
        XCTAssertEqual(weeks[1].tally.percent, 86)
        XCTAssertEqual(weeks[0].cells.count, 7)
        XCTAssertEqual(weeks[1].weekly.map { $0.item.id }, ["wk"])
        XCTAssertEqual(weeks[1].weekly.map { $0.done }, [true])
        XCTAssertEqual(weeks[0].weeklyDone, 0)
    }

    func testWeeksFarIn() {
        var far = input("2027-10-08")
        far.logs = LogIndex([])
        let weeks = OngoingRules.weeks(far, max: 8)
        XCTAssertEqual(weeks.count, 8)
        XCTAssertEqual(weeks[0].weekStart, "2027-10-04")
        XCTAssertTrue(weeks[0].isCurrent)
        var before = input()
        before.today = "2026-09-20"
        XCTAssertTrue(OngoingRules.weeks(before).isEmpty)
    }

    func testMonths() {
        let months = OngoingRules.months(input())
        XCTAssertEqual(months.map { $0.key }, ["2026-10", "2026-09"])
        XCTAssertEqual(months.map { $0.label }, ["October 2026", "September 2026"])
        XCTAssertEqual(months[0].lead, 3)
        XCTAssertEqual(months[0].cells.count, 31)
        XCTAssertEqual([months[0].tally.full, months[0].tally.partial, months[0].tally.missed, months[0].tally.days], [6, 1, 1, 8])
        XCTAssertEqual(months[1].cells.count, 30)
        XCTAssertEqual(months[1].cells.filter { $0.kind == .before }.count, 27)
        XCTAssertEqual(months[1].tally.percent, 100)
    }

    func testMonthsAcrossYearEnd() {
        var i = input("2027-01-15")
        i.historyStart = "2026-11-20"
        i.logs = LogIndex([])
        XCTAssertEqual(OngoingRules.months(i).map { $0.key }, ["2027-01", "2026-12", "2026-11"])
    }

    func testHeadline() {
        let i = input()
        let h = OngoingRules.headline(OngoingRules.statusByDate(i), historyStart: i.historyStart, today: i.today)
        XCTAssertEqual(h.totalDays, 12)
        XCTAssertEqual(h.fullDays, 9)
        XCTAssertEqual(h.last30.full, 9)
        XCTAssertEqual(h.last30.partial, 1)
        XCTAssertEqual(h.last30.days, 11)
        XCTAssertEqual(h.last30.window, 30)
        XCTAssertEqual(h.last7.full, 5)
        XCTAssertEqual(h.last7.days, 7)
        XCTAssertEqual(h.fullStreak, 2)
        XCTAssertEqual(h.bestFullStreak, 4)
    }

    func testHeadlineFirstMorning() {
        let h = OngoingRules.headline(["2026-10-05": .missed], historyStart: "2026-10-05", today: "2026-10-05")
        XCTAssertEqual(h.totalDays, 1)
        XCTAssertEqual(h.fullDays, 0)
        XCTAssertEqual(h.fullStreak, 0)
        XCTAssertEqual(h.bestFullStreak, 0)
        XCTAssertEqual(h.last30.days, 0)
    }
}
