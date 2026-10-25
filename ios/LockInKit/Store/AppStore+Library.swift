import Foundation
import Observation
import UserNotifications

// The Library's reading state: what was read, saved and noted (quote_state), where the reader was left
// (app_settings.library_position), and the drops that go out as local notifications.
// Port of src/features/library/state.ts and dropsRuntime.ts.

/// The marks and the position, kept in memory. Screens read the map and never the db, so a card costs nothing to draw.
/// A write updates the map first, then goes to the db in order.
@Observable
@MainActor
public final class LibraryModel {
    @ObservationIgnored public let db: DBClient
    @ObservationIgnored public let catalog: LibraryCatalog

    public private(set) var marks: LibraryMarks = [:]
    /// False until the table has been read once.
    public private(set) var ready = false
    /// Set when the table could not be read. Nothing is counted or saved until it can.
    public private(set) var problem: String? = nil
    public private(set) var position: LibraryPosition? = nil
    /// Goes up when a read lands, for light feedback.
    public private(set) var readTick = 0

    @ObservationIgnored private var chain: Task<Void, Never>? = nil
    @ObservationIgnored private var inFlight = 0
    @ObservationIgnored private var loading = false
    @ObservationIgnored private var pending: LibraryPosition? = nil
    @ObservationIgnored private var positionTimer: Task<Void, Never>? = nil

    public init(db: DBClient, catalog: LibraryCatalog = LibraryCatalog.shared) {
        self.db = db
        self.catalog = catalog
    }

    // MARK: reading

    /// Read the table. Safe to call any number of times.
    public func load() async {
        if loading { return }
        loading = true
        defer { loading = false }
        do {
            let rows = try await db.list(QuoteState.self)
            var map: LibraryMarks = [:]
            for r in rows {
                map[r.quoteId] = QuoteMark(quoteId: r.quoteId, writer: r.writer, work: r.work, readAt: r.readAt, savedAt: r.savedAt, note: r.note)
            }
            // A write of ours that has not landed is ahead of the table. Keep the map then.
            if inFlight == 0 { marks = map }
            ready = true
            problem = nil
        } catch {
            let message = (error as? APIError)?.errorDescription ?? "Could not load your reading."
            let lower = message.lowercased()
            if lower.contains("does not exist") || lower.contains("schema") || lower.contains("relation") {
                problem = "The Library tables are not set up yet."
            } else {
                problem = message
            }
        }
        if position == nil, let s = try? await db.get(AppSettings.self, id: "app") {
            position = s.libraryPosition
        }
    }

    public func retry() async {
        problem = nil
        await load()
    }

    // MARK: writes

    private func apply(_ q: LibQuote, _ change: (inout QuoteMark) -> Void) {
        var m = marks[q.id] ?? QuoteMark(quoteId: q.id, writer: q.writer, work: q.work)
        change(&m)
        marks[q.id] = m
        let row: JSONObject = [
            "quote_id": .string(m.quoteId),
            "writer": .string(m.writer),
            "work": .string(m.work),
            "read_at": JSON.str(m.readAt),
            "saved_at": JSON.str(m.savedAt),
            "note": JSON.str(m.note),
        ]
        inFlight += 1
        let before = chain
        chain = Task { [weak self] in
            await before?.value
            guard let self = self else { return }
            do {
                _ = try await self.db.upsert(QuoteState.self, row, conflict: ["quote_id"])
            } catch {
                self.inFlight -= 1
                await self.load()
                return
            }
            self.inFlight -= 1
        }
    }

    /// Mark a quote read. True when it was not read before.
    @discardableResult
    public func markRead(_ q: LibQuote, at: String = LIDate.nowIso()) -> Bool {
        if !ready { return false }
        if marks[q.id]?.readAt != nil { return false }
        apply(q) { $0.readAt = at }
        readTick += 1
        return true
    }

    public func setSaved(_ q: LibQuote, _ saved: Bool, at: String = LIDate.nowIso()) {
        if !ready { return }
        if (marks[q.id]?.savedAt != nil) == saved { return }
        apply(q) { $0.savedAt = saved ? at : nil }
    }

