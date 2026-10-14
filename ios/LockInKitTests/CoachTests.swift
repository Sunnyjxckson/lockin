import XCTest
@testable import LockInKit

final class CoachTests: XCTestCase {
    private func input(time: String, enabled: CoachCheckins = CoachCheckins(), blocks: [CoachBlock] = [], workoutDone: Bool = false, slips: [CoachCheckinSlip] = [], yesterday: YesterdayLine? = nil, sent: Set<String> = []) -> CoachCheckinInput {
        return CoachCheckinInput(today: "2026-03-02", time: time, enabled: enabled, voice: .stoic, blocks: blocks, workoutName: "Push day", workoutDone: workoutDone, slips: slips, yesterday: yesterday, sent: sent)
    }

    private let gym = CoachBlock(blockName: "Gym", start: "17:00", end: "18:00", kind: "workout")

    func testNothingIsDueBeforeTheWorkoutBlockEnds() {
        XCTAssertTrue(CoachChat.dueCheckins(input(time: "17:30", blocks: [gym])).isEmpty)
    }

    func testPostWorkoutAfterTheBlockEnds() {
        let due = CoachChat.dueCheckins(input(time: "18:30", blocks: [gym]))
        XCTAssertEqual(due.count, 1)
        XCTAssertEqual(due.first?.trigger, .postWorkout)
        XCTAssertEqual(due.first?.checkKey, "post_workout:2026-03-02")
        XCTAssertTrue(due.first?.body.contains("is not ticked") ?? false)
    }

    func testPostWorkoutStopsAfterTheWindow() {
        XCTAssertTrue(CoachChat.dueCheckins(input(time: "21:30", blocks: [gym])).isEmpty)
    }

    func testAlreadySentIsNotSentAgain() {
        let due = CoachChat.dueCheckins(input(time: "18:30", blocks: [gym], sent: ["post_workout:2026-03-02"]))
        XCTAssertTrue(due.isEmpty)
    }

    func testSwitchedOffCheckinsAreNotSent() {
        let off = CoachCheckins(postWorkout: false, slip: false, missedItem: false)
        let slip = CoachCheckinSlip(id: "s1", vice: "Vaping", time: "13:00", trigger: nil)
        XCTAssertTrue(CoachChat.dueCheckins(input(time: "18:30", enabled: off, blocks: [gym], slips: [slip])).isEmpty)
    }

    func testOneCheckinPerSlip() {
        let slips = [CoachCheckinSlip(id: "s1", vice: "Vaping", time: "13:00", trigger: "boredom."), CoachCheckinSlip(id: "s2", vice: "Vaping", time: "15:00", trigger: nil)]
        let due = CoachChat.dueCheckins(input(time: "16:00", slips: slips))
        XCTAssertEqual(due.map { $0.checkKey }, ["slip:s1", "slip:s2"])
        XCTAssertTrue(due[0].body.contains("set off by boredom."))
        XCTAssertFalse(due[0].body.contains("boredom.."))
    }

    func testMissedItemsFromYesterday() {
        let miss = MissLine(key: nil, name: "Read", state: "open", logged: nil, target: "10 pages", gap: nil)
        let y = YesterdayLine(date: "2026-03-01", label: "Sunday", status: .partial, done: 4, total: 5, misses: [miss], pending: [])
        let due = CoachChat.dueCheckins(input(time: "09:00", yesterday: y))
        XCTAssertEqual(due.first?.checkKey, "missed:2026-03-01")
        XCTAssertTrue(due.first?.body.contains("4 of 5") ?? false)
    }

    func testBriefGoesStaleOnlyWhenItsBasisChanges() {
        let note = CoachNote(id: "n", date: "2026-03-02", kind: .morning, body: "x", source: .ai, basis: "a")
        XCTAssertFalse(CoachChat.briefIsStale(note, basis: "a"))
        XCTAssertTrue(CoachChat.briefIsStale(note, basis: "b"))
        XCTAssertFalse(CoachChat.briefIsStale(CoachNote(id: "m", date: "2026-03-02", kind: .morning, body: "x", source: .ai, basis: nil), basis: "b"))
        XCTAssertFalse(CoachChat.briefIsStale(nil, basis: "b"))
    }

