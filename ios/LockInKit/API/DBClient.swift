import Foundation

/// A row type that lives in one Supabase table.
public protocol DBRow: Codable {
    static var table: String { get }
}

/// Filters for list(). Same shape as Query in src/lib/db/types.ts.
public struct Query: Equatable {
    public var eq: JSONObject = [:]
    public var from: String? = nil
    public var to: String? = nil
    public var dateField: String? = nil
    public var orderBy: String? = nil
    public var ascending: Bool? = nil
    public var limit: Int? = nil

    public init(eq: JSONObject = [:], from: String? = nil, to: String? = nil, dateField: String? = nil, orderBy: String? = nil, ascending: Bool? = nil, limit: Int? = nil) {
        self.eq = eq
        self.from = from
        self.to = to
        self.dateField = dateField
        self.orderBy = orderBy
        self.ascending = ascending
        self.limit = limit
    }

    public var json: JSON {
        var o: JSONObject = [:]
        if !eq.isEmpty { o["eq"] = .object(eq) }
        if let from = from { o["from"] = .string(from) }
        if let to = to { o["to"] = .string(to) }
        if let dateField = dateField { o["dateField"] = .string(dateField) }
        if let orderBy = orderBy { o["orderBy"] = .string(orderBy) }
        if let ascending = ascending { o["ascending"] = .bool(ascending) }
        if let limit = limit { o["limit"] = .number(Double(limit)) }
        return .object(o)
    }
}

/// Mirrors the Backend interface in src/lib/db/types.ts. Every call is one POST to /api/db with { op, table, args }.
public final class DBClient: @unchecked Sendable {
    public let api: APIClient

    public init(api: APIClient) {
        self.api = api
    }

    private struct Envelope<T: Decodable>: Decodable {
        var data: T?
        var error: String?
    }

    /// The exact body the web sends (see RemoteBackend in src/lib/db/remote.ts).
    public static func requestBody(op: String, table: String, args: [JSON]) throws -> Data {
        let body: JSON = .object(["op": .string(op), "table": .string(table), "args": .array(args)])
        return try JSONEncoder().encode(body)
    }

    private func call<T: Decodable>(_ op: String, _ table: String, _ args: [JSON], decode type: T.Type) async throws -> T? {
        let body = try DBClient.requestBody(op: op, table: table, args: args)
        let (data, status) = try await api.send(path: "/api/db", method: "POST", body: body)
        if status == 401 { throw APIError.unauthorized }
        if !(200..<300).contains(status) {
            throw APIError.server(APIClient.errorMessage(from: data) ?? "\(op) \(table) failed (\(status))", status)
        }
        guard let env = try? JSONDecoder().decode(Envelope<T>.self, from: data) else { throw APIError.badResponse }
        return env.data
    }

    // MARK: operations

    public func list<R: DBRow>(_ type: R.Type, _ query: Query = Query()) async throws -> [R] {
        let rows = try await call("list", R.table, [query.json], decode: [R].self)
        return rows ?? []
    }

    /// First row matching the query, or nil.
    public func first<R: DBRow>(_ type: R.Type, _ query: Query = Query()) async throws -> R? {
        var q = query
        q.limit = 1
        let rows = try await list(type, q)
        return rows.first
    }

    public func get<R: DBRow>(_ type: R.Type, id: String) async throws -> R? {
        return try await call("get", R.table, [.string(id)], decode: R.self)
    }

    @discardableResult
    public func insert<R: DBRow>(_ type: R.Type, _ row: JSONObject) async throws -> R {
        guard let made = try await call("insert", R.table, [.object(row)], decode: R.self) else { throw APIError.badResponse }
        return made
    }

    @discardableResult
    public func insertMany<R: DBRow>(_ type: R.Type, _ rows: [JSONObject]) async throws -> [R] {
        if rows.isEmpty { return [] }
        let made = try await call("insertMany", R.table, [.array(rows.map { JSON.object($0) })], decode: [R].self)
        return made ?? []
    }

    @discardableResult
    public func update<R: DBRow>(_ type: R.Type, id: String, patch: JSONObject) async throws -> R {
        guard let made = try await call("update", R.table, [.string(id), .object(patch)], decode: R.self) else { throw APIError.badResponse }
        return made
    }

    /// Insert, or update the row whose `conflict` columns all match.
    @discardableResult
    public func upsert<R: DBRow>(_ type: R.Type, _ row: JSONObject, conflict: [String]) async throws -> R {
        let cols: [JSON] = conflict.map { JSON.string($0) }
        guard let made = try await call("upsert", R.table, [.object(row), .array(cols)], decode: R.self) else { throw APIError.badResponse }
        return made
    }

    public func remove<R: DBRow>(_ type: R.Type, id: String) async throws {
        _ = try await call("remove", R.table, [.string(id)], decode: JSON.self)
    }

    /// Delete every row matching the equality filter. Returns how many went.
    @discardableResult
    public func removeWhere<R: DBRow>(_ type: R.Type, eq: JSONObject) async throws -> Int {
        let n = try await call("removeWhere", R.table, [.object(eq)], decode: Double.self)
        return Int(n ?? 0)
    }
}
