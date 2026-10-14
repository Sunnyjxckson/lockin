import XCTest
@testable import LockInKit

final class APITests: XCTestCase {
    func parse(_ data: Data) throws -> [String: Any] {
        let obj = try JSONSerialization.jsonObject(with: data)
        return (obj as? [String: Any]) ?? [:]
    }

    func testBuildsTheSameBodyAsTheWeb() throws {
        let q = Query(eq: ["date": .string("2026-10-05")], from: "2026-10-01", to: "2026-10-05", orderBy: "date", ascending: false, limit: 5)
        let data = try DBClient.requestBody(op: "list", table: "day_log", args: [q.json])
        let body = try parse(data)
        XCTAssertEqual(body["op"] as? String, "list")
        XCTAssertEqual(body["table"] as? String, "day_log")
        let args = body["args"] as? [Any]
        XCTAssertEqual(args?.count, 1)
        let query = args?.first as? [String: Any]
        XCTAssertEqual(query?["from"] as? String, "2026-10-01")
        XCTAssertEqual(query?["to"] as? String, "2026-10-05")
        XCTAssertEqual(query?["orderBy"] as? String, "date")
        XCTAssertEqual(query?["ascending"] as? Bool, false)
        XCTAssertEqual(query?["limit"] as? Int, 5)
        XCTAssertEqual((query?["eq"] as? [String: Any])?["date"] as? String, "2026-10-05")
    }

    func testAnEmptyQueryIsAnEmptyObject() throws {
        let data = try DBClient.requestBody(op: "list", table: "challenge", args: [Query().json])
        let body = try parse(data)
        let query = (body["args"] as? [Any])?.first as? [String: Any]
        XCTAssertEqual(query?.count, 0)
    }

    func testUpsertCarriesExplicitNulls() throws {
        let row: JSONObject = ["date": "2026-10-05", "value": .null, "checked": true, "slips": 0]
        let data = try DBClient.requestBody(op: "upsert", table: "day_log", args: [.object(row), .array([.string("date"), .string("item_id")])])
        let body = try parse(data)
        let args = body["args"] as? [Any]
        let sent = args?.first as? [String: Any]
        XCTAssertTrue(sent?["value"] is NSNull)
        XCTAssertEqual(sent?["checked"] as? Bool, true)
        XCTAssertEqual((args?[1] as? [String])?.count, 2)
    }

    func testNormalizesTheServerAddress() {
        XCTAssertEqual(APIClient.normalize("lockin.example.com")?.absoluteString, "https://lockin.example.com")
        XCTAssertEqual(APIClient.normalize("  https://lockin.example.com/  ")?.absoluteString, "https://lockin.example.com")
        XCTAssertEqual(APIClient.normalize("http://192.168.1.5:3000")?.absoluteString, "http://192.168.1.5:3000")
        XCTAssertNil(APIClient.normalize("   "))
    }

    func testReadsAnErrorBody() {
        XCTAssertEqual(APIClient.errorMessage(from: Data(#"{"error":"Wrong passcode."}"#.utf8)), "Wrong passcode.")
        XCTAssertNil(APIClient.errorMessage(from: Data("nope".utf8)))
    }

    func testReadsAuthStatus() throws {
        let s = try JSONDecoder().decode(AuthStatus.self, from: Data(#"{"mode":"server","authed":false,"problem":null}"#.utf8))
        XCTAssertEqual(s, AuthStatus(mode: "server", authed: false, problem: nil))
    }
}
