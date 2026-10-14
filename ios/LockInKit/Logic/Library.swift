import Foundation

// The Library: the shapes of the quote files, the fixed vocabularies, which quotes a way in covers,
// the link format and the rule for when a quote counts as read. Port of src/lib/logic/library.ts.

// MARK: the data contract (src/data/quotes)

public struct IndexWork: Codable, Equatable {
    public var slug: String
    public var title: String
    public var count: Int
    public init(slug: String, title: String, count: Int) {
        self.slug = slug
        self.title = title
        self.count = count
    }
}

public struct IndexWriter: Codable, Equatable {
    public var slug: String
    public var name: String
    public var count: Int
    public var works: [IndexWork]
    public init(slug: String, name: String, count: Int, works: [IndexWork]) {
        self.slug = slug
        self.name = name
        self.count = count
        self.works = works
    }
}

/// src/data/quotes/index.json
public struct QuoteIndex: Codable, Equatable {
    public var total: Int
    public var writers: [IndexWriter]
    public init(total: Int, writers: [IndexWriter]) {
        self.total = total
        self.writers = writers
    }
}

public struct WriterInfo: Codable, Equatable {
    public var slug: String
    public var name: String
    public var years: String
    public var bio: String
    public init(slug: String = "", name: String = "", years: String = "", bio: String = "") {
        self.slug = slug
        self.name = name
        self.years = years
        self.bio = bio
    }
    public enum CodingKeys: String, CodingKey {
        case slug, name, years, bio
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = c.or(.slug, "")
        name = c.or(.name, "")
        years = c.flexString(.years)
        bio = c.or(.bio, "")
    }
}

public struct WorkInfo: Codable, Equatable {
    public var slug: String
    public var title: String
    public var translator: String
    public var year: String
    public var sourceUrl: String
    public var note: String
    public init(slug: String = "", title: String = "", translator: String = "", year: String = "", sourceUrl: String = "", note: String = "") {
        self.slug = slug
        self.title = title
        self.translator = translator
        self.year = year
        self.sourceUrl = sourceUrl
        self.note = note
    }
    public enum CodingKeys: String, CodingKey {
        case slug, title, translator, year, sourceUrl = "source_url", note
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = c.or(.slug, "")
        title = c.or(.title, "")
        translator = c.or(.translator, "")
        year = c.flexString(.year)
        sourceUrl = c.or(.sourceUrl, "")
        note = c.or(.note, "")
    }
}

/// One quote as the writer file holds it, with the writer it belongs to (added by the loader).
public struct LibQuote: Codable, Equatable, Identifiable {
    public var id: String
    public var text: String
    /// A work slug.
    public var work: String
    public var location: String
    public var plain: String
    public var themes: [String]
    public var moments: [String]
    /// Laws and maxims only.
    public var by: String?
    public var year: String?
    public var source: String?
    public var sourceUrl: String?
    public var writer: String

    public init(id: String, text: String = "", work: String = "", location: String = "", plain: String = "", themes: [String] = [], moments: [String] = [], by: String? = nil, year: String? = nil, source: String? = nil, sourceUrl: String? = nil, writer: String = "") {
        self.id = id
        self.text = text
        self.work = work
        self.location = location
        self.plain = plain
        self.themes = themes
        self.moments = moments
        self.by = by
        self.year = year
        self.source = source
        self.sourceUrl = sourceUrl
        self.writer = writer
    }

    public enum CodingKeys: String, CodingKey {
        case id, text, work, location, plain, themes, moments, by, year, source, sourceUrl = "source_url", writer
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        text = c.or(.text, "")
        work = c.or(.work, "")
        location = c.or(.location, "")
        plain = c.or(.plain, "")
        themes = c.or(.themes, [])
        moments = c.or(.moments, [])
        by = c.opt(.by)
        let y = c.flexString(.year)
        year = y.isEmpty ? nil : y
        source = c.opt(.source)
        sourceUrl = c.opt(.sourceUrl)
        writer = c.or(.writer, "")
    }
}

