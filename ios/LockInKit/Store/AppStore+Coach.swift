import Foundation

// The coach on the phone: the chat (coach_message), the notes (coach_note) and the check-ins. Same flow as
// src/features/coach/chat.ts and data.ts. The wording is written by the existing routes /api/coach and
// /api/coach/chat, which are handed the same snapshot the web builds. Nothing here calls Anthropic.

public struct CoachAnswer: Equatable {
    public var body: String
    public var source: String
    public var quote: String?
}

public enum CoachError: Error, Equatable, LocalizedError {
    /// The route answered with nothing usable.
    case noAnswer
    /// There is no data to write from yet.
    case notReady

    public var errorDescription: String? {
        switch self {
        case .noAnswer: return "The coach did not answer. Try again."
        case .notReady: return "Nothing to write from yet."
        }
    }
}

extension AppStore {
    /// The first day the coach reads from. Today when no history has been set.
    public var coachHistoryStart: DateStr {
        let h = settings?.historyStart ?? ""
        return h.isEmpty ? LIDate.todayNY() : h
    }

    static var coachNotesRunning = false
    static var coachCheckinsRunning = false

    // MARK: reading

    /// The thread, oldest first.
    public func loadCoachMessages(limit: Int = 200) async throws -> [CoachMessage] {
        let rows = try await db.list(CoachMessage.self, Query(orderBy: "sent_at", ascending: false, limit: limit))
        return Array(rows.reversed())
    }

    /// The voice and check-in switches as they are saved now (Settings changes them).
    public func coachSettings() async -> (voice: CoachVoice, checkins: CoachCheckins) {
        if let fresh = try? await db.get(AppSettings.self, id: "app") {
            return (fresh.coachVoice, fresh.coachCheckins)
        }
        return (settings?.coachVoice ?? .stoic, settings?.coachCheckins ?? CoachCheckins())
    }

    public func unreadCoachCount() async -> Int {
        let rows = (try? await db.list(CoachMessage.self, Query(eq: ["read": .bool(false)], limit: 50))) ?? []
        return rows.count
    }

    /// The chat was opened: nothing is unread any more.
    public func markCoachRead(_ ids: [String]) async {
        for id in ids {
            _ = try? await db.update(CoachMessage.self, id: id, patch: ["read": .bool(true)])
        }
    }

    // MARK: what the coach knows

    /// Everything the coach reads, in one go. Loads Today's data first when it is not in yet.
    public func loadCoachData() async throws -> CoachData? {
        if settings == nil { await reload() }
        guard let s = settings else { return nil }
        let t = today
        let back = LIDate.addDays(t, -120)
        let hs = coachHistoryStart
        let start = hs > back ? hs : back
        async let mealsReq = db.list(Meal.self, Query(from: LIDate.addDays(t, -14), to: t, orderBy: "date"))
        async let bodyReq = db.list(BodyLog.self, Query(to: t, orderBy: "date"))
        async let setsReq = db.list(SetLog.self, Query(from: LIDate.addDays(t, -42), to: t, orderBy: "date"))
        async let slipsReq = db.list(ViceSlip.self, Query(from: start, to: t, orderBy: "date"))
        async let focusReq = db.list(FocusSession.self, Query(from: LIDate.addDays(t, -14), to: t, orderBy: "date"))
        let meals = try await mealsReq
        let bodyLogs = try await bodyReq
        let setLogs = try await setsReq
        let slips = try await slipsReq
        let focus = try await focusReq
        let coachBlocks = blocks.map { CoachBlock(blockName: $0.blockName, start: $0.start, end: $0.end, kind: $0.kind.rawValue) }
        return CoachData(
            today: t,
            historyStart: hs,
            challenge: mode.challenge,
            floor: floor,
            weightUnit: s.weightUnit.rawValue,
            carbsTarget: s.carbsTarget,
            fatTarget: s.fatTarget,
            focusGoalMinutes: s.focusGoalMinutes,
            items: items,
            versions: versions,
            logs: logs.filter { $0.date >= start },
            earnings: earnings,
            meals: meals,
            bodyLogs: bodyLogs,
            setLogs: setLogs,
            slips: slips,
            workouts: workouts,
            blocks: coachBlocks,
            focus: focus
        )
    }

