import Foundation

public enum ViceDayState: String, Equatable {
    /// Clean under the rule in force that day.
    case clean
    /// A slip was logged, or the amount went over the cap.
    case slip
    /// Tracked, nothing logged.
    case open
    /// The vice was not turned on that day.
    case off
    case future
}

public struct ViceDay: Equatable {
    public var date: DateStr
    /// The number in the cell: the day of the challenge (from 1) when numbered, else the day of the month.
    public var day: Int
    public var state: ViceDayState
    public var slips: Int
    public var isToday: Bool
}

public struct TypicalSpend: Equatable {
    public var amount: Double
    public var period: SpendPeriod
    public init(amount: Double, period: SpendPeriod) {
        self.amount = amount
        self.period = period
    }
}

public struct DollarsKept: Equatable {
    /// What the clean days would have cost at the typical spend.
    public var saved: Double
    /// Dollars spent in logged slips.
    public var spent: Double
    /// saved minus spent. Can go below zero.
    public var kept: Double
    public var cleanDays: Int
}

public enum TimeBucket: String, Equatable {
    case morning
    case afternoon
    case evening
    case lateNight = "late night"
}

public struct ViceTop<T: Equatable>: Equatable {
    public var value: T
    public var count: Int
}

public struct SlipPattern: Equatable {
    public var total: Int
    public var timeOfDay: ViceTop<TimeBucket>?
    public var trigger: ViceTop<String>?
    public var weekday: ViceTop<Int>?
}

/// Where the days of a vice calendar start and how many there are.
public struct ViceWindow: Equatable {
    public var start: DateStr
    public var length: Int
    /// True when the days count from a challenge start (Day 1, Day 2). False when they are plain dates.
    public var numbered: Bool
    /// The challenge's name. Nil for a plain window.
    public var name: String?
}

/// Vice rules. Port of src/lib/logic/vices.ts. Pure functions: pass in items, versions, logs and slips.
///
/// A vice is a checklist item with category "vice". Quit mode is a yes/no checked at the end of the day. Cap mode is a
/// number logged through the day against a "max" target. A slip logged on a day makes that day not clean for that vice,
/// whatever the tick or the number says. The count of slips is kept on the day_log row (day_log.slips, see
/// AppStore.syncSlipCount), so the foundation's scoring and streaks see it too and every screen agrees.
public enum ViceRules {
    // MARK: clean or not

    /// Slip counts for one vice, by date.
    public static func slipCounts(_ slips: [ViceSlip], itemId: String) -> [DateStr: Int] {
        var map: [DateStr: Int] = [:]
        for s in slips where s.itemId == itemId { map[s.date, default: 0] += 1 }
        return map
    }

    /// Whether a day is clean for a vice.
    /// Quit: the day is checked and no slip was logged. Cap: an amount is logged, it is at or under the cap, and no slip was logged.
    public static func isCleanDay(_ target: Target, _ log: DayLog?, slipCount: Int = 0) -> Bool {
        guard let log = log, slipCount <= 0 else { return false }
        if case .max(let cap) = target {
            guard let v = log.value else { return false }
            return v <= cap
        }
        return Scoring.itemState(ChecklistItem(type: .yesno), target, log) == .done
    }

    /// One vice's logs with slip days made not clean, ready for the streak maths.
    /// A quit day with a slip is unticked. A capped day with a slip is pushed over any cap.
    public static func logsWithSlips(_ item: ChecklistItem, _ logs: [DayLog], _ slips: [ViceSlip]) -> [DayLog] {
        let counts = slipCounts(slips, itemId: item.id)
        var out: [DayLog] = []
        for l in logs where l.itemId == item.id {
            if counts[l.date] == nil {
                out.append(l)
            } else {
                var c = l
                c.checked = false
                c.value = l.value == nil ? nil : Double.infinity
                out.append(c)
            }
        }
        return out
    }

    /// Clean streak for one vice. Only this vice's slips touch it.
    public static func viceStreak(_ item: ChecklistItem, _ versions: [TargetVersion], _ logs: [DayLog], _ slips: [ViceSlip], today: DateStr, from: DateStr) -> Streak {
        let streak = Streaks.itemStreak(item, versions, logsWithSlips(item, logs, slips), today: today, from: from)
        // The foundation lets an unfinished today ride on yesterday's run. A slip today (or going over the cap)
        // is not unfinished: the run is over.
        let todayLog = logs.first(where: { $0.itemId == item.id && $0.date == today })
        let slipsToday = slips.filter { $0.itemId == item.id && $0.date == today }.count
        if viceDayState(item, versions, todayLog, slipsToday, date: today, today: today) == .slip {
            return Streak(current: 0, best: streak.best, doneNow: false)
        }
        return streak
    }

    // MARK: calendar

