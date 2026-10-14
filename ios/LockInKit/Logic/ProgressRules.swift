import Foundation

// Record screen rules. Port of src/lib/logic/progress.ts and src/lib/logic/ongoing.ts, plus the challenge helpers they lean on.
// Scoring is never redone here. Every day goes through Scoring.summarizeDay, every week through Scoring.summarizeWeek and
// every streak through Streaks.allStreaks, so past days are judged against the targets in force that day.

/// full, partial and missed are the foundation's day status. Today with nothing done yet is "open" rather than missed,
/// because the day is not over. Days after today are "future". Days before the ongoing history starts are "before":
/// they were never tracked, so they are neither missed nor counted.
public enum ProgressCellKind: String, Equatable {
    case full, partial, missed, open, future, before
}

public struct ProgressCell {
    public var date: DateStr
    /// 1 based day of the challenge. For the ongoing view this is the day of the month.
    public var day: Int
    public var kind: ProgressCellKind
    public var isToday: Bool
    /// Daily items done and counted on that date. Zero for future days.
    public var done: Int
    public var total: Int
    /// 0 to 100.
    public var percent: Int
    /// The scored day, nil for future days.
    public var summary: DaySummary?
}

public struct ProgressGrid {
    public var cells: [ProgressCell]
    /// Blank cells before day 1 so columns line up Monday to Sunday.
    public var lead: Int
    public var length: Int
    /// Today's day number when today is inside the challenge.
    public var todayDay: Int?
}

/// Day logs indexed by date, so a long history is not rescanned for every day.
public struct LogIndex {
    public let all: [DayLog]
    let byDate: [DateStr: [DayLog]]

    public init(_ logs: [DayLog]) {
        self.all = logs
        var map: [DateStr: [DayLog]] = [:]
        for l in logs { map[l.date, default: []].append(l) }
        self.byDate = map
    }

    func on(_ date: DateStr) -> [DayLog] {
        return byDate[date] ?? []
    }

    func week(of date: DateStr) -> [DayLog] {
        var out: [DayLog] = []
        for d in LIDate.weekDates(date) { out.append(contentsOf: on(d)) }
        return out
    }
}

public struct ProgressInput {
    public var startDate: DateStr
    public var lengthDays: Int
    /// Where streaks start counting. Default: startDate. Pass the ongoing history start so a streak runs across challenge boundaries.
    public var streakFrom: DateStr?
    public var today: DateStr
    public var items: [ChecklistItem]
    public var versions: [TargetVersion]
    public var logs: LogIndex

    public init(startDate: DateStr, lengthDays: Int, streakFrom: DateStr? = nil, today: DateStr, items: [ChecklistItem], versions: [TargetVersion], logs: LogIndex) {
        self.startDate = startDate
        self.lengthDays = lengthDays
        self.streakFrom = streakFrom
        self.today = today
        self.items = items
        self.versions = versions
        self.logs = logs
    }
}

public struct ProgressHeadline: Equatable {
    /// Day of the challenge, clamped to 0 (not started) through length.
    public var day: Int
    public var length: Int
    public var started: Bool
    public var finished: Bool
    /// Full days, today included once it is full.
    public var lockedIn: Int
    /// Past days with some but not all items done.
    public var partial: Int
    /// Past days with nothing done.
    public var missed: Int
    /// Item completions over items that count so far, 0 to 100.
    public var percent: Int
    /// Days left after today.
    public var remaining: Int
}

public enum ProgressWeekState: String, Equatable {
    case past, current, future
}

public struct WeekRollup {
    /// 1 based, in challenge order.
    public var index: Int
    /// Monday and Sunday of the calendar week.
    public var weekStart: DateStr
    public var weekEnd: DateStr
    /// First and last challenge day inside the week.
    public var from: DateStr
    public var to: DateStr
    public var state: ProgressWeekState
    public var full: Int
    public var partial: Int
    public var missed: Int
    public var done: Int
    public var total: Int
    /// 0 to 100, nil before the week has anything to count.
    public var percent: Int?
    public var weekly: [WeeklyResult]
    public var weeklyDone: Int
    public var weeklyTotal: Int
}

public enum RateUnit: String, Equatable {
    case day, week
}

