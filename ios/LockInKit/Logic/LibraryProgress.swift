import Foundation

// How far into the library you are, and the moments worth marking. Port of src/lib/logic/libraryProgress.ts.

public struct ReadCounts: Equatable {
    public var read: Int
    public var total: Int
    public init(read: Int, total: Int) {
        self.read = read
        self.total = total
    }
}

public struct WorkCounts: Equatable {
    public var slug: String
    public var title: String
    public var read: Int
    public var total: Int
}

public struct WriterCounts: Equatable {
    public var slug: String
    public var name: String
    public var read: Int
    public var total: Int
    public var works: [WorkCounts]

    public var counts: ReadCounts { return ReadCounts(read: read, total: total) }
}

public struct LibraryCounts: Equatable {
    public var overall: ReadCounts
    public var writers: [WriterCounts]
}

public enum LibraryMilestone: Equatable {
    case library(total: Int)
    case writer(slug: String, name: String, count: Int)
    case count(read: Int)
}

public enum LibraryProgress {
    public static func percent(_ c: ReadCounts) -> Int {
        if c.total <= 0 { return 0 }
        return min(100, Int((Double(c.read) / Double(c.total) * 100).rounded()))
    }

    public static func fraction(_ c: ReadCounts) -> Double {
        if c.total <= 0 { return 0 }
        return min(1, Double(c.read) / Double(c.total))
    }

    /// Read counts keyed "writer" and "writer/work", from the marks that carry a read time.
    static func tally(_ marks: LibraryMarks) -> [String: Int] {
        var out: [String: Int] = [:]
        for m in marks.values where m.readAt != nil {
            out[m.writer, default: 0] += 1
            out["\(m.writer)/\(m.work)", default: 0] += 1
        }
        return out
    }

    /// Overall, per writer and per work. A count never goes above its total.
    public static func libraryCounts(_ index: QuoteIndex, _ marks: LibraryMarks) -> LibraryCounts {
        let t = tally(marks)
        var read = 0
        var total = 0
        var writers: [WriterCounts] = []
        for w in index.writers {
            let r = min(w.count, t[w.slug] ?? 0)
            read += r
            total += w.count
            let works = w.works.map { k in
                WorkCounts(slug: k.slug, title: k.title, read: min(k.count, t["\(w.slug)/\(k.slug)"] ?? 0), total: k.count)
            }
            writers.append(WriterCounts(slug: w.slug, name: w.name, read: r, total: w.count, works: works))
        }
        return LibraryCounts(overall: ReadCounts(read: read, total: total), writers: writers)
    }

    public static func writerCounts(_ index: QuoteIndex, _ marks: LibraryMarks, slug: String) -> WriterCounts? {
        return libraryCounts(index, marks).writers.first { $0.slug == slug }
    }

    /// Saved quotes.
    public static func savedCount(_ marks: LibraryMarks) -> Int {
        var n = 0
        for m in marks.values where m.savedAt != nil { n += 1 }
        return n
    }

    /// Round numbers worth a moment: 10, 25, 50, 100, 250, 500, then every 500.
    public static func isRoundNumber(_ n: Int) -> Bool {
        if n <= 0 { return false }
        if [10, 25, 50, 100, 250].contains(n) { return true }
        return n >= 500 && n % 500 == 0
    }

    /// What a quote that has just been read finished, if anything. Biggest first.
    public static func milestonesAfterRead(_ index: QuoteIndex, _ marks: LibraryMarks, writer: String) -> [LibraryMilestone] {
        let counts = libraryCounts(index, marks)
        var out: [LibraryMilestone] = []
        if counts.overall.total > 0 && counts.overall.read >= counts.overall.total {
            out.append(.library(total: counts.overall.total))
        }
        if let w = counts.writers.first(where: { $0.slug == writer }), w.total > 0, w.read >= w.total {
            out.append(.writer(slug: w.slug, name: w.name, count: w.total))
        }
        if isRoundNumber(counts.overall.read) && counts.overall.read < counts.overall.total {
            out.append(.count(read: counts.overall.read))
        }
        return out
    }
}
