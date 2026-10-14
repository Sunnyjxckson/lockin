import Foundation

// Body rules: macro totals, what is left to eat, ring fill, weight trend, chart range and which progress photos
// to compare. Port of src/lib/logic/body.ts. Pure, no network.

public struct BodyMacros: Equatable {
    public var calories: Double
    public var protein: Double
    public var carbs: Double
    public var fat: Double

    public init(calories: Double = 0, protein: Double = 0, carbs: Double = 0, fat: Double = 0) {
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }

    public static let zero = BodyMacros()
}

/// A goal for one macro. min is a number to reach, max a number to stay under.
public struct BodyGoal: Equatable {
    public var min: Double?
    public var max: Double?

    public init(min: Double? = nil, max: Double? = nil) {
        self.min = min
        self.max = max
    }

    public static let none = BodyGoal()
}

public enum BodyRingState: String, Equatable {
    case none
    case empty
    case under
    case met
    case over
}

public struct BodyRing: Equatable {
    /// total / reference, not capped. 1.2 means 20 percent over. 0 with no goal.
    public var percent: Double
    /// percent clamped to 0...1, for drawing.
    public var fill: Double
    public var state: BodyRingState
}

public struct BodyRemaining: Equatable {
    /// Still to eat to reach the reference. Never negative.
    public var left: Double
    /// Amount past the cap. 0 when there is no cap or it is not passed.
    public var over: Double
    /// Space before the cap. Nil with no cap, 0 when at or past it.
    public var room: Double?
}

public struct BodyWeightPoint: Equatable {
    public var date: DateStr
    /// Day number from the start of the window, 1 based. Can be below 1 or past the end.
    public var day: Int
    public var weight: Double
}

public enum BodyWeightDirection: String, Equatable {
    case down
    case up
    case flat
}

public struct BodyWeightTrend: Equatable {
    public var first: BodyWeightPoint
    public var latest: BodyWeightPoint
    /// latest minus first. Negative is weight lost.
    public var change: Double
    /// Change per 7 days. Nil with one weigh-in.
    public var perWeek: Double?
    /// latest minus the weigh-in before it. Nil with one weigh-in.
    public var sinceLast: Double?
    public var direction: BodyWeightDirection
}

public struct BodyPhotoEntry: Equatable, Identifiable {
    public var date: DateStr
    public var photoUrl: String
    public var weight: Double?
    public var id: String { return date }
}

public struct BodyPhotoPair: Equatable {
    /// The day 1 photo: the first one taken on or after the start date, else the oldest.
    public var before: BodyPhotoEntry?
    /// The newest photo that is not the before photo.
    public var after: BodyPhotoEntry?
}

/// The days a weight chart covers: the running challenge, or a rolling run of plain days.
public struct BodyDayWindow: Equatable {
    public var start: DateStr
    public var length: Int
    public var numbered: Bool
    public var name: String?
}

public enum BodyRules {
    // MARK: numbers

    public static let weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    /// "Friday" for weekday 5. Out of range reads as Sunday.
    public static func dayName(_ weekday: Int) -> String {
        return weekdayNames[(weekday % 7 + 7) % 7]
    }

    static func r1(_ n: Double) -> Double {
        return (n * 10).rounded() / 10
    }

    static func clean(_ n: Double) -> Double {
        return n.isFinite ? n : 0
    }

    /// "1,050", "186.4". Grouped, at most `maxDecimals` places.
    public static func fmt(_ n: Double, _ maxDecimals: Int = 0) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = maxDecimals
        f.roundingMode = .halfUp
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    /// "+1.2" or "-3". A plain hyphen, never a dash character.
    public static func signed(_ n: Double, _ maxDecimals: Int = 1) -> String {
        let body = fmt(Swift.abs(n), maxDecimals)
        if n > 0 { return "+" + body }
        if n < 0 { return "-" + body }
        return body
    }

    // MARK: meals