public struct ItemRate {
    public var item: ChecklistItem
    /// Days (or weeks for weekly items) done.
    public var done: Int
    /// Days or weeks that count so far.
    public var total: Int
    /// 0 to 1, nil when nothing counts yet (a weekly item in its first week).
    public var rate: Double?
    public var unit: RateUnit
    /// Still in the checklist today.
    public var current: Bool
}

/// broken: had a run and lost it. cold: never got one going. behind: running, but shorter than the best. best: on the longest run so far.
public enum StreakHealth: Int, Equatable {
    case broken = 0, cold = 1, behind = 2, best = 3
}

public struct StreakRow {
    public var item: ChecklistItem
    public var current: Int
    public var best: Int
    public var doneNow: Bool
    public var unit: RateUnit
    public var health: StreakHealth
}

public struct ProgressModel {
    public var grid: ProgressGrid
    public var headline: ProgressHeadline
    public var weeks: [WeekRollup]
    public var rates: [ItemRate]
    public var streaks: [StreakRow]
}

// MARK: share card data

public struct CardPhoto: Equatable {
    public var date: DateStr
    /// Storage reference, resolve it before drawing.
    public var ref: String
    /// "Day 1", or the short date when it was taken before the start.
    public var label: String
}

public struct CardStreak: Equatable {
    public var name: String
    public var current: Int
    public var unit: RateUnit
}

public struct CardCell: Equatable {
    public var kind: ProgressCellKind
    public var isToday: Bool
}

public struct CardData {
    /// "challenge" shows a day count. "ongoing" shows full days out of the last 30.
    public var isOngoing: Bool
    /// Small label over the big number: "Day", "Last 30 days".
    public var eyebrow: String
    /// The big number, and the words after it: "12" and "of 30".
    public var big: String
    public var bigSub: String
    /// The third stat under the grid: days left in a challenge, the full day streak otherwise.
    public var extraValue: String
    public var extraLabel: String
    /// One line for the share text: "Day 12 of 30", "26 of the last 30 days locked in".
    public var caption: String
    /// For the file name: "day-12", "last-30".
    public var fileTag: String
    public var day: Int
    public var length: Int
    public var started: Bool
    public var percent: Int
    public var lockedIn: Int
    public var remaining: Int
    /// "Oct 5 to Nov 3".
    public var range: String
    /// One entry per challenge day, for the small grid.
    public var cells: [CardCell]
    public var lead: Int
    /// Longest live streaks first, at most `maxStreaks`. Zero streaks left out.
    public var streaks: [CardStreak]
    public var before: CardPhoto?
    public var after: CardPhoto?
}

// MARK: ongoing

public struct OngoingInput {
    /// First date of the history.
    public var historyStart: DateStr
    public var today: DateStr
    public var items: [ChecklistItem]
    public var versions: [TargetVersion]
    public var logs: LogIndex

    public init(historyStart: DateStr, today: DateStr, items: [ChecklistItem], versions: [TargetVersion], logs: LogIndex) {
        self.historyStart = historyStart
        self.today = today
        self.items = items
        self.versions = versions
        self.logs = logs
    }
}

public struct DayTally: Equatable {
    /// Full days, today included once it is full.
    public var full: Int
    /// Finished days with some but not all items done.
    public var partial: Int
    /// Finished days with nothing done.
    public var missed: Int
    /// Days that count so far: finished days, plus today once it is full.
    public var days: Int
    /// Full days over days that count, 0 to 100. Nil before anything counts.
    public var percent: Int?
}

public struct OngoingWeek {
    public var tally: DayTally
    /// Monday and Sunday.
    public var weekStart: DateStr
    public var weekEnd: DateStr
    /// "Oct 5 to Oct 11".
    public var label: String
    public var isCurrent: Bool
    /// Seven cells, Monday first.
    public var cells: [ProgressCell]
    /// The weekly items as rolled up for this week.
    public var weekly: [WeeklyResult]
    public var weeklyDone: Int
    public var weeklyTotal: Int
}

public struct OngoingMonth {
    public var tally: DayTally
    /// "2026-10".
    public var key: String
    /// "October 2026".
    public var label: String
    public var isCurrent: Bool
    /// Blank cells before the 1st so columns line up Monday to Sunday.
    public var lead: Int
    public var cells: [ProgressCell]
}

public struct OngoingHeadline {
    /// Full days out of the last 30, the main number.
    public var last30: Consistency
    public var last7: Consistency
    /// Days in the history so far, today included.
    public var totalDays: Int
    /// Full days in the whole history.
    public var fullDays: Int
    /// Full days in a row ending today or yesterday.
    public var fullStreak: Int
    /// The longest run of full days in the history.
    public var bestFullStreak: Int
}

