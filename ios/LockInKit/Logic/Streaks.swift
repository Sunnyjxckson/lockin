import Foundation

public struct Streak: Equatable {
    /// Days in a row (weeks in a row for weekly items) ending now.
    public var current: Int
    /// Longest run inside the window.
    public var best: Int
    /// Whether the current period (today, or this week) is already done.
    public var doneNow: Bool

    public init(current: Int, best: Int, doneNow: Bool) {
        self.current = current
        self.best = best
        self.doneNow = doneNow
    }
}

/// Streaks are per item and computed from day_log every time. Port of src/lib/logic/streaks.ts.
public enum Streaks {
    static func logIndex(_ logs: [DayLog], _ itemId: String) -> [DateStr: DayLog] {
        var map: [DateStr: DayLog] = [:]
        for l in logs where l.itemId == itemId { map[l.date] = l }
        return map
    }

    /// Streak for one item. `from` is the first day that counts (the challenge start or the history start).
    public static func itemStreak(_ item: ChecklistItem, _ versions: [TargetVersion], _ logs: [DayLog], today: DateStr, from: DateStr) -> Streak {
        if item.cadence == .weekly {
            return weeklyStreak(item, versions, logs, today: today, from: from)
        }
        return dailyStreak(item, versions, logs, today: today, from: from)
    }

    static func dailyStreak(_ item: ChecklistItem, _ versions: [TargetVersion], _ logs: [DayLog], today: DateStr, from: DateStr) -> Streak {
        let byDate = logIndex(logs, item.id)
        func doneOn(_ d: DateStr) -> Bool {
            return Scoring.itemState(item, Targets.targetOn(item, versions, d), byDate[d]) == .done
        }

        let doneNow = today >= from && Targets.isActiveOn(item, versions, today) && doneOn(today)
        var current = 0
        var d = doneNow ? today : LIDate.addDays(today, -1)
        // Today not being done yet does not break a run. A slip today does.
        let slippedToday = Scoring.hasSlip(byDate[today])
        while !slippedToday && d >= from && Targets.isActiveOn(item, versions, d) && doneOn(d) {
            current += 1
            d = LIDate.addDays(d, -1)
        }

        var best = 0
        var run = 0
        var x = from
        while x <= today {
            if Targets.isActiveOn(item, versions, x) && doneOn(x) {
                run += 1
                if run > best { best = run }
            } else if x != today || slippedToday {
                run = 0
            }
            x = LIDate.addDays(x, 1)
        }
        return Streak(current: current, best: max(best, current), doneNow: doneNow)
    }

    static func weeklyStreak(_ item: ChecklistItem, _ versions: [TargetVersion], _ logs: [DayLog], today: DateStr, from: DateStr) -> Streak {
        let own = logs.filter { $0.itemId == item.id }
        func weekDone(_ anyDay: DateStr) -> Bool {
            let w = Scoring.summarizeWeek(anyDay, [item], versions, own, asOf: today)
            return w.items.contains { $0.done }
        }

        let firstWeek = LIDate.weekStart(from)
        let thisWeek = LIDate.weekStart(today)
        let doneNow = today >= from && weekDone(today)

        var current = 0
        var w = doneNow ? thisWeek : LIDate.addDays(thisWeek, -7)
        while w >= firstWeek && weekDone(w) {
            current += 1
            w = LIDate.addDays(w, -7)
        }

        var best = 0
        var run = 0
        var x = firstWeek
        while x <= thisWeek {
            if weekDone(x) {
                run += 1
                if run > best { best = run }
            } else if x != thisWeek {
                run = 0
            }
            x = LIDate.addDays(x, 7)
        }
        return Streak(current: current, best: max(best, current), doneNow: doneNow)
    }

    /// Streaks for many items at once, keyed by item id.
    public static func allStreaks(_ items: [ChecklistItem], _ versions: [TargetVersion], _ logs: [DayLog], today: DateStr, from: DateStr) -> [String: Streak] {
        var out: [String: Streak] = [:]
        for item in items { out[item.id] = itemStreak(item, versions, logs, today: today, from: from) }
        return out
    }

    /// Days in a row, ending today or yesterday, where the whole day was full.
    public static func fullDayStreak(_ statusByDate: [DateStr: DayStatus], today: DateStr, from: DateStr) -> Int {
        var n = 0
        var d = statusByDate[today] == .full ? today : LIDate.addDays(today, -1)
        while d >= from && statusByDate[d] == .full {
            n += 1
            d = LIDate.addDays(d, -1)
        }
        return n
    }
}
