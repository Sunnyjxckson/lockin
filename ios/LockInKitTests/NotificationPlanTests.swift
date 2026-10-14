import XCTest
@testable import LockInKit

final class NotificationPlanTests: XCTestCase {
    // 2026-10-06 08:00 in New York (EDT).
    let now = iso("2026-10-06T12:00:00.000Z")

    func rem(_ id: String, _ kind: ReminderKind, time: String? = nil, blockName: String? = nil, offset: Int = 0, enabled: Bool = true) -> Reminder {
        return Reminder(id: id, createdAt: "2026-10-05T00:00:00.000Z", kind: kind, label: id, body: nil, time: time, blockName: blockName, itemId: nil, offsetMinutes: offset, enabled: enabled, sortOrder: 0)
    }

    func block(_ id: String, _ name: String, _ start: String, _ end: String, kind: BlockKind = .other) -> DayBlock {
        return DayBlock(id: id, date: "2026-10-06", blockName: name, start: start, end: end, duration: LIDate.durationMinutes(start, end), flexible: false, kind: kind, note: nil, templateId: nil, source: .template, persisted: false)
    }

    func plan(_ reminders: [Reminder], blocks: [DateStr: [DayBlock]] = [:], earned: Double = 0, floor: Double = 100, restToday: Bool = false) -> [PlannedNotification] {
        return NotificationScheduler.plan(reminders: reminders, blocksByDate: blocks, today: "2026-10-06", earned: earned, floor: floor, quietStart: "22:00", quietEnd: "07:00", restToday: restToday, now: now)
    }

    func testSchedulesTodayAndTomorrowAndSkipsWhatHasPassed() {
        let out = plan([rem("wake", .wake, time: "08:30"), rem("early", .custom, time: "07:30")], floor: 0)
        // 07:30 today has passed. It is quiet at 22:00 to 07:00 only, so tomorrow's 07:30 and 08:30 still go.
        XCTAssertEqual(out.map { $0.key }, ["2026-10-06:wake", "2026-10-07:early", "2026-10-07:wake"])
    }

    func testBlockRelativeRemindersLookAtTomorrowToo() {
        let blocks: [DateStr: [DayBlock]] = [
            "2026-10-06": [block("b1", "Delivery: lunch", "11:30", "13:30")],
            "2026-10-07": [block("b2", "Delivery: dinner", "17:00", "20:00")],
        ]
        let out = plan([rem("del", .delivery, blockName: "Delivery", offset: -10)], blocks: blocks, floor: 0)
        XCTAssertEqual(out.map { $0.time }, ["11:20", "16:50"])
        XCTAssertEqual(out.map { $0.date }, ["2026-10-06", "2026-10-07"])
    }

    func testAddsTheEightPmNudgeWhenTheTableHasNone() {
        let out = plan([rem("wake", .wake, time: "07:30")], earned: 40)
        let nudges = out.filter { $0.kind == .earningsNudge }
        XCTAssertEqual(nudges.map { $0.time }, ["20:00", "20:00"])
        XCTAssertEqual(nudges.first?.body, "$40 of $100 today. $60 to go.")
    }

    func testTheNudgeIsDroppedTodayOnceTheFloorIsMetButStaysForTomorrow() {
        let out = plan([], earned: 100)
        let nudges = out.filter { $0.kind == .earningsNudge }
        XCTAssertEqual(nudges.map { $0.date }, ["2026-10-07"])
    }

    func testUsesTheNudgeFromTheTableInsteadOfAddingAnother() {
        let out = plan([rem("nudge", .earningsNudge, time: "19:00")])
        let nudges = out.filter { $0.kind == .earningsNudge }
        XCTAssertEqual(nudges.map { $0.time }, ["19:00", "19:00"])
    }

    func testNoNudgeWithoutAFloor() {
        XCTAssertTrue(plan([], floor: 0).isEmpty)
    }

    func testRestDaySkipsTheWorkoutReminderToday() {
        let out = plan([rem("w", .workout, time: "12:00")], floor: 0, restToday: true)
        XCTAssertEqual(out.map { $0.date }, ["2026-10-07"])
    }

    func testNeverMoreThanThePendingLimit() {
        var many: [Reminder] = []
        for i in 0..<80 { many.append(rem("r\(i)", .custom, time: "\(LIDate.timeFromMinutes(8 * 60 + 5 + (i % 50)))")) }
        let out = plan(many, floor: 0)
        XCTAssertLessThanOrEqual(out.count, NotificationScheduler.maxPending)
        XCTAssertEqual(out.map { $0.at }, out.map { $0.at }.sorted())
    }
}