public enum ProgressRules {
    // MARK: grid

    public static func cellKind(_ status: DayStatus, date: DateStr, today: DateStr) -> ProgressCellKind {
        if date > today { return .future }
        if date == today && status == .missed { return .open }
        switch status {
        case .full: return .full
        case .partial: return .partial
        case .missed: return .missed
        }
    }

    public static func buildGrid(_ input: ProgressInput) -> ProgressGrid {
        let length = max(0, input.lengthDays)
        var cells: [ProgressCell] = []
        for (i, date) in LIDate.challengeDates(input.startDate, length).enumerated() {
            if date > input.today {
                cells.append(ProgressCell(date: date, day: i + 1, kind: .future, isToday: false, done: 0, total: 0, percent: 0, summary: nil))
                continue
            }
            let summary = Scoring.summarizeDay(date, input.items, input.versions, input.logs.on(date))
            cells.append(ProgressCell(
                date: date,
                day: i + 1,
                kind: cellKind(summary.status, date: date, today: input.today),
                isToday: date == input.today,
                done: summary.done,
                total: summary.total,
                percent: summary.percent,
                summary: summary
            ))
        }
        let n = LIDate.dayNumber(input.startDate, input.today)
        return ProgressGrid(
            cells: cells,
            lead: (LIDate.weekdayOf(input.startDate) + 6) % 7,
            length: length,
            todayDay: (n >= 1 && n <= length) ? n : nil
        )
    }

    // MARK: what counts so far

    /// Whether one item on one day counts toward a rate yet. Past days always count. Today counts once the item is done,
    /// so an unfinished morning does not drag the numbers down. On day 1 there is nothing else to show, so today counts in full.
    static func countsYet(_ cell: ProgressCell, done: Bool, onlyToday: Bool) -> Bool {
        if cell.kind == .future || cell.kind == .before { return false }
        if !cell.isToday { return true }
        return done || onlyToday
    }

    static func isOnlyToday(_ grid: ProgressGrid) -> Bool {
        return !grid.cells.contains { $0.kind != .future && $0.kind != .before && !$0.isToday }
    }

    static func pct(_ done: Int, _ total: Int) -> Int {
        return total <= 0 ? 0 : Int((Double(done) / Double(total) * 100).rounded(.toNearestOrAwayFromZero))
    }

    // MARK: headline

    public static func headline(_ grid: ProgressGrid, startDate: DateStr, today: DateStr) -> ProgressHeadline {
        let n = LIDate.dayNumber(startDate, today)
        let day = min(max(n, 0), grid.length)
        let onlyToday = isOnlyToday(grid)
        var lockedIn = 0
        var partial = 0
        var missed = 0
        var done = 0
        var total = 0
        for cell in grid.cells {
            guard cell.kind != .future, let summary = cell.summary else { continue }
            if cell.kind == .full {
                lockedIn += 1
            } else if !cell.isToday && cell.kind == .partial {
                partial += 1
            } else if !cell.isToday && cell.kind == .missed {
                missed += 1
            }
            for r in summary.items {
                if !countsYet(cell, done: r.done, onlyToday: onlyToday) { continue }
                total += 1
                if r.done { done += 1 }
            }
        }
        return ProgressHeadline(
            day: day,
            length: grid.length,
            started: n >= 1,
            finished: n > grid.length,
            lockedIn: lockedIn,
            partial: partial,
            missed: missed,
            percent: pct(done, total),
            remaining: max(0, grid.length - day)
        )
    }

    // MARK: weeks