    /// Keep a note. A note on a quote saves it. An empty note removes it.
    public func setNote(_ q: LibQuote, _ text: String, at: String = LIDate.nowIso()) {
        if !ready { return }
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let note: String? = t.isEmpty ? nil : t
        let was = marks[q.id]
        if was?.note == note { return }
        apply(q) { m in
            m.note = note
            if note != nil && m.savedAt == nil { m.savedAt = at }
        }
    }

    // MARK: position

    /// Remember where the reader is. Written at most about every 1.5 seconds, and flushed when the reader closes.
    public func savePosition(_ p: LibraryPosition) {
        pending = p
        position = p
        if positionTimer == nil {
            positionTimer = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                await self?.flushPosition()
            }
        }
    }

    public func flushPosition() async {
        positionTimer?.cancel()
        positionTimer = nil
        guard let p = pending else { return }
        pending = nil
        _ = try? await db.update(AppSettings.self, id: "app", patch: ["library_position": JSON.from(p)])
    }

    // MARK: derived

    public var counts: LibraryCounts? {
        guard let index = try? catalog.index() else { return nil }
        return LibraryProgress.libraryCounts(index, marks)
    }

    public var savedIds: [String] {
        return marks.values.filter { $0.savedAt != nil }.sorted { ($0.savedAt ?? "") > ($1.savedAt ?? "") }.map { $0.quoteId }
    }

    public func readToday(_ date: DateStr) -> Int {
        return LibraryQueue.readOnDate(marks, date)
    }
}

// MARK: drops

extension AppStore {
    /// Turn the drops on or off from Settings or the Library. Asks for notification permission the first time.
    /// Returns false when the person said no to notifications.
    public func setDrops(enabled: Bool, perDay: Int? = nil) async -> Bool {
        if enabled {
            let status = await NotificationScheduler.status()
            if status == .notDetermined {
                // The one place that asks for permission.
                if !(await NotificationScheduler.requestAuthorization()) { return false }
            } else if status == .denied {
                return false
            }
        }
        var patch: JSONObject = ["drops_enabled": .bool(enabled)]
        if let n = perDay { patch["drops_per_day"] = .int(Drops.dropsPerDay(n)) }
        do {
            _ = try await db.update(AppSettings.self, id: "app", patch: patch)
        } catch {
            return false
        }
        await reload()
        await rescheduleDrops()
        return true
    }

    /// Plan the next week of drops and hand them to the system. Safe to call on every launch and every return to the
    /// app. Only touches notifications whose identifier starts with "drop.".
    public func rescheduleDrops() async {
        // One run at a time. A call that arrives meanwhile runs again afterwards, so the last state wins.
        if AppStore.dropsRunning {
            AppStore.dropsAgain = true
            return
        }
        AppStore.dropsRunning = true
        repeat {
            AppStore.dropsAgain = false
            await rescheduleDropsOnce()
        } while AppStore.dropsAgain
        AppStore.dropsRunning = false
    }

    private static var dropsRunning = false
    private static var dropsAgain = false
    /// Tomorrow's blocks when the app has them, so tomorrow's morning drop lands at tomorrow's wake block and the
    /// reminder planner folds against the same time. Set by the coordinator before it replans.
    public static var tomorrowDropBlocks: (date: DateStr, blocks: [DayBlock])? = nil
    private static var readCache: (at: Date, ids: Set<String>)? = nil

    /// How many days of morning quotes the widget snapshot carries: today and the next two.
    static let widgetQuoteDays = 3

