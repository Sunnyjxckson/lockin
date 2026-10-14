import Foundation

public enum DayStatus: String, Equatable {
    case full, partial, missed
}

public enum ItemState: String, Equatable {
    /// Meets its target.
    case done
    /// Nothing logged.
    case open
    /// Something is logged but it does not meet the target.
    case off
}

public struct ItemResult {
    public var item: ChecklistItem
    public var target: Target
    public var log: DayLog?
    public var state: ItemState
    public var done: Bool
}

public struct DaySummary {
    public var date: DateStr
    public var status: DayStatus
    public var done: Int
    public var total: Int
    /// 0 to 100, whole number.
    public var percent: Int
    /// Daily items only, in display order.
    public var items: [ItemResult]
}

public struct WeeklyResult {
    public var item: ChecklistItem
    public var target: Target
    public var log: DayLog?
    public var done: Bool
    public var doneOn: DateStr?
}

public struct WeekSummary {
    public var weekStart: DateStr
    public var weekEnd: DateStr
    public var items: [WeeklyResult]
    public var done: Int
    public var total: Int
    public var complete: Bool
}

/// Day scoring. Port of src/lib/logic/day.ts.
/// A day is full when every daily item is done, partial when some are, missed when none are.
public enum Scoring {
    /// Whether a number meets a numeric target. Non numeric targets return false.
    public static func meetsNumber(_ target: Target, _ value: Double?) -> Bool {
        guard let value = value, !value.isNaN else { return false }
        switch target {
        case .min(let lo): return value >= lo
        case .max(let hi): return value <= hi
        case .range(let lo, let hi): return value >= lo && value <= hi
        default: return false
        }
    }

    /// A time gated check counts when ticked at or before the cutoff on the day itself.
    /// Ticked on another calendar date it is a backfill and counts on trust. A tick with no timestamp also counts.
    public static func checkedInTime(_ log: DayLog, by: String) -> Bool {
        if !log.checked { return false }
        guard let completed = log.completedAt else { return true }
        let at = LIDate.nyParts(iso: completed)
        if at.date > log.date { return true }
        if at.date < log.date { return true }
        return at.minutes <= LIDate.minutesOf(by)
    }

    public static func hasSlip(_ log: DayLog?) -> Bool {
        guard let log = log else { return false }
        return log.slips > 0
    }

    /// The state of one item on one day given its target and its log row.
    public static func itemState(_ item: ChecklistItem, _ target: Target, _ log: DayLog?) -> ItemState {
        guard let log = log else { return .open }
        if hasSlip(log) { return .off }
        switch target {
        case .check:
            return log.checked ? .done : .open
        case .checkBy(let by):
            if !log.checked { return .open }
            return checkedInTime(log, by: by) ? .done : .off
        case .text:
            let trimmed = (log.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let hasText = !trimmed.isEmpty
            if log.checked && hasText { return .done }
            return (log.checked || hasText) ? .off : .open
        case .min, .max, .range:
            guard let v = log.value else { return .open }
            return meetsNumber(target, v) ? .done : .off
        }
    }

    public static func isItemDone(_ item: ChecklistItem, _ target: Target, _ log: DayLog?) -> Bool {
        return itemState(item, target, log) == .done
    }

    /// Index one day's logs by item id.
    public static func logsByItem(_ logs: [DayLog], _ date: DateStr) -> [String: DayLog] {
        var map: [String: DayLog] = [:]
        for l in logs where l.date == date { map[l.itemId] = l }
        return map
    }

    public static func statusFromCounts(done: Int, total: Int) -> DayStatus {
        if total > 0 && done >= total { return .full }
        return done > 0 ? .partial : .missed
    }

    /// Whole number percent, rounded half up like Math.round.
    static func percent(_ done: Int, _ total: Int) -> Int {
        if total == 0 { return 0 }
        return Int((Double(done) / Double(total) * 100.0).rounded(.toNearestOrAwayFromZero))
    }

    /// Score one day. `logs` may hold many days, only rows for `date` are read.
    public static func summarizeDay(_ date: DateStr, _ items: [ChecklistItem], _ versions: [TargetVersion], _ logs: [DayLog]) -> DaySummary {
        let byItem = logsByItem(logs, date)
        var results: [ItemResult] = []
        for s in Targets.scoredItems(items, versions, date) where s.item.cadence == .daily {
            let log = byItem[s.item.id]
            let state = itemState(s.item, s.target, log)
            results.append(ItemResult(item: s.item, target: s.target, log: log, state: state, done: state == .done))
        }
        let done = results.filter { $0.done }.count
        let total = results.count
        return DaySummary(date: date, status: statusFromCounts(done: done, total: total), done: done, total: total, percent: percent(done, total), items: results)
    }

    public static func dayStatus(_ date: DateStr, _ items: [ChecklistItem], _ versions: [TargetVersion], _ logs: [DayLog]) -> DayStatus {
        return summarizeDay(date, items, versions, logs).status
    }

    /// Roll up weekly items for the Monday to Sunday week holding `date`.
    /// A weekly item is done for the week when it is done on any day in it. Membership is judged on the week's Sunday (or `asOf` while the week runs).
    public static func summarizeWeek(_ date: DateStr, _ items: [ChecklistItem], _ versions: [TargetVersion], _ logs: [DayLog], asOf: DateStr? = nil) -> WeekSummary {
        let start = LIDate.weekStart(date)
        let end = LIDate.weekEnd(date)
        var judgeOn = end
        if let asOf = asOf, asOf < end { judgeOn = asOf < start ? start : asOf }
        let days = LIDate.weekDates(date)
        let weekly = Targets.scoredItems(items, versions, judgeOn).filter { $0.item.cadence == .weekly }
        var results: [WeeklyResult] = []
        for s in weekly {
            var latest: DayLog? = nil
            var found: WeeklyResult? = nil
            for d in days {
                guard let log = logs.first(where: { $0.date == d && $0.itemId == s.item.id }) else { continue }
                let dayTarget = Targets.scoredItems([s.item], versions, d).first?.target ?? s.target
                if itemState(s.item, dayTarget, log) == .done {
                    found = WeeklyResult(item: s.item, target: s.target, log: log, done: true, doneOn: d)
                    break
                }
                latest = log
            }
            results.append(found ?? WeeklyResult(item: s.item, target: s.target, log: latest, done: false, doneOn: nil))
        }
        let done = results.filter { $0.done }.count
        return WeekSummary(weekStart: start, weekEnd: end, items: results, done: done, total: results.count, complete: !results.isEmpty && done == results.count)
    }
}