    /// Sum of the meals, optionally only those on `date`.
    public static func mealTotals(_ meals: [Meal], date: DateStr? = nil) -> BodyMacros {
        var out = BodyMacros.zero
        for m in meals {
            if let date = date, m.date != date { continue }
            out.calories += clean(m.calories)
            out.protein += clean(m.protein)
            out.carbs += clean(m.carbs)
            out.fat += clean(m.fat)
        }
        out.calories = r1(out.calories)
        out.protein = r1(out.protein)
        out.carbs = r1(out.carbs)
        out.fat = r1(out.fat)
        return out
    }

    // MARK: goals, rings, what is left

    /// Turn a checklist target into a goal. Calories is a range, protein a minimum.
    public static func goalFromTarget(_ target: Target?) -> BodyGoal {
        guard let target = target else { return BodyGoal.none }
        switch target {
        case .min(let v): return BodyGoal(min: v, max: nil)
        case .max(let v): return BodyGoal(min: nil, max: v)
        case .range(let lo, let hi): return BodyGoal(min: lo, max: hi)
        default: return BodyGoal.none
        }
    }

    /// Carbs and fat are budgets: a number to land at or under.
    public static func budgetGoal(_ amount: Double?) -> BodyGoal {
        if let a = amount, a > 0 { return BodyGoal(min: nil, max: a) }
        return BodyGoal.none
    }

    /// The number the ring fills toward: the minimum when there is one, else the cap.
    public static func goalReference(_ goal: BodyGoal) -> Double? {
        let ref = goal.min ?? goal.max
        if let r = ref, r > 0 { return r }
        return nil
    }

    public static func ringFor(_ total: Double, _ goal: BodyGoal) -> BodyRing {
        guard let ref = goalReference(goal) else { return BodyRing(percent: 0, fill: 0, state: .none) }
        let t = Swift.max(0, clean(total))
        let percent = t / ref
        let fill = Swift.min(1, percent)
        var state: BodyRingState
        if let cap = goal.max, t > cap {
            state = .over
        } else if t == 0 {
            state = .empty
        } else if let lo = goal.min, t >= lo {
            state = .met
        } else {
            state = .under
        }
        return BodyRing(percent: percent, fill: fill, state: state)
    }

    public static func remainingFor(_ total: Double, _ goal: BodyGoal) -> BodyRemaining {
        let t = Swift.max(0, clean(total))
        let ref = goalReference(goal)
        let left: Double = ref == nil ? 0 : r1(Swift.max(0, (ref ?? 0) - t))
        var over = 0.0
        var room: Double? = nil
        if let cap = goal.max {
            over = r1(Swift.max(0, t - cap))
            room = r1(Swift.max(0, cap - t))
        }
        return BodyRemaining(left: left, over: over, room: room)
    }

    /// Short line under a ring: "320 left", "In range", "40 over", "Done".
    public static func remainingLabel(_ total: Double, _ goal: BodyGoal, unit: String = "") -> String {
        let ring = ringFor(total, goal)
        let rem = remainingFor(total, goal)
        func n(_ v: Double) -> String { return fmt(v.rounded(), 0) + unit }
        switch ring.state {
        case .none: return "No target"
        case .over: return n(rem.over) + " over"
        case .met: return goal.max != nil ? "In range" : "Done"
        default: return n(rem.left) + " left"
        }
    }

    /// "1,900 to 2,100 kcal", "180 g or more", "No target".
    public static func targetLine(_ goal: BodyGoal, unit: String) -> String {
        if let lo = goal.min, let hi = goal.max { return "\(fmt(lo)) to \(fmt(hi)) \(unit)" }
        if let lo = goal.min { return "\(fmt(lo)) \(unit) or more" }
        if let hi = goal.max { return "\(fmt(hi)) \(unit)" }
        return "No target"
    }

    // MARK: weight

