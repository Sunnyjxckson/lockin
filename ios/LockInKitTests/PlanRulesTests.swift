import XCTest
@testable import LockInKit

final class PlanRulesTests: XCTestCase {
    let date = "2026-10-06"

    func blk(_ id: String, _ start: String, _ end: String, name: String? = nil, flexible: Bool = true, kind: BlockKind = .other, templateId: String? = nil, source: BlockSource = .manual, persisted: Bool = true, note: String? = nil) -> DayBlock {
        return DayBlock(id: id, date: date, blockName: name ?? id, start: start, end: end, duration: LIDate.durationMinutes(start, end), flexible: flexible, kind: kind, note: note, templateId: templateId, source: source, persisted: persisted)
    }

    func fixed(_ id: String, _ start: String, _ end: String, kind: BlockKind = .other) -> DayBlock {
        return blk(id, start, end, flexible: false, kind: kind)
    }

    func times(_ blocks: [DayBlock]) -> [String: String] {
        var out: [String: String] = [:]
        for b in blocks { out[b.id] = "\(b.start)-\(b.end)" }
        return out
    }

    // A Tuesday close to the seeded template.
    func tuesday() -> [DayBlock] {
        return [
            fixed("wake", "05:45", "06:30", kind: .wake),
            fixed("lift", "06:30", "07:30", kind: .workout),
            blk("home", "07:30", "09:30", kind: .home),
            fixed("class", "10:00", "14:30", kind: .classTime),
            blk("ball", "15:00", "16:30", kind: .basketball),
            blk("dinner", "17:00", "21:00", kind: .delivery),
            blk("study", "21:00", "23:00", kind: .study),
            fixed("bed", "23:00", "23:59", kind: .bed),
        ]
    }

    // MARK: snapping and spans

    func testSnapping() {
        XCTAssertEqual(PlanRules.snap(62, 5), 60)
        XCTAssertEqual(PlanRules.snap(63, 5), 65)
        XCTAssertEqual(PlanRules.snap(67, 15), 60)
        XCTAssertEqual(PlanRules.snap(68, 15), 75)
        XCTAssertEqual(PlanRules.snapUp(60, 5), 60)
        XCTAssertEqual(PlanRules.snapUp(61, 5), 65)
        XCTAssertEqual(PlanRules.snapUp(61, 15), 75)
        XCTAssertEqual(PlanRules.snapTime("09:07", 5), "09:05")
        XCTAssertEqual(PlanRules.snapTime("09:08", 15), "09:15")
        XCTAssertEqual(PlanRules.snapTime("23:59", 15), "23:45")
    }

    func testSpansStopAtMidnight() {
        XCTAssertEqual(PlanRules.spanOf(blk("a", "23:00", "23:59")), BlockSpan(s: 1380, e: 1439))
        XCTAssertEqual(PlanRules.spanOf(PlainTimed(start: "23:00", duration: 120)), BlockSpan(s: 1380, e: 1440))
    }

    func testWithSpanKeepsStartEndAndDurationInStep() {
        let b = PlanRules.withSpan(blk("a", "09:00", "10:00"), 600, 690)
        XCTAssertEqual([b.start, b.end], ["10:00", "11:30"])
        XCTAssertEqual(b.duration, 90)
        let late = PlanRules.withSpan(blk("a", "09:00", "10:00"), 1380, 1500)
        XCTAssertEqual([late.start, late.end], ["23:00", "00:00"])
        XCTAssertEqual(late.duration, 60)
        XCTAssertEqual(LIDate.durationMinutes(late.start, late.end), 60)
        XCTAssertEqual(PlanRules.withSpan(blk("a", "09:00", "10:00"), 600, 600).duration, 5)
    }

    // MARK: overlaps

    func testOverlaps() {
        XCTAssertEqual(PlanRules.findOverlaps(tuesday()).count, 0)
        XCTAssertEqual(PlanRules.findOverlaps([blk("a", "09:00", "10:00"), blk("b", "10:00", "11:00")]).count, 0)

        let out = PlanRules.findOverlaps(tuesday() + [blk("lunch", "11:00", "14:00", kind: .delivery)])
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out[0].a.id, "class")
        XCTAssertEqual(out[0].b.id, "lunch")
        XCTAssertEqual([out[0].start, out[0].end], ["11:00", "14:00"])
        XCTAssertEqual(out[0].minutes, 180)
        XCTAssertTrue(out[0].fixed)