    public static func weeklyRollups(_ grid: ProgressGrid, _ input: ProgressInput) -> [WeekRollup] {
        let onlyToday = isOnlyToday(grid)
        var order: [DateStr] = []
        var byWeek: [DateStr: [ProgressCell]] = [:]
        for cell in grid.cells {
            let key = LIDate.weekStart(cell.date)
            if byWeek[key] == nil {
                order.append(key)
                byWeek[key] = [cell]
            } else {
                byWeek[key]?.append(cell)
            }
        }
        var out: [WeekRollup] = []
        var index = 0
        for start in order {
            guard let cells = byWeek[start], let first = cells.first, let last = cells.last else { continue }
            index += 1
            let end = LIDate.weekEnd(start)
            let state: ProgressWeekState = input.today < first.date ? .future : (input.today > end ? .past : .current)
            var full = 0
            var partial = 0
            var missed = 0
            var done = 0
            var total = 0
            for cell in cells {
                guard cell.kind != .future, let summary = cell.summary else { continue }
                if cell.kind == .full {
                    full += 1
                } else if cell.isToday {
                    // today only counts once it is full
                } else if cell.kind == .partial {
                    partial += 1
                } else if cell.kind == .missed {
                    missed += 1
                }
                for r in summary.items {
                    if !countsYet(cell, done: r.done, onlyToday: onlyToday) { continue }
                    total += 1
                    if r.done { done += 1 }
                }
            }
            let week: WeekSummary? = state == .future ? nil : Scoring.summarizeWeek(start, input.items, input.versions, input.logs.week(of: start), asOf: input.today)
            out.append(WeekRollup(
                index: index,
                weekStart: start,
                weekEnd: end,
                from: first.date,
                to: last.date,
                state: state,
                full: full,
                partial: partial,
                missed: missed,
                done: done,
                total: total,
                percent: total > 0 ? pct(done, total) : nil,
                weekly: week?.items ?? [],
                weeklyDone: week?.done ?? 0,
                weeklyTotal: week?.total ?? 0
            ))
        }
        return out
    }

    // MARK: per item rates

    /// Completion rate for every item that was ever scored in the challenge so far. Weekly items count weeks: a week
    /// counts once it has ended, or as soon as the item is done in it. Lowest rate first.
    public static func itemRates(_ grid: ProgressGrid, _ weeks: [WeekRollup], _ input: ProgressInput) -> [ItemRate] {
        let onlyToday = isOnlyToday(grid)
        var order: [String] = []
        var rows: [String: ItemRate] = [:]
        func ensure(_ item: ChecklistItem, _ unit: RateUnit) {
            if rows[item.id] != nil { return }
            order.append(item.id)
            rows[item.id] = ItemRate(
                item: item,
                done: 0,
                total: 0,
                rate: nil,
                unit: unit,
                current: !item.archived && Targets.isActiveOn(item, input.versions, input.today)
            )
        }
        for cell in grid.cells {
            guard let summary = cell.summary else { continue }
            for res in summary.items {
                ensure(res.item, .day)
                if !countsYet(cell, done: res.done, onlyToday: onlyToday) { continue }
                rows[res.item.id]?.total += 1
                if res.done { rows[res.item.id]?.done += 1 }
            }
        }
        for week in weeks {
            if week.state == .future { continue }
            for res in week.weekly {
                ensure(res.item, .week)
                if week.state == .past || res.done {
                    rows[res.item.id]?.total += 1
                    if res.done { rows[res.item.id]?.done += 1 }
                }
            }
        }
        var list: [ItemRate] = order.compactMap { rows[$0] }
        for i in 0..<list.count {
            list[i].rate = list[i].total > 0 ? Double(list[i].done) / Double(list[i].total) : nil
        }
        return list.enumerated().sorted { l, r in
            let a = l.element
            let b = r.element
            let ra = a.rate ?? 2
            let rb = b.rate ?? 2
            if ra != rb { return ra < rb }
            if a.item.sortOrder != b.item.sortOrder { return a.item.sortOrder < b.item.sortOrder }
            let c = a.item.name.localizedCompare(b.item.name)
            if c != .orderedSame { return c == .orderedAscending }
            return l.offset < r.offset
        }.map { $0.element }
    }

    // MARK: streaks

    public static func streakHealth(_ s: Streak) -> StreakHealth {
        if s.current == 0 { return s.best > 0 ? .broken : .cold }
        return s.current < s.best ? .behind : .best
    }

