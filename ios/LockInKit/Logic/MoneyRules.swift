import Foundation

/// How far a money target has got. hit wins over past. The target can be reset in either.
public enum MoneyTargetState: String, Equatable {
    case active
    case hit
    case past
}

/// What is needed per remaining day to hit the target by the deadline.
public struct MoneyNeeded: Equatable {
    /// Still to earn. 0 when the target is hit.
    public var remaining: Double
    /// Days that can still be worked, today included.
    public var days: Int
    /// Remaining spread evenly over those days. Nil when no days are left.
    public var perDay: Double?
    /// What to aim for each day: perDay, but never under the floor. Nil when no days are left.
    public var aim: Double?
}

/// One day of earnings.
public struct MoneyDay: Equatable, Identifiable {
    public var date: DateStr
    public var total: Double
    public var hours: Double
    public var rate: Double?
    public var entries: [Earning]
    public var id: String { return date }
}

/// What the screenshot reader found. Anything it could not trust is nil.
public struct MoneyEarningRead: Equatable {
    public var amount: Double?
    public var app: String?
    public var hours: Double?

    public init(amount: Double? = nil, app: String? = nil, hours: Double? = nil) {
        self.amount = amount
        self.app = app
        self.hours = hours
    }
}

/// The rest of src/lib/logic/money.ts. The basics live in Money.swift.
extension Money {
    /// The apps the quick add offers. Anything the reader cannot place falls to Other.
    public static let apps = ["DoorDash", "Uber Eats", "Instacart", "Other"]

    /// Map whatever the model or the user wrote to one of the three known apps. Nil when it is none of them.
    public static func normalizeApp(_ raw: String?) -> String? {
        guard let raw = raw else { return nil }
        let s = String(raw.lowercased().filter { $0 >= "a" && $0 <= "z" })
        if s.contains("doordash") || s == "dasher" || s == "dd" { return "DoorDash" }
        if s.contains("uber") { return "Uber Eats" }
        if s.contains("instacart") || s == "shopper" { return "Instacart" }
        return nil
    }

    /// The app to show for a stored value: a known app, or Other.
    public static func appChoice(_ raw: String?) -> String {
        if let known = normalizeApp(raw) { return known }
        if let raw = raw, raw.trimmingCharacters(in: .whitespaces).lowercased() == "other" { return "Other" }
        return "Other"
    }

    /// Dollars spent between two dates, inclusive, in one category or in all of them.
    public static func spentBetween(_ expenses: [Expense], from: DateStr, to: DateStr, category: String? = nil) -> Double {
        var sum = 0.0
        for e in expenses {
            if e.date < from || e.date > to { continue }
            if let category = category, e.category != category { continue }
            if e.amount.isFinite { sum += e.amount }
        }
        return cents(sum)
    }

    /// Whole days from today until the deadline. 0 on the deadline day and after it.
    public static func daysLeft(today: DateStr, deadline: DateStr) -> Int {
        return Swift.max(0, LIDate.diffDays(today, deadline))
    }

    /// Dollars per hour. Only entries with hours count, on both sides, so an entry logged without hours cannot inflate the rate.
    public static func hourlyRate(_ earnings: [Earning]) -> Double? {
        var amount = 0.0
        var hours = 0.0
        for e in earnings {
            if let h = e.hours, h > 0 {
                amount += e.amount
                hours += h
            }
        }
        return hours > 0 ? cents(amount / hours) : nil
    }

    public static func totalHours(_ earnings: [Earning]) -> Double {
        var sum = 0.0
        for e in earnings {
            if let h = e.hours, h > 0 { sum += h }
        }
        return cents(sum)
    }

    public static func neededPerDay(target: Double, total: Double, today: DateStr, deadline: DateStr, floor: Double = 0) -> MoneyNeeded {
        let remaining = cents(Swift.max(0, target - total))
        let days = workDaysLeft(today: today, deadline: deadline)
        if days == 0 { return MoneyNeeded(remaining: remaining, days: 0, perDay: nil, aim: nil) }
        let perDay = cents(remaining / Double(days))
        return MoneyNeeded(remaining: remaining, days: days, perDay: perDay, aim: Swift.max(perDay, Swift.max(0, floor)))
    }

    public static func targetState(target: Double, total: Double, today: DateStr, deadline: DateStr) -> MoneyTargetState {
        if target > 0 && total >= target { return .hit }
        if today > deadline { return .past }
        return .active
    }

    public static func canResetTarget(_ state: MoneyTargetState) -> Bool {
        return state != .active
    }

    /// A new target is valid when it is above what already counts toward it and due today or later.
    public static func validNewTarget(_ target: Double?, deadline: String, total: Double, today: DateStr) -> Bool {
        guard let target = target, target.isFinite else { return false }
        return target > total && LIDate.isDateStr(deadline) && deadline >= today
    }

    /// Entries grouped by day, newest day first. Entry order inside a day is kept.
    public static func groupByDay(_ earnings: [Earning]) -> [MoneyDay] {
        var map: [DateStr: [Earning]] = [:]
        for e in earnings { map[e.date, default: []].append(e) }
        let dates = map.keys.sorted(by: >)
        return dates.map { date in
            let entries = map[date] ?? []
            return MoneyDay(date: date, total: sumAmounts(entries), hours: totalHours(entries), rate: hourlyRate(entries), entries: entries)
        }
    }

    /// "1.5h", "2h".
    public static func formatHours(_ h: Double) -> String {
        let r = (h * 100).rounded() / 100
        if r == r.rounded() { return "\(Int(r))h" }
        return "\(r)h"
    }

    // MARK: reading a screenshot

    private static func toNumber(_ raw: JSON?) -> Double? {
        guard let raw = raw else { return nil }
        switch raw {
        case .number(let n):
            return n.isFinite ? n : nil
        case .string(let s):
            let cleaned = String(s.filter { !"$, \t\n".contains($0) })
            if s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
            if let n = Double(cleaned), n.isFinite { return n }
            return nil
        default:
            return nil
        }
    }

    /// Clean up what the model returned. Anything missing or implausible becomes nil so the form shows it empty.
    /// `minutes` is used when `hours` is absent.
    public static func parseEarningRead(_ raw: JSON?) -> MoneyEarningRead {
        var o: JSONObject = [:]
        if let raw = raw, case .object(let d) = raw { o = d }
        let amount = toNumber(o["amount"])
        var hours = toNumber(o["hours"])
        let minutes = toNumber(o["minutes"])
        if (hours == nil || (hours ?? 0) <= 0), let m = minutes, m > 0 { hours = m / 60 }
        var appName: String? = nil
        if let a = o["app"], case .string(let s) = a { appName = normalizeApp(s) }
        var outAmount: Double? = nil
        if let a = amount, a > 0, a < 100000 { outAmount = cents(a) }
        var outHours: Double? = nil
        if let h = hours, h > 0, h <= 24 { outHours = cents(h) }
        return MoneyEarningRead(amount: outAmount, app: appName, hours: outHours)
    }
}
