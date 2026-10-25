import Foundation
import Observation
import SwiftUI
import WidgetKit

public enum LoadState: Equatable {
    case idle
    /// First load, nothing on screen yet.
    case loading
    case loaded
    /// The last load failed. `offline` is true when the server could not be reached.
    case failed(message: String, offline: Bool)
}

/// The observable cache over the API. Loads the data Today needs, scores it with the pure logic in LockInKit/Logic,
/// writes taps back with the same upserts the web helpers use, and keeps the widget snapshot current.
@Observable
@MainActor
public final class AppStore {
    // MARK: dependencies
    @ObservationIgnored public let db: DBClient
    @ObservationIgnored private var writeChain: Task<Void, Never>? = nil
    @ObservationIgnored private var loadedOnce = false

    // MARK: raw data
    public private(set) var settings: AppSettings? = nil
    public private(set) var items: [ChecklistItem] = []
    public private(set) var savedVersions: [TargetVersion] = []
    public private(set) var challenges: [Challenge] = []
    public private(set) var logs: [DayLog] = []
    public private(set) var templates: [ScheduleTemplate] = []
    public private(set) var blockRows: [ScheduleBlock] = []
    public private(set) var workouts: [Workout] = []
    public private(set) var earnings: [Earning] = []
    public private(set) var themeRow: ThemeRow? = nil

    // MARK: derived
    public private(set) var now: Date = Date()
    public private(set) var today: DateStr = LIDate.todayNY()
    public private(set) var mode: ModeInfo = AppStore.emptyMode
    public private(set) var versions: [TargetVersion] = []
    public private(set) var summary: DaySummary? = nil
    public private(set) var challengeSummary: DaySummary? = nil
    public private(set) var week: WeekSummary? = nil
    public private(set) var streaks: [String: Streak] = [:]
    public private(set) var statusByDate: [DateStr: DayStatus] = [:]
    public private(set) var consistency: Consistency? = nil
    public private(set) var fullStreak: Int = 0
    public private(set) var blocks: [DayBlock] = []
    public private(set) var nowNext: NowNext? = nil
    public private(set) var floor: Double = 0
    public private(set) var moneyToday: Double = 0
    public private(set) var theme: LITheme = LITheme.dark
    public private(set) var tracks: [TrackSummary] = []
    public private(set) var mainWorkout: Workout? = nil
    public private(set) var coreWorkout: Workout? = nil

    // MARK: state
    public private(set) var loadState: LoadState = .idle
    /// A short message about the last failed save. Cleared when shown.
    public var saveError: String? = nil
    /// Goes up each time the last item of the day lands from a tap.
    public private(set) var celebrationTick: Int = 0
    public private(set) var refreshing = false
    @ObservationIgnored private var reloadAgain = false

    static let emptyMode = ModeInfo(mode: .ongoing, challenge: nil, day: nil, length: nil, lastDay: nil, finished: nil, upcoming: nil, historyStart: LIDate.todayNY())

    /// How far back Today reads logs. Streaks count at most this many days.
    static let historyWindow = 400

    public init(db: DBClient) {
        self.db = db
    }

    /// Wear a theme row at once, before the next reload reads it back.
    public func applyThemeRow(_ row: ThemeRow?) {
        themeRow = row
        theme = LITheme.make(base: row?.base ?? .dark, palette: row?.palette)
        refreshWidgets()
    }

    // MARK: loading

    /// Loads everything Today needs. Keeps what is on screen if the server cannot be reached.
    public func reload() async {
        // A reload asked for while one is running is not dropped: it runs again once the first is done, so a change
        // saved in between (a theme, a setting) is read.
        if refreshing {
            reloadAgain = true
            return
        }
        refreshing = true
        defer { refreshing = false }
        repeat {
            reloadAgain = false
            await reloadOnce()
        } while reloadAgain
    }