    /// Streaks for everything in the checklist today, habits and the vices that are turned on, with the ones that are slipping at the top.
    public static func streakRows(_ input: ProgressInput) -> [StreakRow] {
        let live = input.items.filter { !$0.archived && Targets.isActiveOn($0, input.versions, input.today) }
        let streaks = Streaks.allStreaks(live, input.versions, input.logs.all, today: input.today, from: input.streakFrom ?? input.startDate)
        let rows: [StreakRow] = live.map { item in
            let s = streaks[item.id] ?? Streak(current: 0, best: 0, doneNow: false)
            return StreakRow(item: item, current: s.current, best: s.best, doneNow: s.doneNow, unit: item.cadence == .weekly ? .week : .day, health: streakHealth(s))
        }
        return rows.enumerated().sorted { l, r in
            let a = l.element
            let b = r.element
            if a.health != b.health { return a.health.rawValue < b.health.rawValue }
            let byOrder = a.item.sortOrder < b.item.sortOrder
            switch a.health {
            case .broken:
                if a.best != b.best { return a.best > b.best }
                if a.item.sortOrder != b.item.sortOrder { return byOrder }
            case .behind:
                let ga = a.best - a.current
                let gb = b.best - b.current
                if ga != gb { return ga > gb }
                if a.item.sortOrder != b.item.sortOrder { return byOrder }
            case .best:
                if a.current != b.current { return a.current < b.current }
                if a.item.sortOrder != b.item.sortOrder { return byOrder }
            case .cold:
                if a.item.sortOrder != b.item.sortOrder { return byOrder }
            }
            return l.offset < r.offset
        }.map { $0.element }
    }

    // MARK: everything at once

    public static func buildProgress(_ input: ProgressInput) -> ProgressModel {
        let grid = buildGrid(input)
        let weeks = weeklyRollups(grid, input)
        return ProgressModel(
            grid: grid,
            headline: headline(grid, startDate: input.startDate, today: input.today),
            weeks: weeks,
            rates: itemRates(grid, weeks, input),
            streaks: streakRows(input)
        )
    }

    // MARK: share card

    /// The first photo in body_log and the latest one. With a single photo there is a before and no after.
    public static func pickPhotos(_ bodyLogs: [BodyLog], startDate: DateStr, today: DateStr) -> (before: CardPhoto?, after: CardPhoto?) {
        let withPhoto = bodyLogs
            .filter { !($0.photoUrl ?? "").isEmpty && $0.date <= today }
            .sorted { $0.date < $1.date }
        guard let first = withPhoto.first, let last = withPhoto.last else { return (nil, nil) }
        func make(_ b: BodyLog) -> CardPhoto {
            let n = LIDate.dayNumber(startDate, b.date)
            return CardPhoto(date: b.date, ref: b.photoUrl ?? "", label: n >= 1 ? "Day \(n)" : LIDate.formatDateShort(b.date))
        }
        return (make(first), last.date == first.date ? nil : make(last))
    }

    public static func topStreaks(_ rows: [StreakRow], max maxCount: Int = 3) -> [CardStreak] {
        let live = rows.filter { $0.current > 0 }
        let sorted = live.enumerated().sorted { l, r in
            let a = l.element
            let b = r.element
            // Daily streaks before weekly ones, since a week count of 2 is not comparable to a day count of 2.
            if a.unit != b.unit { return a.unit == .day }
            if a.current != b.current { return a.current > b.current }
            if a.best != b.best { return a.best > b.best }
            if a.item.sortOrder != b.item.sortOrder { return a.item.sortOrder < b.item.sortOrder }
            return l.offset < r.offset
        }.map { $0.element }
        return sorted.prefix(Swift.max(0, maxCount)).map { CardStreak(name: $0.item.name, current: $0.current, unit: $0.unit) }
    }

    public static func cardData(_ model: ProgressModel, startDate: DateStr, today: DateStr, bodyLogs: [BodyLog] = [], maxStreaks: Int = 3) -> CardData {
        let h = model.headline
        let last = LIDate.addDays(startDate, Swift.max(0, h.length - 1))
        let photos = pickPhotos(bodyLogs, startDate: startDate, today: today)
        return CardData(
            isOngoing: false,
            eyebrow: "Day",
            big: "\(h.day)",
            bigSub: "of \(h.length)",
            extraValue: "\(h.remaining)",
            extraLabel: "Days left",
            caption: "Day \(h.day) of \(h.length)",
            fileTag: "day-\(h.day)",
            day: h.day,
            length: h.length,
            started: h.started,
            percent: h.percent,
            lockedIn: h.lockedIn,
            remaining: h.remaining,
            range: "\(LIDate.formatDateShort(startDate)) to \(LIDate.formatDateShort(last))",
            cells: model.grid.cells.map { CardCell(kind: $0.kind, isToday: $0.isToday) },
            lead: model.grid.lead,
            streaks: topStreaks(model.streaks, max: maxStreaks),
            before: photos.before,
            after: photos.after
        )
    }

