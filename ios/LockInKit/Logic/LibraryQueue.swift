import Foundation

// What the reader walks through. Port of src/lib/logic/libraryQueue.ts.

/// A small seeded generator (mulberry32). The same seed gives the same numbers on any device, and the same as the web.
public final class SeededRandom {
    private var a: UInt32

    public init(seed: Int) {
        a = UInt32(truncatingIfNeeded: seed)
    }

    public func next() -> Double {
        a = a &+ 0x6d2b79f5
        var t: UInt32 = a
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        let out: UInt32 = t ^ (t >> 14)
        return Double(out) / 4294967296.0
    }
}

public struct ReadingQueue: Equatable {
    public var ids: [String]
    /// 1 while there is anything unread in the scope, 2 once it has all been read and you are going through again.
    public var pass: Int
    /// Reviewing a collection (Saved): no passes, read or not.
    public var review: Bool
    /// Where to open.
    public var start: Int
}

public struct ScopeCounts: Equatable {
    public var read: Int
    public var total: Int
}

public struct PickOptions {
    public var moment: String? = nil
    public var theme: String? = nil
    public var writer: String? = nil
    public var seed: Int
    public var exclude: [String] = []
    /// nil or true: prefer unread. false: any. strict: only unread.
    public var unread: UnreadMode = .prefer

    public enum UnreadMode {
        case prefer, any, strict
    }

    public init(moment: String? = nil, theme: String? = nil, writer: String? = nil, seed: Int, exclude: [String] = [], unread: UnreadMode = .prefer) {
        self.moment = moment
        self.theme = theme
        self.writer = writer
        self.seed = seed
        self.exclude = exclude
        self.unread = unread
    }
}

public enum LibraryQueue {
    // MARK: seeded order

    /// A seeded shuffle that leaves the input alone.
    public static func shuffled<T>(_ items: [T], seed: Int) -> [T] {
        var out = items
        if out.count < 2 { return out }
        let rand = SeededRandom(seed: seed)
        var i = out.count - 1
        while i > 0 {
            let j = Int((rand.next() * Double(i + 1)).rounded(.down))
            out.swapAt(i, j)
            i -= 1
        }
        return out
    }

    /// A new shuffle seed.
    public static func newSeed() -> Int {
        return Int.random(in: 1...999_999_998)
    }

    /// Take one from each writer in turn, each writer's own order kept.
    public static func interleave(_ quotes: [LibQuote]) -> [LibQuote] {
        var lanes: [[LibQuote]] = []
        var laneOf: [String: Int] = [:]
        for q in quotes {
            if let i = laneOf[q.writer] {
                lanes[i].append(q)
            } else {
                laneOf[q.writer] = lanes.count
                lanes.append([q])
            }
        }
        var out: [LibQuote] = []
        let longest = lanes.map { $0.count }.max() ?? 0
        if longest == 0 { return out }
        var taken = Array(repeating: 0, count: lanes.count)
        for step in 0..<longest {
            for (i, lane) in lanes.enumerated() {
                // ceil(((step + 1) * lane.count) / longest) in whole numbers
                let want = ((step + 1) * lane.count + longest - 1) / longest
                while taken[i] < want {
                    out.append(lane[taken[i]])
                    taken[i] += 1
                }
            }
        }
        return out
    }

    // MARK: scopes

    /// The quotes a scope covers, in the order they are read.
    public static func scopeQuotes(_ scope: LibraryScope, _ all: [LibQuote], _ marks: LibraryMarks) -> [LibQuote] {
        switch scope {
        case .writer(let w, let work):
            return all.filter { $0.writer == w && (work == nil || work == "" || $0.work == work) }
        case .theme(let t):
            return interleave(all.filter { $0.themes.contains(t) })
        case .moment(let m):
            return interleave(all.filter { $0.moments.contains(m) })
        case .shuffle(let seed):
            return shuffled(all, seed: seed)
        case .saved:
            let saved = all.enumerated().filter { marks[$0.element.id]?.savedAt != nil }
            let sorted = saved.sorted { a, b in
                let sa = marks[a.element.id]?.savedAt ?? ""
                let sb = marks[b.element.id]?.savedAt ?? ""
                if sa != sb { return sa > sb }
                return a.offset < b.offset
            }
            return sorted.map { $0.element }
        }
    }

