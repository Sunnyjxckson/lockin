import XCTest
@testable import LockInKit

private func q(_ id: String, _ writer: String = "w", work: String = "k", text: String = "", themes: [String] = [], moments: [String] = []) -> LibQuote {
    return LibQuote(id: id, text: text.isEmpty ? "Text of \(id)" : text, work: work, location: "1", plain: "", themes: themes, moments: moments, writer: writer)
}

private func read(_ id: String, at: String = "2026-03-02T15:00:00.000Z") -> QuoteMark {
    return QuoteMark(quoteId: id, writer: "w", work: "k", readAt: at)
}

final class LibraryTests: XCTestCase {
    // MARK: seeded order

    func testMulberryMatchesTheWeb() {
        let r = SeededRandom(seed: 7)
        XCTAssertEqual(r.next(), 0.011704753153026104, accuracy: 1e-12)
        XCTAssertEqual(r.next(), 0.06195825757458806, accuracy: 1e-12)
        XCTAssertEqual(r.next(), 0.97690763277933, accuracy: 1e-12)
    }

    func testShuffleMatchesTheWebAndLeavesInputAlone() {
        let input = Array(0..<10)
        XCTAssertEqual(LibraryQueue.shuffled(input, seed: 123), [0, 6, 5, 9, 4, 2, 8, 3, 1, 7])
        XCTAssertEqual(LibraryQueue.shuffled(input, seed: 1517), [6, 1, 8, 4, 0, 5, 3, 9, 2, 7])
        XCTAssertEqual(input, Array(0..<10))
    }

    // MARK: scopes

    func testScopeQueryRoundTrips() {
        let scopes: [LibraryScope] = [.writer("seneca", work: nil), .writer("seneca", work: "letters"), .theme("courage"), .moment("tired"), .shuffle(42), .saved]
        for s in scopes {
            XCTAssertEqual(LibraryScopes.scopeFromQuery(LibraryScopes.scopeQuery(s)), s)
        }
    }

    func testScopeQuotes() {
        let all = [q("a1", "a", themes: ["x"]), q("a2", "a", themes: ["y"]), q("b1", "b", themes: ["x"])]
        XCTAssertEqual(LibraryQueue.scopeQuotes(.writer("a", work: nil), all, [:]).map { $0.id }, ["a1", "a2"])
        XCTAssertEqual(LibraryQueue.scopeQuotes(.theme("x"), all, [:]).map { $0.id }, ["a1", "b1"])
        var marks: LibraryMarks = [:]
        marks["b1"] = QuoteMark(quoteId: "b1", writer: "b", work: "k", savedAt: "2026-03-02T10:00:00.000Z")
        XCTAssertEqual(LibraryQueue.scopeQuotes(.saved, all, marks).map { $0.id }, ["b1"])
    }

    func testInterleaveTakesTurns() {
        let list = [q("a1", "a"), q("a2", "a"), q("b1", "b"), q("b2", "b")]
        XCTAssertEqual(LibraryQueue.interleave(list).map { $0.id }, ["a1", "b1", "a2", "b2"])
    }

    // MARK: the queue

    func testFirstPassIsTheUnreadOnes() {
        let list = [q("a"), q("b"), q("c")]
        let queue = LibraryQueue.buildQueue(.writer("w", work: nil), list, ["b": read("b")])
        XCTAssertEqual(queue.ids, ["a", "c"])
        XCTAssertEqual(queue.pass, 1)
        XCTAssertFalse(queue.review)
        XCTAssertEqual(queue.start, 0)
    }

    func testSecondPassStartsAfterWhereYouLeftOff() {
        let list = [q("a"), q("b"), q("c")]
        let marks: LibraryMarks = ["a": read("a"), "b": read("b"), "c": read("c")]
        let queue = LibraryQueue.buildQueue(.writer("w", work: nil), list, marks, startAt: nil, after: "a")
        XCTAssertEqual(queue.pass, 2)
        XCTAssertEqual(queue.ids, ["a", "b", "c"])
        XCTAssertEqual(queue.start, 1)
        let wrap = LibraryQueue.buildQueue(.writer("w", work: nil), list, marks, startAt: nil, after: "c")
        XCTAssertEqual(wrap.start, 0)
    }

    func testStartAtOpensOnAReadQuote() {
        let list = [q("a"), q("b"), q("c")]
        let queue = LibraryQueue.buildQueue(.writer("w", work: nil), list, ["b": read("b")], startAt: "b")
        XCTAssertEqual(queue.ids.first, "b")
        XCTAssertEqual(queue.start, 0)
    }

    func testSavedIsAReview() {
        let list = [q("a"), q("b")]
        let queue = LibraryQueue.buildQueue(.saved, list, [:])
        XCTAssertTrue(queue.review)
        XCTAssertEqual(queue.ids, ["a", "b"])
    }