    /// "1 day", "4 days", "2 weeks".
    public static func countLabel(_ n: Int, _ unit: RateUnit) -> String {
        return "\(n) \(unit.rawValue)\(n == 1 ? "" : "s")"
    }
}

// MARK: ongoing

public enum OngoingRules {
    /// One scored cell per date. `day` is the day of the month.
    public static func cells(_ input: OngoingInput, from: DateStr, to: DateStr) -> [ProgressCell] {
        return LIDate.dateRange(from, to).map { date in
            let day = Int(date.suffix(2)) ?? 1
            if date > input.today || date < input.historyStart {
                return ProgressCell(date: date, day: day, kind: date > input.today ? .future : .before, isToday: false, done: 0, total: 0, percent: 0, summary: nil)
            }
            let summary = Scoring.summarizeDay(date, input.items, input.versions, input.logs.on(date))
            return ProgressCell(
                date: date,
                day: day,
                kind: ProgressRules.cellKind(summary.status, date: date, today: input.today),
                isToday: date == input.today,
                done: summary.done,
                total: summary.total,
                percent: summary.percent,
                summary: summary
            )
        }
    }

    /// The status of every day in the history so far.
    public static func statusByDate(_ input: OngoingInput) -> [DateStr: DayStatus] {
        return Challenges.statusByDate(historyStart: input.historyStart, today: input.today, items: input.items, versions: input.versions, logs: input.logs.all)
    }

    /// Day counts for a run of cells. Today only counts once it is full, so an unfinished morning is not a miss.
    public static func tally(_ cells: [ProgressCell]) -> DayTally {
        var full = 0
        var partial = 0
        var missed = 0
        for c in cells {
            if c.kind == .full {
                full += 1
            } else if c.isToday {
                continue
            } else if c.kind == .partial {
                partial += 1
            } else if c.kind == .missed {
                missed += 1
            }
        }
        let days = full + partial + missed
        return DayTally(full: full, partial: partial, missed: missed, days: days, percent: days > 0 ? Int((Double(full) / Double(days) * 100).rounded(.toNearestOrAwayFromZero)) : nil)
    }

    /// The latest weeks, this week first, back to the week the history starts in.
    public static func weeks(_ input: OngoingInput, max maxCount: Int = 8) -> [OngoingWeek] {
        if input.historyStart > input.today { return [] }
        let first = LIDate.weekStart(input.historyStart)
        var out: [OngoingWeek] = []
        var start = LIDate.weekStart(input.today)
        while start >= first && out.count < maxCount {
            let end = LIDate.weekEnd(start)
            let cs = cells(input, from: start, to: end)
            let week = Scoring.summarizeWeek(start, input.items, input.versions, input.logs.week(of: start), asOf: input.today)
            out.append(OngoingWeek(
                tally: tally(cs),
                weekStart: start,
                weekEnd: end,
                label: "\(LIDate.formatDateShort(start)) to \(LIDate.formatDateShort(end))",
                isCurrent: input.today <= end,
                cells: cs,
                weekly: week.items,
                weeklyDone: week.done,
                weeklyTotal: week.total
            ))
            start = LIDate.addDays(start, -7)
        }
        return out
    }

    /// Every month from the one the history starts in to this one, newest first.
    public static func months(_ input: OngoingInput, max maxCount: Int = 24) -> [OngoingMonth] {
        if input.historyStart > input.today { return [] }
        let first = LIDate.monthStart(input.historyStart)
        var out: [OngoingMonth] = []
        var start = LIDate.monthStart(input.today)
        while start >= first && out.count < maxCount {
            let cs = cells(input, from: start, to: LIDate.monthEnd(start))
            out.append(OngoingMonth(
                tally: tally(cs),
                key: String(start.prefix(7)),
                label: LIDate.formatMonth(start),
                isCurrent: start == LIDate.monthStart(input.today),
                lead: (LIDate.weekdayOf(start) + 6) % 7,
                cells: cs
            ))
            start = LIDate.addMonths(start, -1)
        }
        return out
    }