    public static func isRead(_ marks: LibraryMarks, _ id: String) -> Bool {
        return marks[id]?.readAt != nil
    }

    public static func scopeCounts(_ quotes: [LibQuote], _ marks: LibraryMarks) -> ScopeCounts {
        var read = 0
        for q in quotes where isRead(marks, q.id) { read += 1 }
        return ScopeCounts(read: read, total: quotes.count)
    }

    // MARK: the queue

    /// The queue for a scope's quotes. First pass: the unread ones, in order. Once none are left: all of them again,
    /// from after `after` (or the top), pass 2. A saved collection is a review. `startAt` always opens on that quote.
    public static func buildQueue(_ scope: LibraryScope, _ quotes: [LibQuote], _ marks: LibraryMarks, startAt: String? = nil, after: String? = nil) -> ReadingQueue {
        let review = scope == .saved
        let unread = quotes.filter { !isRead(marks, $0.id) }
        let first = !review && !unread.isEmpty
        var ids = (first ? unread : quotes).map { $0.id }
        let pass = (first || review) ? 1 : 2
        var start = 0
        if let startAt = startAt, !startAt.isEmpty {
            if let at = ids.firstIndex(of: startAt) {
                start = at
            } else if quotes.contains(where: { $0.id == startAt }) {
                ids.insert(startAt, at: 0)
            }
        } else if pass == 2, let after = after, let at = ids.firstIndex(of: after) {
            start = (at + 1) % ids.count
        }
        return ReadingQueue(ids: ids, pass: pass, review: review, start: start)
    }

    // MARK: picking one quote

    /// One quote for a moment, a theme, a writer or anything, chosen by the seed. Prefers quotes you have not read.
    public static func pickQuote(_ all: [LibQuote], _ marks: LibraryMarks, _ opts: PickOptions) -> LibQuote? {
        let out = Set(opts.exclude)
        let fits = all.filter { q in
            if out.contains(q.id) { return false }
            if let m = opts.moment, !q.moments.contains(m) { return false }
            if let t = opts.theme, !q.themes.contains(t) { return false }
            if let w = opts.writer, q.writer != w { return false }
            return true
        }
        if fits.isEmpty { return nil }
        let unread = fits.filter { !isRead(marks, $0.id) }
        let pool: [LibQuote]
        switch opts.unread {
        case .any: pool = fits
        case .prefer: pool = unread.isEmpty ? fits : unread
        case .strict: pool = unread
        }
        if pool.isEmpty { return nil }
        let seed = Int(abs(Double(opts.seed)).rounded(.down)) % 4_294_967_296
        let rand = SeededRandom(seed: seed)
        return pool[Int((rand.next() * Double(pool.count)).rounded(.down))]
    }

    /// A seed that is the same all day: today's date as a number, plus anything else that should vary.
    public static func daySeed(_ date: DateStr, extra: Int = 0) -> Int {
        return (Int(date.replacingOccurrences(of: "-", with: "")) ?? 0) * 31 + extra
    }

    // MARK: today

    /// How many quotes were read on a New York calendar date.
    public static func readOnDate(_ marks: LibraryMarks, _ date: DateStr) -> Int {
        // read_at is an instant in UTC. A New York day never starts before the UTC date before it, so skip older ones cheaply.
        let floor = LIDate.addDays(date, -1)
        var n = 0
        for m in marks.values {
            guard let at = m.readAt else { continue }
            if String(at.prefix(10)) < floor { continue }
            if LIDate.nyParts(iso: at).date == date { n += 1 }
        }
        return n
    }
}