    public static func viceDayState(_ item: ChecklistItem, _ versions: [TargetVersion], _ log: DayLog?, _ slipCount: Int, date: DateStr, today: DateStr) -> ViceDayState {
        if date > today { return .future }
        if slipCount > 0 { return .slip }
        if !Targets.isActiveOn(item, versions, date) { return .off }
        let target = Targets.targetOn(item, versions, date)
        if isCleanDay(target, log, slipCount: 0) { return .clean }
        if case .max = target, let log = log, log.value != nil { return .slip }
        return .open
    }

    /// One entry per day of the window, in order. Pass `numbered` false for plain dates outside a challenge.
    public static func viceCalendar(_ item: ChecklistItem, _ versions: [TargetVersion], _ logs: [DayLog], _ slips: [ViceSlip], startDate: DateStr, lengthDays: Int, today: DateStr, numbered: Bool = true) -> [ViceDay] {
        let counts = slipCounts(slips, itemId: item.id)
        var byDate: [DateStr: DayLog] = [:]
        for l in logs where l.itemId == item.id { byDate[l.date] = l }
        return LIDate.challengeDates(startDate, lengthDays).map { date in
            let n = counts[date] ?? 0
            let dayOfMonth = Int(date.suffix(2)) ?? 1
            return ViceDay(
                date: date,
                day: numbered ? LIDate.dayNumber(startDate, date) : dayOfMonth,
                state: viceDayState(item, versions, byDate[date], n, date: date, today: today),
                slips: n,
                isToday: date == today
            )
        }
    }

    /// Clean days from `from` up to and including `today`.
    public static func cleanDayCount(_ item: ChecklistItem, _ versions: [TargetVersion], _ logs: [DayLog], _ slips: [ViceSlip], from: DateStr, today: DateStr) -> Int {
        let counts = slipCounts(slips, itemId: item.id)
        var byDate: [DateStr: DayLog] = [:]
        for l in logs where l.itemId == item.id { byDate[l.date] = l }
        var n = 0
        var d = from
        while d <= today {
            if viceDayState(item, versions, byDate[d], counts[d] ?? 0, date: d, today: today) == .clean { n += 1 }
            d = LIDate.addDays(d, 1)
        }
        return n
    }

    /// The days a vice calendar draws: the running challenge, or the last `ongoingDays` plain days. Port of dayWindow.
    public static func dayWindow(challenge: Challenge?, historyStart: DateStr, today: DateStr, ongoingDays: Int = 30) -> ViceWindow {
        if let c = challenge {
            return ViceWindow(start: c.startDate, length: c.lengthDays, numbered: true, name: c.name)
        }
        let size = max(1, ongoingDays)
        let rolling = LIDate.addDays(today, -(size - 1))
        return ViceWindow(start: rolling < historyStart ? historyStart : rolling, length: size, numbered: false, name: nil)
    }

    // MARK: dollars kept

    /// The typical spend stored on a vice, or nil when none is set.
    public static func spendOf(_ item: ChecklistItem) -> TypicalSpend? {
        guard let amount = item.typicalSpend, amount.isFinite, amount > 0 else { return nil }
        return TypicalSpend(amount: amount, period: item.spendPeriod == .day ? .day : .week)
    }

    /// "$40 a week".
    public static func describeSpend(_ spend: TypicalSpend) -> String {
        return "$\(trimNumber(spend.amount)) a \(spend.period.rawValue)"
    }

    public static func spendPerDay(_ spend: TypicalSpend) -> Double {
        return spend.period == .week ? spend.amount / 7 : spend.amount
    }

    public static func dollarsKept(cleanDays: Int, spend: TypicalSpend?, slipAmounts: [Double?]) -> DollarsKept {
        let saved = spend.map { roundCents(Double(cleanDays) * spendPerDay($0)) } ?? 0
        let spent = roundCents(slipAmounts.reduce(0) { $0 + ($1 ?? 0) })
        return DollarsKept(saved: saved, spent: spent, kept: roundCents(saved - spent), cleanDays: cleanDays)
    }

    static func roundCents(_ n: Double) -> Double {
        return (n * 100).rounded(.toNearestOrAwayFromZero) / 100
    }

    /// 40 to "40", 87.5 to "87.5", 12.345 to "12.35".
    static func trimNumber(_ n: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.usesGroupingSeparator = false
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        return f.string(from: NSNumber(value: roundCents(n))) ?? String(n)
    }

    /// "$1,240", "$12.50", "-$40".
    public static func formatDollars(_ n: Double) -> String {
        let abs = Swift.abs(n)
        let text = Money.formatMoney(abs)
        return (n < 0 && abs >= 0.005 ? "-" : "") + text
    }

    // MARK: triggers

    public static let triggerChips = ["bored", "stressed", "tired", "with friends", "late night", "alone", "celebrating"]