    private func reloadOnce() async {
        if !loadedOnce { loadState = .loading }
        do {
            let t = LIDate.todayNY()
            async let settingsReq = db.get(AppSettings.self, id: "app")
            async let itemsReq = db.list(ChecklistItem.self, Query(orderBy: "sort_order"))
            async let versionsReq = db.list(TargetVersion.self, Query(orderBy: "effective_from"))
            async let challengesReq = db.list(Challenge.self, Query(orderBy: "start_date"))
            async let templatesReq = db.list(ScheduleTemplate.self, Query(eq: ["weekday": .int(LIDate.weekdayOf(t))]))
            async let blocksReq = db.list(ScheduleBlock.self, Query(eq: ["date": .string(t)]))
            async let workoutsReq = db.list(Workout.self, Query(orderBy: "weekday"))
            async let earningsReq = db.list(Earning.self, Query(orderBy: "date"))
            async let themeReq = db.first(ThemeRow.self, Query(eq: ["active": .bool(true)]))

            let newSettings = try await settingsReq
            let newItems = try await itemsReq
            let newVersions = try await versionsReq
            let newChallenges = try await challengesReq
            let newTemplates = try await templatesReq
            let newBlocks = try await blocksReq
            let newWorkouts = try await workoutsReq
            let newEarnings = try await earningsReq
            let newTheme = try await themeReq

            let historyStart = (newSettings?.historyStart ?? "").isEmpty ? t : (newSettings?.historyStart ?? t)
            let windowStart = LIDate.addDays(t, -AppStore.historyWindow)
            let readFrom = windowStart > historyStart ? windowStart : historyStart
            let newLogs = try await db.list(DayLog.self, Query(from: readFrom, to: t, orderBy: "date"))

            settings = newSettings
            items = newItems
            savedVersions = newVersions
            challenges = newChallenges
            templates = newTemplates
            blockRows = newBlocks
            workouts = newWorkouts
            earnings = newEarnings
            themeRow = newTheme
            logs = newLogs
            loadedOnce = true
            loadState = .loaded
            recompute()
            refreshWidgets()
        } catch is CancellationError {
            // A pull to refresh that was cancelled. Leave the state alone.
            if !loadedOnce { loadState = .idle }
        } catch let error as APIError {
            fail(error.errorDescription ?? "Could not load.", offline: error.isOffline)
        } catch {
            fail("Could not load.", offline: false)
        }
    }

    private func fail(_ message: String, offline: Bool) {
        // Keep showing old data when there is some. The screen shows the banner.
        loadState = .failed(message: message, offline: offline)
    }

    /// The error the screens should treat as "sign in again".
    public var needsLogin: Bool {
        if case .failed(let message, _) = loadState { return message == APIError.unauthorized.errorDescription }
        return false
    }

    public var hasData: Bool { return loadedOnce && settings != nil }

    // MARK: clock

    /// Call on a timer and when the app comes to the front. Rolls the day over at midnight.
    public func tick(_ date: Date = Date()) {
        let newToday = LIDate.todayNY(date)
        let rolled = newToday != today
        now = date
        if rolled {
            Task { await self.reload() }
            return
        }
        updateNowNext()
    }

    private func updateNowNext() {
        nowNext = Blocks.nowAndNext(blocks, time: LIDate.timeNY(now))
    }

    // MARK: derived state

    func recompute() {
        let t = LIDate.todayNY(now)
        today = t
        let startRaw = settings?.historyStart ?? ""
        let historyStart = startRaw.isEmpty ? t : startRaw
        mode = Challenges.modeOn(challenges, historyStart: historyStart, today: t)
        versions = Challenges.scoringVersions(savedVersions, challenges)
        let earnedId = items.first(where: { $0.key == "earned" })?.id
        floor = Challenges.floorOn(base: settings?.dailyFloor ?? 0, challenge: mode.challenge, earnedItemId: earnedId)

        let day = Scoring.summarizeDay(t, items, versions, logs)
        summary = day
        if let c = mode.challenge, c.rules != nil {
            challengeSummary = Challenges.challengeDay(c, day)
        } else {
            challengeSummary = nil
        }
        week = Scoring.summarizeWeek(t, items, versions, logs, asOf: t)

        let windowStart = LIDate.addDays(t, -AppStore.historyWindow)
        let readFrom = windowStart > historyStart ? windowStart : historyStart
        streaks = Streaks.allStreaks(items, versions, logs, today: t, from: readFrom)
        tracks = Tracks.summarize(day.items, streaks: streaks)
        statusByDate = Challenges.statusByDate(historyStart: readFrom, today: t, items: items, versions: versions, logs: logs)
        consistency = Challenges.consistency(statusByDate, today: t, from: historyStart, window: 30)
        fullStreak = Streaks.fullDayStreak(statusByDate, today: t, from: readFrom)

        blocks = Blocks.resolveBlocks(t, rows: blockRows, template: templates)
        updateNowNext()

        let w = Workouts.workoutsFor(workouts, weekday: LIDate.weekdayOf(t))
        mainWorkout = w.main
        coreWorkout = w.core

        moneyToday = Money.totalForDate(earnings, t)
        theme = LITheme.make(base: themeRow?.base ?? .dark, palette: themeRow?.palette)
        LIHaptics.enabled = settings?.haptics ?? true
    }

