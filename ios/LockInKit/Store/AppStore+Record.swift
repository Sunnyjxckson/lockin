import Foundation

// Loads for the Record screen. Record only reads: it scores the data AppStore already holds plus the longer history,
// the body log (for the share card photos) and the latest Sunday review. Nothing here writes.

/// What Record needs beyond AppStore's own cache.
public struct RecordLoad {
    /// Day logs from the Monday before the history starts through today. Older than AppStore keeps.
    public var logs: [DayLog]
    public var bodyLogs: [BodyLog]
    /// The newest coach note of kind "weekly", if one exists.
    public var weeklyNote: CoachNote?
}

extension AppStore {
    public func recordLoad(from: DateStr, to: DateStr) async throws -> RecordLoad {
        async let logsReq = db.list(DayLog.self, Query(from: from, to: to, orderBy: "date"))
        async let bodyReq = db.list(BodyLog.self, Query(orderBy: "date"))
        async let noteReq = db.first(CoachNote.self, Query(eq: ["kind": .string("weekly")], orderBy: "date", ascending: false))
        let logs = try await logsReq
        let body = try await bodyReq
        let note = try await noteReq
        return RecordLoad(logs: logs, bodyLogs: body, weeklyNote: note)
    }
}