    func testCountsAndPick() {
        let list = [q("a", moments: ["tired"]), q("b", moments: ["tired"]), q("c")]
        let marks: LibraryMarks = ["a": read("a")]
        XCTAssertEqual(LibraryQueue.scopeCounts(list, marks), ScopeCounts(read: 1, total: 3))
        let pick = LibraryQueue.pickQuote(list, marks, PickOptions(moment: "tired", seed: 5))
        XCTAssertEqual(pick?.id, "b")
        XCTAssertNil(LibraryQueue.pickQuote(list, marks, PickOptions(moment: "angry", seed: 5)))
    }

    func testReadOnDateUsesTheNewYorkDay() {
        // 03:30 UTC on the 3rd is still the evening of the 2nd in New York.
        let marks: LibraryMarks = ["a": read("a", at: "2026-03-03T03:30:00.000Z"), "b": read("b", at: "2026-03-03T15:00:00.000Z")]
        XCTAssertEqual(LibraryQueue.readOnDate(marks, "2026-03-02"), 1)
        XCTAssertEqual(LibraryQueue.readOnDate(marks, "2026-03-03"), 1)
    }

    // MARK: counting a read

    func testWhenAQuoteCountsAsRead() {
        XCTAssertFalse(LibraryReading.countsAsRead(visibleMs: 200, text: "Short.", movedPast: true))
        XCTAssertTrue(LibraryReading.countsAsRead(visibleMs: 1000, text: "Short.", movedPast: true))
        XCTAssertFalse(LibraryReading.countsAsRead(visibleMs: 1000, text: "Short.", movedPast: false))
        XCTAssertTrue(LibraryReading.countsAsRead(visibleMs: 9000, text: "Short.", movedPast: false))
    }

    // MARK: progress

    func testRoundNumbers() {
        for n in [10, 25, 50, 100, 250, 500, 1000] { XCTAssertTrue(LibraryProgress.isRoundNumber(n), "\(n)") }
        for n in [0, 1, 11, 26, 499, 501] { XCTAssertFalse(LibraryProgress.isRoundNumber(n), "\(n)") }
    }

    func testCountsNeverPassTheirTotal() {
        let index = QuoteIndex(total: 2, writers: [IndexWriter(slug: "w", name: "W", count: 2, works: [IndexWork(slug: "k", title: "K", count: 2)])])
        let marks: LibraryMarks = ["a": read("a"), "b": read("b"), "c": read("c")]
        let counts = LibraryProgress.libraryCounts(index, marks)
        XCTAssertEqual(counts.overall.read, 2)
        XCTAssertEqual(counts.writers.first?.works.first?.read, 2)
        XCTAssertEqual(LibraryProgress.percent(counts.overall), 100)
    }

    // MARK: search

    func testSearchFindsByWordAndWriter() {
        let list = [q("a", "marcus", text: "You have power over your mind."), q("b", "seneca", text: "We suffer more in imagination than in reality.")]
        let ctx = SearchContext(writerName: { $0 == "marcus" ? "Marcus Aurelius" : "Seneca" }, workTitle: { _, _ in "Work" })
        XCTAssertEqual(LibrarySearch.searchQuotes(list, "imagination", ctx).hits.map { $0.id }, ["b"])
        XCTAssertEqual(LibrarySearch.searchQuotes(list, "marcus", ctx).hits.map { $0.id }, ["a"])
        XCTAssertTrue(LibrarySearch.searchQuotes(list, "   ", ctx).hits.isEmpty)
    }

    // MARK: drops

    func testDropsPerDayIsClamped() {
        let none: Int? = nil
        XCTAssertEqual(Drops.dropsPerDay(none), 3)
        XCTAssertEqual(Drops.dropsPerDay(Int?.some(0)), 1)
        XCTAssertEqual(Drops.dropsPerDay(Int?.some(9)), 6)
        XCTAssertEqual(Drops.dropsPerDay(Int?.some(4)), 4)
    }

    func testDropTimesSitInsideTheDay() {
        let times = Drops.dropSlotTimes(3, wake: "07:00", bed: "22:00", quietStart: "22:00", quietEnd: "07:00")
        XCTAssertEqual(times, ["07:00", "12:00", "17:00"])
    }

    func testFirstDropIsAtWakeAndWakeInsideQuietHoursMovesToQuietEnd() {
        XCTAssertEqual(Drops.dropSlotTimes(3, wake: "05:45", bed: "23:00", quietStart: "23:00", quietEnd: "05:30"), ["05:45", "11:30", "17:15"])
        XCTAssertEqual(Drops.dropSlotTimes(1, wake: "06:00", bed: "22:00", quietStart: "23:00", quietEnd: "05:30"), ["06:00"])
        XCTAssertEqual(Drops.dropSlotTimes(3, wake: "23:30", bed: "23:45", quietStart: "23:00", quietEnd: "05:30"), ["05:30", "11:20", "17:10"])
        XCTAssertEqual(Drops.dropSlotTimes(2, wake: "04:00", bed: "22:00", quietStart: "23:00", quietEnd: "05:30").first, "05:30")
    }