    public static func headline(_ status: [DateStr: DayStatus], historyStart: DateStr, today: DateStr) -> OngoingHeadline {
        var fullDays = 0
        var best = 0
        var run = 0
        if historyStart <= today {
            for d in LIDate.dateRange(historyStart, today) {
                if status[d] == .full {
                    fullDays += 1
                    run += 1
                    if run > best { best = run }
                } else if d != today {
                    run = 0
                }
            }
        }
        var streak = 0
        var d = status[today] == .full ? today : LIDate.addDays(today, -1)
        while d >= historyStart && status[d] == .full {
            streak += 1
            d = LIDate.addDays(d, -1)
        }
        return OngoingHeadline(
            last30: Challenges.consistency(status, today: today, from: historyStart, window: 30),
            last7: Challenges.consistency(status, today: today, from: historyStart, window: 7),
            totalDays: historyStart <= today ? LIDate.diffDays(historyStart, today) + 1 : 0,
            fullDays: fullDays,
            fullStreak: streak,
            bestFullStreak: Swift.max(best, streak)
        )
    }

    /// The share card with no challenge running: the last 30 days as the grid and "26 of the last 30 days" where a challenge
    /// shows its day count. Photos are tagged with their dates, since there is no day 1.
    public static func cardData(_ input: OngoingInput, bodyLogs: [BodyLog] = [], window: Int = 30, maxStreaks: Int = 3) -> CardData {
        let first = LIDate.addDays(input.today, -(window - 1))
        let from = first < input.historyStart ? input.historyStart : first
        let length = Swift.max(1, LIDate.diffDays(from, input.today) + 1)
        let model = ProgressRules.buildProgress(ProgressInput(startDate: from, lengthDays: length, streakFrom: input.historyStart, today: input.today, items: input.items, versions: input.versions, logs: input.logs))
        let head = headline(statusByDate(input), historyStart: input.historyStart, today: input.today)
        let c = head.last30
        var card = ProgressRules.cardData(model, startDate: from, today: input.today, bodyLogs: [], maxStreaks: maxStreaks)
        let photos = bodyLogs
            .filter { !($0.photoUrl ?? "").isEmpty && $0.date <= input.today }
            .sorted { $0.date < $1.date }
        func tag(_ b: BodyLog) -> CardPhoto {
            return CardPhoto(date: b.date, ref: b.photoUrl ?? "", label: LIDate.formatDateShort(b.date))
        }
        card.isOngoing = true
        card.eyebrow = c.days < c.window ? "Days locked in" : "Last \(c.window) days"
        card.big = "\(c.full)"
        card.bigSub = "of \(c.days)"
        card.extraValue = "\(head.fullStreak)"
        card.extraLabel = "Full in a row"
        card.caption = c.days < c.window
            ? "\(c.full) of \(c.days) \(c.days == 1 ? "day" : "days") locked in"
            : "\(c.full) of the last \(c.window) days locked in"
        card.fileTag = "last-\(c.window)"
        card.lockedIn = c.full
        card.range = "\(LIDate.formatDateShort(from)) to \(LIDate.formatDateShort(input.today))"
        if let f = photos.first, let l = photos.last {
            card.before = tag(f)
            card.after = l.date != f.date ? tag(l) : nil
        } else {
            card.before = nil
            card.after = nil
        }
        return card
    }
}

// MARK: challenge helpers

/// Pieces of src/lib/logic/challenge.ts the Record screen needs that the foundation did not port.
public enum ChallengeViews {
    /// Days of the challenge that have run, up to today.
    public static func daysRun(_ c: Challenge, today: DateStr) -> Int {
        let last = Challenges.lastDay(c)
        let to = last < today ? last : today
        return to < c.startDate ? 0 : LIDate.diffDays(c.startDate, to) + 1
    }

    /// Closed challenges, newest first.
    public static func pastChallenges(_ challenges: [Challenge]) -> [Challenge] {
        return challenges
            .filter { $0.status != .active }
            .enumerated()
            .sorted { l, r in
                if l.element.startDate != r.element.startDate { return l.element.startDate > r.element.startDate }
                return l.offset < r.offset
            }
            .map { $0.element }
    }

    public static func statusLabel(_ s: ChallengeStatus) -> String {
        switch s {
        case .active: return "Active"
        case .succeeded: return "Finished"
        case .ended: return "Ended early"
        case .abandoned: return "Restarted"
        }
    }

    /// The items a challenge counts. Nil rules mean the whole checklist.
    public static func challengeItems(_ c: Challenge, _ items: [ChecklistItem]) -> [ChecklistItem] {
        guard let rules = c.rules else { return items }
        let ids = Set(rules.map { $0.itemId })
        return items.filter { ids.contains($0.id) }
    }
}
