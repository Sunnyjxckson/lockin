import XCTest
@testable import LockInKit

final class TargetsTests: XCTestCase {
    let item = makeItem(id: "cal", type: .number, target: .range(1700, 1900))
    var versions: [TargetVersion] {
        return [
            makeVersion("cal", Targets.baselineDate, .range(1900, 2100)),
            makeVersion("cal", "2026-10-10", .range(1700, 1900)),
            makeVersion("other", "2026-10-07", .check),
        ]
    }

    func testPicksTheLatestVersionAtOrBeforeTheDate() {
        let v = versions
        XCTAssertEqual(Targets.versionOn(v, itemId: "cal", date: "2026-10-05")?.effectiveFrom, Targets.baselineDate)
        XCTAssertEqual(Targets.versionOn(v, itemId: "cal", date: "2026-10-09")?.effectiveFrom, Targets.baselineDate)
        XCTAssertEqual(Targets.versionOn(v, itemId: "cal", date: "2026-10-10")?.effectiveFrom, "2026-10-10")
        XCTAssertEqual(Targets.versionOn(v, itemId: "cal", date: "2026-10-20")?.effectiveFrom, "2026-10-10")
        XCTAssertNil(Targets.versionOn(v, itemId: "cal", date: "1999-01-01"))
    }

    func testPastDaysKeepTheTargetTheyWereScoredAgainst() {
        let v = versions
        XCTAssertEqual(Targets.targetOn(item, v, "2026-10-09"), .range(1900, 2100))
        XCTAssertEqual(Targets.targetOn(item, v, "2026-10-10"), .range(1700, 1900))
        let logs = [makeLog("cal", "2026-10-09", value: 2000, checked: true), makeLog("cal", "2026-10-10", value: 2000, checked: true)]
        XCTAssertEqual(Scoring.summarizeDay("2026-10-09", [item], v, logs).status, .full)
        XCTAssertEqual(Scoring.summarizeDay("2026-10-10", [item], v, logs).status, .missed)
    }

    func testFallsBackToTheItemWhenItHasNoVersions() {
        let bare = makeItem(id: "bare", target: .checkBy("06:00"))
        XCTAssertEqual(Targets.targetOn(bare, [], "2026-10-05"), .checkBy("06:00"))
        XCTAssertTrue(Targets.isActiveOn(bare, [], "2026-10-05"))
        XCTAssertFalse(Targets.isActiveOn(makeItem(active: false), [], "2026-10-05"))
    }

    func testAnItemAddedTodayDoesNotCountOnEarlierDays() {
        let added = makeItem(id: "new")
        let v = [makeVersion("new", "2026-10-08", .check)]
        XCTAssertFalse(Targets.isActiveOn(added, v, "2026-10-07"))
        XCTAssertTrue(Targets.isActiveOn(added, v, "2026-10-08"))
    }

    func testAnItemRemovedTodayStillCountsOnEarlierDays() {
        let removed = makeItem(id: "gone", active: false, archived: true)
        let v = [makeVersion("gone", Targets.baselineDate, .check, active: true), makeVersion("gone", "2026-10-08", .check, active: false)]
        XCTAssertTrue(Targets.isActiveOn(removed, v, "2026-10-07"))
        XCTAssertFalse(Targets.isActiveOn(removed, v, "2026-10-08"))
        XCTAssertEqual(Targets.scoredItems([removed], v, "2026-10-07").count, 1)
        XCTAssertEqual(Targets.scoredItems([removed], v, "2026-10-08").count, 0)
    }

    func testAViceTurnedOnLaterOnlyCountsFromThatDay() {
        let vice = makeItem(id: "vape", category: .vice, active: true)
        let v = [makeVersion("vape", Targets.baselineDate, .check, active: false), makeVersion("vape", "2026-10-12", .check, active: true)]
        XCTAssertFalse(Targets.isActiveOn(vice, v, "2026-10-11"))
        XCTAssertTrue(Targets.isActiveOn(vice, v, "2026-10-12"))
    }

    func testOrdersBySortOrder() {
        let a = makeItem(id: "a", sortOrder: 20)
        let b = makeItem(id: "b", sortOrder: 10)
        XCTAssertEqual(Targets.scoredItems([a, b], [], "2026-10-05").map { $0.item.id }, ["b", "a"])
    }

    func testBuildsTheRowForAChangeDatedToday() {
        let row = Targets.versionForChange(itemId: "cal", today: "2026-10-10", target: .min(200), active: true)
        XCTAssertEqual(row["item_id"], JSON.string("cal"))
        XCTAssertEqual(row["effective_from"], JSON.string("2026-10-10"))
        XCTAssertEqual(row["active"], JSON.bool(true))
        XCTAssertEqual(row["target"], JSON.object(["kind": JSON.string("min"), "min": JSON.number(200)]))
    }

    func testComparesAndDescribesTargets() {
        XCTAssertTrue(Targets.targetsEqual(.min(1), .min(1)))
        XCTAssertFalse(Targets.targetsEqual(.min(1), .min(2)))
        XCTAssertFalse(Targets.targetsEqual(.min(1), .max(1)))
        XCTAssertFalse(Targets.targetsEqual(.checkBy("06:00"), .checkBy("06:30")))
        XCTAssertEqual(Targets.describeTarget(.range(1900, 2100), unit: "kcal"), "1,900 to 2,100 kcal")
        XCTAssertEqual(Targets.describeTarget(.min(180), unit: "g"), "180g or more")
        XCTAssertEqual(Targets.describeTarget(.min(100), unit: "$"), "$100 or more")
        XCTAssertEqual(Targets.describeTarget(.max(30), unit: "min"), "30 min or less")
        XCTAssertEqual(Targets.describeTarget(.checkBy("06:00")), "Check by 6:00 AM")
        XCTAssertEqual(Targets.describeTarget(.check), "")
        XCTAssertEqual(Targets.defaultTarget(.yesno), .check)
        XCTAssertEqual(Targets.defaultTarget(.text), .text)
        XCTAssertEqual(Targets.defaultTarget(.number), .min(1))
        XCTAssertEqual(Targets.shortTarget(.min(100), unit: "$"), "of $100")
        XCTAssertEqual(Targets.shortTarget(.min(180), unit: "g"), "180g or more")
        XCTAssertEqual(Targets.shortTarget(.range(1900, 2100)), "1,900 to 2,100")
    }
}