/// src/data/quotes/<writer-slug>.json
public struct WriterFile: Decodable {
    public var writer: WriterInfo
    public var works: [WorkInfo]
    public var quotes: [LibQuote]

    public enum CodingKeys: String, CodingKey {
        case writer, works, quotes
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        writer = c.or(.writer, WriterInfo())
        works = c.or(.works, [])
        quotes = c.or(.quotes, [])
    }
}

/// What is kept per quote (the quote_state row without its ids).
public struct QuoteMark: Equatable {
    public var quoteId: String
    public var writer: String
    public var work: String
    public var readAt: String?
    public var savedAt: String?
    public var note: String?
    public init(quoteId: String, writer: String, work: String, readAt: String? = nil, savedAt: String? = nil, note: String? = nil) {
        self.quoteId = quoteId
        self.writer = writer
        self.work = work
        self.readAt = readAt
        self.savedAt = savedAt
        self.note = note
    }
}

public typealias LibraryMarks = [String: QuoteMark]

// MARK: vocabularies

public enum LibraryVocab {
    public static let themes: [String] = [
        "fear", "death", "time", "discipline", "adversity", "anger", "wealth", "desire", "solitude", "friendship", "fate",
        "self-mastery", "work", "pain", "reputation", "happiness", "mind", "change", "courage", "folly", "love", "power",
    ]

    public static let moments: [String] = ["overwhelmed", "angry", "broke", "alone", "doubting", "tempted", "tired", "afraid"]

    public static func isTheme(_ s: String?) -> Bool {
        guard let s = s else { return false }
        return themes.contains(s)
    }

    public static func isMoment(_ s: String?) -> Bool {
        guard let s = s else { return false }
        return moments.contains(s)
    }

    /// "self-mastery" to "Self-mastery".
    public static func themeLabel(_ theme: String) -> String {
        guard let first = theme.first else { return theme }
        return String(first).uppercased() + String(theme.dropFirst())
    }

    public static func momentLabel(_ moment: String) -> String {
        return themeLabel(moment)
    }
}

// MARK: ways in

/// Which quotes a reading session covers.
public enum LibraryScope: Equatable, Hashable {
    case writer(String, work: String?)
    case theme(String)
    case moment(String)
    case shuffle(Int)
    case saved
}

public enum LibraryScopes {
    static func isSlug(_ s: String) -> Bool {
        guard let first = s.unicodeScalars.first else { return false }
        func alnum(_ u: Unicode.Scalar) -> Bool {
            return (u.value >= 97 && u.value <= 122) || (u.value >= 48 && u.value <= 57)
        }
        if !alnum(first) { return false }
        for u in s.unicodeScalars where !(alnum(u) || u == "-") { return false }
        return true
    }

    static func intParam(_ v: String?) -> Int? {
        guard let v = v, !v.isEmpty, v.count <= 12 else { return nil }
        for u in v.unicodeScalars where !(u.value >= 48 && u.value <= 57) { return nil }
        return Int(v)
    }

    /// The scope a reader address names, or nil when it names none. Parameters: w (writer), k (one work),
    /// t (theme), m (moment), shuffle (a seed), saved (1). The first one found wins, in that order.
    public static func parseScope(_ params: [String: String]) -> LibraryScope? {
        if let w = params["w"], isSlug(w) {
            if let k = params["k"], isSlug(k) { return .writer(w, work: k) }
            return .writer(w, work: nil)
        }
        if let t = params["t"], LibraryVocab.isTheme(t) { return .theme(t) }
        if let m = params["m"], LibraryVocab.isMoment(m) { return .moment(m) }
        if let seed = intParam(params["shuffle"]) { return .shuffle(seed) }
        if params["saved"] == "1" { return .saved }
        return nil
    }

    /// The query string for a scope. The inverse of parseScope.
    public static func scopeQuery(_ scope: LibraryScope) -> String {
        switch scope {
        case .writer(let w, let work):
            if let work = work, !work.isEmpty { return "w=\(w)&k=\(work)" }
            return "w=\(w)"
        case .theme(let t): return "t=\(t)"
        case .moment(let m): return "m=\(m)"
        case .shuffle(let seed): return "shuffle=\(seed)"
        case .saved: return "saved=1"
        }
    }