        let three = PlanRules.findOverlaps([blk("a", "09:00", "11:00"), blk("b", "09:30", "10:30"), blk("c", "10:00", "12:00")])
        XCTAssertEqual(three.map { $0.a.id + $0.b.id }.sorted(), ["ab", "ac", "bc"])
        XCTAssertTrue(three.allSatisfy { !$0.fixed })

        let ids = PlanRules.overlappingIds([blk("a", "09:00", "10:00"), blk("b", "09:30", "10:30"), blk("c", "12:00", "13:00")])
        XCTAssertEqual(ids, Set(["a", "b"]))
    }

    // MARK: next open slot

    func testNextOpenSlot() {
        let t = tuesday().map { $0 as TimedBlock }
        var s = PlanRules.nextOpenSlot(t, duration: 30, from: 9 * 60 + 30)
        XCTAssertEqual([s?.start, s?.end], ["09:30", "10:00"])
        s = PlanRules.nextOpenSlot(t, duration: 20, from: 9 * 60 + 32)
        XCTAssertEqual([s?.start, s?.end], ["09:35", "09:55"])
        XCTAssertNil(PlanRules.nextOpenSlot(t, duration: 60, from: 9 * 60 + 30))
        s = PlanRules.nextOpenSlot(t, duration: 30, from: 9 * 60 + 45)
        XCTAssertEqual([s?.start, s?.end], ["14:30", "15:00"])
        s = PlanRules.nextOpenSlot(t, duration: 30, from: 12 * 60)
        XCTAssertEqual(s?.start, "14:30")
        let freed = PlanRules.removeBlock(tuesday(), id: "ball").map { $0 as TimedBlock }
        s = PlanRules.nextOpenSlot(freed, duration: 60, from: 12 * 60)
        XCTAssertEqual([s?.start, s?.end], ["14:30", "15:30"])
        XCTAssertNil(PlanRules.nextOpenSlot(t, duration: 30, from: 23 * 60 + 10))
    }

    func testNextOpenSlotOnAnEmptyDayAndAtMidnight() {
        let none: [TimedBlock] = []
        var s = PlanRules.nextOpenSlot(none, duration: 60, from: 0)
        XCTAssertEqual([s?.start, s?.end], ["00:00", "01:00"])
        s = PlanRules.nextOpenSlot(none, duration: 60, from: 23 * 60)
        XCTAssertEqual([s?.start, s?.end], ["23:00", "00:00"])
        XCTAssertEqual(s?.endMin, 1440)
        XCTAssertNil(PlanRules.nextOpenSlot(none, duration: 60, from: 23 * 60 + 5))
    }

    func testNextOpenSlotHonorsGridAndWalksPastOverlaps() {
        let one: [TimedBlock] = [blk("a", "09:00", "09:50")]
        XCTAssertEqual(PlanRules.nextOpenSlot(one, duration: 30, from: 9 * 60, step: 15)?.start, "10:00")
        let stacked: [TimedBlock] = [blk("a", "09:00", "10:00"), blk("b", "09:30", "11:00"), blk("c", "11:00", "11:30")]
        XCTAssertEqual(PlanRules.nextOpenSlot(stacked, duration: 15, from: 9 * 60)?.start, "11:30")
    }

    // MARK: shifting

    func testPushesTheNextFlexibleBlocksAndStopsAtAGap() {
        let day = [blk("a", "09:00", "10:00"), blk("b", "10:00", "11:00"), blk("c", "11:00", "12:00"), blk("d", "13:00", "14:00")]
        let out = PlanRules.resizeBlock(day, id: "a", endMin: 10 * 60 + 30)
        XCTAssertEqual(times(out.blocks), ["a": "09:00-10:30", "b": "10:30-11:30", "c": "11:30-12:30", "d": "13:00-14:00"])
        XCTAssertEqual(out.moved.map { $0.id }, ["b", "c"])
        XCTAssertTrue(out.conflicts.isEmpty)
    }

    func testAGapSoaksUpTheDelay() {
        let day = [blk("a", "09:00", "10:00"), blk("b", "10:15", "11:00"), blk("c", "11:30", "12:00")]
        let out = PlanRules.resizeBlock(day, id: "a", endMin: 10 * 60 + 30)
        XCTAssertEqual(times(out.blocks), ["a": "09:00-10:30", "b": "10:30-11:15", "c": "11:30-12:00"])
    }

    func testShorterLeavesTheRestAlone() {
        let out = PlanRules.resizeBlock(tuesday(), id: "dinner", endMin: 20 * 60)
        XCTAssertTrue(out.moved.isEmpty)
        XCTAssertEqual(times(out.blocks)["study"], "21:00-23:00")
        XCTAssertEqual(times(out.blocks)["dinner"], "17:00-20:00")
    }

    func testNeverMovesAFixedBlockAndCutsTheFlexibleOneInFrontOfIt() {
        let out = PlanRules.resizeBlock(tuesday(), id: "dinner", endMin: 21 * 60 + 30)
        let t = times(out.blocks)
        XCTAssertEqual(t["dinner"], "17:00-21:30")
        XCTAssertEqual(t["study"], "21:30-23:00")
        XCTAssertEqual(t["bed"], "23:00-23:59")
        XCTAssertEqual(out.moved, [ShiftChange(id: "study", name: "study", from: BlockTimeRange(start: "21:00", end: "23:00"), to: BlockTimeRange(start: "21:30", end: "23:00"), cut: 30)])
        XCTAssertTrue(out.conflicts.isEmpty)
        XCTAssertTrue(PlanRules.findOverlaps(out.blocks).isEmpty)
    }

    func testFlagsInsteadOfHidingWhenThereIsNoRoomInFrontOfAFixedBlock() {
        let out = PlanRules.resizeBlock(tuesday(), id: "dinner", endMin: 22 * 60 + 55)
        let t = times(out.blocks)
        XCTAssertEqual(t["study"], "22:55-00:00")
        XCTAssertEqual(t["bed"], "23:00-23:59")
        XCTAssertEqual(out.conflicts, [ShiftConflict(id: "study", withId: "bed", minutes: 59)])
        let pairs = PlanRules.findOverlaps(out.blocks).map { $0.a.id + ">" + $0.b.id }
        XCTAssertEqual(pairs, ["study>bed"])
    }

    func testFlagsTheBlockItselfWhenStretchedOverAFixedBlock() {
        let out = PlanRules.resizeBlock(tuesday(), id: "home", endMin: 10 * 60 + 30)
        XCTAssertEqual(times(out.blocks)["class"], "10:00-14:30")
        XCTAssertEqual(out.conflicts, [ShiftConflict(id: "home", withId: "class", minutes: 30)])
        XCTAssertTrue(out.moved.isEmpty)
    }

    func testKeepsShiftingOnTheFarSideOfAFixedBlock() {
        let day = [blk("a", "09:00", "10:00"), fixed("f", "10:00", "10:30"), blk("b", "10:30", "11:00"), blk("c", "11:00", "11:30")]
        let out = PlanRules.resizeBlock(day, id: "a", endMin: 10 * 60 + 45)
        XCTAssertEqual(times(out.blocks), ["a": "09:00-10:45", "f": "10:00-10:30", "b": "10:45-11:15", "c": "11:15-11:45"])
        XCTAssertEqual(out.conflicts, [ShiftConflict(id: "a", withId: "f", minutes: 30)])
    }

    func testSqueezesAPushedBlockBetweenTwoThingsWhenAtLeast15MinutesFit() {
        let day = [blk("a", "09:00", "10:00"), blk("b", "10:00", "11:00"), fixed("f", "11:00", "12:00"), blk("c", "12:00", "13:00")]
        let out = PlanRules.resizeBlock(day, id: "a", endMin: 10 * 60 + 40)
        XCTAssertEqual(times(out.blocks), ["a": "09:00-10:40", "b": "10:40-11:00", "f": "11:00-12:00", "c": "12:00-13:00"])
        XCTAssertEqual(out.moved[0].cut, 40)
    }

    func testLeavesBlocksThatStartBeforeTheOldEndAlone() {
        let day = [blk("a", "09:00", "10:00"), blk("b", "09:30", "09:45"), blk("c", "10:00", "10:30")]
        let out = PlanRules.resizeBlock(day, id: "a", endMin: 10 * 60 + 15)
        XCTAssertEqual(times(out.blocks), ["a": "09:00-10:15", "b": "09:30-09:45", "c": "10:15-10:45"])
    }

    func testCutsTheLastBlockAtMidnight() {
        let day = [blk("a", "21:00", "22:00"), blk("b", "22:00", "23:30")]
        let out = PlanRules.resizeBlock(day, id: "a", endMin: 23 * 60)
        XCTAssertEqual(times(out.blocks)["b"], "23:00-00:00")
        XCTAssertEqual(out.moved[0].cut, 30)
    }

    func testShiftWithAnUnknownIdChangesNothing() {
        XCTAssertTrue(PlanRules.shiftAfter(tuesday(), anchorId: "nope").moved.isEmpty)
    }

    func testStillGoing() {
        let day = [blk("tv", "20:00", "21:00", kind: .free), blk("study", "21:00", "22:00"), fixed("bed", "23:00", "23:59")]
        let out = PlanRules.stillGoing(day, id: "tv", nowMin: 21 * 60 + 2)
        XCTAssertEqual(times(out.blocks), ["tv": "20:00-21:20", "study": "21:20-22:20", "bed": "23:00-23:59"])
        let early = [blk("tv", "20:00", "21:00"), blk("study", "21:00", "22:00")]
        XCTAssertEqual(times(PlanRules.stillGoing(early, id: "tv", nowMin: 20 * 60 + 30).blocks)["tv"], "20:00-21:15")
    }

    // MARK: move and typed edits

    func testMoveKeepsLengthAndTouchesNothingElse() {
        let out = PlanRules.moveBlock(tuesday(), id: "ball", startMin: 14 * 60 + 30)
        XCTAssertEqual(times(out)["ball"], "14:30-16:00")
        XCTAssertEqual(times(out)["dinner"], "17:00-21:00")
        XCTAssertEqual(times(PlanRules.moveBlock([blk("a", "09:00", "10:00")], id: "a", startMin: -30))["a"], "00:00-01:00")
        XCTAssertEqual(times(PlanRules.moveBlock([blk("a", "09:00", "10:00")], id: "a", startMin: 1430))["a"], "23:00-00:00")
    }

    func testTypedEdits() {
        let renamed = PlanRules.updateBlock(tuesday(), id: "ball", patch: BlockPatch(blockName: "  Pickup run ", flexible: false))
        let b = renamed.blocks.first(where: { $0.id == "ball" })
        XCTAssertEqual(b?.blockName, "Pickup run")
        XCTAssertEqual(b?.flexible, false)
        XCTAssertEqual([b?.start, b?.end], ["15:00", "16:30"])
        XCTAssertTrue(renamed.moved.isEmpty)

        XCTAssertEqual(times(PlanRules.updateBlock(tuesday(), id: "dinner", patch: BlockPatch(end: "21:15")).blocks)["study"], "21:15-23:00")
        XCTAssertEqual(times(PlanRules.updateBlock(tuesday(), id: "ball", patch: BlockPatch(start: "14:45")).blocks)["ball"], "14:45-16:15")

        let toMidnight = PlanRules.updateBlock([blk("a", "22:00", "23:00")], id: "a", patch: BlockPatch(end: "00:00"))
        XCTAssertEqual(toMidnight.blocks[0].end, "00:00")
        XCTAssertEqual(toMidnight.blocks[0].duration, 120)

        let blank = PlanRules.updateBlock(tuesday(), id: "ball", patch: BlockPatch(blockName: "  "))
        XCTAssertEqual(blank.blocks.first(where: { $0.id == "ball" })?.blockName, "ball")

        let cleared = PlanRules.updateBlock([blk("a", "09:00", "10:00", note: "x")], id: "a", patch: BlockPatch(note: .some(nil)))
        XCTAssertNil(cleared.blocks[0].note)
    }

    func testAddAndRemove() {
        let tv = PlanRules.makeBlock(id: "new:1", date: date, name: "TV", startMin: 14 * 60 + 30, duration: 30, kind: .free)
        let day = PlanRules.addBlock(tuesday(), tv)
        XCTAssertEqual(day.firstIndex(where: { $0.id == "new:1" }), 4)
        XCTAssertEqual([tv.start, tv.end], ["14:30", "15:00"])
        XCTAssertTrue(tv.flexible)
        XCTAssertEqual(tv.source, .manual)
        XCTAssertFalse(tv.persisted)
        XCTAssertEqual(PlanRules.removeBlock(day, id: "new:1").count, 8)
        XCTAssertEqual(PlanRules.makeBlock(id: "x", date: date, name: "  ", startMin: 600, duration: 30).blockName, "Block")
    }

    // MARK: the 9:00 clock-in errand

    func testErrandCutsTheBlockUnderWayAndLeavesFixedBlocksAlone() {
        let out = PlanRules.insertErrand(tuesday(), id: "new:e", date: date)
        let t = times(out.blocks)
        XCTAssertEqual(t["new:e"], "09:00-10:00")
        XCTAssertEqual(t["home"], "07:30-09:00")
        XCTAssertEqual(t["class"], "10:00-14:30")
        XCTAssertEqual(out.moved, [ShiftChange(id: "home", name: "home", from: BlockTimeRange(start: "07:30", end: "09:30"), to: BlockTimeRange(start: "07:30", end: "09:00"), cut: 30)])
        XCTAssertTrue(out.conflicts.isEmpty)
        let errand = PlanRules.findErrand(out.blocks)
        XCTAssertEqual(errand?.kind, .errand)
        XCTAssertEqual(errand?.flexible, false)
        XCTAssertEqual(errand?.blockName, "Clock-in errand")
    }

    func testErrandShiftsMorningBlocksAndTheRippleCarriesOn() {
        let day = [
            fixed("lift", "06:30", "07:30"),
            blk("home", "07:30", "09:00"),
            blk("study", "09:00", "11:00"),
            blk("lunch", "11:00", "14:00"),
            blk("ball", "14:30", "16:30"),
        ]
        let out = PlanRules.insertErrand(day, id: "e", date: date)
        XCTAssertEqual(times(out.blocks), ["lift": "06:30-07:30", "home": "07:30-09:00", "e": "09:00-10:00", "study": "10:00-12:00", "lunch": "12:00-15:00", "ball": "15:00-17:00"])
        XCTAssertEqual(out.moved.map { $0.id }, ["study", "lunch", "ball"])
    }

    func testErrandFlagsFixedBlocks() {
        let day = [blk("home", "07:30", "09:00"), fixed("class", "09:30", "16:00")]
        let out = PlanRules.insertErrand(day, id: "e", date: date)
        XCTAssertEqual(times(out.blocks)["class"], "09:30-16:00")
        XCTAssertEqual(out.conflicts, [ShiftConflict(id: "e", withId: "class", minutes: 30)])

        let running = PlanRules.insertErrand([fixed("class", "08:00", "09:30")], id: "e", date: date)
        XCTAssertEqual(running.conflicts, [ShiftConflict(id: "e", withId: "class", minutes: 30)])
    }

    func testErrandPushesABlockBehindItWhenUnder15MinutesWouldBeLeft() {
        let day = [blk("a", "08:50", "09:20"), blk("b", "10:00", "10:30")]
        let out = PlanRules.insertErrand(day, id: "e", date: date)
        XCTAssertEqual(times(out.blocks), ["e": "09:00-10:00", "a": "10:00-10:30", "b": "10:30-11:00"])
        XCTAssertEqual(out.moved.first(where: { $0.id == "a" })?.from, BlockTimeRange(start: "08:50", end: "09:20"))
    }

    func testErrandCustomTimeAndNotAddedTwice() {
        let out = PlanRules.insertErrand([], id: "e", date: date, start: "08:30", duration: 45)
        XCTAssertEqual(times(out.blocks)["e"], "08:30-09:15")
        let once = PlanRules.insertErrand(tuesday(), id: "e", date: date).blocks
        XCTAssertEqual(PlanRules.insertErrand(once, id: "e2", date: date).blocks.count, once.count)
    }

    func testTurningTheErrandOffPutsShiftedTemplateBlocksBack() {
        func t(_ id: String, _ start: String, _ end: String) -> ScheduleTemplate {
            return ScheduleTemplate(id: id, createdAt: "", weekday: 2, blockName: id, start: start, end: end)
        }
        let template = [t("t-home", "07:30", "09:00"), t("t-study", "09:00", "11:00"), t("t-lunch", "11:00", "14:00"), t("t-ball", "14:30", "16:30")]
        let day = [
            blk("home", "07:30", "09:00", templateId: "t-home", source: .template),
            blk("study", "09:00", "11:00", templateId: "t-study", source: .template),
            blk("lunch", "11:00", "14:00", templateId: "t-lunch", source: .template),
            blk("ball", "14:30", "16:30", templateId: "t-ball", source: .template),
            blk("tv", "19:00", "20:00", kind: .free),
        ]
        let on = PlanRules.insertErrand(day, id: "e", date: date).blocks
        let off = PlanRules.removeErrand(on, template: template)
        XCTAssertNil(PlanRules.findErrand(off))
        XCTAssertEqual(times(off), ["home": "07:30-09:00", "study": "09:00-11:00", "lunch": "11:00-14:00", "ball": "15:00-17:00", "tv": "19:00-20:00"])
        XCTAssertEqual(times(PlanRules.removeErrand(tuesday(), template: [])), times(tuesday()))
    }

    // MARK: template to day

    func derived() -> [DayBlock] {
        return [
            blk("template:t1", "05:45", "06:30", flexible: false, kind: .wake, templateId: "t1", source: .template, persisted: false),
            blk("template:t2", "06:30", "07:30", templateId: "t2", source: .template, persisted: false, note: "Lift"),
        ]
    }

    func testMaterializeCopiesEveryBlockWithAStableIdAndItsTemplateLink() {
        let rows = PlanRules.materializeDay(date, derived())
        XCTAssertEqual(rows.count, 2)
        let expected: JSONObject = [
            "id": .string(PlanRules.materializedId(date, "t1")),
            "date": .string(date),
            "block_name": .string("template:t1"),
            "start": .string("05:45"),
            "end": .string("06:30"),
            "duration": .int(45),
            "flexible": .bool(false),
            "kind": .string("wake"),
            "note": .null,
            "calendar_event_id": .null,
            "template_id": .string("t1"),
            "source": .string("template"),
        ]
        XCTAssertEqual(rows[0], expected)
        XCTAssertEqual(rows[1]["id"], .string("2026-10-06.t2"))
        XCTAssertEqual(rows[1]["note"], .string("Lift"))
        XCTAssertNotEqual(PlanRules.materializedId("2026-10-06", "t1"), PlanRules.materializedId("2026-10-13", "t1"))
    }

    func testKnowsADerivedDayFromOneWithItsOwnRows() {
        XCTAssertFalse(PlanRules.isMaterialized(derived()))
        XCTAssertTrue(PlanRules.isMaterialized(tuesday()))
        XCTAssertFalse(PlanRules.isMaterialized([]))
    }

    func testTheFirstEditWritesTheWholeDayWithTheEditApplied() {
        let after = PlanRules.resizeBlock(derived(), id: "template:t2", endMin: 8 * 60).blocks
        let write = PlanRules.planDayWrite(date, before: derived(), after: after)
        XCTAssertTrue(write.update.isEmpty)
        XCTAssertTrue(write.remove.isEmpty)
        XCTAssertEqual(write.insert.map { $0["id"] }, [.string("2026-10-06.t1"), .string("2026-10-06.t2")])
        XCTAssertEqual(write.insert[1]["end"], .string("08:00"))
        XCTAssertEqual(write.insert[1]["duration"], .int(90))
    }

    func testTheFirstEditCanAlsoAddABlockWhichGetsNoIdOfItsOwn() {
        let tv = PlanRules.makeBlock(id: "new:1", date: date, name: "TV", startMin: 600, duration: 60, kind: .free)
        let write = PlanRules.planDayWrite(date, before: derived(), after: PlanRules.addBlock(derived(), tv))
        XCTAssertEqual(write.insert.count, 3)
        XCTAssertNil(write.insert[2]["id"])
        XCTAssertEqual(write.insert[2]["block_name"], .string("TV"))
        XCTAssertEqual(write.insert[2]["kind"], .string("free"))
        XCTAssertEqual(write.insert[2]["source"], .string("manual"))
        XCTAssertEqual(write.insert[2]["template_id"], .null)
    }

    func testLaterEditsWriteOnlyWhatChanged() {
        let before = tuesday()
        let tv = PlanRules.makeBlock(id: "new:1", date: date, name: "TV", startMin: 14 * 60 + 30, duration: 30, kind: .free)
        let stretched = PlanRules.resizeBlock(before, id: "dinner", endMin: 21 * 60 + 30).blocks
        let after = PlanRules.addBlock(PlanRules.removeBlock(stretched, id: "ball"), tv)
        let write = PlanRules.planDayWrite(date, before: before, after: after)
        XCTAssertEqual(write.remove, ["ball"])
        XCTAssertEqual(write.insert.map { $0["block_name"] }, [.string("TV")])
        XCTAssertEqual(write.update.map { $0.id }, ["dinner", "study"])
        XCTAssertEqual(write.update[0].patch, ["end": .string("21:30"), "duration": .int(270)])
        XCTAssertEqual(write.update[1].patch, ["start": .string("21:30"), "duration": .int(90)])
    }

    func testNoChangeMeansNoWrites() {
        XCTAssertTrue(PlanRules.planDayWrite(date, before: tuesday(), after: tuesday()).isEmpty)
    }

    // MARK: lanes and range

    func testLanes() {
        let clean = PlanRules.layoutLanes(tuesday())
        XCTAssertTrue(clean.values.allSatisfy { $0.lane == 0 && $0.lanes == 1 })

        let lanes = PlanRules.layoutLanes([blk("a", "09:00", "11:00"), blk("b", "10:00", "12:00"), blk("c", "11:00", "11:30"), blk("d", "13:00", "14:00")])
        XCTAssertEqual(lanes["a"], BlockLane(lane: 0, lanes: 2))
        XCTAssertEqual(lanes["b"], BlockLane(lane: 1, lanes: 2))
        XCTAssertEqual(lanes["c"], BlockLane(lane: 0, lanes: 2))
        XCTAssertEqual(lanes["d"], BlockLane(lane: 0, lanes: 1))

        let three = PlanRules.layoutLanes([blk("a", "09:00", "11:00"), blk("b", "09:30", "10:30"), blk("c", "10:00", "12:00")])
        XCTAssertEqual([three["a"]?.lane, three["b"]?.lane, three["c"]?.lane], [0, 1, 2])
        XCTAssertEqual(three["a"]?.lanes, 3)
    }

    func testTimelineRange() {
        XCTAssertEqual(PlanRules.timelineRange(tuesday()), BlockSpan(s: 300, e: 1440))
        XCTAssertEqual(PlanRules.timelineRange([blk("a", "03:20", "04:00")]), BlockSpan(s: 180, e: 1440))
    }

    // MARK: free time timer

    func testTimer() {
        let tv = blk("tv", "20:00", "21:00", kind: .free)
        let live = PlanRules.timerState(tv, nowSeconds: 20 * 3600 + 15 * 60 + 30)
        XCTAssertEqual(live.phase, .live)
        XCTAssertEqual(live.remaining, 44 * 60 + 30)
        XCTAssertEqual(live.progress, 15.5 / 60, accuracy: 0.00001)
        XCTAssertEqual(PlanRules.timerState(tv, nowSeconds: 19 * 3600).phase, .before)
        let over = PlanRules.timerState(tv, nowSeconds: 21 * 3600 + 90)
        XCTAssertEqual(over.phase, .over)
        XCTAssertEqual(over.overBy, 90)
        XCTAssertEqual(over.remaining, 0)
        XCTAssertEqual(PlanRules.timerState(tv, nowSeconds: 21 * 3600 - 1).phase, .live)
        XCTAssertEqual(PlanRules.timerState(tv, nowSeconds: 21 * 3600 - 1).remaining, 1)
        XCTAssertEqual(PlanRules.timerState(tv, nowSeconds: 21 * 3600).phase, .over)
    }

    func testCountdownFormat() {
        XCTAssertEqual(PlanRules.formatCountdown(44 * 60 + 30), "44:30")
        XCTAssertEqual(PlanRules.formatCountdown(3909), "1:05:09")
        XCTAssertEqual(PlanRules.formatCountdown(5), "0:05")
        XCTAssertEqual(PlanRules.formatCountdown(-3), "0:00")
    }

    func testFreeTimeFocus() {
        let tv = blk("tv", "20:00", "21:00", kind: .free)
        let day = tuesday().filter { $0.id != "dinner" } + [tv]
        XCTAssertNil(PlanRules.freeTimeFocus(day, nowSeconds: 19 * 3600))
        XCTAssertEqual(PlanRules.freeTimeFocus(day, nowSeconds: 20 * 3600 + 60)?.timer.phase, .live)
        XCTAssertEqual(PlanRules.freeTimeFocus(day, nowSeconds: 21 * 3600 + 60)?.timer.phase, .over)
        XCTAssertNil(PlanRules.freeTimeFocus(day, nowSeconds: 21 * 3600 + 60, cleared: Set(["tv"])))
        XCTAssertNil(PlanRules.freeTimeFocus(day, nowSeconds: 21 * 3600 + 31 * 60))
        XCTAssertNil(PlanRules.freeTimeFocus(tuesday(), nowSeconds: 18 * 3600))
    }

    // MARK: kinds

    func testGuessesTheKindFromTheName() {
        XCTAssertEqual(BlockKind.guess(fromName: "TV"), .free)
        XCTAssertEqual(BlockKind.guess(fromName: "Netflix tonight"), .free)
        XCTAssertEqual(BlockKind.guess(fromName: "DoorDash lunch"), .delivery)
        XCTAssertEqual(BlockKind.guess(fromName: "Study econ"), .study)
        XCTAssertEqual(BlockKind.guess(fromName: "Gym"), .workout)
        XCTAssertEqual(BlockKind.guess(fromName: "Hoops"), .basketball)
        XCTAssertEqual(BlockKind.guess(fromName: "Haircut"), .other)
        XCTAssertEqual(BlockKind.guess(fromName: "clock-in"), .errand)
    }
}

