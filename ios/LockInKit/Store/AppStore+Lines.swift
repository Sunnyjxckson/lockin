import Foundation

// Your lines: the things he said himself, kept as `motivation` rows of kind quote. The PRD puts them first: a line
// you said yourself hits harder than a quote. The Library's Yours screen edits them, the morning drop (the one at
// wake) and the quote widget read them. Same table the web has, written through DBClient.

public struct OwnLineFailure: Error, LocalizedError, Equatable {
    public var message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { return message }
}

extension AppStore {
    /// The line he gave to start with. Put in once when he has no lines of his own yet.
    public static let seedOwnLine = "Embarrassment is an underexplored emotion. Go out there and make a fool of yourself."
    /// A line never runs longer than this.
    public static let ownLineMax = 280
    static let ownLinesSeededKey = "lockin.ownLinesSeeded"

    /// His lines as the drops and the widget read them. Filled by `syncOwnLines` and by every write.
    public static var ownLines: [OwnLine] = []
    private static var ownLinesSyncing = false

    /// His lines, in the order he keeps them.
    public func loadOwnLines() async throws -> [Motivation] {
        let rows = try await db.list(Motivation.self, Query(eq: ["kind": .string("quote")], orderBy: "sort_order"))
        return rows.sorted { a, b in
            if a.sortOrder != b.sortOrder { return a.sortOrder < b.sortOrder }
            return a.createdAt < b.createdAt
        }
    }

    /// Read his lines into the cache, putting in the starting line the first time he has none. The seed is guarded
    /// twice: it only goes in when there are no lines at all, and a flag in the app group means it never goes in
    /// again, even after he deletes every line. Safe to call often; a call while another runs does nothing.
    public func syncOwnLines() async {
        if AppStore.ownLinesSyncing { return }
        AppStore.ownLinesSyncing = true
        defer { AppStore.ownLinesSyncing = false }
        guard var rows = try? await loadOwnLines() else { return }
        let defaults = AppGroup.defaults
        if !defaults.bool(forKey: AppStore.ownLinesSeededKey) {
            if rows.isEmpty {
                let row: JSONObject = ["kind": .string("quote"), "body": .string(AppStore.seedOwnLine), "url": .null, "sort_order": .int(0)]
                if let made = try? await db.insert(Motivation.self, row) {
                    rows = [made]
                    defaults.set(true, forKey: AppStore.ownLinesSeededKey)
                }
            } else {
                defaults.set(true, forKey: AppStore.ownLinesSeededKey)
            }
        }
        setOwnLinesCache(rows)
    }

    private func setOwnLinesCache(_ rows: [Motivation]) {
        let next = rows.map { OwnLine(id: $0.id, body: $0.body) }
        if next == AppStore.ownLines { return }
        AppStore.ownLines = next
        // The widget's quote may be one of them.
        refreshWidgets()
    }

    private func cleanLine(_ text: String) throws -> String {
        let flat = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        if flat.isEmpty { throw OwnLineFailure("Write the line first.") }
        return String(flat.prefix(AppStore.ownLineMax))
    }

    /// After a write: the cache follows the table, then the notifications and the widget follow the cache.
    private func ownLinesChanged() async {
        if let rows = try? await loadOwnLines() { setOwnLinesCache(rows) }
        await rescheduleDrops()
    }

    @discardableResult
    public func addOwnLine(_ text: String) async throws -> Motivation {
        let body = try cleanLine(text)
        let current = (try? await loadOwnLines()) ?? []
        let next = (current.map { $0.sortOrder }.max() ?? -1) + 1
        let row: JSONObject = ["kind": .string("quote"), "body": .string(body), "url": .null, "sort_order": .int(next)]
        let made = try await db.insert(Motivation.self, row)
        await ownLinesChanged()
        return made
    }

    public func updateOwnLine(id: String, text: String) async throws {
        let body = try cleanLine(text)
        _ = try await db.update(Motivation.self, id: id, patch: ["body": .string(body)])
        await ownLinesChanged()
    }

    public func deleteOwnLine(id: String) async throws {
        try await db.remove(Motivation.self, id: id)
        await ownLinesChanged()
    }
}