    /// Parse a stored scope string ("w=seneca").
    public static func scopeFromQuery(_ query: String) -> LibraryScope? {
        var params: [String: String] = [:]
        for part in query.split(separator: "&") {
            let kv = part.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            if kv.count == 2 {
                let key = String(kv[0])
                let value = String(kv[1]).removingPercentEncoding ?? String(kv[1])
                if params[key] == nil { params[key] = value }
            }
        }
        return parseScope(params)
    }

    public static let readerPath = "/library/read"

    /// JavaScript's encodeURIComponent.
    public static func encodeURIComponent(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'()")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    public static func readerLink(_ scope: LibraryScope?, quoteId: String? = nil) -> String {
        var parts: [String] = []
        if let scope = scope { parts.append(scopeQuery(scope)) }
        if let q = quoteId, !q.isEmpty { parts.append("q=" + encodeURIComponent(q)) }
        return parts.isEmpty ? readerPath : readerPath + "?" + parts.joined(separator: "&")
    }

    /// The deep link that opens the reader on one quote and carries on from there.
    public static func quoteLink(_ quoteId: String, writer: String? = nil, scope: LibraryScope? = nil) -> String {
        var s = scope
        if s == nil, let w = writer, !w.isEmpty { s = .writer(w, work: nil) }
        return readerLink(s, quoteId: quoteId)
    }

    /// A short name for a scope, for the reader's top line.
    public static func scopeTitle(_ scope: LibraryScope, writerName: (String) -> String?, workTitle: ((String, String) -> String?)? = nil) -> String {
        switch scope {
        case .writer(let w, let work):
            let name = writerName(w) ?? w
            if let work = work, !work.isEmpty { return workTitle?(w, work) ?? name }
            return name
        case .theme(let t): return LibraryVocab.themeLabel(t)
        case .moment(let m): return LibraryVocab.momentLabel(m)
        case .shuffle: return "Shuffled"
        case .saved: return "Saved"
        }
    }
}

// MARK: when a quote counts as read

public enum LibraryReading {
    /// Moved past a quote after at least this long on screen: it was read. A faster flick is skimming.
    public static let passMs: Double = 1000
    /// Never wait longer than this on a quote before it counts.
    public static let dwellMaxMs: Double = 8000
    /// Never less than this either.
    public static let dwellMinMs: Double = 3000

    /// How long a quote has to stay on screen to count by itself: a little more for a longer one.
    public static func dwellMs(_ text: String) -> Double {
        let ms = 2000 + 20 * Double(text.utf16.count)
        return min(dwellMaxMs, max(dwellMinMs, ms))
    }

    /// The rule. `visibleMs` is the time the quote has been on screen with the app in front.
    public static func countsAsRead(visibleMs: Double, text: String, movedPast: Bool) -> Bool {
        if visibleMs >= dwellMs(text) { return true }
        return movedPast && visibleMs >= passMs
    }
}

// MARK: how a quote is cited

public struct LibraryCitation: Equatable {
    public var title: String
    public var lines: [String]
    public var source: String?
    public var sourceUrl: String?
}

public enum LibraryCite {
    /// A law or maxim carries its own attribution and source.
    public static func isLaw(_ q: LibQuote) -> Bool {
        return !(q.by ?? "").isEmpty || !(q.source ?? "").isEmpty || !(q.sourceUrl ?? "").isEmpty
    }

