import XCTest
@testable import LockInKit

final class RemindersTests: XCTestCase {
    func rem(_ id: String, _ kind: ReminderKind, label: String? = nil, body: String? = nil, time: String? = nil, blockName: String? = nil, offset: Int = 0, enabled: Bool = true) -> Reminder {
        return Reminder(id: id, createdAt: "2026-10-05T00:00:00.000Z", kind: kind, label: label ?? kind.rawValue, body: body, time: time, blockName: blockName, itemId: nil, offsetMinutes: offset, enabled: enabled, sortOrder: 0)
    }

    var wake: Reminder { return rem("r-wake", .wake, label: "Wake", body: "5:45. Feet on the floor.", time: "05:45") }
    var workout: Reminder { return rem("r-workout", .workout, label: "Workout", body: "Workout starts in 15 minutes.", time: "06:15") }
    var delivery: Reminder { return rem("r-del", .delivery, label: "Delivery block", blockName: "Delivery", offset: -10) }
    var nudge: Reminder { return rem("r-nudge", .earningsNudge, label: "Earnings nudge", body: "Get back out.", time: "20:00") }
    var checkin: Reminder { return rem("r-check", .checkin, label: "End of day check-in", body: "Close out the day.", time: "22:30") }
    var all: [Reminder] { return [wake, workout, delivery, nudge, checkin] }

    let lunch = ReminderBlock(id: "template:t1", blockName: "Delivery: lunch", start: "11:30", templateId: "t1")
    let dinner = ReminderBlock(id: "template:t2", blockName: "Delivery: dinner", start: "17:00", templateId: "t2")
    let study = ReminderBlock(id: "template:t3", blockName: "Study", start: "14:00", templateId: "t3")
    let opts = ReminderPlanOptions(floor: 100, quietStart: "23:00", quietEnd: "05:30")
    let D = "2026-10-06"

    func day(earned: Double = 0, restDay: Bool = false) -> ReminderDay {
        return ReminderDay(date: D, blocks: [lunch, study, dinner], earned: earned, restDay: restDay)
    }

    func testPlansEveryKindInTimeOrder() {
        let plan = Reminders.planDay(all, day(), opts)
        XCTAssertEqual(plan.map { $0.time }, ["05:45", "06:15", "11:20", "16:50", "20:00", "22:30"])
        XCTAssertEqual(plan.map { $0.kind }, [.wake, .workout, .delivery, .delivery, .earningsNudge, .checkin])
    }

    func testWakeReminderFoldsIntoTheMorningDrop() {
        let wakeBlock = ReminderBlock(id: "template:w", blockName: "Wake", start: "05:45", templateId: "w", kind: "wake")
        let bedBlock = ReminderBlock(id: "template:b", blockName: "Bed", start: "23:00", templateId: "b", kind: "bed")
        let d = ReminderDay(date: D, blocks: [wakeBlock, bedBlock])
        let withDrops = ReminderPlanOptions(floor: 100, quietStart: "23:00", quietEnd: "05:30", dropsPerDay: 3)
        // The morning drop lands at 05:45, so the wake reminder there is left out.
        XCTAssertEqual(Reminders.planDay([wake, workout], d, withDrops).map { $0.kind }, [.workout])
        // Drops off: the wake reminder stays.
        XCTAssertEqual(Reminders.planDay([wake, workout], d, opts).map { $0.kind }, [.wake, .workout])
        // A wake reminder at another minute stays.
        let early = rem("r-early", .wake, time: "05:40")
        XCTAssertEqual(Reminders.planDay([early], d, withDrops).map { $0.kind }, [.wake])
    }

    func testBlockRelativeReminderFollowsTheBlockName() {
        let plan = Reminders.planDay([delivery], day(), opts)
        XCTAssertEqual(plan.map { $0.title }, ["Delivery: lunch", "Delivery: dinner"])
        XCTAssertEqual(plan[0].body, "Starts in 10 min, at 11:30 AM.")
        XCTAssertEqual(plan[1].key, "\(D):r-del:t.t2")
    }

    func testAPositiveOffsetStartsAtTheBlock() {
        let r = rem("r-after", .custom, label: "Begin", blockName: "study", offset: 5)
        let plan = Reminders.planDay([r], day(), opts)
        XCTAssertEqual(plan.map { $0.time }, ["14:05"])
        XCTAssertEqual(plan[0].body, "Starts at 2:00 PM.")
    }

    func testSkipsDisabledAndQuietAndAnOffsetPastMidnight() {
        XCTAssertTrue(Reminders.planDay([rem("x", .wake, time: "08:00", enabled: false)], day(), opts).isEmpty)
        XCTAssertTrue(Reminders.planDay([rem("q", .custom, time: "23:30")], day(), opts).isEmpty)
        XCTAssertTrue(Reminders.planDay([rem("q", .custom, time: "05:00")], day(), opts).isEmpty)
        let early = ReminderBlock(id: "b", blockName: "Delivery", start: "00:05")
        XCTAssertTrue(Reminders.planDay([delivery], ReminderDay(date: D, blocks: [early]), opts).isEmpty)
    }

    func testTheWorkoutReminderIsSkippedOnARestDay() {
        XCTAssertEqual(Reminders.planDay([workout], day(restDay: true), opts).count, 0)
        XCTAssertEqual(Reminders.planDay([workout], day(), opts).count, 1)
    }

    func testTheNudgeSaysWhatIsLeftAndIsDroppedOnceTheFloorIsMet() {
        let under = Reminders.planDay([nudge], day(earned: 62.5), opts, forSend: true)
        XCTAssertEqual(under.count, 1)
        XCTAssertEqual(under[0].body, "$62.50 of $100 today. $37.50 to go. Get back out.")
        XCTAssertEqual(Reminders.planDay([nudge], day(earned: 100), opts, forSend: true).count, 0)
        // Planned for listing even when met.
        XCTAssertEqual(Reminders.planDay([nudge], day(earned: 100), opts, forSend: false).count, 1)
    }

    func testFiresAtTheNewYorkInstant() {
        let plan = Reminders.planDay([wake], day(), opts)
        // 05:45 EDT is 09:45 UTC.
        XCTAssertEqual(plan[0].at, iso("2026-10-06T09:45:00.000Z"))
    }

    func testNeverLetsADashReachANotification() {
        let r = rem("d", .custom, label: "Go\u{2014}now", body: "a \u{2013} b", time: "09:00")
        let plan = Reminders.planDay([r], day(), opts)
        XCTAssertEqual(plan[0].title, "Go, now")
        XCTAssertEqual(plan[0].body, "a,  b")
    }

    func testWhereATapLands() {
        XCTAssertEqual(Reminders.urlFor(.delivery), "/money")
        XCTAssertEqual(Reminders.urlFor(.earningsNudge), "/money")
        XCTAssertEqual(Reminders.urlFor(.workout), "/body/workout")
        XCTAssertEqual(Reminders.urlFor(.wake), "/today")
    }

    func testQuietHoursWrapPastMidnight() {
        XCTAssertTrue(LIDate.isQuiet("23:00", quietStart: "23:00", quietEnd: "05:30"))
        XCTAssertTrue(LIDate.isQuiet("05:29", quietStart: "23:00", quietEnd: "05:30"))
        XCTAssertFalse(LIDate.isQuiet("05:30", quietStart: "23:00", quietEnd: "05:30"))
    }
}
