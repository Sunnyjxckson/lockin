import Foundation

// Loads and writes for the Plan screen. Port of src/features/schedule/actions.ts and src/features/calendar/client.ts.
// Extensions cannot hold stored state, so the screen keeps what it shows in PlanModel and calls these.
// Google OAuth stays on the server: this only calls /api/calendar/status, /calendars and /sync.

/// Blocks edited on this device since the last sync, so a local move can win over an older change in Google.
@MainActor
public enum PlanCalendarEdits {
    public private(set) static var edits: [String: String] = [:]

    public static func note(_ ids: [String]) {
        let at = LIDate.nowIso()
        for id in ids { edits[id] = at }
    }

    static func clear(sent: [String: String]) {
        for (id, at) in sent where edits[id] == at { edits[id] = nil }
    }
}

public struct PlanCalendarStatus: Decodable, Equatable {
    public var configured: Bool = false
    public var missing: [String] = []
    public var connected: Bool = false
    public var storage: String = "database"
    public var redirectUri: String = ""
    public var calendarId: String? = nil
    public var calendarName: String? = nil
    public var importWritable: Bool? = nil
    public var lastSyncAt: String? = nil

    public init() {}

    private enum Keys: String, CodingKey {
        case configured, missing, connected, storage, redirectUri, calendarId, calendarName, importWritable, lastSyncAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        configured = (try? c.decode(Bool.self, forKey: .configured)) ?? false
        missing = (try? c.decode([String].self, forKey: .missing)) ?? []
        connected = (try? c.decode(Bool.self, forKey: .connected)) ?? false
        storage = (try? c.decode(String.self, forKey: .storage)) ?? "database"
        redirectUri = (try? c.decode(String.self, forKey: .redirectUri)) ?? ""
        calendarId = try? c.decode(String.self, forKey: .calendarId)
        calendarName = try? c.decode(String.self, forKey: .calendarName)
        importWritable = try? c.decode(Bool.self, forKey: .importWritable)
        lastSyncAt = try? c.decode(String.self, forKey: .lastSyncAt)
    }
}

public struct PlanCalendarChoice: Decodable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var primary: Bool
    public var writable: Bool
}

public struct PlanSyncOutcome: Equatable {
    public var ok: Bool
    public var pulled: Int
    public var pushed: Int
    public var removed: Int
    public var errors: [String]
    public var lastSyncAt: String?

    public var summary: String {
        var parts: [String] = []
        if pulled > 0 { parts.append("\(pulled) in") }
        if pushed > 0 { parts.append("\(pushed) out") }
        if removed > 0 { parts.append("\(removed) removed") }
        return parts.isEmpty ? "Already in step" : parts.joined(separator: ", ")
    }
}

private struct CalendarSyncResponse: Decodable {
    struct Stats: Decodable {
        var pulled: Int = 0
        var pushed: Int = 0
        var removed: Int = 0
    }
    var localOps: [JSON] = []
    var stats: Stats = Stats()
    var partial: Bool = false
    var errors: [String] = []
    var lastSyncAt: String? = nil

    private enum Keys: String, CodingKey { case localOps, stats, partial, errors, lastSyncAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        localOps = (try? c.decode([JSON].self, forKey: .localOps)) ?? []
        stats = (try? c.decode(Stats.self, forKey: .stats)) ?? Stats()
        partial = (try? c.decode(Bool.self, forKey: .partial)) ?? false
        errors = (try? c.decode([String].self, forKey: .errors)) ?? []
        lastSyncAt = try? c.decode(String.self, forKey: .lastSyncAt)
    }
}

private struct CalendarListResponse: Decodable {
    var calendars: [PlanCalendarChoice] = []
}

extension AppStore {
    /// Template days this far ahead are sent to Google.
    public static let planExportDays = 7
    /// How many days, from today, a sync round reads.
    public static let planSyncDays = 28

    // MARK: loads

    /// Per-day rows between two dates, and every template row. The screen resolves a day with Blocks.resolveBlocks.
    public func planLoad(from: DateStr, to: DateStr) async throws -> (rows: [ScheduleBlock], template: [ScheduleTemplate]) {
        async let rows = db.list(ScheduleBlock.self, Query(from: from, to: to))
        async let template = db.list(ScheduleTemplate.self, Query(orderBy: "start"))
        let r = try await rows
        let t = try await template
        return (r, t)
    }

    // MARK: day writes

    private func planRowId(_ date: DateStr, _ b: DayBlock) -> String {
        if !b.persisted, let tid = b.templateId, b.id.hasPrefix("template:") {
            return PlanRules.materializedId(date, tid)
        }
        return b.id
    }

