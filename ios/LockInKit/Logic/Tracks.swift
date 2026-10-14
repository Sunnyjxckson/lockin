import Foundation

public struct TrackSummary: Identifiable {
    public var track: Track
    public var label: String
    public var done: Int
    public var total: Int
    /// What the track shows as its number: "3/6", "$40", "4d".
    public var value: String
    /// 0 to 1.
    public var progress: Double
    public var attention: Bool
    public var id: String { return track.rawValue }
}

/// The four tracks Today sums the day up in, plus the greeting and short names. Port of src/lib/logic/tracks.ts.
public enum Tracks {
    public static let all: [Track] = [.body, .money, .mind, .clean]

    public static func label(_ t: Track) -> String {
        switch t {
        case .body: return "Body"
        case .money: return "Money"
        case .mind: return "Mind"
        case .clean: return "Clean"
        }
    }

    static let byKey: [String: Track] = [
        "wake": .body, "workout": .body, "core": .body, "calories": .body, "protein": .body, "bed": .body, "weighin": .body,
        "earned": .money,
        "study": .mind, "business": .mind, "talk": .mind, "read_quotes": .mind,
    ]

    static let bodyUnits: Set<String> = ["kcal", "cal", "g", "lb", "lbs", "kg", "oz", "steps", "mi", "km", "reps"]

    /// The track an item gets when none is set on it.
    public static func defaultTrack(_ item: ChecklistItem) -> Track {
        if item.category == .vice { return .clean }
        if let key = item.key, let t = byKey[key] { return t }
        let unit = (item.unit ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        if unit == "$" || item.tracksMoney { return .money }
        if bodyUnits.contains(unit) { return .body }
        return .mind
    }

    public static func trackOf(_ item: ChecklistItem) -> Track {
        return item.track ?? defaultTrack(item)
    }

    /// Items grouped by track, Body first, each group in its checklist order.
    public static func orderByTrack(_ rows: [ItemResult]) -> [ItemResult] {
        var out: [ItemResult] = []
        for t in all { out.append(contentsOf: rows.filter { trackOf($0.item) == t }) }
        return out
    }

    /// Logged and it does not count: a slip, a late check, a number over its limit.
    static func needsLook(_ r: ItemResult) -> Bool {
        if r.state != .off { return false }
        if r.item.type != .number { return true }
        if (r.log?.slips ?? 0) > 0 { return true }
        var maxValue: Double? = nil
        switch r.target {
        case .max(let hi): maxValue = hi
        case .range(_, let hi): maxValue = hi
        default: maxValue = nil
        }
        if let hi = maxValue { return (r.log?.value ?? 0) > hi }
        return false
    }

    static func moneyProgress(_ target: Target, _ value: Double) -> Double {
        switch target {
        case .min(let lo): return lo > 0 ? Swift.min(1, value / lo) : 1
        case .range(let lo, _): return lo > 0 ? Swift.min(1, value / lo) : 1
        default: return 0
        }
    }

    /// One summary per track that has items today, in track order.
    public static func summarize(_ results: [ItemResult], streaks: [String: Streak] = [:]) -> [TrackSummary] {
        var out: [TrackSummary] = []
        for track in all {
            let rows = results.filter { trackOf($0.item) == track }
            if rows.isEmpty { continue }
            let done = rows.filter { $0.done }.count
            let total = rows.count
            var value = "\(done)/\(total)"
            var progress = Double(done) / Double(total)
            if track == .money {
                let dollars = rows.first(where: { $0.item.key == "earned" }) ?? rows.first(where: { $0.item.type == .number && $0.item.unit == "$" })
                if let d = dollars {
                    let v = d.log?.value ?? 0
                    value = Money.formatMoney(v.rounded())
                    if total == 1 {
                        progress = d.done ? 1 : moneyProgress(d.target, v)
                    }
                }
            }
            if track == .clean {
                var days = Int.max
                for r in rows {
                    let n = r.state == .off ? 0 : (streaks[r.item.id]?.current ?? 0)
                    if n < days { days = n }
                }
                value = "\(days == Int.max ? 0 : days)d"
            }
            out.append(TrackSummary(track: track, label: label(track), done: done, total: total, value: value, progress: progress, attention: rows.contains { needsLook($0) }))
        }
        return out
    }

    // MARK: greeting

    /// "Good morning" from 4:00, "Good afternoon" from noon, "Good evening" from 5:00 PM.
    public static func greeting(hour: Int) -> String {
        if hour >= 4 && hour < 12 { return "Good morning" }
        if hour >= 12 && hour < 17 { return "Good afternoon" }
        return "Good evening"
    }

    /// The two lines of the greeting: ["Good morning,", "Sunny."], or ["Good morning."] without a name.
    public static func greetingLines(hour: Int, name: String?) -> [String] {
        let who = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if who.isEmpty { return [greeting(hour: hour) + "."] }
        return [greeting(hour: hour) + ",", who + "."]
    }

    // MARK: short names

    static let shortNames: [String: String] = [
        "wake": "Wake", "workout": "Workout", "core": "Core", "calories": "Calories", "protein": "Protein", "earned": "Earned",
        "study": "Study", "business": "Business", "bed": "Bed", "talk": "Talk", "weighin": "Weigh-in",
    ]

    /// A name short enough for a tile.
    public static func shortName(_ item: ChecklistItem) -> String {
        if let key = item.key, let s = shortNames[key] { return s }
        if item.category == .vice {
            var bare = item.name.trimmingCharacters(in: .whitespaces)
            if bare.lowercased().hasPrefix("no ") { bare = String(bare.dropFirst(3)).trimmingCharacters(in: .whitespaces) }
            if bare.isEmpty { return item.name }
            return String(bare.prefix(1)).uppercased() + String(bare.dropFirst())
        }
        return item.name
    }
}