    func testReviewDueOnSundayEveningAndAfter() {
        // 2026-03-01 is a Sunday.
        let sundayDay = CoachChat.reviewDue(today: "2026-03-01", time: "12:00", historyStart: "2026-01-01")
        XCTAssertEqual(sundayDay?.weekEnd, "2026-03-01")
        XCTAssertEqual(sundayDay?.auto, false)
        let sundayNight = CoachChat.reviewDue(today: "2026-03-01", time: "20:00", historyStart: "2026-01-01")
        XCTAssertEqual(sundayNight?.auto, true)
        let tuesday = CoachChat.reviewDue(today: "2026-03-03", time: "09:00", historyStart: "2026-01-01")
        XCTAssertEqual(tuesday?.weekEnd, "2026-03-01")
        XCTAssertEqual(tuesday?.auto, true)
        XCTAssertNil(CoachChat.reviewDue(today: "2026-03-03", time: "09:00", historyStart: "2026-03-02"))
    }

    func testQuotesUsedRecently() {
        let a = CoachMessage(id: "1", date: "2026-03-01", sender: .coach, quote: "lib:x")
        let b = CoachMessage(id: "2", date: "2026-02-01", sender: .coach, quote: "old")
        let c = CoachMessage(id: "3", date: "2026-03-01", sender: .me, quote: "mine")
        XCTAssertEqual(CoachChat.quotesUsedSince([a, b, c], since: "2026-02-20"), ["lib:x"])
    }

    func testFlagNotesRoundTripDismissal() {
        let body = "{\"flag\":{\"key\":\"k\",\"kind\":\"gap\",\"title\":\"T\",\"detail\":\"D\",\"change\":\"C\",\"evidence\":[],\"since\":\"2026-02-20\"}}"
        let note = CoachNote(id: "f", date: "2026-02-20", kind: .flag, body: body, source: .fallback)
        XCTAssertEqual(CoachChat.activeFlagNotes([note]).count, 1)
        let dismissed = CoachChat.flagBody(body, dismissedOn: "2026-03-02") ?? ""
        let hidden = CoachNote(id: "f", date: "2026-02-20", kind: .flag, body: dismissed, source: .fallback)
        XCTAssertTrue(CoachChat.activeFlagNotes([hidden]).isEmpty)
        let back = CoachNote(id: "f", date: "2026-02-20", kind: .flag, body: CoachChat.flagBody(dismissed, dismissedOn: nil) ?? "", source: .fallback)
        XCTAssertEqual(CoachChat.activeFlagNotes([back]).count, 1)
    }

    func testCleanedTextHasNoDashes() {
        let dirty = "Hold the line \u{2014} always. Two\u{2013}three days."
        let clean = CoachText.cleanCoachText(dirty)
        XCTAssertFalse(clean.contains("\u{2014}"))
        XCTAssertFalse(clean.contains("\u{2013}"))
    }

    func testRoundingFollowsJavaScript() {
        XCTAssertEqual(CoachText.jsRound(2.5), 3)
        XCTAssertEqual(CoachText.jsRound(-2.5), -2)
        XCTAssertEqual(CoachText.round1(1.25), 1.3, accuracy: 1e-9)
    }

    func testBundledQuotesMatchTheIndex() throws {
        // The app bundle is not the test bundle, so this reads the files straight from the source tree.
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("LockIn/Resources/Quotes")
        let data = try Data(contentsOf: root.appendingPathComponent("lib-index.json"))
        let index = try JSONDecoder().decode(QuoteIndex.self, from: data)
        XCTAssertGreaterThan(index.total, 0)
        var seen = 0
        for w in index.writers {
            let file = try Data(contentsOf: root.appendingPathComponent("lib-\(w.slug).json"))
            let parsed = try JSONDecoder().decode(WriterFile.self, from: file)
            XCTAssertEqual(parsed.quotes.count, w.count, w.slug)
            seen += parsed.quotes.count
        }
        XCTAssertEqual(seen, index.total)
        let pool = try JSONDecoder().decode(ShortPool.self, from: Data(contentsOf: root.appendingPathComponent("lib-quotes-short.json")))
        XCTAssertFalse(pool.quotes.isEmpty)
    }
}
