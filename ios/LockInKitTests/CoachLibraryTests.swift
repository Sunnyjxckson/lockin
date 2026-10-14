import XCTest
@testable import LockInKit

final class CoachLibraryTests: XCTestCase {
    private let pool = ShortPool(
        names: ["seneca": "Seneca", "laws": "The Laws"],
        quotes: [
            ShortQuote(id: "a", w: "seneca", t: "We suffer more in imagination than in reality.", m: ["afraid", "doubting"]),
            ShortQuote(id: "b", w: "seneca", t: "It is not that we have a short time to live, but that we waste a lot of it.", m: ["tired", "overwhelmed"]),
            ShortQuote(id: "c", w: "laws", t: "Never outshine the master.", m: ["doubting"]),
            ShortQuote(id: "d", w: "seneca", t: "Luck is what happens when preparation meets opportunity.", m: ["doubting"]),
        ]
    )

    func testSafetyTopicsComeFirst() {
        XCTAssertEqual(CoachLibrary.classify("I want to die"), .care)
        XCTAssertEqual(CoachLibrary.classify("chest pain and my knee hurts"), .emergency)
        XCTAssertEqual(CoachLibrary.classify("sharp pain in my shoulder"), .injury)
        XCTAssertEqual(CoachLibrary.classify("I am so sore today"), .pain)
        XCTAssertEqual(CoachLibrary.classify("want to smoke so bad"), .urge)
        XCTAssertEqual(CoachLibrary.classify("what should I make for dinner"), .general)
    }

    func testCareStaysInPlayForTheConversation() {
        let turns: [(sender: String, body: String)] = [("me", "i want to die"), ("coach", "stay with me"), ("me", "ok")]
        XCTAssertTrue(CoachLibrary.careInPlay(turns))
        XCTAssertFalse(CoachLibrary.careInPlay([("coach", "i want to die")]))
    }

    func testNoMomentsForSafetyOrWins() {
        XCTAssertTrue(CoachLibrary.momentsFor(.injury, "sharp pain").isEmpty)
        XCTAssertTrue(CoachLibrary.momentsFor(.win, "crushed it").isEmpty)
        XCTAssertEqual(CoachLibrary.momentsFor(.general, "i am scared of tomorrow").first, "afraid")
    }

    func testPicksLinesThatFitAndLeavesTheLawsOut() {
        let out = CoachLibrary.pickCandidates(pool: pool, topic: .general, message: "i keep doubting myself", saved: [], read: [], used: [], date: "2026-10-14")
        XCTAssertFalse(out.isEmpty)
        XCTAssertFalse(out.contains { $0.key == "lib:c" })
        XCTAssertTrue(out.allSatisfy { $0.key.hasPrefix("lib:") })
        XCTAssertEqual(out.first(where: { $0.key == "lib:a" })?.by, "Seneca")
    }

    func testSavedFirstAndUsedLeftOut() {
        let out = CoachLibrary.pickCandidates(pool: pool, topic: .general, message: "i keep doubting myself", saved: ["d"], read: [], used: ["lib:a"], date: "2026-10-14")
        XCTAssertEqual(out.first?.key, "lib:d")
        XCTAssertEqual(out.first?.saved, true)
        XCTAssertFalse(out.contains { $0.key == "lib:a" })
    }

    func testNothingForInjury() {
        XCTAssertTrue(CoachLibrary.pickCandidates(pool: pool, topic: .injury, message: "sharp pain", saved: [], read: [], used: [], date: "2026-10-14").isEmpty)
    }
}

final class CoachFlagsTests: XCTestCase {
    private func data(logs: [DayLog], items: [ChecklistItem]) -> CoachData {
        return CoachData(today: "2026-10-08", historyStart: "2026-10-01", floor: 100, items: items, logs: logs)
    }

    func testEarnedUnderAfterThreeMissedDays() {
        let earned = makeItem(id: "earned", name: "Earn", type: .number, target: .min(100), key: "earned", unit: "$")
        let logs = ["2026-10-05", "2026-10-06", "2026-10-07"].map { makeLog("earned", $0, value: 20) }
        let flags = CoachFlags.detect(data(logs: logs, items: [earned]))
        XCTAssertEqual(flags.map { $0.kind }, ["earned_under"])
        XCTAssertEqual(flags.first?.since, "2026-10-05")
        XCTAssertEqual(flags.first?.evidence.count, 3)
    }

    func testNoFlagWhenADayHitsTheFloor() {
        let earned = makeItem(id: "earned", name: "Earn", type: .number, target: .min(100), key: "earned", unit: "$")
        let logs = [makeLog("earned", "2026-10-05", value: 20), makeLog("earned", "2026-10-06", value: 150), makeLog("earned", "2026-10-07", value: 20)]
        XCTAssertTrue(CoachFlags.detect(data(logs: logs, items: [earned])).isEmpty)
    }

    func testTheSnapshotCarriesTheFlags() {
        let earned = makeItem(id: "earned", name: "Earn", type: .number, target: .min(100), key: "earned", unit: "$")
        let logs = ["2026-10-05", "2026-10-06", "2026-10-07"].map { makeLog("earned", $0, value: 20) }
        let snap = CoachSnapshotBuilder.buildSnapshot(data(logs: logs, items: [earned]))
        if case .array(let flags)? = snap["flags"] {
            XCTAssertEqual(flags.count, 1)
        } else {
            XCTFail("flags missing")
        }
    }
}

final class NotificationBudgetTests: XCTestCase {
    func testDropsGetWhatTheRemindersLeave() {
        let reminders = (0..<10).map { "lockin.rem.2026-10-14:r\($0)" }
        let drops = (0..<30).map { "drop.2026-10-15.\($0)" }
        let focus = ["lockin.focus.end", "lockin.focus.away"]
        let budget = NotificationScheduler.dropBudget(pendingIds: reminders + drops + focus)
        XCTAssertEqual(budget, 64 - 4 - 2 - 10)
    }

    func testBudgetNeverGoesBelowZero() {
        let many = (0..<80).map { "lockin.rem.x\($0)" }
        XCTAssertEqual(NotificationScheduler.dropBudget(pendingIds: many), 0)
    }

    func testTotalStaysUnderTheSystemLimit() {
        let reminders = (0..<NotificationScheduler.maxPending).map { "lockin.rem.x\($0)" }
        let budget = NotificationScheduler.dropBudget(pendingIds: reminders)
        XCTAssertLessThanOrEqual(reminders.count + budget + NotificationScheduler.focusReserve, NotificationScheduler.systemLimit - NotificationScheduler.safetyMargin)
        XCTAssertGreaterThan(budget, 0)
    }

    func testRouterMapsTapsToScreens() {
        // The mapping lives in the app target; the path format it reads is made here.
        let link = LibraryScopes.quoteLink("abc", writer: "seneca")
        XCTAssertEqual(link, "/library/read?w=seneca&q=abc")
        XCTAssertEqual(Reminders.urlFor(.earningsNudge), "/money")
    }
}
