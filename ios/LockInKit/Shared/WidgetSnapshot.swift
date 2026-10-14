import Foundation

public struct WidgetItem: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var done: Bool
    /// "yesno", "number" or "text".
    public var type: String

    public init(id: String, name: String, done: Bool, type: String) {
        self.id = id
        self.name = name
        self.done = done
        self.type = type
    }
}

public struct WidgetBlock: Codable, Equatable {
    public var name: String
    /// "HH:MM"
    public var start: String
    public var end: String
    public var kind: String

    public init(name: String, start: String, end: String, kind: String) {
        self.name = name
        self.start = start
        self.end = end
        self.kind = kind
    }
}

/// Everything the widgets and Live Activities draw from. The app writes it to the app group, the extensions read it.
public struct WidgetSnapshot: Codable, Equatable {
    /// New York calendar date this snapshot is for.
    public var date: String
    /// Day X of N while a challenge runs, nil in ongoing mode.
    public var dayNumber: Int?
    public var dayLength: Int?
    public var percent: Int
    public var done: Int
    public var total: Int
    public var items: [WidgetItem]
    public var now: WidgetBlock?
    public var next: WidgetBlock?
    public var moneyToday: Double
    public var moneyFloor: Double
    /// Running total toward the target, or all time when there is no target.
    public var moneyTotal: Double
    public var moneyTarget: Double?
    /// Full days in a row.
    public var streak: Int
    /// ISO instant the snapshot was written.
    public var updatedAt: String

    public init(date: String = "", dayNumber: Int? = nil, dayLength: Int? = nil, percent: Int = 0, done: Int = 0, total: Int = 0, items: [WidgetItem] = [], now: WidgetBlock? = nil, next: WidgetBlock? = nil, moneyToday: Double = 0, moneyFloor: Double = 0, moneyTotal: Double = 0, moneyTarget: Double? = nil, streak: Int = 0, updatedAt: String = "") {
        self.date = date
        self.dayNumber = dayNumber
        self.dayLength = dayLength
        self.percent = percent
        self.done = done
        self.total = total
        self.items = items
        self.now = now
        self.next = next
        self.moneyToday = moneyToday
        self.moneyFloor = moneyFloor
        self.moneyTotal = moneyTotal
        self.moneyTarget = moneyTarget
        self.streak = streak
        self.updatedAt = updatedAt
    }

    public static let empty = WidgetSnapshot()

    /// Reads the last snapshot the app wrote, or nil.
    public static func load() -> WidgetSnapshot? {
        guard let data = AppGroup.defaults.data(forKey: AppGroup.snapshotKey) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    public func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        AppGroup.defaults.set(data, forKey: AppGroup.snapshotKey)
    }
}
