import Foundation

// Search over the quotes: the words of the quote, its plain line, the writer, the work and the themes.
// Every word typed has to be found somewhere; whole words beat word starts beat the middle of a word.
// Port of src/lib/logic/librarySearch.ts.

public struct SearchContext {
    public var writerName: (String) -> String
    public var workTitle: (String, String) -> String
    public init(writerName: @escaping (String) -> String, workTitle: @escaping (String, String) -> String) {
        self.writerName = writerName
        self.workTitle = workTitle
    }
}

public struct SearchResult {
    /// Best first, cut to the limit.
    public var hits: [LibQuote]
    /// How many quotes matched in all.
    public var total: Int
}

/// The text of a quote prepared once, so a keystroke only compares strings.
public struct SearchHaystack {
    var text: String
    var plain: String
    var writer: String
    var work: String
    var themes: String
    var moments: String
    var location: String
    var length: Int
}

public enum LibrarySearch {
    /// Lowercase, accents and marks gone, anything that is not a letter or digit a space.
    public static func normalize(_ text: String) -> String {
        let decomposed = text.decomposedStringWithCanonicalMapping.lowercased()
        var out = String.UnicodeScalarView()
        var pendingSpace = false
        for u in decomposed.unicodeScalars {
            let v = u.value
            if v >= 0x300 && v <= 0x36F { continue }
            if u == "'" || v == 0x2019 { continue }
            let isAlnum = (v >= 97 && v <= 122) || (v >= 48 && v <= 57)
            if isAlnum {
                if pendingSpace && !out.isEmpty { out.append(" ") }
                pendingSpace = false
                out.append(u)
            } else {
                pendingSpace = true
            }
        }
        return String(out)
    }

    public static func haystack(_ q: LibQuote, _ ctx: SearchContext) -> SearchHaystack {
        return SearchHaystack(
            text: " " + normalize(q.text) + " ",
            plain: " " + normalize(q.plain) + " ",
            writer: " " + normalize(ctx.writerName(q.writer)) + " ",
            work: " " + normalize(ctx.workTitle(q.writer, q.work)) + " ",
            themes: " " + q.themes.map { normalize($0) }.joined(separator: "  ") + " ",
            moments: " " + q.moments.map { normalize($0) }.joined(separator: "  ") + " ",
            location: " " + normalize(q.location + " " + (q.by ?? "")) + " ",
            length: q.text.utf16.count
        )
    }

    /// Points for one word in one field of padded text: a whole word, the start of a word, the middle of one.
    static func inField(_ field: String, _ token: String, _ whole: Double, _ start: Double, _ middle: Double) -> Double {
        if field.contains(" " + token + " ") { return whole }
        if field.contains(" " + token) { return start }
        if token.count >= 3 && field.contains(token) { return middle }
        return 0
    }

    /// The score of one quote for the words, or 0 when a word is found nowhere.
    public static func score(_ h: SearchHaystack, tokens: [String], phrase: String) -> Double {
        var score = 0.0
        for t in tokens {
            let here =
                inField(h.text, t, 10, 6, 3) +
                inField(h.plain, t, 4, 3, 1.5) +
                inField(h.writer, t, 8, 5, 0) +
                inField(h.work, t, 5, 3, 0) +
                inField(h.themes, t, 8, 4, 0) +
                inField(h.moments, t, 6, 3, 0) +
                inField(h.location, t, 2, 1, 0)
            if here == 0 { return 0 }
            score += here
        }
        if tokens.count > 1 {
            if h.text.contains(" " + phrase + " ") {
                score += 12
            } else if h.plain.contains(" " + phrase + " ") {
                score += 5
            }
        }
        // Between equals the shorter quote reads better as a result.
        return score + 2 / (1 + Double(h.length) / 200)
    }

    /// Search prepared haystacks. `quotes` and `haystacks` line up.
    public static func search(_ quotes: [LibQuote], haystacks: [SearchHaystack], query: String, limit: Int = 60) -> SearchResult {
        let phrase = normalize(query)
        var tokens: [String] = []
        for t in phrase.split(separator: " ") {
            let s = String(t)
            if !s.isEmpty && !tokens.contains(s) { tokens.append(s) }
        }
        if tokens.isEmpty { return SearchResult(hits: [], total: 0) }
        var scored: [(order: Int, score: Double)] = []
        for (i, h) in haystacks.enumerated() {
            let s = score(h, tokens: tokens, phrase: phrase)
            if s > 0 { scored.append((order: i, score: s)) }
        }
        scored.sort { a, b in
            if a.score != b.score { return a.score > b.score }
            return a.order < b.order
        }
        let hits = scored.prefix(limit).map { quotes[$0.order] }
        return SearchResult(hits: Array(hits), total: scored.count)
    }

    /// Quotes matching what was typed, best first. An empty query matches nothing.
    public static func searchQuotes(_ quotes: [LibQuote], _ query: String, _ ctx: SearchContext, limit: Int = 60) -> SearchResult {
        let hay = quotes.map { haystack($0, ctx) }
        return search(quotes, haystacks: hay, query: query, limit: limit)
    }
}
