import Foundation

// Philosophy drops: a quote through the day as a notification. Port of src/lib/logic/drops.ts.
// The choice is a function of the date and the slot over the bundled short quotes, so the phone and the
// server agree on which quote a drop is.

/// One quote of the bundled short set. `w` is the writer slug, `m` the moments it fits.
public struct ShortQuote: Codable, Equatable {
    public var id: String
    public var w: String
    public var t: String
    public var m: [String]
    public init(id: String, w: String, t: String, m: [String] = []) {
        self.id = id
        self.w = w
        self.t = t
        self.m = m
    }
    public enum CodingKeys: String, CodingKey {
        case id, w, t, m
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        w = c.or(.w, "")
        t = c.or(.t, "")
        m = c.or(.m, [])
    }
}

public struct ShortPool: Codable, Equatable {
    public var names: [String: String]
    public var quotes: [ShortQuote]
    public init(names: [String: String] = [:], quotes: [ShortQuote] = []) {
        self.names = names
        self.quotes = quotes
    }
    public enum CodingKeys: String, CodingKey {
        case names, quotes
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        names = c.or(.names, [:])
        quotes = c.or(.quotes, [])
    }
}

public struct DropMessage: Equatable {
    public var title: String
    public var body: String
    /// Opens that quote in the reader.
    public var url: String
    public var quoteId: String
    public var writer: String
}

/// One drop planned for a date and slot.
public struct PlannedDrop: Equatable {
    /// "drop.<date>.<slot>", the notification identifier.
    public var identifier: String
    public var date: DateStr
    public var time: TimeStr
    public var slot: Int
    public var message: DropMessage
}

public struct WindowBlock: Equatable {
    public var kind: String
    public var start: TimeStr
    public init(kind: String, start: TimeStr) {
        self.kind = kind
        self.start = start
    }
}

public enum Drops {
    public static let defaultPerDay = 3
    public static let minPerDay = 1
    public static let maxPerDay = 6
    /// The drop's candidates: the first unread of these is the drop.
    public static let candidateCount = 6
    /// The notification body never runs past this many characters.
    public static let bodyMax = 170
    /// Local notification identifiers start with this, so they never collide with the reminders.
    public static let identifierPrefix = "drop."

    static let step = 5
    static let shuffleSeed = 1517

    /// A saved setting as a usable count: whole, 1 to 6, 3 when missing.
    public static func dropsPerDay(_ value: Double?) -> Int {
        guard let v = value, v.isFinite else { return defaultPerDay }
        let n = Int(v.rounded())
        return min(maxPerDay, max(minPerDay, n))
    }

    public static func dropsPerDay(_ value: Int?) -> Int {
        guard let v = value else { return defaultPerDay }
        return min(maxPerDay, max(minPerDay, v))
    }

    // MARK: when

    /// The times of a day's drops: `perDay` of them spread evenly between wake and bedtime, none inside quiet hours.
    public static func dropSlotTimes(_ perDay: Int, wake: TimeStr, bed: TimeStr, quietStart: TimeStr, quietEnd: TimeStr) -> [TimeStr] {
        var lo = LIDate.minutesOf(wake)
        var hi = LIDate.minutesOf(bed)
        if LIDate.isQuiet(LIDate.timeFromMinutes(lo), quietStart: quietStart, quietEnd: quietEnd) { lo = LIDate.minutesOf(quietEnd) }
        if hi <= lo { hi = LIDate.minutesOf(quietStart) > lo ? LIDate.minutesOf(quietStart) : 24 * 60 - 1 }
        if LIDate.isQuiet(LIDate.timeFromMinutes(hi - 1), quietStart: quietStart, quietEnd: quietEnd) { hi = LIDate.minutesOf(quietStart) }
        if hi <= lo { return [] }
        let n = dropsPerDay(perDay)
        var out: [TimeStr] = []
        for i in 1...n {
            let raw = Double(lo) + (Double(hi - lo) * Double(i)) / Double(n + 1)
            let at = Int((raw / Double(step)).rounded()) * step
            let time = LIDate.timeFromMinutes(min(24 * 60 - 1, at))
            if !LIDate.isQuiet(time, quietStart: quietStart, quietEnd: quietEnd) { out.append(time) }
        }
        return out
    }

    /// Wake and bedtime for a day: the wake and bed blocks when it has them, else the ends of quiet hours.
    public static func dropWindow(_ blocks: [WindowBlock], quietStart: TimeStr, quietEnd: TimeStr) -> (wake: TimeStr, bed: TimeStr) {
        let wakes = blocks.filter { $0.kind == "wake" }.map { $0.start }.sorted()
        let beds = blocks.filter { $0.kind == "bed" }.map { $0.start }.sorted()
        return (wakes.first ?? quietEnd, beds.last ?? quietStart)
    }

