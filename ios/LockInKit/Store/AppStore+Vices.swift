import Foundation

// Loads and writes for the Vices screens. Port of src/features/vices/data.ts and the vice parts of src/lib/db/helpers.ts.
// A slip is a vice_slip row. After every slip change the day's count is stored on its day_log row (syncSlipCount), which is
// what makes the day not clean on Today, Record, streaks and the coach. Ticking a quit vice clean and setting a cap amount
// are the same writes as Today (AppStore.setChecked and setValue), so the two screens never disagree.

extension AppStore {
    // MARK: loads

    /// Every slip, oldest first.
    public func viceLoadSlips() async throws -> [ViceSlip] {
        return try await db.list(ViceSlip.self, Query(orderBy: "date"))
    }

    // MARK: slips

    /// Recount the slips of one vice on one day and store the number on day_log.slips. The tick and the number stay as they were.
    /// Does nothing when there is no row and no slips.
    @discardableResult
    public func viceSyncSlipCount(itemId: String, date: DateStr) async throws -> DayLog? {
        async let prevReq = db.first(DayLog.self, Query(eq: ["date": .string(date), "item_id": .string(itemId)]))
        async let slipsReq = db.list(ViceSlip.self, Query(eq: ["item_id": .string(itemId), "date": .string(date)]))
        let prev = try await prevReq
        let n = try await slipsReq.count
        if prev == nil && n == 0 { return nil }
        if let prev = prev, prev.slips == n { return prev }
        let row = AppStore.logRow(date: date, itemId: itemId, value: prev?.value, checked: prev?.checked ?? false, text: prev?.text, completedAt: prev?.completedAt, slips: n)
        return try await db.upsert(DayLog.self, row, conflict: ["date", "item_id"])
    }

    /// Save a slip (insert, or update when `id` is given), then store the day's slip count. A slip moved to another day
    /// or vice also recounts the place it left.
    @discardableResult
    public func viceSaveSlip(id: String?, itemId: String, date: DateStr, time: TimeStr, trigger: String?, amount: Double?) async throws -> ViceSlip {
        let row: JSONObject = [
            "item_id": .string(itemId),
            "date": .string(date),
            "time": .string(time),
            "trigger": JSON.str(trigger),
            "amount": JSON.num(amount),
        ]
        var before: ViceSlip? = nil
        if let id = id { before = try await db.get(ViceSlip.self, id: id) }
        let saved: ViceSlip
        if let id = id {
            saved = try await db.update(ViceSlip.self, id: id, patch: row)
        } else {
            saved = try await db.insert(ViceSlip.self, row)
        }
        try await viceSyncSlipCount(itemId: saved.itemId, date: saved.date)
        if let b = before, b.date != saved.date || b.itemId != saved.itemId {
            try await viceSyncSlipCount(itemId: b.itemId, date: b.date)
        }
        await reload()
        return saved
    }

    public func viceRemoveSlip(_ slip: ViceSlip) async throws {
        try await db.remove(ViceSlip.self, id: slip.id)
        try await viceSyncSlipCount(itemId: slip.itemId, date: slip.date)
        await reload()
    }

    // MARK: vices

    /// Add a vice of the user's own, on from today. Same writes as addItem in helpers.ts.
    @discardableResult
    public func viceCreate(_ input: ViceRules.ViceInput, today: DateStr) async throws -> ChecklistItem {
        let built = ViceRules.itemFields(input)
        let last = items.filter { !$0.archived && $0.active }.reduce(0) { max($0, $1.sortOrder) }
        var row = built.fields
        row["key"] = .null
        row["cadence"] = .string("daily")
        row["category"] = .string("vice")
        row["hint"] = .null
        row["sort_order"] = .int(last + 10)
        row["active"] = .bool(true)
        row["archived"] = .bool(false)
        row["weekly_day"] = .null
        row["with_photo"] = .bool(false)
        row["track"] = .null
        let item = try await db.insert(ChecklistItem.self, row)
        let version = Targets.versionForChange(itemId: item.id, today: today, target: built.target, active: true)
        _ = try await db.upsert(TargetVersion.self, version, conflict: ["item_id", "effective_from"])
        await reload()
        return item
    }

    /// Change a vice's rule and turn it on. Applies from today forward. Same writes as saveItem in helpers.ts.
    @discardableResult
    public func viceUpdate(_ item: ChecklistItem, _ input: ViceRules.ViceInput, today: DateStr) async throws -> ChecklistItem {
        var patch = ViceRules.itemFields(input).fields
        patch["active"] = .bool(true)
        return try await viceSave(item, patch: patch, today: today)
    }

    @discardableResult
    public func viceSetActive(_ item: ChecklistItem, _ active: Bool, today: DateStr) async throws -> ChecklistItem {
        return try await viceSave(item, patch: ["active": .bool(active)], today: today)
    }

    /// Remove from the checklist from today forward. Past days still count it.
    @discardableResult
    public func viceRemove(_ item: ChecklistItem, today: DateStr) async throws -> ChecklistItem {
        return try await viceSave(item, patch: ["active": .bool(false), "archived": .bool(true)], today: today)
    }

    private func viceSave(_ item: ChecklistItem, patch: JSONObject, today: DateStr) async throws -> ChecklistItem {
        guard let before = try await db.get(ChecklistItem.self, id: item.id) else { throw APIError.server("Item not found", 404) }
        let after = try await db.update(ChecklistItem.self, id: item.id, patch: patch)
        if !Targets.targetsEqual(before.target, after.target) || before.active != after.active {
            let version = Targets.versionForChange(itemId: item.id, today: today, target: after.target, active: after.active)
            _ = try await db.upsert(TargetVersion.self, version, conflict: ["item_id", "effective_from"])
        }
        await reload()
        return after
    }
}