    func testTrimForNotification() {
        XCTAssertEqual(Drops.trimForNotification("A short one."), "A short one.")
        let long = Array(repeating: "word", count: 80).joined(separator: " ")
        let cut = Drops.trimForNotification(long)
        XCTAssertTrue(cut.hasSuffix("..."))
        XCTAssertLessThanOrEqual(cut.count, Drops.bodyMax)
    }

    private func pool() -> ShortPool {
        var quotes: [ShortQuote] = []
        for i in 0..<12 { quotes.append(ShortQuote(id: "s\(i)", w: "seneca", t: "Quote number \(i)")) }
        return ShortPool(names: ["seneca": "Seneca"], quotes: quotes)
    }

    func testPickDropIsSteadyAndSkipsWhatWasRead() {
        let p = pool()
        let a = Drops.pickDrop(p, date: "2026-03-02", slot: 0, perDay: 3)
        let b = Drops.pickDrop(p, date: "2026-03-02", slot: 0, perDay: 3)
        XCTAssertEqual(a, b)
        let skipped = Drops.pickDrop(p, date: "2026-03-02", slot: 0, perDay: 3, isRead: { $0 == a?.id })
        XCTAssertNotEqual(skipped?.id, a?.id)
    }

    func testPlanStartsAfterNowAndUsesTheDropPrefix() {
        let plan = Drops.plan(pool: pool(), perDay: 3, today: "2026-03-02", time: "23:00", quietStart: "22:00", quietEnd: "07:00", blocksFor: { _ in [] }, isRead: { _ in false })
        XCTAssertEqual(plan.count, 18)
        XCTAssertTrue(plan.allSatisfy { $0.identifier.hasPrefix("drop.") })
        XCTAssertEqual(plan.first?.date, "2026-03-03")
        XCTAssertEqual(Set(plan.map { $0.identifier }).count, plan.count)
    }

    func testOwnLinesWalkOneADayInIdOrderAndSkipBlanks() {
        let lines = [OwnLine(id: "b", body: "Embarrassment is an underexplored emotion."), OwnLine(id: "a", body: "Say it yourself."), OwnLine(id: "c", body: "   ")]
        XCTAssertNil(Drops.pickOwnLine([], date: "2026-10-12"))
        let first = Drops.pickOwnLine(lines, date: "2026-10-12")
        XCTAssertEqual(Drops.pickOwnLine(Array(lines.reversed()), date: "2026-10-12"), first)
        XCTAssertNotEqual(Drops.pickOwnLine(lines, date: "2026-10-13"), first)
        XCTAssertEqual(Drops.pickOwnLine(lines, date: "2026-10-14"), first)
        XCTAssertTrue(["a", "b"].contains(first?.id ?? ""))
        // Dates before the walk began still pick one.
        XCTAssertNotNil(Drops.pickOwnLine(lines, date: "2025-03-01"))
    }

    func testOwnLineMessageIsTitledYourLineAndOpensYours() {
        let m = Drops.ownLineMessage(OwnLine(id: "x1", body: "Make a fool of yourself."))
        XCTAssertEqual(m.title, "Your line")
        XCTAssertEqual(m.body, "Make a fool of yourself.")
        XCTAssertEqual(m.url, "/library/yours")
        XCTAssertEqual(m.quoteId, "own:x1")
    }

    func testPlanPutsAnOwnLineAtWakeAndLibraryQuotesAfter() {
        let own = [OwnLine(id: "x1", body: "Make a fool of yourself.")]
        let blocks = { (_: DateStr) in [WindowBlock(kind: "wake", start: "05:45"), WindowBlock(kind: "bed", start: "23:00")] }
        let plan = Drops.plan(pool: pool(), perDay: 3, today: "2026-03-02", time: "00:00", quietStart: "23:00", quietEnd: "05:30", blocksFor: blocks, isRead: { _ in false }, days: 2, ownLines: own)
        let today = plan.filter { $0.date == "2026-03-02" }
        XCTAssertEqual(today.map { $0.time }, ["05:45", "11:30", "17:15"])
        XCTAssertEqual(today[0].message.title, "Your line")
        XCTAssertEqual(today[0].message.url, "/library/yours")
        XCTAssertNotEqual(today[1].message.title, "Your line")
        XCTAssertNotEqual(today[2].message.title, "Your line")
        // With no lines of his own nothing changes.
        let plain = Drops.plan(pool: pool(), perDay: 3, today: "2026-03-02", time: "00:00", quietStart: "23:00", quietEnd: "05:30", blocksFor: blocks, isRead: { _ in false }, days: 2)
        XCTAssertNotEqual(plain.first?.message.title, "Your line")
        XCTAssertEqual(plain.count, plan.count)
    }

    func testPlanKeepsToTheCap() {
        let plan = Drops.plan(pool: pool(), perDay: 6, today: "2026-03-02", time: "00:00", quietStart: "22:00", quietEnd: "07:00", blocksFor: { _ in [] }, isRead: { _ in false }, days: 7, cap: 10)
        XCTAssertEqual(plan.count, 10)
    }
}
