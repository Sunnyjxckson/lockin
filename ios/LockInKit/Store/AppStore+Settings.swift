import Foundation
import Observation

// Settings: every write the web Settings screens make, through the same DBClient calls. A change to a target or the on/off
// state also writes a target_version dated today, so it applies from today forward and past days keep their scoring.

/// What the checklist item sheet edits.
public struct ChecklistDraft: Equatable {
    public var name: String
    public var type: ItemType
    public var cadence: Cadence
    public var target: Target
    public var unit: String?
    public var hint: String?
    /// Nil follows the default for what the item measures.
    public var track: Track?

    public init(name: String, type: ItemType, cadence: Cadence, target: Target, unit: String?, hint: String?, track: Track?) {
        self.name = name
        self.type = type
        self.cadence = cadence
        self.target = target
        self.unit = unit
        self.hint = hint
        self.track = track
    }
}

extension AppStore {
    /// Make one theme row the active one: the others are switched off first, since only one may be active. Then reload so the app wears it.
    /// The same write as activate() in src/lib/theme.
    public func activateTheme(base: ThemeBase, palette: ThemePalette?, boardId: String?, name: String?) async throws {
        let clean = ThemeBuild.cleanPalette(palette)
        let rows = try await db.list(ThemeRow.self)
        let match: ThemeRow?
        if clean != nil {
            match = rows.first { $0.palette != nil && $0.boardId == boardId }
        } else {
            match = rows.first { $0.palette == nil }
        }
        for r in rows where r.active && r.id != match?.id {
            try await db.update(ThemeRow.self, id: r.id, patch: ["active": .bool(false)])
        }
        var fields: JSONObject = [
            "name": JSON.str(clean != nil ? name : nil),
            "base": .string(base.rawValue),
            "palette": clean.map { JSON.from($0) } ?? .null,
            "accent": JSON.str(clean?.accent),
            "board_id": JSON.str(clean != nil ? boardId : nil),
            "active": .bool(true),
        ]
        if clean == nil { fields["board_id"] = .null }
        let made: ThemeRow
        if let m = match {
            made = try await db.update(ThemeRow.self, id: m.id, patch: fields)
        } else {
            made = try await db.insert(ThemeRow.self, fields)
        }
        // Wear it now, on every screen and the widgets, then read everything back.
        applyThemeRow(made)
        await reload()
    }

    /// Switch the base theme. A palette on top stays on top.
    public func setBaseTheme(_ base: ThemeBase) async throws {
        let row = themeRow
        try await activateTheme(base: base, palette: row?.palette, boardId: row?.boardId, name: row?.name)
    }

    /// Drop the palette and go back to the base theme as it ships.
    public func resetThemePalette() async throws {
        try await activateTheme(base: themeRow?.base ?? .dark, palette: nil, boardId: nil, name: nil)
    }
}

@Observable
@MainActor
public final class SettingsModel {
    @ObservationIgnored public let store: AppStore

    public private(set) var reminders: [Reminder] = []
    public private(set) var templates: [ScheduleTemplate] = []
    public private(set) var templateDay: Int = 0
    public private(set) var settings: AppSettings? = nil
    public private(set) var loading = true
    public private(set) var failure: String? = nil

    public init(store: AppStore) {
        self.store = store
    }

    private var db: DBClient { return store.db }

    public static func describe(_ error: Error) -> String {
        if let api = error as? APIError { return api.isOffline ? "You look offline." : (api.errorDescription ?? "Could not save.") }
        if let own = error as? MealsFailure { return own.message }
        if let le = error as? LocalizedError, let d = le.errorDescription, !d.isEmpty { return d }
        return "Could not save."
    }

    // MARK: loading

    public func load() async {
        if !store.hasData { await store.reload() }
        do {
            async let r = db.list(Reminder.self, Query(orderBy: "sort_order"))
            async let s = db.get(AppSettings.self, id: "app")
            reminders = try await r
            settings = try await s
            failure = nil
        } catch {
            failure = SettingsModel.describe(error)
        }
        loading = false
    }

    /// Re-read what Today uses, so a change shows there at once.
    private func applied() async {
        await store.reload()
        settings = store.settings ?? settings
    }

    // MARK: app settings

    @discardableResult
    public func updateSettings(_ patch: JSONObject) async throws -> AppSettings {
        let made = try await db.update(AppSettings.self, id: "app", patch: patch)
        settings = made
        await applied()
        return made
    }