    /// Save a day. `before` is what the screen showed, `after` is what it should show now. The first save of a template day
    /// copies the whole day into schedule_block, so the change touches this date only and never the template.
    /// Returns false when nothing needed writing.
    @discardableResult
    public func planSaveDay(_ date: DateStr, before: [DayBlock], after: [DayBlock]) async throws -> Bool {
        var from = before
        var to = after
        let fresh = from.isEmpty || from.contains(where: { !$0.persisted })
        if fresh {
            // Another device or a calendar sync may have given the day its rows a moment ago. Work against those.
            let existing = try await db.list(ScheduleBlock.self, Query(eq: ["date": .string(date)]))
            if !existing.isEmpty {
                from = Blocks.blocksFromRows(existing)
                let known = Set(existing.map { $0.id })
                to = to.map { (b: DayBlock) -> DayBlock in
                    let id = planRowId(date, b)
                    if known.contains(id) {
                        var c = b
                        c.id = id
                        c.persisted = true
                        return c
                    }
                    return b
                }
            }
        }
        var edited: [String] = []
        var old: [String: DayBlock] = [:]
        for b in before { old[planRowId(date, b)] = b }
        for b in after {
            let id = planRowId(date, b)
            if let prev = old[id], !(prev.blockName == b.blockName && prev.start == b.start && prev.duration == b.duration) {
                edited.append(id)
            }
        }
        let write = PlanRules.planDayWrite(date, before: from, after: to)
        if !write.insert.isEmpty { _ = try await db.insertMany(ScheduleBlock.self, write.insert) }
        for u in write.update { _ = try await db.update(ScheduleBlock.self, id: u.id, patch: u.patch) }
        for id in write.remove { try await db.remove(ScheduleBlock.self, id: id) }
        if write.isEmpty { return false }
        PlanCalendarEdits.note(edited)
        return true
    }

    /// Drop the day's own rows so it follows the weekday template again.
    public func planResetDay(_ date: DateStr) async throws {
        _ = try await db.removeWhere(ScheduleBlock.self, eq: ["date": .string(date)])
        PlanCalendarEdits.note([])
    }

    // MARK: template writes

    public static func templateRow(weekday: Int, blockName: String, start: TimeStr, end: TimeStr, kind: BlockKind, flexible: Bool, note: String?) -> JSONObject {
        return [
            "weekday": .int(weekday),
            "block_name": .string(blockName),
            "start": .string(start),
            "end": .string(end),
            "kind": .string(kind.rawValue),
            "flexible": .bool(flexible),
            "note": JSON.str(note),
        ]
    }

    public func planAddTemplate(_ row: JSONObject) async throws -> ScheduleTemplate {
        return try await db.insert(ScheduleTemplate.self, row)
    }

    public func planUpdateTemplate(id: String, patch: JSONObject) async throws -> ScheduleTemplate {
        return try await db.update(ScheduleTemplate.self, id: id, patch: patch)
    }

    public func planRemoveTemplate(id: String) async throws {
        try await db.remove(ScheduleTemplate.self, id: id)
    }

    // MARK: Google Calendar

    private func planCalendarCall(_ path: String, method: String = "GET", body: JSONObject? = nil) async throws -> Data {
        var data: Data? = nil
        if let body = body { data = try JSONEncoder().encode(JSON.object(body)) }
        let (out, status) = try await db.api.send(path: path, method: method, body: data)
        if status == 401 { throw APIError.unauthorized }
        if !(200..<300).contains(status) {
            let message = Self.planCalendarError(out)
            throw APIError.server(message == "not_connected" ? "Google Calendar is not connected." : (message ?? "Request failed (\(status))"), status)
        }
        return out
    }

    private static func planCalendarError(_ data: Data) -> String? {
        struct Body: Decodable { var error: String? }
        return (try? JSONDecoder().decode(Body.self, from: data))?.error
    }

    public func planCalendarStatus() async throws -> PlanCalendarStatus {
        let data = try await planCalendarCall("/api/calendar/status")
        guard let status = try? JSONDecoder().decode(PlanCalendarStatus.self, from: data) else { throw APIError.badResponse }
        return status
    }

    public func planCalendarChoices() async throws -> [PlanCalendarChoice] {
        let data = try await planCalendarCall("/api/calendar/calendars")
        return (try? JSONDecoder().decode(CalendarListResponse.self, from: data))?.calendars ?? []
    }

    public func planCalendarChoose(_ id: String?) async throws {
        _ = try await planCalendarCall("/api/calendar/calendars", method: "POST", body: ["calendarId": JSON.str(id)])
    }

