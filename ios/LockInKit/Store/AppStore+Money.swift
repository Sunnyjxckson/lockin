import Foundation
import Observation

// Money: the writes and loads behind the Money screen. Port of src/features/money/actions.ts and useMoney.ts.
// Every change to earnings ends by pushing the day's total into the "Earned today" checklist item,
// which is what Today scores.

extension AppStore {
    /// Set the number of a seeded item by its key, the way setValueByKey does on the web. Nil clears it.
    /// Writes the day_log row only. Callers reload the store afterwards.
    func writeValueByKey(_ key: String, date: DateStr, value: Double?) async throws {
        var itemId = items.first(where: { $0.key == key })?.id
        if itemId == nil {
            let found = try await db.first(ChecklistItem.self, Query(eq: ["key": .string(key)]))
            itemId = found?.id
        }
        guard let id = itemId else { return }
        let prev = try await db.first(DayLog.self, Query(eq: ["date": .string(date), "item_id": .string(id)]))
        let has = value != nil && !((value ?? 0).isNaN)
        let at = LIDate.nowIso()
        let row = AppStore.logRow(date: date, itemId: id, value: has ? value : nil, checked: has, text: prev?.text, completedAt: has ? at : nil, slips: prev?.slips ?? 0)
        _ = try await db.upsert(DayLog.self, row, conflict: ["date", "item_id"])
    }

    /// Recompute one date's total from the table and write it to the checklist. Empty days clear the value.
    @discardableResult
    func syncEarned(_ date: DateStr) async throws -> Double {
        let rows = try await db.list(Earning.self, Query(eq: ["date": .string(date)]))
        let total = Money.totalForDate(rows, date)
        try await writeValueByKey("earned", date: date, value: rows.isEmpty ? nil : total)
        return total
    }

    /// Reload everything Today reads, after a write from another screen. Does not block the caller.
    public func scheduleReload() {
        Task { @MainActor in
            var waited = 0
            while self.refreshing && waited < 20 {
                try? await Task.sleep(nanoseconds: 150_000_000)
                waited += 1
            }
            await self.reload()
        }
    }
}

/// One earning as the form sends it.
public struct MoneyEarningInput: Equatable {
    public var date: DateStr
    public var amount: Double
    public var app: String
    public var hours: Double?
    public var screenshotUrl: String?

    public init(date: DateStr, amount: Double, app: String, hours: Double?, screenshotUrl: String?) {
        self.date = date
        self.amount = amount
        self.app = app
        self.hours = hours
        self.screenshotUrl = screenshotUrl
    }

    var row: JSONObject {
        return [
            "date": .string(date),
            "amount": .number(Money.cents(amount)),
            "app": .string(app),
            "hours": JSON.num(hours),
            "screenshot_url": JSON.str(screenshotUrl),
        ]
    }
}

public enum MoneyReadResult: Equatable {
    case read(MoneyEarningRead)
    case fallback(String)
}

/// Everything the Money screen shows, and the writes behind it.
@Observable
@MainActor
public final class MoneyModel {
    @ObservationIgnored private let store: AppStore

    public private(set) var earnings: [Earning] = []
    public private(set) var weekExpenses: [Expense] = []
    public private(set) var loaded = false
    public private(set) var loadError: String? = nil

    public init(store: AppStore) {
        self.store = store
    }

    // MARK: loading

    public func load() async {
        let t = store.today
        do {
            let rows = try await store.db.list(Earning.self, Query(orderBy: "created_at", ascending: false))
            earnings = rows
            loadError = nil
            loaded = true
        } catch is CancellationError {
            return
        } catch let error as APIError {
            loadError = error.isOffline ? "You look offline. Showing the last data." : (error.errorDescription ?? "Could not load.")
            if !loaded { loaded = true }
        } catch {
            loadError = "Could not load."
            if !loaded { loaded = true }
        }
        // The expense table can be missing on an older database. Groceries just stay hidden then.
        if let spent = try? await store.db.list(Expense.self, Query(from: LIDate.weekStart(t), to: LIDate.weekEnd(t))) {
            weekExpenses = spent
        }
    }

    // MARK: what the screen shows

    public var today: DateStr { return store.today }
    public var floor: Double { return store.floor }
    public var challenge: Challenge? { return store.mode.challenge }
    public var historyStart: DateStr { return store.mode.historyStart }

    /// Entries inside the ongoing history.
    private var counted: [Earning] {
        let start = store.mode.historyStart
        return earnings.filter { $0.date >= start }
    }

    public var hasTarget: Bool {
        guard let c = store.mode.challenge, let t = c.moneyTarget, t > 0 else { return false }
        return !(c.moneyDeadline ?? "").isEmpty
    }

    public var target: Double {
        guard hasTarget, let c = store.mode.challenge else { return 0 }
        return c.moneyTarget ?? 0
    }

    public var deadline: DateStr {
        guard hasTarget, let c = store.mode.challenge else { return store.today }
        return c.moneyDeadline ?? store.today
    }

    /// The first date that counts toward the current target.
    public var since: DateStr {
        if let c = store.mode.challenge { return Money.targetStart(c) }
        return store.mode.historyStart
    }

    public var allTime: Double { return Money.runningTotal(counted) }

    public var total: Double {
        return hasTarget ? Money.runningTotal(counted, from: since) : allTime
    }