    public func setDisplayName(_ text: String) async throws {
        let trimmed = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(24))
        let next: String? = trimmed.isEmpty ? nil : trimmed
        if next == (settings?.displayName ?? nil) { return }
        try await updateSettings(["display_name": JSON.str(next)])
    }

    public func setHaptics(_ on: Bool) async throws {
        try await updateSettings(["haptics": .bool(on)])
    }

    /// Tell the system layer that reminders, quiet hours or drops changed, so the local notifications follow at once.
    func notificationsChanged() {
        NotificationCenter.default.post(name: .lockInNotificationsChanged, object: nil)
    }

    public func setQuiet(start: String?, end: String?) async throws {
        var patch: JSONObject = [:]
        if let s = start { patch["quiet_start"] = .string(s) }
        if let e = end { patch["quiet_end"] = .string(e) }
        if patch.isEmpty { return }
        try await updateSettings(patch)
        notificationsChanged()
    }

    /// Drops on or off, or how many a day. Turning them on asks for notification permission (in AppStore.setDrops, the
    /// same path the Library uses) and plans the next week.
    public func setDrops(enabled: Bool?, perDay: Int?) async throws {
        if enabled == nil && perDay == nil { return }
        let on = enabled ?? (settings?.dropsEnabled ?? store.settings?.dropsEnabled ?? false)
        let ok = await store.setDrops(enabled: on, perDay: perDay)
        settings = store.settings ?? settings
        if !ok && on { throw MealsFailure("Could not turn drops on. Check that notifications are allowed for Lock In.") }
        notificationsChanged()
    }

    public func setVoice(_ voice: CoachVoice) async throws {
        try await updateSettings(["coach_voice": .string(voice.rawValue)])
    }

    public func setCheckins(_ next: CoachCheckins) async throws {
        try await updateSettings(["coach_checkins": JSON.from(next)])
    }

    /// The daily earnings floor everywhere it lives: app settings, the earned item's target, and the active challenge.
    public func setDailyFloor(_ floor: Double) async throws {
        let value = max(0, floor)
        try await updateSettings(["daily_floor": .number(value)])
        let items = try await db.list(ChecklistItem.self, Query(eq: ["key": .string("earned")], limit: 1))
        if let earned = items.first {
            var same = false
            if case .min(let m) = earned.target, m == value { same = true }
            if !same { _ = try await saveItemFields(earned.id, ["target": JSON.from(Target.min(value))]) }
        }
        if let c = try await activeChallenge(), c.dailyFloor != value {
            try await db.update(Challenge.self, id: c.id, patch: ["daily_floor": .number(value)])
        }
        await applied()
    }

    // MARK: checklist

    private func trackJSON(_ draft: ChecklistDraft, existing: ChecklistItem?) -> JSON {
        guard let track = draft.track else { return .null }
        var probe = existing ?? ChecklistItem()
        probe.track = nil
        probe.unit = draft.unit
        let fallback = Tracks.defaultTrack(probe)
        // Saved only when it differs from the default, so an untouched item keeps following the default.
        if track == fallback && (existing?.track == nil) { return .null }
        return .string(track.rawValue)
    }

    @discardableResult
    public func addItem(_ draft: ChecklistDraft) async throws -> ChecklistItem {
        let all = try await db.list(ChecklistItem.self, Query(orderBy: "sort_order"))
        let last = all.filter { !$0.archived && $0.active }.reduce(0) { max($0, $1.sortOrder) }
        let unit: String? = draft.type == .number ? draft.unit : nil
        let row: JSONObject = [
            "key": .null,
            "name": .string(draft.name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "type": .string(draft.type.rawValue),
            "cadence": .string(draft.cadence.rawValue),
            "target": JSON.from(draft.target),
            "category": .string("habit"),
            "mode": .null,
            "unit": JSON.str(unit),
            "hint": JSON.str(draft.hint),
            "sort_order": .int(last + 10),
            "active": .bool(true),
            "archived": .bool(false),
            "weekly_day": .null,
            "with_photo": .bool(false),
            "tracks_money": .bool(false),
            "typical_spend": .null,
            "spend_period": .null,
            "track": trackJSON(draft, existing: nil),
        ]
        let item = try await db.insert(ChecklistItem.self, row)
        try await db.upsert(TargetVersion.self, Targets.versionForChange(itemId: item.id, today: store.today, target: draft.target, active: true), conflict: ["item_id", "effective_from"])
        await applied()
        return item
    }

    /// Change an item. A new target or on/off state also writes a target_version dated today.
    @discardableResult
    func saveItemFields(_ id: String, _ patch: JSONObject) async throws -> ChecklistItem {
        guard let before = try await db.get(ChecklistItem.self, id: id) else { throw MealsFailure("Item not found.") }
        let after = try await db.update(ChecklistItem.self, id: id, patch: patch)
        if !Targets.targetsEqual(before.target, after.target) || before.active != after.active {
            try await db.upsert(TargetVersion.self, Targets.versionForChange(itemId: id, today: store.today, target: after.target, active: after.active), conflict: ["item_id", "effective_from"])
        }
        return after
    }

    @discardableResult
    public func saveItem(_ item: ChecklistItem, _ draft: ChecklistDraft) async throws -> ChecklistItem {
        let unit: String? = item.type == .number ? draft.unit : nil
        let fields: JSONObject = [
            "name": .string(draft.name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "cadence": .string(draft.cadence.rawValue),
            "hint": JSON.str(draft.hint),
            "unit": JSON.str(unit),
            "target": JSON.from(draft.target),
            "track": trackJSON(draft, existing: item),
        ]
        let after = try await saveItemFields(item.id, fields)
        // "Earned today" and the daily floor are the same number.
        if item.key == "earned", case .min(let m) = draft.target {
            try await db.update(AppSettings.self, id: "app", patch: ["daily_floor": .number(max(0, m))])
        }
        await applied()
        return after
    }

    /// Remove from the checklist from today forward. Past days still count it.
    public func removeItem(_ item: ChecklistItem) async throws {
        _ = try await saveItemFields(item.id, ["active": .bool(false), "archived": .bool(true)])
        await applied()
    }

    /// Save a new display order. Pass item ids top to bottom.
    public func reorderItems(_ ids: [String]) async throws {
        let all = try await db.list(ChecklistItem.self, Query(orderBy: "sort_order"))
        var byId: [String: ChecklistItem] = [:]
        for i in all { byId[i.id] = i }
        var n = 0
        for id in ids {
            n += 10
            if let row = byId[id], row.sortOrder != n {
                try await db.update(ChecklistItem.self, id: id, patch: ["sort_order": .int(n)])
            }
        }
        await applied()
    }

    // MARK: reading habit

    public static let readKey = "read_quotes"

    public func readItem() async -> ChecklistItem? {
        return try? await db.first(ChecklistItem.self, Query(eq: ["key": .string(SettingsModel.readKey)]))
    }

    public static func clampReadTarget(_ n: Double?) -> Int {
        guard let n = n, n.isFinite else { return 10 }
        return min(100, max(1, Int(n.rounded())))
    }

    public func enableReading(_ count: Int) async throws {
        let n = SettingsModel.clampReadTarget(Double(count))
        let target = Target.min(Double(n))
        let name = "Read \(n) quotes"
        if let item = await readItem() {
            _ = try await saveItemFields(item.id, ["name": .string(name), "target": JSON.from(target), "unit": .string("quotes"), "active": .bool(true), "archived": .bool(false)])
        } else {
            let all = try await db.list(ChecklistItem.self, Query(orderBy: "sort_order"))
            let last = all.filter { !$0.archived && $0.active }.reduce(0) { max($0, $1.sortOrder) }
            let made = try await db.insert(ChecklistItem.self, [
                "key": .string(SettingsModel.readKey), "name": .string(name), "type": .string("number"), "cadence": .string("daily"),
                "target": JSON.from(target), "category": .string("habit"), "mode": .null, "unit": .string("quotes"), "hint": .null,
                "sort_order": .int(last + 10), "active": .bool(true), "archived": .bool(false), "weekly_day": .null,
                "with_photo": .bool(false), "tracks_money": .bool(false), "typical_spend": .null, "spend_period": .null, "track": .string("mind"),
            ])
            try await db.upsert(TargetVersion.self, Targets.versionForChange(itemId: made.id, today: store.today, target: target, active: true), conflict: ["item_id", "effective_from"])
        }
        await applied()
    }

    public func disableReading() async throws {
        if let item = await readItem(), item.active {
            _ = try await saveItemFields(item.id, ["active": .bool(false)])
            await applied()
        }
    }

    // MARK: schedule

    public func loadTemplates(weekday: Int) async {
        templateDay = weekday
        do {
            templates = try await db.list(ScheduleTemplate.self, Query(eq: ["weekday": .int(weekday)]))
            failure = nil
        } catch {
            failure = SettingsModel.describe(error)
        }
    }

    public func saveBlock(id: String?, weekday: Int, name: String, start: String, end: String, kind: BlockKind, flexible: Bool, note: String?) async throws {
        let trimmedNote = (note ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let row: JSONObject = [
            "weekday": .int(weekday),
            "block_name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "start": .string(start),
            "end": .string(end),
            "kind": .string(kind.rawValue),
            "flexible": .bool(flexible),
            "note": trimmedNote.isEmpty ? JSON.null : JSON.string(trimmedNote),
        ]
        if let id = id {
            try await db.update(ScheduleTemplate.self, id: id, patch: row)
        } else {
            try await db.insert(ScheduleTemplate.self, row)
        }
        await loadTemplates(weekday: weekday)
        await applied()
        notificationsChanged()
    }

    public func deleteBlock(_ id: String, weekday: Int) async throws {
        try await db.remove(ScheduleTemplate.self, id: id)
        await loadTemplates(weekday: weekday)
        await applied()
        notificationsChanged()
    }

    // MARK: workouts

    public func addWorkout(weekday: Int, slot: WorkoutSlot) async throws {
        try await db.upsert(Workout.self, [
            "weekday": .int(weekday),
            "slot": .string(slot.rawValue),
            "name": .string(slot == .core ? "Core" : "Workout"),
            "kind": .string(slot == .core ? "lift" : "cardio"),
            "detail": .null,
            "exercises": .array([]),
        ], conflict: ["weekday", "slot"])
        await applied()
    }

    public func updateWorkout(_ id: String, _ patch: JSONObject) async throws {
        try await db.update(Workout.self, id: id, patch: patch)
        await applied()
    }

    public func setExercises(_ id: String, _ list: [Exercise]) async throws {
        try await updateWorkout(id, ["exercises": JSON.from(list)])
    }

    // MARK: challenge

    private func activeChallenge() async throws -> Challenge? {
        let rows = try await db.list(Challenge.self, Query(eq: ["status": .string("active")], orderBy: "created_at"))
        return Challenges.activeChallenge(rows)
    }

    /// Change the active challenge. Throws when there is none.
    public func updateChallenge(_ patch: JSONObject, historyStartTo: DateStr? = nil) async throws {
        guard let c = try await activeChallenge() else { throw MealsFailure("No active challenge.") }
        try await db.update(Challenge.self, id: c.id, patch: patch)
        if let start = historyStartTo { try await db.update(AppSettings.self, id: "app", patch: ["history_start": .string(start)]) }
        await applied()
    }

    /// Start a challenge. Only challenge rows are written, so the ongoing history is untouched.
    public func startChallenge(_ input: ChallengeInput) async throws {
        if let problem = ChallengeRules.problem(input, today: store.today) { throw MealsFailure(problem) }
        if try await activeChallenge() != nil { throw MealsFailure("A challenge is already active. End it first.") }
        try await db.insert(Challenge.self, ChallengeRules.newRow(input))
        await applied()
    }

    public func endChallenge() async throws {
        guard let c = try await activeChallenge() else { throw MealsFailure("No active challenge.") }
        try await db.update(Challenge.self, id: c.id, patch: ChallengeRules.endPatch(c, store.today).patch)
        await applied()
    }

    public func finishChallenge() async throws {
        guard let c = try await activeChallenge() else { throw MealsFailure("No active challenge.") }
        if !ChallengeRules.canFinish(c, store.today) { throw MealsFailure("It has days left. End it early instead.") }
        try await db.update(Challenge.self, id: c.id, patch: ChallengeRules.finishPatch(c).patch)
        await applied()
    }

    /// Run a challenge again from today: same name, length and rules. Pass an id for a past one, or nil for the active one.
    public func restartChallenge(id: String?) async throws {
        let active = try await activeChallenge()
        var source: Challenge? = active
        if let id = id, id != active?.id { source = try await db.get(Challenge.self, id: id) }
        guard let src = source else { throw MealsFailure("No challenge to restart.") }
        if let a = active, a.id != src.id { throw MealsFailure("A challenge is already active. End it first.") }
        let rows = ChallengeRules.restartRows(src, store.today)
        if let close = rows.close { try await db.update(Challenge.self, id: src.id, patch: close.patch) }
        try await db.insert(Challenge.self, rows.next)
        await applied()
    }

    // MARK: reminders

    public func updateReminder(_ id: String, _ patch: JSONObject) async throws {
        let made = try await db.update(Reminder.self, id: id, patch: patch)
        if let i = reminders.firstIndex(where: { $0.id == id }) { reminders[i] = made }
        notificationsChanged()
    }
}