    public func planCalendarDisconnect() async throws {
        _ = try await planCalendarCall("/api/calendar/disconnect", method: "POST", body: [:])
    }

    /// A DayBlock the way the sync route reads it (the web DayBlock shape).
    private func planSyncBlock(_ b: DayBlock) -> JSON {
        return .object([
            "id": .string(b.id),
            "date": .string(b.date),
            "block_name": .string(b.blockName),
            "start": .string(b.start),
            "end": .string(b.end),
            "duration": .int(b.duration),
            "flexible": .bool(b.flexible),
            "kind": .string(b.kind.rawValue),
            "note": JSON.str(b.note),
            "calendar_event_id": JSON.str(b.calendarEventId),
            "template_id": JSON.str(b.templateId),
            "source": .string(b.source.rawValue),
            "persisted": .bool(b.persisted),
        ])
    }

    /// One or more sync rounds over today and the next four weeks. A big first sync can take more than one round.
    public func planCalendarSync() async throws -> PlanSyncOutcome {
        let today = LIDate.todayNY()
        let to = LIDate.addDays(today, AppStore.planSyncDays - 1)
        let lastExport = LIDate.addDays(today, AppStore.planExportDays - 1)
        let exportDates = LIDate.dateRange(today, lastExport < to ? lastExport : to)
        var out = PlanSyncOutcome(ok: true, pulled: 0, pushed: 0, removed: 0, errors: [], lastSyncAt: nil)
        for _ in 0..<3 {
            let sent = PlanCalendarEdits.edits
            let loaded = try await planLoad(from: today, to: to)
            let days: [JSON] = LIDate.dateRange(today, to).map { date in
                let blocks = Blocks.resolveBlocks(date, rows: loaded.rows, template: loaded.template)
                return .object(["date": .string(date), "blocks": .array(blocks.map { planSyncBlock($0) })])
            }
            var editsJSON: JSONObject = [:]
            for (id, at) in sent { editsJSON[id] = .string(at) }
            let body: JSONObject = [
                "days": .array(days),
                "exportDates": .array(exportDates.map { JSON.string($0) }),
                "edits": .object(editsJSON),
            ]
            let data = try await planCalendarCall("/api/calendar/sync", method: "POST", body: body)
            guard let res = try? JSONDecoder().decode(CalendarSyncResponse.self, from: data) else { throw APIError.badResponse }
            await planApplyLocalOps(res.localOps)
            out.pulled += res.stats.pulled
            out.pushed += res.stats.pushed
            out.removed += res.stats.removed
            out.errors.append(contentsOf: res.errors)
            out.lastSyncAt = res.lastSyncAt
            if res.errors.isEmpty && !res.partial { PlanCalendarEdits.clear(sent: sent) }
            if !res.partial { break }
        }
        out.ok = out.errors.isEmpty
        return out
    }

    /// Make the changes a sync round asked for. A change whose row is gone is skipped.
    private func planApplyLocalOps(_ ops: [JSON]) async {
        for op in ops {
            guard case .object(let o) = op, case .string(let kind)? = o["op"] else { continue }
            do {
                if kind == "materialize" {
                    guard case .string(let date)? = o["date"], case .array(let rows)? = o["rows"] else { continue }
                    let have = try await db.list(ScheduleBlock.self, Query(eq: ["date": .string(date)], limit: 1))
                    if have.isEmpty {
                        var objects: [JSONObject] = []
                        for r in rows { if case .object(let ro) = r { objects.append(ro) } }
                        _ = try await db.insertMany(ScheduleBlock.self, objects)
                    }
                } else if kind == "create" {
                    guard case .object(let row)? = o["row"] else { continue }
                    var twins: [ScheduleBlock] = []
                    if case .string(let eid)? = row["calendar_event_id"] {
                        twins = try await db.list(ScheduleBlock.self, Query(eq: ["calendar_event_id": .string(eid)], limit: 1))
                    }
                    if twins.isEmpty { _ = try await db.insert(ScheduleBlock.self, row) }
                } else if kind == "update" {
                    guard case .string(let id)? = o["id"], case .object(let patch)? = o["patch"] else { continue }
                    _ = try await db.update(ScheduleBlock.self, id: id, patch: patch)
                } else if kind == "delete" {
                    guard case .string(let id)? = o["id"] else { continue }
                    try await db.remove(ScheduleBlock.self, id: id)
                }
            } catch {
                // The row changed under us. The next round sees the real state and settles it.
            }
        }
    }
}