    /// What goes under a quote on the card.
    public static func citeQuote(_ q: LibQuote, workTitle: String) -> LibraryCitation {
        if isLaw(q) {
            let who = [q.by ?? "", q.year ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
            let url = q.sourceUrl ?? ""
            return LibraryCitation(title: q.location, lines: who.isEmpty ? [] : [who], source: q.source, sourceUrl: url.isEmpty ? nil : url)
        }
        let plays = q.work == "plays"
        let line = plays ? q.location : [workTitle, q.location].filter { !$0.isEmpty }.joined(separator: ", ")
        return LibraryCitation(title: line, lines: [], source: nil, sourceUrl: nil)
    }

    /// Only an http or https link is ever drawn as one.
    public static func safeUrl(_ url: String?) -> String? {
        guard let url = url, !url.isEmpty else { return nil }
        let lower = url.lowercased()
        return (lower.hasPrefix("http://") || lower.hasPrefix("https://")) ? url : nil
    }
}

// MARK: layout

public enum LibraryLayout {
    /// Quote type steps, biggest first.
    public static let quoteSizes: [Double] = [34, 29, 25, 22, 19, 17, 15]

    /// The first type step to try, by length: short quotes get big type.
    public static func quoteStep(_ text: String) -> Int {
        let lines = text.components(separatedBy: "\n")
        let longest = lines.map { Double($0.utf16.count) }.max() ?? 0
        let total = Double(text.utf16.count)
        let weight = lines.count > 1 ? max(total * 0.7, longest * 2.2, Double(lines.count) * 38) : total
        if weight <= 70 { return 0 }
        if weight <= 130 { return 1 }
        if weight <= 220 { return 2 }
        if weight <= 340 { return 3 }
        if weight <= 520 { return 4 }
        if weight <= 760 { return 5 }
        return 6
    }
}

// MARK: the passage around a quote

public struct PassagePiece: Equatable {
    public var text: String
    public var hit: Bool
    public init(text: String, hit: Bool) {
        self.text = text
        self.hit = hit
    }
}

public enum LibraryPassage {
    /// Where the quote sits in its passage, as UTF-16 offsets [start, end), or nil. Tolerates different line breaks and spacing.
    public static func findInPassage(_ passage: String, _ quote: String) -> (Int, Int)? {
        let words = quote.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        if words.isEmpty || passage.isEmpty { return nil }
        let ns = passage as NSString
        let full = NSRange(location: 0, length: ns.length)

        func regex(_ ws: [String]) -> NSRegularExpression? {
            let pattern = ws.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "\\s+")
            return try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
        }

        if let re = regex(words), let m = re.firstMatch(in: passage, options: [], range: full) {
            return (m.range.location, m.range.location + m.range.length)
        }
        // The passage may differ in a word or a mark. Try the first and last few words.
        if words.count >= 8 {
            if let headRe = regex(Array(words.prefix(4))), let tailRe = regex(Array(words.suffix(4))),
               let head = headRe.firstMatch(in: passage, options: [], range: full),
               let tail = tailRe.firstMatch(in: passage, options: [], range: full) {
                let tailEnd = tail.range.location + tail.range.length
                if tailEnd > head.range.location { return (head.range.location, tailEnd) }
            }
        }
        return nil
    }

    /// The passage as paragraphs, each a list of pieces, with the quote marked.
    public static func passageParagraphs(_ passage: String, _ quote: String) -> [[PassagePiece]] {
        let text = passage.replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return [] }
        let range = findInPassage(text, quote)
        let ns = text as NSString
        var bounds: [(Int, Int)] = []
        var start = 0
        if let re = try? NSRegularExpression(pattern: "\\n\\s*\\n", options: []) {
            for m in re.matches(in: text, options: [], range: NSRange(location: 0, length: ns.length)) {
                bounds.append((start, m.range.location))
                start = m.range.location + m.range.length
            }
        }
        bounds.append((start, ns.length))

        var out: [[PassagePiece]] = []
        for (a, b) in bounds {
            if a == b { continue }
            var pieces: [PassagePiece] = []
            func push(_ from: Int, _ to: Int, _ hit: Bool) {
                if to > from {
                    pieces.append(PassagePiece(text: ns.substring(with: NSRange(location: from, length: to - from)), hit: hit))
                }
            }
            if let r = range, r.1 > a, r.0 < b {
                push(a, max(a, r.0), false)
                push(max(a, r.0), min(b, r.1), true)
                push(min(b, r.1), b, false)
            } else {
                push(a, b, false)
            }
            out.append(pieces)
        }
        return out
    }
}