    // MARK: which

    static func order(_ pool: ShortPool) -> [ShortQuote] {
        return LibraryQueue.shuffled(pool.quotes, seed: shuffleSeed)
    }

    static func gcd(_ a: Int, _ b: Int) -> Int {
        return b == 0 ? a : gcd(b, a % b)
    }

    /// A step through the set that never lands on the same quote twice in a row and reaches every one.
    static func stride(_ n: Int) -> Int {
        var s = 131 % n
        if s == 0 { s = 1 }
        while gcd(s, n) != 1 { s += 1 }
        return s
    }

    /// The candidates of one drop, in order. The first is where the day's walk through the set has got to for this slot.
    public static func dropCandidates(_ pool: ShortPool, date: DateStr, slot: Int, perDay: Int, count: Int = candidateCount) -> [ShortQuote] {
        let all = order(pool)
        let n = all.count
        if n == 0 { return [] }
        let per = dropsPerDay(perDay)
        let day = LIDate.diffDays("2026-01-01", date)
        let base = (((day * per + slot) % n) + n) % n
        let st = stride(n)
        var out: [ShortQuote] = []
        var seen = Set<String>()
        for j in 0..<min(count, n) {
            let q = all[(base + j * st) % n]
            if !seen.contains(q.id) {
                seen.insert(q.id)
                out.append(q)
            }
        }
        return out
    }

    /// The drop for a date and slot: the first candidate not read, or the first when all are. Nil for an empty set.
    public static func pickDrop(_ pool: ShortPool, date: DateStr, slot: Int, perDay: Int, isRead: (String) -> Bool = { _ in false }) -> ShortQuote? {
        let c = dropCandidates(pool, date: date, slot: slot, perDay: perDay)
        return c.first(where: { !isRead($0.id) }) ?? c.first
    }

    // MARK: what it says

    /// A quote cut to fit a notification: whole when it fits, otherwise cut at a word and ended with three dots.
    public static func trimForNotification(_ text: String, max: Int = bodyMax) -> String {
        let flat = text.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" || $0 == "\r" }).joined(separator: " ")
        let chars = Array(flat)
        if chars.count <= max { return flat }
        let room = max - 3
        let head = Array(chars.prefix(room + 1))
        var cut: String
        if let space = head.lastIndex(of: " "), space > 0 {
            cut = String(head[0..<space])
        } else {
            cut = String(chars.prefix(room))
        }
        let trailing = CharacterSet(charactersIn: " \t\n\r,;:.!?-")
        while let last = cut.unicodeScalars.last, trailing.contains(last) {
            cut.unicodeScalars.removeLast()
        }
        return cut + "..."
    }

    /// The notification for a drop: the writer as the title, the quote as the body, a tap opens it.
    public static func dropMessage(_ pool: ShortPool, _ q: ShortQuote) -> DropMessage {
        return DropMessage(
            title: pool.names[q.w] ?? q.w,
            body: trimForNotification(q.t),
            url: LibraryScopes.quoteLink(q.id, writer: q.w),
            quoteId: q.id,
            writer: q.w
        )
    }

    /// The same key the job stores, one per date and slot. Starts with its date.
    public static func dropKey(_ date: DateStr, _ slot: Int) -> String {
        return "\(date):drop:\(slot)"
    }

    // MARK: planning

    /// Drops for the days from `today`, in time order, only ones still ahead of `now`. At most `cap` of them.
    /// `windowFor` gives the wake and bed blocks of a date (an empty list falls back to quiet hours).
    public static func plan(
        pool: ShortPool,
        perDay: Int,
        today: DateStr,
        time: TimeStr,
        quietStart: TimeStr,
        quietEnd: TimeStr,
        blocksFor: (DateStr) -> [WindowBlock],
        isRead: (String) -> Bool,
        days: Int = 7,
        cap: Int = 24
    ) -> [PlannedDrop] {
        var out: [PlannedDrop] = []
        let per = dropsPerDay(perDay)
        for offset in 0..<max(1, days) {
            let date = LIDate.addDays(today, offset)
            let window = dropWindow(blocksFor(date), quietStart: quietStart, quietEnd: quietEnd)
            let times = dropSlotTimes(per, wake: window.wake, bed: window.bed, quietStart: quietStart, quietEnd: quietEnd)
            for (slot, t) in times.enumerated() {
                if offset == 0 && t <= time { continue }
                guard let q = pickDrop(pool, date: date, slot: slot, perDay: per, isRead: isRead) else { continue }
                out.append(PlannedDrop(identifier: "\(identifierPrefix)\(date).\(slot)", date: date, time: t, slot: slot, message: dropMessage(pool, q)))
                if out.count >= cap { return out }
            }
        }
        return out
    }
}