    /// The morning drop's quote (slot 0) for today and the next days, for the quote widgets. When he has lines of his
    /// own the quote is one of them, picked by date like the drop. Otherwise a day that already has a library quote
    /// in the last snapshot keeps it, so reading the quote in the Library does not swap it for another one.
    func widgetQuotes() -> [WidgetQuote] {
        let t = LIDate.todayNY()
        if !AppStore.ownLines.isEmpty {
            var mine: [WidgetQuote] = []
            for offset in 0..<AppStore.widgetQuoteDays {
                let date = LIDate.addDays(t, offset)
                guard let line = Drops.pickOwnLine(AppStore.ownLines, date: date) else { continue }
                let m = Drops.ownLineMessage(line)
                mine.append(WidgetQuote(date: date, id: m.quoteId, writer: m.title, text: m.body, url: m.url))
            }
            if !mine.isEmpty { return mine }
        }
        guard let pool = try? LibraryCatalog.shared.shortPool() else { return [] }
        let per = Drops.dropsPerDay(settings?.dropsPerDay)
        let read = AppStore.readCache?.ids ?? []
        let kept = WidgetSnapshot.load()?.quotes ?? []
        var out: [WidgetQuote] = []
        for offset in 0..<AppStore.widgetQuoteDays {
            let date = LIDate.addDays(t, offset)
            if let have = kept.first(where: { $0.date == date && !$0.id.hasPrefix(Drops.ownLineIdPrefix) }) {
                out.append(have)
                continue
            }
            guard let q = Drops.pickDrop(pool, date: date, slot: 0, perDay: per, isRead: { read.contains($0) }) else { continue }
            let m = Drops.dropMessage(pool, q)
            out.append(WidgetQuote(date: date, id: m.quoteId, writer: m.title, text: m.body, url: m.url))
        }
        return out
    }

    private func rescheduleDropsOnce() async {
        // His own lines first: the drop at wake and the widget read them, drops on or not.
        await syncOwnLines()
        let center = UNUserNotificationCenter.current()
        let pendingRequests = await center.pendingNotificationRequests()
        let budget = NotificationScheduler.dropBudget(pendingIds: pendingRequests.map { $0.identifier })
        let mine = pendingRequests.map { $0.identifier }.filter { $0.hasPrefix(Drops.identifierPrefix) }
        guard let s = settings, s.dropsEnabled else {
            if !mine.isEmpty { center.removePendingNotificationRequests(withIdentifiers: mine) }
            return
        }
        let status = await center.notificationSettings().authorizationStatus
        if status != .authorized && status != .provisional && status != .ephemeral { return }
        guard let pool = try? LibraryCatalog.shared.shortPool() else { return }

        // Which quotes are read changes slowly, and this runs after every reminder reschedule: ask the server at most
        // every ten minutes.
        var read = Set<String>()
        if let c = AppStore.readCache, Date().timeIntervalSince(c.at) < 600 {
            read = c.ids
        } else if let rows = try? await db.list(QuoteState.self) {
            for r in rows where r.readAt != nil { read.insert(r.quoteId) }
            AppStore.readCache = (at: Date(), ids: read)
        }
        let t = LIDate.todayNY()
        let todays = blocks.map { WindowBlock(kind: $0.kind.rawValue, start: $0.start) }
        var tomorrowDate = ""
        var tomorrows: [WindowBlock] = []
        if let tb = AppStore.tomorrowDropBlocks, tb.date == LIDate.addDays(t, 1) {
            tomorrowDate = tb.date
            tomorrows = tb.blocks.map { WindowBlock(kind: $0.kind.rawValue, start: $0.start) }
        }
        let plan = Drops.plan(
            pool: pool,
            perDay: s.dropsPerDay,
            today: t,
            time: LIDate.timeNY(),
            quietStart: s.quietStart,
            quietEnd: s.quietEnd,
            blocksFor: { date in date == t ? todays : (date == tomorrowDate ? tomorrows : []) },
            isRead: { read.contains($0) },
            days: NotificationScheduler.dropHorizonDays,
            cap: budget,
            ownLines: AppStore.ownLines
        )
        if !mine.isEmpty { center.removePendingNotificationRequests(withIdentifiers: mine) }

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: LIDate.timeZoneId) ?? TimeZone.current
        for d in plan {
            let at = LIDate.nyInstant(d.date, d.time)
            if at <= Date() { continue }
            let content = UNMutableNotificationContent()
            content.title = d.message.title
            content.body = d.message.body
            content.sound = UNNotificationSound.default
            content.userInfo = ["url": d.message.url, "quote_id": d.message.quoteId, "kind": "drop"]
            let parts = cal.dateComponents([.year, .month, .day, .hour, .minute], from: at)
            let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            let request = UNNotificationRequest(identifier: d.identifier, content: content, trigger: trigger)
            try? await center.add(request)
        }
    }
}
