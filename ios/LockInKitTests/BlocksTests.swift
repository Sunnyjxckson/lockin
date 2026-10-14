import XCTest
@testable import LockInKit

final class BlocksTests: XCTestCase {
    func template(_ id: String, weekday: Int, name: String, start: String, end: String, kind: BlockKind = .other) -> ScheduleTemplate {
        return ScheduleTemplate(id: id, createdAt: "2026-10-01T12:00:00.000Z", weekday: weekday, blockName: name, start: start, end: end, kind: kind)
    }

    func row(_ id: String, date: String, name: String, start: String, end: String, duration: Int) -> ScheduleBlock {
        return ScheduleBlock(id: id, createdAt: "2026-10-01T12:00:00.000Z", date: date, blockName: name, start: start, end: end, duration: duration, flexible: false, kind: .other, source: .manual)
    }

    // 2026-10-05 is a Monday (weekday 1).
    var templates: [ScheduleTemplate] {
        return [
            template("t2", weekday: 1, name: "Class", start: "09:00", end: "10:30", kind: .classTime),
            template("t1", weekday: 1, name: "Workout", start: "06:30", end: "07:30", kind: .workout),
            template("t3", weekday: 2, name: "Study", start: "14:00", end: "16:00", kind: .study),
        ]
    }

    func testBuildsTheDayFromTheTemplateForThatWeekday() {
        let blocks = Blocks.blocksFromTemplate("2026-10-05", templates)
        XCTAssertEqual(blocks.map { $0.blockName }, ["Workout", "Class"])
        XCTAssertEqual(blocks.map { $0.id }, ["template:t1", "template:t2"])
        XCTAssertEqual(blocks[0].duration, 60)
        XCTAssertEqual(blocks[1].duration, 90)
        XCTAssertFalse(blocks[0].persisted)
    }

    func testPerDayRowsWinOverTheTemplate() {
        let rows = [row("r1", date: "2026-10-05", name: "Errand", start: "12:00", end: "13:00", duration: 60)]
        let blocks = Blocks.resolveBlocks("2026-10-05", rows: rows, template: templates)
        XCTAssertEqual(blocks.map { $0.blockName }, ["Errand"])
        XCTAssertTrue(blocks[0].persisted)
        // A different day with no rows falls back to the template.
        XCTAssertEqual(Blocks.resolveBlocks("2026-10-06", rows: rows, template: templates).map { $0.blockName }, ["Study"])
    }

    func testNowAndNext() {
        let blocks = Blocks.blocksFromTemplate("2026-10-05", templates)
        let during = Blocks.nowAndNext(blocks, time: "06:45")
        XCTAssertEqual(during.now?.blockName, "Workout")
        XCTAssertEqual(during.next?.blockName, "Class")
        XCTAssertEqual(during.minutesLeft, 45)
        XCTAssertEqual(during.minutesUntilNext, 135)

        let gap = Blocks.nowAndNext(blocks, time: "08:00")
        XCTAssertNil(gap.now)
        XCTAssertEqual(gap.next?.blockName, "Class")
        XCTAssertEqual(gap.minutesUntilNext, 60)

        let over = Blocks.nowAndNext(blocks, time: "22:00")
        XCTAssertNil(over.now)
        XCTAssertNil(over.next)
        XCTAssertNil(over.minutesLeft)

        let edge = Blocks.nowAndNext(blocks, time: "07:30")
        XCTAssertNil(edge.now)
    }

    func testTheMostRecentlyStartedBlockIsNowWhenTheyOverlap() {
        let rows = [
            row("a", date: "2026-10-05", name: "Long", start: "09:00", end: "12:00", duration: 180),
            row("b", date: "2026-10-05", name: "Call", start: "10:00", end: "10:30", duration: 30),
        ]
        let blocks = Blocks.blocksFromRows(rows)
        XCTAssertEqual(Blocks.nowAndNext(blocks, time: "10:10").now?.blockName, "Call")
        XCTAssertEqual(Blocks.nowAndNext(blocks, time: "10:40").now?.blockName, "Long")
    }
}
