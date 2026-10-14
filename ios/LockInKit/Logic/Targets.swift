import Foundation

/// An item paired with the target it is scored against on one date.
public struct ScoredItem {
    public var item: ChecklistItem
    public var target: Target
}

/// Target versioning. Port of src/lib/logic/targets.ts.
/// Settings changes apply from today forward, so scoring a past day reads the version in force on that day.
public enum Targets {
    /// Seeded versions use this date so they cover any challenge start.
    public static let baselineDate: DateStr = "2000-01-01"

    /// The version in force for an item on a date, or nil if none had started.
    public static func versionOn(_ versions: [TargetVersion], itemId: String, date: DateStr) -> TargetVersion? {
        var best: TargetVersion? = nil
        for v in versions {
            if v.itemId != itemId || v.effectiveFrom > date { continue }
            if let b = best {
                if v.effectiveFrom > b.effectiveFrom { best = v }
            } else {
                best = v
            }
        }
        return best
    }

    static func hasVersions(_ versions: [TargetVersion], itemId: String) -> Bool {
        return versions.contains { $0.itemId == itemId }
    }

    /// The target an item was scored against on a date. Items with no version rows fall back to the item's own target.
    public static func targetOn(_ item: ChecklistItem, _ versions: [TargetVersion], _ date: DateStr) -> Target {
        if let v = versionOn(versions, itemId: item.id, date: date) { return v.target }
        return item.target
    }

    /// Whether an item was in the checklist on a date.
    public static func isActiveOn(_ item: ChecklistItem, _ versions: [TargetVersion], _ date: DateStr) -> Bool {
        if let v = versionOn(versions, itemId: item.id, date: date) { return v.active }
        return hasVersions(versions, itemId: item.id) ? false : item.active
    }

    /// The checklist for one date, in display order, with that date's targets.
    public static func scoredItems(_ items: [ChecklistItem], _ versions: [TargetVersion], _ date: DateStr) -> [ScoredItem] {
        let active = items.filter { isActiveOn($0, versions, date) }
        let sorted = active.sorted { a, b in
            if a.sortOrder != b.sortOrder { return a.sortOrder < b.sortOrder }
            return a.name.localizedCompare(b.name) == .orderedAscending
        }
        return sorted.map { ScoredItem(item: $0, target: targetOn($0, versions, date)) }
    }

    /// The row to upsert (on item_id + effective_from) when a target or the on/off state changes.
    public static func versionForChange(itemId: String, today: DateStr, target: Target, active: Bool) -> JSONObject {
        return [
            "item_id": .string(itemId),
            "effective_from": .string(today),
            "target": JSON.from(target),
            "active": .bool(active),
        ]
    }

    public static func targetsEqual(_ a: Target, _ b: Target) -> Bool {
        return a == b
    }

    /// The default target for a freshly made item of a type.
    public static func defaultTarget(_ type: ItemType) -> Target {
        switch type {
        case .number: return .min(1)
        case .text: return .text
        case .yesno: return .check
        }
    }

    static func num(_ n: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = 2
        f.minimumFractionDigits = 0
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    static func withUnit(_ n: Double, _ unit: String?) -> String {
        guard let unit = unit, !unit.isEmpty else { return num(n) }
        if unit == "$" { return "$" + num(n) }
        return unit.count <= 2 ? num(n) + unit : num(n) + " " + unit
    }

    /// Short human text for a target: "1,900 to 2,100", "180g or more", "Check by 6:00 AM".
    public static func describeTarget(_ target: Target, unit: String? = nil) -> String {
        switch target {
        case .check:
            return ""
        case .checkBy(let by):
            return "Check by " + LIDate.formatTime(by)
        case .min(let v):
            return withUnit(v, unit) + " or more"
        case .max(let v):
            return withUnit(v, unit) + " or less"
        case .range(let lo, let hi):
            return num(lo) + " to " + withUnit(hi, unit)
        case .text:
            return "Write it, then check it"
        }
    }

    /// A number target short enough for a tile: "of $100", "180g or more", "1,900 to 2,100", "2 or less".
    public static func shortTarget(_ target: Target, unit: String? = nil) -> String {
        func u(_ v: Double) -> String {
            if unit == "$" { return "$" + num(v) }
            if let unit = unit, unit.count <= 2 { return num(v) + unit }
            return num(v)
        }
        switch target {
        case .min(let v):
            return unit == "$" ? "of " + u(v) : u(v) + " or more"
        case .max(let v):
            return u(v) + " or less"
        case .range(let lo, let hi):
            return num(lo) + " to " + num(hi)
        default:
            return ""
        }
    }
}
