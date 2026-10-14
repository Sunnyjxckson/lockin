import SwiftUI
import Observation
import LockInKit

/// A short message at the bottom of the Plan screen.
struct PlanToast: Identifiable, Equatable {
    let id = UUID()
    var text: String
    var bad: Bool
}

/// What the Plan screen shows and does for one day. The rules are in LockInKit/Logic/PlanRules.swift,
/// the writes in LockInKit/Store/AppStore+Plan.swift. This holds the loaded rows, the picked date and the edit in flight.
@Observable
@MainActor
final class PlanModel {
    var date: DateStr = LIDate.todayNY()
    private(set) var rows: [ScheduleBlock] = []
    private(set) var template: [ScheduleTemplate] = []
    private(set) var loading = true
    private(set) var busy = false
    var toast: PlanToast? = nil
    /// Free time blocks whose "time is up" alert was answered.
    var cleared: Set<String> = []
    private var overlay: [DayBlock]? = nil
    private var rangeFrom: DateStr = ""
    private var rangeTo: DateStr = ""
    @ObservationIgnored private var store: AppStore? = nil

    func bind(_ store: AppStore) {
        self.store = store
    }

    // MARK: derived

    var saved: [DayBlock] {
        return Blocks.resolveBlocks(date, rows: rows, template: template.filter { $0.weekday == LIDate.weekdayOf(date) })
    }

    /// What the screen shows: the saved day, or the change that is on its way in.
    var blocks: [DayBlock] {
        return overlay ?? saved
    }

    var isOwn: Bool {
        return PlanRules.isMaterialized(saved)
    }

    var editedDates: Set<DateStr> {
        return Set(rows.map { $0.date })
    }

    func dates(today: DateStr) -> [DateStr] {
        let base = LIDate.dateRange(LIDate.addDays(today, -3), LIDate.addDays(today, 14))
        if base.contains(date) { return base }
        return (base + [date]).sorted()
    }

    func weekdayTemplate() -> [ScheduleTemplate] {
        return template.filter { $0.weekday == LIDate.weekdayOf(date) }
    }

    // MARK: loading

    func load(today: DateStr) async {
        guard let store = store else { return }
        let all = dates(today: today)
        guard let first = all.first, let last = all.last else { return }
        do {
            let loaded = try await store.planLoad(from: first, to: last)
            rows = loaded.rows
            template = loaded.template
            rangeFrom = first
            rangeTo = last
            loading = false
        } catch is CancellationError {
            // Left the screen mid load.
        } catch {
            loading = false
            say(PlanErrorText.text(error), bad: true)
        }
    }

    func select(_ next: DateStr, today: DateStr) {
        if next == date { return }
        overlay = nil
        date = next
        if rangeFrom.isEmpty || next < rangeFrom || next > rangeTo {
            Task { await load(today: today) }
        }
    }

    func say(_ text: String, bad: Bool = false) {
        toast = PlanToast(text: text, bad: bad)
        if bad { LIHaptics.error() }
    }

    // MARK: edits

    static func draftId() -> String {
        return UUID().uuidString.lowercased()
    }

    /// Show `after` at once, save it, then show the saved rows. Only one save at a time, as on the web.
    func commit(_ after: [DayBlock], result: ShiftResult?, done: String?, today: DateStr) {
        guard !busy, let store = store else { return }
        let before = blocks
        let day = date
        busy = true
        overlay = after
        let names = Dictionary(after.map { ($0.id, $0.blockName) }, uniquingKeysWith: { first, _ in first })
        Task {
            do {
                try await store.planSaveDay(day, before: before, after: after)
                await load(today: today)
                if day == today { await store.reload() }
                overlay = nil
                if let note = PlanModel.shiftMessage(result, names) {
                    say(note.text, bad: note.bad)
                } else if let done = done {
                    say(done)
                }
            } catch {
                overlay = nil
                say(PlanErrorText.text(error), bad: true)
            }
            busy = false
        }
    }

    func reset(today: DateStr) {
        guard !busy, let store = store else { return }
        let day = date
        busy = true
        Task {
            do {
                try await store.planResetDay(day)
                await load(today: today)
                if day == today { await store.reload() }
                say("Back on the template")
            } catch {
                say("Could not reset the day", bad: true)
            }
            busy = false
        }
    }

    func stillGoing(_ block: DayBlock, nowMin: Int, today: DateStr) {
        let result = PlanRules.stillGoing(blocks, id: block.id, nowMin: nowMin)
        cleared.insert(block.id)
        var done: String? = nil
        if let to = result.blocks.first(where: { $0.id == block.id }) {
            done = "\(block.blockName) now runs to \(LIDate.formatTime(to.end))"
        }
        commit(result.blocks, result: result, done: done, today: today)
    }

    func setErrand(_ on: Bool, today: DateStr) {
        if on {
            let result = PlanRules.insertErrand(blocks, id: PlanModel.draftId(), date: date)
            commit(result.blocks, result: result, done: "Errand added at 9:00 AM", today: today)
        } else {
            let after = PlanRules.removeErrand(blocks, template: weekdayTemplate())
            commit(after, result: nil, done: "Errand removed", today: today)
        }
    }

    /// One line about what a shift did.
    static func shiftMessage(_ result: ShiftResult?, _ names: [String: String]) -> (text: String, bad: Bool)? {
        guard let result = result else { return nil }
        if let c = result.conflicts.first {
            return ("\(names[c.id] ?? "A block") now overlaps \(names[c.withId] ?? "a fixed block")", true)
        }
        if result.moved.isEmpty { return nil }
        if let cut = result.moved.first(where: { $0.cut > 0 }) {
            return ("\(cut.name) cut by \(LIDate.formatDuration(cut.cut)) to fit", false)
        }
        if result.moved.count == 1 {
            return ("\(result.moved[0].name) moved to \(LIDate.formatTime(result.moved[0].to.start))", false)
        }
        return ("\(result.moved.count) blocks shifted later", false)
    }
}

/// Turns a thrown error into the line the screen shows.
enum PlanErrorText {
    static func text(_ error: Error) -> String {
        if let api = error as? APIError {
            return api.isOffline ? "You look offline." : (api.errorDescription ?? "Could not save that change")
        }
        return "Could not save that change"
    }
}
