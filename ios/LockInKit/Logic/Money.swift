import Foundation

public struct FloorStatus: Equatable {
    public var floor: Double
    public var earned: Double
    public var met: Bool
    /// How far under the floor, 0 when met.
    public var short: Double
    /// How far over the floor, 0 when under.
    public var over: Double
    /// 0 to 1 for a progress bar.
    public var progress: Double
}

/// Money rules. Port of src/lib/logic/money.ts.
/// The daily floor applies every day and is a fixed number: being ahead never lowers it.
public enum Money {
    /// Round to cents, so sums of decimals do not drift.
    public static func cents(_ n: Double) -> Double {
        let v = n.isFinite ? n : 0
        return (v * 100.0).rounded(.toNearestOrAwayFromZero) / 100.0
    }

    public static func sumAmounts(_ earnings: [Earning]) -> Double {
        return cents(earnings.reduce(0.0) { $0 + ($1.amount.isFinite ? $1.amount : 0) })
    }

    public static func totalForDate(_ earnings: [Earning], _ date: DateStr) -> Double {
        return sumAmounts(earnings.filter { $0.date == date })
    }

    public static func totalsByDate(_ earnings: [Earning]) -> [DateStr: Double] {
        var out: [DateStr: Double] = [:]
        for e in earnings { out[e.date] = cents((out[e.date] ?? 0) + e.amount) }
        return out
    }

    /// Everything earned toward the target: entries dated on or after `from`, up to `to` when given.
    public static func runningTotal(_ earnings: [Earning], from: DateStr? = nil, to: DateStr? = nil) -> Double {
        return sumAmounts(earnings.filter { e in
            if let from = from, e.date < from { return false }
            if let to = to, e.date > to { return false }
            return true
        })
    }

    /// The first date that counts toward the current money target.
    public static func targetStart(_ c: Challenge) -> DateStr {
        if let s = c.moneyTargetStart, s > c.startDate { return s }
        return c.startDate
    }

    /// Where one day stands against the floor. `banked` is accepted only to make the rule explicit: it never lowers the floor.
    public static func floorStatus(earned: Double, floor: Double, banked: Double = 0) -> FloorStatus {
        let f = Swift.max(0, floor)
        let e = cents(Swift.max(0, earned))
        return FloorStatus(
            floor: f,
            earned: e,
            met: f > 0 ? e >= f : true,
            short: cents(Swift.max(0, f - e)),
            over: cents(Swift.max(0, e - f)),
            progress: f > 0 ? Swift.min(1, e / f) : 1
        )
    }

    /// Surplus banked: the sum of everything earned above the floor, day by day.
    public static func surplusBanked(_ earnings: [Earning], floor: Double, from: DateStr? = nil, to: DateStr? = nil) -> Double {
        var sum = 0.0
        for (date, total) in totalsByDate(earnings) {
            if let from = from, date < from { continue }
            if let to = to, date > to { continue }
            sum += Swift.max(0, total - Swift.max(0, floor))
        }
        return cents(sum)
    }

    /// Days that can still be worked: today through the deadline, inclusive. 0 once the deadline has passed.
    public static func workDaysLeft(today: DateStr, deadline: DateStr) -> Int {
        return today > deadline ? 0 : LIDate.diffDays(today, deadline) + 1
    }

    /// "$1,000", "$42.50". Cents only when there are any.
    public static func formatMoney(_ n: Double) -> String {
        let v = cents(n)
        let whole = v == v.rounded()
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.minimumFractionDigits = whole ? 0 : 2
        f.maximumFractionDigits = 2
        return "$" + (f.string(from: NSNumber(value: v)) ?? String(v))
    }
}