    /// Whether the day on screen can still be edited. Today always can.
    public var isEditable: Bool {
        let installed = settings.map { LIDate.nyParts(iso: $0.createdAt).date }
        return LIDate.isDayEditable(today, now: now, installedOn: installed)
    }

    // MARK: writes

    /// Run writes one at a time, so two quick taps cannot overwrite each other.
    private func enqueue(_ work: @escaping @MainActor () async -> Void) {
        let previous = writeChain
        writeChain = Task { @MainActor in
            if let previous = previous { await previous.value }
            await work()
        }
    }

    private func logIndex(date: DateStr, itemId: String) -> Int? {
        return logs.firstIndex { $0.date == date && $0.itemId == itemId }
    }

    /// Change the local copy of one log row, so the screen answers at once. Returns the row as it was.
    private func applyLocal(date: DateStr, itemId: String, _ mutate: (inout DayLog) -> Void) -> DayLog? {
        if let i = logIndex(date: date, itemId: itemId) {
            let before = logs[i]
            var row = before
            mutate(&row)
            logs[i] = row
            return before
        }
        var row = DayLog(id: "local:\(itemId):\(date)", createdAt: LIDate.nowIso(), date: date, itemId: itemId)
        mutate(&row)
        logs.append(row)
        return nil
    }

    private func restoreLocal(date: DateStr, itemId: String, before: DayLog?) {
        if let i = logIndex(date: date, itemId: itemId) {
            if let before = before { logs[i] = before } else { logs.remove(at: i) }
        }
        recompute()
        refreshWidgets()
    }

    private func replaceLocal(_ saved: DayLog) {
        if let i = logIndex(date: saved.date, itemId: saved.itemId) {
            logs[i] = saved
        } else {
            logs.append(saved)
        }
    }

    static func logRow(date: DateStr, itemId: String, value: Double?, checked: Bool, text: String?, completedAt: String?, slips: Int) -> JSONObject {
        return [
            "date": .string(date),
            "item_id": .string(itemId),
            "value": JSON.num(value),
            "checked": .bool(checked),
            "text": JSON.str(text),
            "completed_at": JSON.str(completedAt),
            "slips": .int(slips),
        ]
    }

    private func existing(date: DateStr, itemId: String) async throws -> DayLog? {
        return try await db.first(DayLog.self, Query(eq: ["date": .string(date), "item_id": .string(itemId)]))
    }

    private func afterLocalChange(wasFull: Bool) {
        recompute()
        if !wasFull && summary?.status == .full { celebrationTick += 1 }
        refreshWidgets()
    }

    private func saveFailed(_ error: Error) {
        LIHaptics.error()
        if let api = error as? APIError {
            saveError = api.isOffline ? "Could not save. You look offline." : (api.errorDescription ?? "Could not save.")
        } else {
            saveError = "Could not save."
        }
    }

    /// Tick or untick a yes/no or text item for today. Same write as setChecked in src/lib/db/helpers.ts.
    public func setChecked(_ item: ChecklistItem, _ checked: Bool) {
        let date = today
        let itemId = item.id
        let at = LIDate.nowIso()
        let wasFull = summary?.status == .full
        let before = applyLocal(date: date, itemId: itemId) { row in
            row.checked = checked
            row.completedAt = checked ? at : nil
        }
        afterLocalChange(wasFull: wasFull)
        enqueue { [weak self] in
            guard let self = self else { return }
            do {
                let prev = try await self.existing(date: date, itemId: itemId)
                let row = AppStore.logRow(date: date, itemId: itemId, value: prev?.value, checked: checked, text: prev?.text, completedAt: checked ? at : nil, slips: prev?.slips ?? 0)
                let saved = try await self.db.upsert(DayLog.self, row, conflict: ["date", "item_id"])
                self.replaceLocal(saved)
                self.recompute()
                self.refreshWidgets()
            } catch {
                self.restoreLocal(date: date, itemId: itemId, before: before)
                self.saveFailed(error)
            }
        }
    }