    /// Weigh-ins with a number, oldest first. With a start date, only from then on.
    public static func weightSeries(_ logs: [BodyLog], startDate: DateStr? = nil, lengthDays: Int? = nil) -> [BodyWeightPoint] {
        var end: DateStr? = nil
        if let s = startDate, let n = lengthDays { end = LIDate.addDays(s, n - 1) }
        var out: [BodyWeightPoint] = []
        for l in logs {
            guard let w = l.weight, w.isFinite, w > 0 else { continue }
            if let s = startDate, l.date < s { continue }
            if let e = end, l.date > e { continue }
            let day = startDate == nil ? 1 : LIDate.diffDays(startDate ?? l.date, l.date) + 1
            out.append(BodyWeightPoint(date: l.date, day: day, weight: w))
        }
        return out.sorted { $0.date < $1.date }
    }

    public static func weightTrend(_ series: [BodyWeightPoint]) -> BodyWeightTrend? {
        guard let first = series.first, let latest = series.last else { return nil }
        let change = r1(latest.weight - first.weight)
        let days = LIDate.diffDays(first.date, latest.date)
        let prev: BodyWeightPoint? = series.count > 1 ? series[series.count - 2] : nil
        let direction: BodyWeightDirection = Swift.abs(change) < 0.05 ? .flat : (change < 0 ? .down : .up)
        return BodyWeightTrend(
            first: first,
            latest: latest,
            change: change,
            perWeek: days > 0 ? r1(change / Double(days) * 7) : nil,
            sinceLast: prev != nil ? r1(latest.weight - (prev?.weight ?? latest.weight)) : nil,
            direction: direction
        )
    }

    /// The y range the weight chart shows. At least a 4 unit window, so one weigh-in or a flat week sits mid chart.
    public static func weightDomain(_ series: [BodyWeightPoint]) -> (lo: Double, hi: Double) {
        if series.isEmpty { return (0, 1) }
        let weights = series.map { $0.weight }
        let low = weights.min() ?? 0
        let high = weights.max() ?? 0
        let span = Swift.max(4, high - low)
        let mid = (high + low) / 2
        let lo = (mid - span / 2 - span * 0.15).rounded(.down)
        let hi = (mid + span / 2 + span * 0.15).rounded(.up)
        return (lo, hi)
    }

    /// The weekly weigh-in date for the week starting `weekMonday` (weeks run Monday to Sunday).
    public static func weighInDateFor(_ weekMonday: DateStr, weeklyDay: Int?) -> DateStr {
        let wd = weeklyDay ?? 5
        return LIDate.addDays(weekMonday, (wd + 6) % 7)
    }

    /// The days the weight chart covers: the running challenge, or `ongoingDays` plain days ending today.
    public static func dayWindow(_ mode: ModeInfo, today: DateStr, ongoingDays: Int = 30) -> BodyDayWindow {
        if let c = mode.challenge {
            return BodyDayWindow(start: c.startDate, length: c.lengthDays, numbered: true, name: c.name)
        }
        let size = Swift.max(1, ongoingDays)
        let rolling = LIDate.addDays(today, -(size - 1))
        return BodyDayWindow(start: rolling < mode.historyStart ? mode.historyStart : rolling, length: size, numbered: false, name: nil)
    }

    // MARK: progress photos

    /// Body logs that carry a photo, oldest first.
    public static func photoEntries(_ logs: [BodyLog]) -> [BodyPhotoEntry] {
        var out: [BodyPhotoEntry] = []
        for l in logs {
            guard let url = l.photoUrl, !url.isEmpty else { continue }
            out.append(BodyPhotoEntry(date: l.date, photoUrl: url, weight: l.weight))
        }
        return out.sorted { $0.date < $1.date }
    }

    public static func pickComparePhotos(_ logs: [BodyLog], startDate: DateStr? = nil) -> BodyPhotoPair {
        let all = photoEntries(logs)
        guard let oldest = all.first, let latest = all.last else { return BodyPhotoPair(before: nil, after: nil) }
        var before = oldest
        if let s = startDate, let hit = all.first(where: { $0.date >= s }) { before = hit }
        return BodyPhotoPair(before: before, after: latest.date == before.date ? nil : latest)
    }
}