    /// True once the target has been reset, so the total and the all time total differ in meaning.
    public var wasReset: Bool {
        guard let c = store.mode.challenge else { return false }
        return hasTarget && since > c.startDate
    }

    public var progress: Double {
        return target > 0 ? Swift.min(1, total / target) : 0
    }

    public var daysLeft: Int { return Money.daysLeft(today: store.today, deadline: deadline) }

    public var state: MoneyTargetState {
        return Money.targetState(target: target, total: total, today: store.today, deadline: deadline)
    }

    public var needed: MoneyNeeded {
        return Money.neededPerDay(target: target, total: total, today: store.today, deadline: deadline, floor: store.floor)
    }

    public var todaysEarnings: [Earning] {
        return earnings.filter { $0.date == store.today }
    }

    public var todayFloor: FloorStatus {
        return Money.floorStatus(earned: Money.runningTotal(todaysEarnings), floor: store.floor, banked: banked)
    }

    public var banked: Double { return Money.surplusBanked(counted, floor: store.floor) }

    public var rateOverall: Double? { return Money.hourlyRate(counted) }

    public var hoursWorked: Double {
        return counted.reduce(0.0) { $0 + (($1.hours ?? 0) > 0 ? ($1.hours ?? 0) : 0) }
    }

    public var days: [MoneyDay] { return Money.groupByDay(earnings) }

    /// The app of the latest entry, for the quick add to preselect.
    public var lastApp: String {
        return Money.normalizeApp(earnings.first?.app) ?? "DoorDash"
    }

    /// Dollars spent on groceries this week, from the expense table.
    public var groceriesThisWeek: Double {
        return Money.spentBetween(weekExpenses, from: LIDate.weekStart(store.today), to: LIDate.weekEnd(store.today), category: "groceries")
    }

    public func isLocked(_ date: DateStr) -> Bool {
        let installed = store.settings.map { LIDate.nyParts(iso: $0.createdAt).date }
        return LIDate.isDayLocked(date, now: Date(), installedOn: installed)
    }

    // MARK: writes

    private func replaceLocal(_ row: Earning) {
        if let i = earnings.firstIndex(where: { $0.id == row.id }) {
            earnings[i] = row
        } else {
            earnings.insert(row, at: 0)
        }
    }

    /// Keep Today's "Earned today" in step. One retry, then tell the person.
    private func sync(_ date: DateStr) async {
        do {
            try await store.syncEarned(date)
        } catch {
            do {
                try await store.syncEarned(date)
            } catch {
                store.saveError = "Saved, but Today could not update. Pull down on Today to refresh."
            }
        }
    }

    @discardableResult
    public func add(_ input: MoneyEarningInput) async throws -> Earning {
        let made = try await store.db.insert(Earning.self, input.row)
        replaceLocal(made)
        await sync(input.date)
        store.scheduleReload()
        return made
    }

    @discardableResult
    public func save(_ prev: Earning, _ input: MoneyEarningInput) async throws -> Earning {
        let made = try await store.db.update(Earning.self, id: prev.id, patch: input.row)
        replaceLocal(made)
        await sync(input.date)
        if prev.date != input.date { await sync(prev.date) }
        if let old = prev.screenshotUrl, old != input.screenshotUrl {
            await MoneyBodyPhotos.remove(api: store.db.api, ref: old)
        }
        store.scheduleReload()
        return made
    }

    public func delete(_ row: Earning) async throws {
        try await store.db.remove(Earning.self, id: row.id)
        earnings.removeAll { $0.id == row.id }
        await sync(row.date)
        if let old = row.screenshotUrl { await MoneyBodyPhotos.remove(api: store.db.api, ref: old) }
        store.scheduleReload()
    }

    /// Point the challenge at a new money target and deadline. The new target starts a fresh running total from `from`.
    public func resetTarget(_ target: Double, deadline: DateStr, from: DateStr) async throws {
        guard let c = store.mode.challenge else { throw APIError.server("No active challenge", 400) }
        _ = try await store.db.update(Challenge.self, id: c.id, patch: [
            "money_target": .number(target),
            "money_deadline": .string(deadline),
            "money_target_start": .string(from),
        ])
        store.scheduleReload()
    }

    // MARK: screenshots

    /// Store a screenshot and return the reference for earning.screenshot_url.
    public func storeScreenshot(_ jpeg: Data) async throws -> String {
        return try await MoneyBodyPhotos.upload(api: store.db.api, jpeg: jpeg, folder: "earnings")
    }

    /// Ask the server to read an earnings screenshot. Never throws: any trouble is a fallback.
    public func readScreenshot(_ jpeg: Data) async -> MoneyReadResult {
        do {
            let body = try JSONEncoder().encode(["image": MoneyBodyPhotos.dataURL(jpeg)])
            let (data, status) = try await store.db.api.send(path: "/api/money/read", method: "POST", body: body)
            if !(200..<300).contains(status) { return .fallback("error") }
            guard let json = try? JSONDecoder().decode(JSON.self, from: data), case .object(let o) = json else { return .fallback("error") }
            if o["source"]?.stringValue != "ai" { return .fallback(o["reason"]?.stringValue ?? "no_key") }
            return .read(Money.parseEarningRead(json))
        } catch {
            return .fallback("error")
        }
    }
}