    /// Chips and free text become one comma separated string for the slip row.
    public static func joinTriggers(_ chips: [String], text: String = "") -> String? {
        let parts = (chips + text.split(separator: ",", omittingEmptySubsequences: false).map { String($0) })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }
        var unique: [String] = []
        for p in parts where !unique.contains(p) { unique.append(p) }
        return unique.isEmpty ? nil : unique.joined(separator: ", ")
    }

    public static func splitTriggers(_ trigger: String?) -> [String] {
        guard let trigger = trigger else { return [] }
        return trigger.split(separator: ",", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }
    }

    // MARK: pattern summary

    /// Morning 5 to noon, afternoon noon to 5, evening 5 to 9, late night 9 PM to 5 AM.
    public static func timeBucket(_ time: TimeStr) -> TimeBucket {
        let m = LIDate.minutesOf(time)
        if m >= 5 * 60 && m < 12 * 60 { return .morning }
        if m >= 12 * 60 && m < 17 * 60 { return .afternoon }
        if m >= 17 * 60 && m < 21 * 60 { return .evening }
        return .lateNight
    }

    public static let weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    /// The most common value. Values arrive newest first, so the first to reach a count wins a tie.
    static func top<T: Hashable>(_ values: [T]) -> ViceTop<T>? {
        var counts: [T: Int] = [:]
        for v in values { counts[v, default: 0] += 1 }
        var best: ViceTop<T>? = nil
        for v in values {
            let count = counts[v] ?? 0
            if best == nil || count > (best?.count ?? 0) { best = ViceTop(value: v, count: count) }
        }
        return best
    }

    /// Newest first, by date then time.
    public static func sortSlips(_ slips: [ViceSlip]) -> [ViceSlip] {
        return slips.enumerated().sorted { l, r in
            let a = l.element
            let b = r.element
            if a.date != b.date { return a.date > b.date }
            if a.time != b.time { return a.time > b.time }
            return l.offset < r.offset
        }.map { $0.element }
    }

    public static func slipPattern(_ slips: [ViceSlip]) -> SlipPattern {
        let ordered = sortSlips(slips)
        return SlipPattern(
            total: ordered.count,
            timeOfDay: top(ordered.map { timeBucket($0.time) }),
            trigger: top(ordered.flatMap { splitTriggers($0.trigger) }),
            weekday: top(ordered.map { LIDate.weekdayOf($0.date) })
        )
    }

    // MARK: caps

    public static let capUnits: [(value: String, label: String)] = [
        (value: "min", label: "Minutes"),
        (value: "times", label: "Count"),
        (value: "$", label: "Dollars"),
    ]

    /// "12 min", "$40", "3 times".
    public static func formatAmount(_ value: Double, unit: String?) -> String {
        let n = trimNumber(value)
        if unit == "$" { return "$" + n }
        if unit == "times" { return "\(n) \(value == 1 ? "time" : "times")" }
        if let unit = unit, !unit.isEmpty { return "\(n) \(unit)" }
        return n
    }

    /// Quick add steps for the amount sheet.
    public static func quickAdds(unit: String?) -> [Double] {
        if unit == "min" { return [5, 15, 30] }
        if unit == "$" { return [5, 10, 20] }
        return [1, 2, 3]
    }

    /// The line shown for a vice's rule: "Quit completely", "30 min or less a day".
    public static func describeRule(_ item: ChecklistItem, _ target: Target) -> String {
        if item.mode == .cap, case .max(let cap) = target {
            return "\(formatAmount(cap, unit: item.unit)) or less a day"
        }
        return "Quit completely"
    }

    // MARK: writes shared by the screen and the tests

    /// The check or number a new vice gets, from the form.
    public struct ViceInput {
        public var name: String
        public var mode: ViceMode
        public var cap: Double?
        public var unit: String?
        public var tracksMoney: Bool
        public var spend: TypicalSpend?
        public init(name: String, mode: ViceMode, cap: Double?, unit: String?, tracksMoney: Bool, spend: TypicalSpend?) {
            self.name = name
            self.mode = mode
            self.cap = cap
            self.unit = unit
            self.tracksMoney = tracksMoney
            self.spend = spend
        }
    }

    /// The checklist_item fields for a vice. Cap mode with a cap is a number against a "max" target, anything else is a yes/no.
    public static func itemFields(_ input: ViceInput) -> (fields: JSONObject, target: Target) {
        let capped = input.mode == .cap && input.cap != nil
        let target: Target = capped ? .max(input.cap ?? 0) : .check
        let spend = input.tracksMoney ? input.spend : nil
        let fields: JSONObject = [
            "name": .string(input.name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "type": .string(capped ? "number" : "yesno"),
            "mode": .string(capped ? "cap" : "quit"),
            "unit": capped ? JSON.str(input.unit) : .null,
            "target": JSON.from(target),
            "tracks_money": .bool(input.tracksMoney),
            "typical_spend": JSON.num(spend?.amount),
            "spend_period": JSON.str(spend?.period.rawValue),
        ]
        return (fields, target)
    }
}
