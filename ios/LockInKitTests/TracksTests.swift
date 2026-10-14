import XCTest
@testable import LockInKit

final class TracksTests: XCTestCase {
    func testGreeting() {
        XCTAssertEqual(Tracks.greeting(hour: 3), "Good evening")
        XCTAssertEqual(Tracks.greeting(hour: 4), "Good morning")
        XCTAssertEqual(Tracks.greeting(hour: 12), "Good afternoon")
        XCTAssertEqual(Tracks.greeting(hour: 17), "Good evening")
        XCTAssertEqual(Tracks.greetingLines(hour: 9, name: "Sunny"), ["Good morning,", "Sunny."])
        XCTAssertEqual(Tracks.greetingLines(hour: 9, name: "  "), ["Good morning."])
        XCTAssertEqual(Tracks.greetingLines(hour: 9, name: nil), ["Good morning."])
    }

    func testShortNames() {
        XCTAssertEqual(Tracks.shortName(makeItem(key: "weighin")), "Weigh-in")
        XCTAssertEqual(Tracks.shortName(makeItem(name: "No vaping", category: .vice)), "Vaping")
        XCTAssertEqual(Tracks.shortName(makeItem(name: "Read twenty pages")), "Read twenty pages")
    }

    func testSummarizesTracks() {
        let wake = makeItem(id: "w", key: "wake")
        let earned = makeItem(id: "e", type: .number, target: .min(100), key: "earned", unit: "$")
        let logs = [tick("w", "2026-10-05"), makeLog("e", "2026-10-05", value: 40.4, checked: true)]
        let day = Scoring.summarizeDay("2026-10-05", [wake, earned], [], logs)
        let tracks = Tracks.summarize(day.items)
        XCTAssertEqual(tracks.count, 2)
        XCTAssertEqual(tracks[0].value, "1/1")
        XCTAssertEqual(tracks[1].value, "$40")
        XCTAssertEqual(tracks[1].progress, 0.404, accuracy: 0.0001)
    }
}
