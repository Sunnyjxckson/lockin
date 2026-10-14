import XCTest
@testable import LockInKit

final class ModelsTests: XCTestCase {
    func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        return try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func testDecodesATargetOfEveryKind() throws {
        XCTAssertEqual(try decode(Target.self, #"{"kind":"check"}"#), .check)
        XCTAssertEqual(try decode(Target.self, #"{"kind":"check_by","by":"06:00"}"#), .checkBy("06:00"))
        XCTAssertEqual(try decode(Target.self, #"{"kind":"min","min":180}"#), .min(180))
        XCTAssertEqual(try decode(Target.self, #"{"kind":"max","max":30}"#), .max(30))
        XCTAssertEqual(try decode(Target.self, #"{"kind":"range","min":1900,"max":2100}"#), .range(1900, 2100))
        XCTAssertEqual(try decode(Target.self, #"{"kind":"text"}"#), .text)
        XCTAssertEqual(try decode(Target.self, #"{"kind":"something_new"}"#), .check)
    }

    func testTargetsEncodeTheWayTheWebReadsThem() throws {
        let json = JSON.from(Target.range(1900, 2100))
        XCTAssertEqual(json, JSON.object(["kind": JSON.string("range"), "min": JSON.number(1900), "max": JSON.number(2100)]))
        XCTAssertEqual(JSON.from(Target.check), JSON.object(["kind": JSON.string("check")]))
    }

    func testDecodesAChecklistItemRow() throws {
        let row = #"""
        {"id":"abc","created_at":"2026-10-01T12:00:00+00:00","key":"protein","name":"Protein","type":"number","cadence":"daily",
         "target":{"kind":"min","min":180},"category":"habit","mode":null,"unit":"g","hint":null,"sort_order":40,"track":null,
         "active":true,"archived":false,"weekly_day":null,"with_photo":false,"tracks_money":false,"typical_spend":null,"spend_period":null}
        """#
        let item = try decode(ChecklistItem.self, row)
        XCTAssertEqual(item.id, "abc")
        XCTAssertEqual(item.key, "protein")
        XCTAssertEqual(item.type, .number)
        XCTAssertEqual(item.target, .min(180))
        XCTAssertEqual(item.unit, "g")
        XCTAssertEqual(item.sortOrder, 40)
        XCTAssertNil(item.track)
        XCTAssertTrue(item.active)
    }

    func testDecodesARowThatIsMissingSoftColumns() throws {
        // A row from before the later migrations: no track, no typical_spend, no slips.
        let item = try decode(ChecklistItem.self, #"{"id":"x","name":"Wake","type":"yesno","target":{"kind":"check_by","by":"06:00"}}"#)
        XCTAssertEqual(item.name, "Wake")
        XCTAssertEqual(item.cadence, .daily)
        XCTAssertEqual(item.target, .checkBy("06:00"))
        let log = try decode(DayLog.self, #"{"id":"l","date":"2026-10-05","item_id":"x","value":null,"checked":true}"#)
        XCTAssertEqual(log.slips, 0)
        XCTAssertTrue(log.checked)
        XCTAssertNil(log.value)
    }

    func testDecodesNumbersAsDoubles() throws {
        let log = try decode(DayLog.self, #"{"id":"l","date":"2026-10-05","item_id":"x","value":182.4,"checked":true,"text":null,"completed_at":"2026-10-05T10:00:00.123+00:00","slips":0}"#)
        XCTAssertEqual(log.value, 182.4)
        XCTAssertEqual(log.completedAt, "2026-10-05T10:00:00.123+00:00")
    }

    func testDecodesAChallengeWithRules() throws {
        let row = #"""
        {"id":"c1","created_at":"2026-10-01T12:00:00Z","name":"Lock in","status":"active","start_date":"2026-10-05","length_days":30,
         "ended_on":null,"rules":[{"item_id":"cal","target":{"kind":"range","min":1500,"max":1700}},{"item_id":"wake","target":null}],
         "restart_of":null,"money_target":1000,"money_deadline":"2026-10-14","daily_floor":100,"money_target_start":null}
        """#
        let c = try decode(Challenge.self, row)
        XCTAssertEqual(c.status, .active)
        XCTAssertEqual(c.lengthDays, 30)
        XCTAssertEqual(c.rules?.count, 2)
        XCTAssertEqual(c.rules?[0].target, .range(1500, 1700))
        XCTAssertNil(c.rules?[1].target)
        XCTAssertEqual(c.moneyTarget, 1000)
    }

    func testDecodesJSONColumns() throws {
        let workout = try decode(Workout.self, #"{"id":"w","weekday":1,"slot":"main","name":"Push","kind":"lift","detail":null,"exercises":[{"name":"Bench","sets":4,"reps":"6 to 8"},{"name":"Plank","sets":1,"reps":45}]}"#)
        XCTAssertEqual(workout.exercises.count, 2)
        XCTAssertEqual(workout.exercises[0].reps, "6 to 8")
        XCTAssertEqual(workout.exercises[1].reps, "45")
        XCTAssertEqual(Workouts.formatSets(workout.exercises[0]), "4 x 6 to 8")
        XCTAssertEqual(Workouts.formatSets(workout.exercises[1]), "45")

        let theme = try decode(ThemeRow.self, ##"{"id":"t","base":"dark","palette":{"accent":"#aabbcc","background":"#101010"},"accent":"#aabbcc","active":true}"##)
        XCTAssertEqual(theme.palette?.accent, "#aabbcc")
        XCTAssertNil(theme.palette?.text)

        let item = try decode(BoardItem.self, ##"{"id":"b","board_id":"x","kind":"image","palette":["#111111","#222222"],"aspect":0.75,"sort_order":2}"##)
        XCTAssertEqual(item.palette ?? [], ["#111111", "#222222"])
        XCTAssertEqual(item.aspect, 0.75)

        let plan = try decode(MealPlan.self, #"{"id":"p","week_start":"2026-10-05","budget":80,"recipe_ids":["a"],"meals":[{"date":"2026-10-05","slot":"dinner","recipe_id":"a","servings":1.5}],"total_cost":61.2,"store":null}"#)
        XCTAssertEqual(plan.meals.count, 1)
        XCTAssertEqual(plan.meals[0].servings, 1.5)
        XCTAssertEqual(plan.meals[0].slot, .dinner)

        let grocery = try decode(GroceryItem.self, #"{"id":"g","plan_id":"p","name":"Rice","quantity":2,"prices":{"Aldi":3.5,"Harris Teeter":4.25},"bought":false}"#)
        XCTAssertEqual(grocery.prices?["Harris Teeter"], 4.25)
    }

    func testDecodesSettingsWithAMissingCoachVoice() throws {
        let s = try decode(AppSettings.self, #"{"id":"app","history_start":"2026-10-05","daily_floor":100,"display_name":"Sunny","haptics":true}"#)
        XCTAssertEqual(s.coachVoice, .stoic)
        XCTAssertTrue(s.coachCheckins.slip)
        XCTAssertEqual(s.dailyFloor, 100)
        XCTAssertEqual(s.displayName, "Sunny")
        XCTAssertEqual(s.dropsPerDay, 3)
    }

    func testUnknownEnumValuesFallBack() throws {
        let b = try decode(ScheduleTemplate.self, #"{"id":"s","weekday":2,"block_name":"x","start":"09:00","end":"10:00","kind":"mystery","flexible":false}"#)
        XCTAssertEqual(b.kind, .wake)
        let c = try decode(ScheduleTemplate.self, #"{"id":"s","weekday":2,"block_name":"x","start":"09:00","end":"10:00","kind":"class","flexible":false}"#)
        XCTAssertEqual(c.kind, .classTime)
    }

    func testEveryTableHasAName() {
        XCTAssertEqual(DayLog.table, "day_log")
        XCTAssertEqual(ChecklistItem.table, "checklist_item")
        XCTAssertEqual(AppSettings.table, "app_settings")
        XCTAssertEqual(ThemeRow.table, "theme")
        XCTAssertTrue(Tables.all.contains("focus_session"))
        XCTAssertFalse(Tables.all.contains("push_subscription"))
        XCTAssertEqual(Tables.all.count + Tables.serverOnly.count, 35)
    }
}