    /// Their own reasons, in their words: boards, the notes on them, the business goal.
    func loadCoachWhy() async -> [String] {
        let boards = (try? await db.list(Board.self, Query(orderBy: "sort_order"))) ?? []
        let notes = (try? await db.list(BoardItem.self, Query(eq: ["kind": .string("note")], orderBy: "sort_order"))) ?? []
        var out: [String] = []
        for b in boards.prefix(4) {
            let own = notes
                .filter { $0.boardId == b.id && !($0.note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                .prefix(3)
                .map { String(($0.note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(140)) }
            out.append(own.isEmpty ? "\(b.name) board" : "\(b.name) board: \(own.joined(separator: " / "))")
        }
        let goal = (settings?.businessGoal ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !goal.isEmpty { out.append("Business goal: \(String(goal.prefix(200)))") }
        return out.map { CoachText.cleanCoachText($0) }
    }

    // MARK: talking to the routes

    func coachPost(_ path: String, _ body: JSON) async throws -> JSONObject {
        let data = try JSONEncoder().encode(body)
        let (reply, status) = try await db.api.send(path: path, method: "POST", body: data)
        if status == 401 { throw APIError.unauthorized }
        if !(200..<300).contains(status) {
            throw APIError.server(APIClient.errorMessage(from: reply) ?? "The coach could not answer (\(status)).", status)
        }
        guard let json = try? JSONDecoder().decode(JSON.self, from: reply), case .object(let o) = json else { throw CoachError.noAnswer }
        return o
    }

    // MARK: chat

    /// Save their message. Throws only when it could not be saved.
    public func saveCoachUserMessage(_ text: String) async throws -> CoachMessage {
        var body = text.replacingOccurrences(of: "\\s+\\n", with: "\n", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        if body.count > CoachChat.maxMessage { body = String(body.prefix(CoachChat.maxMessage)) }
        let row: JSONObject = [
            "date": .string(LIDate.todayNY()),
            "sent_at": .string(LIDate.nowIso()),
            "sender": .string("me"),
            "body": .string(body),
            "trigger": .string("chat"),
            "source": .null,
            "quote": .null,
            "check_key": .null,
            "read": .bool(true),
        ]
        return try await db.insert(CoachMessage.self, row)
    }

    /// Ask the route for the answer to the last message in `history` (oldest first, ending with their message), then save it.
    public func requestCoachReply(history: [CoachMessage]) async throws -> CoachMessage {
        guard let data = try await loadCoachData() else { throw CoachError.notReady }
        let t = data.today
        let prefs = await coachSettings()
        let why = await loadCoachWhy()
        let snapshot = CoachSnapshotBuilder.buildSnapshot(data)

        let day = summary
        let left = (day?.items ?? []).filter { !$0.done }.map { $0.item.name }
        let now: JSONObject = [
            "time": .string(LIDate.formatTime(LIDate.timeNY())),
            "done": .int(day?.done ?? 0),
            "total": .int(day?.total ?? 0),
            "left": .array(left.map { JSON.string($0) }),
        ]
        let context: JSONObject = ["snapshot": .object(snapshot), "now": .object(now), "why": .array(why.map { JSON.string($0) })]

        let turns: [JSON] = history.suffix(CoachChat.maxTurns).map { m in
            JSON.object(["sender": .string(m.sender.rawValue), "body": .string(m.body)])
        }
        let usedRows = (try? await db.list(CoachMessage.self, Query(from: LIDate.addDays(t, -CoachChat.quoteRestDays), to: t, orderBy: "sent_at"))) ?? []
        let used = CoachChat.quotesUsedSince(usedRows, since: LIDate.addDays(t, -(CoachChat.quoteRestDays - 1)))

        let request: JSON = .object([
            "context": .object(context),
            "turns": .array(turns),
            "voice": .string(prefs.voice.rawValue),
            "used": .array(used.map { JSON.string($0) }),
            "library": .array([]),
        ])
        let reply = try await coachPost("/api/coach/chat", request)
        guard let raw = reply["body"]?.stringValue, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CoachError.noAnswer }
        let source = reply["source"]?.stringValue == "ai" ? "ai" : "fallback"
        let quote = reply["quote"]?.stringValue
        let row: JSONObject = [
            "date": .string(LIDate.todayNY()),
            "sent_at": .string(LIDate.nowIso()),
            "sender": .string("coach"),
            "body": .string(CoachText.cleanCoachText(raw)),
            "trigger": .string("chat"),
            "source": .string(source),
            "quote": JSON.str((quote ?? "").isEmpty ? nil : quote),
            "check_key": .null,
            "read": .bool(true),
        ]
        return try await db.insert(CoachMessage.self, row)
    }

    // MARK: check-ins

    static func isUniqueViolation(_ error: Error) -> Bool {
        guard let api = error as? APIError, case .server(let message, let status) = api else { return false }
        let m = message.lowercased()
        return status == 409 || m.contains("duplicate") || m.contains("unique") || m.contains("23505")
    }

    /// Send the check-ins that are due and were not sent yet: after the workout block, after a slip, after yesterday's
    /// misses. Safe to call often. Returns how many were sent.
    @discardableResult
    public func syncCoachCheckins() async throws -> Int {
        if AppStore.coachCheckinsRunning { return 0 }
        AppStore.coachCheckinsRunning = true
        defer { AppStore.coachCheckinsRunning = false }

        let prefs = await coachSettings()
        let enabled = prefs.checkins
        if !enabled.postWorkout && !enabled.slip && !enabled.missedItem { return 0 }
        guard let data = try await loadCoachData() else { return 0 }
        let t = data.today
        if t < data.historyStart { return 0 }
        let sentRows = try await db.list(CoachMessage.self, Query(from: LIDate.addDays(t, -1), to: t))
        let day = summary
        let main = data.workouts.first(where: { $0.weekday == LIDate.weekdayOf(t) && $0.slot == .main })
        var workoutName: String? = nil
        if let m = main, m.kind != .rest { workoutName = m.name }
        let workoutDone = (day?.items ?? []).contains { $0.item.key == "workout" && $0.done }
        let slips: [CoachCheckinSlip] = data.slips.filter { $0.date == t }.map { s in
            let name = data.items.first(where: { $0.id == s.itemId })?.name ?? "a vice"
            let trigger = (s.trigger ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return CoachCheckinSlip(id: s.id, vice: CoachText.viceName(name), time: s.time, trigger: trigger.isEmpty ? nil : trigger)
        }
        var sent = Set<String>()
        for m in sentRows { if let k = m.checkKey, !k.isEmpty { sent.insert(k) } }
        let due = CoachChat.dueCheckins(CoachCheckinInput(
            today: t,
            time: LIDate.timeNY(),
            enabled: enabled,
            voice: prefs.voice,
            blocks: data.blocks,
            workoutName: workoutName,
            workoutDone: workoutDone,
            slips: slips,
            yesterday: CoachSnapshotBuilder.yesterdayLine(data),
            sent: sent
        ))
        var count = 0
        let base = Date()
        for (i, c) in due.enumerated() {
            do {
                // A millisecond apart, so they keep this order in the thread.
                let at = LIDate.nowIso(base.addingTimeInterval(Double(i) / 1000.0))
                let row: JSONObject = [
                    "date": .string(t),
                    "sent_at": .string(at),
                    "sender": .string("coach"),
                    "body": .string(c.body),
                    "trigger": .string(c.trigger.rawValue),
                    "source": .string("fallback"),
                    "quote": .null,
                    "check_key": .string(c.checkKey),
                    "read": .bool(false),
                ]
                _ = try await db.insert(CoachMessage.self, row)
                count += 1
            } catch {
                // Another device sent this one first.
                if !AppStore.isUniqueViolation(error) { throw error }
            }
        }
        return count
    }

    // MARK: notes

    /// All notes, newest first.
    public func loadCoachNotes() async throws -> [CoachNote] {
        return try await db.list(CoachNote.self, Query(orderBy: "date", ascending: false))
    }

    /// Ask /api/coach to write a note from the snapshot.
    func writeCoachNote(kind: CoachNoteKind, snapshot: JSONObject) async throws -> CoachAnswer {
        let reply = try await coachPost("/api/coach", .object(["kind": .string(kind.rawValue), "snapshot": .object(snapshot)]))
        guard let raw = reply["body"]?.stringValue, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CoachError.noAnswer }
        return CoachAnswer(body: CoachText.cleanCoachText(raw), source: reply["source"]?.stringValue == "ai" ? "ai" : "fallback", quote: nil)
    }

    func saveCoachNote(kind: CoachNoteKind, date: DateStr, answer: CoachAnswer, basis: String?) async throws {
        let existing = try await db.first(CoachNote.self, Query(eq: ["date": .string(date), "kind": .string(kind.rawValue)]))
        if let e = existing {
            _ = try await db.update(CoachNote.self, id: e.id, patch: ["body": .string(answer.body), "source": .string(answer.source), "basis": JSON.str(basis)])
        } else {
            _ = try await db.insert(CoachNote.self, ["date": .string(date), "kind": .string(kind.rawValue), "body": .string(answer.body), "source": .string(answer.source), "basis": JSON.str(basis)])
        }
    }

    /// The coach's routine: write today's brief if it is missing or out of date, and the Sunday review when it is due.
    /// Only talks to the route when a note is actually missing. Safe to call on every open.
    public func syncCoachNotes(regenerate: Bool = false, weekly: Bool = false) async throws {
        if AppStore.coachNotesRunning { return }
        AppStore.coachNotesRunning = true
        defer { AppStore.coachNotesRunning = false }

        guard let data = try await loadCoachData() else { return }
        let t = data.today
        let basis = CoachChat.briefBasis(data.challenge, floor: data.floor)
        if t >= data.historyStart {
            let brief = try await db.first(CoachNote.self, Query(eq: ["date": .string(t), "kind": .string("morning")]))
            if brief == nil || regenerate || CoachChat.briefIsStale(brief, basis: basis) {
                let snapshot = CoachSnapshotBuilder.buildSnapshot(data)
                let answer = try await writeCoachNote(kind: .morning, snapshot: snapshot)
                try await saveCoachNote(kind: .morning, date: t, answer: answer, basis: basis)
            }
        }
        if let due = CoachChat.reviewDue(today: t, time: LIDate.timeNY(), historyStart: data.historyStart) {
            let review = try await db.first(CoachNote.self, Query(eq: ["date": .string(due.weekEnd), "kind": .string("weekly")]))
            if weekly || (review == nil && due.auto) {
                let snapshot = CoachSnapshotBuilder.buildSnapshot(data, weekOf: due.weekEnd)
                let answer = try await writeCoachNote(kind: .weekly, snapshot: snapshot)
                try await saveCoachNote(kind: .weekly, date: due.weekEnd, answer: answer, basis: nil)
            }
        }
    }

    /// Hide a flag. It stays hidden until the pattern clears.
    public func dismissCoachFlag(_ note: CoachNote) async throws {
        guard let body = CoachChat.flagBody(note.body, dismissedOn: LIDate.todayNY()) else { return }
        _ = try await db.update(CoachNote.self, id: note.id, patch: ["body": .string(body)])
    }

    /// Bring a dismissed flag back.
    public func restoreCoachFlag(_ note: CoachNote) async throws {
        guard let body = CoachChat.flagBody(note.body, dismissedOn: nil) else { return }
        _ = try await db.update(CoachNote.self, id: note.id, patch: ["body": .string(body)])
    }
}