final class CalendarRulesTests: XCTestCase {
    let date = "2026-10-06"

    func blk(_ id: String, _ start: String, _ end: String, name: String? = nil, flexible: Bool = true, kind: BlockKind = .other, source: BlockSource = .manual) -> DayBlock {
        return DayBlock(id: id, date: date, blockName: name ?? id, start: start, end: end, duration: LIDate.durationMinutes(start, end), flexible: flexible, kind: kind, note: nil, templateId: nil, source: source, persisted: true)
    }

    func testFindsADeliveryBlockThatOverlapsAnImportedClass() {
        let out = CalendarRules.findCalendarConflicts([
            blk("class", "10:00", "14:30", name: "ECON 2101", flexible: false, kind: .classTime, source: .calendar),
            blk("lunch", "11:00", "14:00", name: "Delivery: lunch", kind: .delivery),
            blk("study", "15:00", "16:00"),
        ])
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out[0].event.id, "class")
        XCTAssertEqual(out[0].block.id, "lunch")
        XCTAssertEqual([out[0].start, out[0].end], ["11:00", "14:00"])
        XCTAssertEqual(out[0].minutes, 180)
        XCTAssertEqual(CalendarRules.describe(out[0]), "Delivery: lunch overlaps ECON 2101")
    }

    func testATemplateClassBlockIsFixedToo() {
        let out = CalendarRules.findCalendarConflicts([blk("class", "09:30", "16:00", flexible: false, kind: .classTime, source: .template), blk("errand", "09:00", "10:00", kind: .errand)])
        XCTAssertEqual(out.map { $0.block.id }, ["errand"])
        XCTAssertEqual(out.map { $0.minutes }, [30])
    }

    func testAnImportedEventThatIsNotAClass() {
        let out = CalendarRules.findCalendarConflicts([blk("dentist", "15:00", "16:00", flexible: false, source: .calendar), blk("ball", "15:30", "17:00")])
        XCTAssertEqual(out.map { $0.event.id + ">" + $0.block.id }, ["dentist>ball"])
        XCTAssertEqual(out[0].minutes, 30)
    }

    func testEmptyWhenBlocksOnlyTouchOrOverlapTheirOwnKind() {
        XCTAssertTrue(CalendarRules.findCalendarConflicts([blk("class", "10:00", "11:00", kind: .classTime), blk("a", "09:00", "10:00"), blk("b", "11:00", "12:00")]).isEmpty)
        XCTAssertTrue(CalendarRules.findCalendarConflicts([blk("a", "09:00", "10:00"), blk("b", "09:30", "10:30")]).isEmpty)
        XCTAssertTrue(CalendarRules.findCalendarConflicts([blk("a", "09:00", "10:00", source: .calendar), blk("b", "09:30", "10:30", source: .calendar)]).isEmpty)
        XCTAssertTrue(CalendarRules.findCalendarConflicts([]).isEmpty)
    }

    func testListsEveryBlockAnEventCollidesWithEarliestFirst() {
        let out = CalendarRules.findCalendarConflicts([
            blk("class", "10:00", "14:00", source: .calendar),
            blk("late", "13:00", "15:00"),
            blk("early", "09:00", "10:30"),
        ])
        XCTAssertEqual(out.map { $0.block.id }, ["early", "late"])
    }

    func testDayIssuesListCalendarCollisionsFirstThenOtherOverlaps() {
        let issues = CalendarRules.dayIssues([
            blk("class", "10:00", "11:00", name: "Class", flexible: false, kind: .classTime),
            blk("drive", "10:30", "11:30", name: "Drive"),
            blk("a", "13:00", "14:00", name: "A"),
            blk("b", "13:30", "14:30", name: "B"),
        ])
        XCTAssertEqual(issues.count, 2)
        XCTAssertEqual(issues[0].title, "Drive overlaps Class")
        XCTAssertEqual(issues[0].detail, "10:30 AM to 11:00 AM, 30m")
        XCTAssertEqual(issues[1].block.id, "b")
    }
}
