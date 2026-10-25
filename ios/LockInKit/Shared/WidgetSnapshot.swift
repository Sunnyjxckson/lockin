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

/// The morning quote for one New York date, as the quote widgets draw it. The app writes today's and the next days'.
public struct WidgetQuote: Codable, Equatable {
    /// New York calendar date this is the morning quote for.
    public var date: String
    public var id: String
    /// The writer's display name.
    public var writer: String
    public var text: String
    /// App path that opens the quote in the Library reader, as in a drop notification.
    public var url: String

    public init(date: String, id: String, writer: String, text: String, url: String) {
        self.date = date
        self.id = id
        self.writer = writer
        self.text = text
        self.url = url
    }

    /// The URL a widget tap opens: the app's own scheme in front of the reader path.
    public var deepLink: URL? {
        return URL(string: "lockin://app" + url)
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
    /// Every block of the day, so a widget can move on to the next one without the app running. Nil in older snapshots.
    public var blocks: [WidgetBlock]?
    /// The look the app is wearing: "dark" or "contrast", and the palette laid over it. Nil in older snapshots.
    public var themeBase: String?
    public var themePalette: ThemePalette?
    /// The morning quote for today and the next days, so the quote widgets can move to the next day without the app running. Nil in older snapshots.
    public var quotes: [WidgetQuote]?

    public init(date: String = "", dayNumber: Int? = nil, dayLength: Int? = nil, percent: Int = 0, done: Int = 0, total: Int = 0, items: [WidgetItem] = [], now: WidgetBlock? = nil, next: WidgetBlock? = nil, moneyToday: Double = 0, moneyFloor: Double = 0, moneyTotal: Double = 0, moneyTarget: Double? = nil, streak: Int = 0, updatedAt: String = "", blocks: [WidgetBlock]? = nil, themeBase: String? = nil, themePalette: ThemePalette? = nil, quotes: [WidgetQuote]? = nil) {
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
        self.blocks = blocks
        self.themeBase = themeBase
        self.themePalette = themePalette
        self.quotes = quotes
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
