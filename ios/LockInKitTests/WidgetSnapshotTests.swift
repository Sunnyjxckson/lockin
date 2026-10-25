import XCTest
@testable import LockInKit

final class WidgetSnapshotTests: XCTestCase {
    func blocks() -> [WidgetBlock] {
        return [
            WidgetBlock(name: "Workout", start: "06:30", end: "07:30", kind: "workout"),
            WidgetBlock(name: "Study", start: "14:00", end: "16:00", kind: "study"),
            WidgetBlock(name: "Delivery", start: "17:00", end: "20:00", kind: "delivery"),
        ]
    }

    func snap(date: String = "2026-10-06", blocks: [WidgetBlock]? = nil) -> WidgetSnapshot {
        return WidgetSnapshot(date: date, dayNumber: 3, dayLength: 30, percent: 40, done: 2, total: 5, blocks: blocks)
    }

    // 2026-10-06 15:00 in New York.
    let afternoon = iso("2026-10-06T19:00:00.000Z")

    func testFindsNowAndNextFromTheWholeDay() {
        let nn = snap(blocks: blocks()).nowNext(at: afternoon)
        XCTAssertEqual(nn.now?.name, "Study")
        XCTAssertEqual(nn.next?.name, "Delivery")
    }

    func testBetweenBlocksThereIsOnlyANext() {
        let at = iso("2026-10-06T20:30:00.000Z") // 16:30
        let nn = snap(blocks: blocks()).nowNext(at: at)
        XCTAssertNil(nn.now)
        XCTAssertEqual(nn.next?.name, "Delivery")
    }

    func testAnOlderSnapshotWithoutBlocksFallsBackToWhatItStored() {
        var s = snap()
        s.now = WidgetBlock(name: "Stored", start: "14:00", end: "16:00", kind: "study")
        XCTAssertEqual(s.nowNext(at: afternoon).now?.name, "Stored")
    }

    func testASnapshotFromAnotherDayOffersNothing() {
        let s = snap(date: "2026-10-05", blocks: blocks())
        XCTAssertFalse(s.isCurrent(at: afternoon))
        XCTAssertNil(s.nowNext(at: afternoon).now)
        XCTAssertNil(s.nowNext(at: afternoon).next)
    }

    func testMinutesLeftAndProgress() {
        let study = blocks()[1]
        XCTAssertEqual(WidgetSnapshot.minutesLeft(study, at: afternoon), 60)
        XCTAssertEqual(WidgetSnapshot.progress(study, at: afternoon), 0.5, accuracy: 0.001)
    }

    func testBoundariesAreEachStartAndEndThenMidnight() {
        let s = snap(blocks: blocks())
        let b = s.boundaries(after: afternoon)
        // Study ends 16:00, delivery 17:00 and 20:00, then midnight.
        XCTAssertEqual(b.count, 4)
        XCTAssertEqual(b.first, iso("2026-10-06T20:00:00.000Z"))
        XCTAssertEqual(b.last, WidgetSnapshot.nextMidnight(after: afternoon))
        XCTAssertEqual(WidgetSnapshot.nextMidnight(after: afternoon), iso("2026-10-07T04:00:00.000Z"))
    }

    func testRoundTripsThroughJSONWithAndWithoutBlocks() throws {
        let with = snap(blocks: blocks())
        let decoded = try JSONDecoder().decode(WidgetSnapshot.self, from: JSONEncoder().encode(with))
        XCTAssertEqual(decoded, with)
        // A snapshot written before blocks existed still reads.
        let old = Data("{\"date\":\"2026-10-06\",\"percent\":10,\"done\":1,\"total\":3,\"items\":[],\"moneyToday\":0,\"moneyFloor\":0,\"moneyTotal\":0,\"streak\":0,\"updatedAt\":\"\"}".utf8)
        let read = try JSONDecoder().decode(WidgetSnapshot.self, from: old)
        XCTAssertNil(read.blocks)
        XCTAssertNil(read.quotes)
        XCTAssertEqual(read.percent, 10)
    }

    func testFindsTheMorningQuoteForTheDayOfTheEntry() throws {
        let today = WidgetQuote(date: "2026-10-06", id: "seneca-a", writer: "Seneca", text: "Begin at once.", url: "/library/read?w=seneca&q=seneca-a")
        let tomorrow = WidgetQuote(date: "2026-10-07", id: "epictetus-b", writer: "Epictetus", text: "First say to yourself what you would be.", url: "/library/read?w=epictetus&q=epictetus-b")
        var s = snap()
        s.quotes = [today, tomorrow]
        XCTAssertEqual(s.quote(at: afternoon), today)
        // After midnight New York the next day's quote is the one, with no new snapshot.
        XCTAssertEqual(s.quote(at: iso("2026-10-07T04:30:00.000Z")), tomorrow)
        // A day the snapshot has no quote for shows none.
        XCTAssertNil(s.quote(at: iso("2026-10-09T16:00:00.000Z")))
        XCTAssertNil(snap().quote(at: afternoon))
        let decoded = try JSONDecoder().decode(WidgetSnapshot.self, from: JSONEncoder().encode(s))
        XCTAssertEqual(decoded.quotes, [today, tomorrow])
    }

    func testTheQuoteLinkOpensTheAppAtTheReaderPath() {
        let q = WidgetQuote(date: "2026-10-06", id: "seneca-a", writer: "Seneca", text: "Begin at once.", url: "/library/read?w=seneca&q=seneca-a")
        let link = q.deepLink
        XCTAssertEqual(link?.scheme, "lockin")
        XCTAssertEqual(link?.path, "/library/read")
        XCTAssertEqual(link?.query, "w=seneca&q=seneca-a")
    }
}