    /// Set a number item for today. Nil clears it. Same write as setValue in helpers.ts.
    /// The earned item also adds an earning row for the difference, so Money keeps adding up.
    public func setValue(_ item: ChecklistItem, _ value: Double?) {
        let date = today
        let itemId = item.id
        let at = LIDate.nowIso()
        let has = value != nil && !(value ?? 0).isNaN
        let wasFull = summary?.status == .full
        let isEarned = item.key == "earned"
        let isWeighIn = item.key == "weighin"
        let before = applyLocal(date: date, itemId: itemId) { row in
            row.value = has ? value : nil
            row.checked = has
            row.completedAt = has ? at : nil
        }
        afterLocalChange(wasFull: wasFull)
        enqueue { [weak self] in
            guard let self = self else { return }
            do {
                if isEarned, has, let v = value {
                    let sum = Money.totalForDate(self.earnings, date)
                    if v > sum {
                        let made = try await self.db.insert(Earning.self, [
                            "date": .string(date),
                            "amount": .number(Money.cents(v - sum)),
                            "app": .string("Other"),
                            "hours": .null,
                            "screenshot_url": .null,
                        ])
                        self.earnings.append(made)
                    }
                }
                if isWeighIn {
                    let prevBody = try await self.db.first(BodyLog.self, Query(eq: ["date": .string(date)]))
                    _ = try await self.db.upsert(BodyLog.self, [
                        "date": .string(date),
                        "weight": JSON.num(has ? value : nil),
                        "photo_url": JSON.str(prevBody?.photoUrl),
                    ], conflict: ["date"])
                }
                let prev = try await self.existing(date: date, itemId: itemId)
                let row = AppStore.logRow(date: date, itemId: itemId, value: has ? value : nil, checked: has, text: prev?.text, completedAt: has ? at : nil, slips: prev?.slips ?? 0)
                let saved = try await self.db.upsert(DayLog.self, row, conflict: ["date", "item_id"])
                self.replaceLocal(saved)
                self.recompute()
                self.refreshWidgets()
            } catch {
                self.restoreLocal(date: date, itemId: itemId, before: before)
                self.saveFailed(error)
            }
        }
    }

    /// Set the text of a text item for today. Keeps the tick as it was. Same write as setText in helpers.ts.
    public func setText(_ item: ChecklistItem, _ text: String) {
        let date = today
        let itemId = item.id
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let wasFull = summary?.status == .full
        let before = applyLocal(date: date, itemId: itemId) { row in
            row.text = clean.isEmpty ? nil : clean
            if clean.isEmpty {
                row.checked = false
                row.completedAt = nil
            }
        }
        afterLocalChange(wasFull: wasFull)
        enqueue { [weak self] in
            guard let self = self else { return }
            do {
                let prev = try await self.existing(date: date, itemId: itemId)
                let checked = clean.isEmpty ? false : (prev?.checked ?? false)
                let row = AppStore.logRow(date: date, itemId: itemId, value: prev?.value, checked: checked, text: clean.isEmpty ? nil : clean, completedAt: checked ? prev?.completedAt : nil, slips: prev?.slips ?? 0)
                let saved = try await self.db.upsert(DayLog.self, row, conflict: ["date", "item_id"])
                self.replaceLocal(saved)
                self.recompute()
                self.refreshWidgets()
            } catch {
                self.restoreLocal(date: date, itemId: itemId, before: before)
                self.saveFailed(error)
            }
        }
    }

    // MARK: widgets

    /// The snapshot the widgets draw from.
    public func makeSnapshot() -> WidgetSnapshot {
        let day = summary
        let widgetItems: [WidgetItem] = (day?.items ?? []).map { r in
            WidgetItem(id: r.item.id, name: Tracks.shortName(r.item), done: r.done, type: r.item.type.rawValue)
        }
        func block(_ b: DayBlock?) -> WidgetBlock? {
            guard let b = b else { return nil }
            return WidgetBlock(name: b.blockName, start: b.start, end: b.end, kind: b.kind.rawValue)
        }
        var total = Money.runningTotal(earnings)
        var target: Double? = nil
        if let c = mode.challenge, let t = c.moneyTarget, t > 0 {
            target = t
            total = Money.runningTotal(earnings, from: Money.targetStart(c))
        }
        return WidgetSnapshot(
            date: today,
            dayNumber: mode.day,
            dayLength: mode.length,
            percent: day?.percent ?? 0,
            done: day?.done ?? 0,
            total: day?.total ?? 0,
            items: widgetItems,
            now: block(nowNext?.now),
            next: block(nowNext?.next),
            moneyToday: moneyToday,
            moneyFloor: floor,
            moneyTotal: total,
            moneyTarget: target,
            streak: fullStreak,
            updatedAt: LIDate.nowIso(),
            blocks: blocks.map { WidgetBlock(name: $0.blockName, start: $0.start, end: $0.end, kind: $0.kind.rawValue) },
            themeBase: (themeRow?.base ?? .dark).rawValue,
            themePalette: themeRow?.palette,
            quotes: widgetQuotes()
        )
    }

    /// Writes the snapshot to the app group and asks WidgetKit to redraw. Call after any write that changes what a widget shows.
    public func refreshWidgets() {
        makeSnapshot().save()
        WidgetCenter.shared.reloadAllTimelines()
        NotificationCenter.default.post(name: .lockInSnapshotChanged, object: nil)
    }
}
