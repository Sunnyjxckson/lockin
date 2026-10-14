import Foundation

// "More chicken, no fish, cheaper breakfasts" as planner inputs. The words only ever change what the
// planner is asked for (lean toward, leave out, which slots to economize, the budget). The plan itself
// and all of its math stay in the deterministic planner. Port of mealsRequest.ts.
//
// parseRequest is the rule based reader, used with no API key. A model's answer goes through
// cleanRequest, which keeps only terms that exist in the library, so a model cannot invent a food or a recipe.

public struct PlanRequest: Equatable {
    public var boost: [String] = []
    public var avoid: [String] = []
    public var cheaperSlots: [MealSlot] = []
    /// A new weekly budget, when one was named.
    public var budget: Double? = nil
    public var variety: PlanVariety? = nil
    /// Words that matched nothing in the library, to tell the user.
    public var unknown: [String] = []

    public init() {}

    public var isEmpty: Bool {
        return boost.isEmpty && avoid.isEmpty && cheaperSlots.isEmpty && budget == nil && variety == nil
    }

    public var prefs: PlanPrefs {
        return PlanPrefs(boost: boost, avoid: avoid, cheaperSlots: cheaperSlots, variety: variety)
    }
}

private func rx(_ pattern: String) -> NSRegularExpression {
    // The patterns are constants in this file; a bad one is a programming error caught by the tests.
    return try! NSRegularExpression(pattern: pattern, options: [])
}

public enum MealsRequest {
    static let slotWords: [String: MealSlot] = [
        "breakfast": .breakfast, "breakfasts": .breakfast, "morning": .breakfast, "mornings": .breakfast,
        "lunch": .lunch, "lunches": .lunch,
        "dinner": .dinner, "dinners": .dinner, "supper": .dinner,
        "snack": .snack, "snacks": .snack,
    ]

    static let avoidRx = rx("^(?:no|not|without|skip|avoid|less|fewer|zero|drop|cut|remove|hold the|i hate|hate|i (?:do not|don't|dont) (?:like|want)|(?:do not|don't|dont) (?:like|want)|nothing with|not any)\\s+(.+)$")
    static let boostRx = rx("^(?:more|extra|add|lots of|plenty of|heavy on|i love|love|i like|like|i want|want|give me|include|lean on|mostly)\\s+(.+)$")
    static let cheapRx = rx("\\b(?:cheap|cheaper|cheapest|budget|inexpensive|save money|low cost)\\b")
    static let fillerRx = rx("\\b(?:please|some|any|the|a|an|my|meals?|dishes?|recipes?|options?|food|foods|stuff|this week|for)\\b")
    static let moneyRx = rx("(?:under|below|max|at most|budget(?: of| is)?|spend|for)\\s*\\$?\\s*(\\d{2,4})(?!\\s*(?:g|kcal|cal))|\\$\\s*(\\d{2,4})")
    static let varietyUpRx = rx("\\b(?:more variety|mix it up|different every|less repeat|fewer repeats|not the same)\\b")
    static let varietyDownRx = rx("\\b(?:less cooking|fewer recipes|simpler|simple week|meal prep|batch|cook once|less variety)\\b")
    static let clauseRx = rx("[,;.\\n]|\\band\\b|\\bbut\\b|\\bplus\\b")
    static let termSplitRx = rx("\\bor\\b|/|&")
    static let spacesRx = rx("\\s+")
    static let dashesRx = rx("[\\u2012-\\u2015]")

    static func matches(_ re: NSRegularExpression, _ s: String) -> Bool {
        return re.firstMatch(in: s, options: [], range: NSRange(location: 0, length: (s as NSString).length)) != nil
    }

    static func replace(_ re: NSRegularExpression, _ s: String, _ with: String) -> String {
        return re.stringByReplacingMatches(in: s, options: [], range: NSRange(location: 0, length: (s as NSString).length), withTemplate: with)
    }

    static func capture(_ re: NSRegularExpression, _ s: String, _ group: Int) -> String? {
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, options: [], range: NSRange(location: 0, length: ns.length)) else { return nil }
        if group >= m.numberOfRanges { return nil }
        let r = m.range(at: group)
        if r.location == NSNotFound { return nil }
        return ns.substring(with: r)
    }

    /// JavaScript String.split with a regex and no capture groups.
    static func split(_ re: NSRegularExpression, _ s: String) -> [String] {
        let ns = s as NSString
        var out: [String] = []
        var last = 0
        for m in re.matches(in: s, options: [], range: NSRange(location: 0, length: ns.length)) {
            if m.range.length == 0 { continue }
            out.append(ns.substring(with: NSRange(location: last, length: m.range.location - last)))
            last = m.range.location + m.range.length
        }
        out.append(ns.substring(from: last))
        return out
    }

    static func tidy(_ term: String) -> String {
        let a = replace(fillerRx, term, " ")
        return replace(spacesRx, a, " ").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func unique<T: Hashable>(_ list: [T]) -> [T] {
        var seen = Set<T>()
        var out: [T] = []
        for x in list where !seen.contains(x) {
            seen.insert(x)
            out.append(x)
        }
        return out
    }

    static func known(_ term: String, _ recipes: [Recipe]) -> Bool {
        return recipes.contains { MealsCore.matchesTerm($0, term) }
    }

    /// Read a request with plain rules. Deterministic, works offline.
    public static func parse(_ text: String, recipes: [Recipe]) -> PlanRequest {
        var out = PlanRequest()
        let lower = replace(dashesRx, text.lowercased(), ",")
        if let g = capture(moneyRx, lower, 1) ?? capture(moneyRx, lower, 2), let v = Double(g) { out.budget = v }
        if matches(varietyUpRx, lower) { out.variety = .varied }
        if matches(varietyDownRx, lower) { out.variety = .batch }

        let clauses = split(clauseRx, lower).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        var lastCheap = false
        for clause in clauses {
            let words = clause.split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "\n" }).map { String($0) }
            let slotsHere: [MealSlot] = words.compactMap { slotWords[$0] }
            if matches(cheapRx, clause) {
                out.cheaperSlots.append(contentsOf: slotsHere.isEmpty ? MealsCore.slots : slotsHere)
                lastCheap = !slotsHere.isEmpty
                continue
            }
            // "cheap lunches and dinners": the second half carries the first half's meaning.
            if lastCheap && !slotsHere.isEmpty {
                let t = tidy(clause).split(separator: " ").map { String($0) }
                if t.allSatisfy({ slotWords[$0] != nil }) {
                    out.cheaperSlots.append(contentsOf: slotsHere)
                    continue
                }
            }
            lastCheap = false
            let avoidBody = capture(avoidRx, clause, 1)
            let boostBody: String? = avoidBody == nil ? capture(boostRx, clause, 1) : nil
            guard let body = avoidBody ?? boostBody else { continue }
            for raw in split(termSplitRx, body) {
                let term = tidy(raw)
                if term.isEmpty { continue }
                if let f = term.unicodeScalars.first {
                    if f.value >= 48 && f.value <= 57 { continue }
                    if f == "$" && term.unicodeScalars.count > 1 {
                        let second = Array(term.unicodeScalars)[1]
                        if second.value >= 48 && second.value <= 57 { continue }
                    }
                }
                if slotWords[term] != nil { continue }
                if !known(term, recipes) { out.unknown.append(term) } else if avoidBody != nil { out.avoid.append(term) } else { out.boost.append(term) }
            }
        }
        let avoidAll = out.avoid
        out.boost = unique(out.boost).filter { !avoidAll.contains($0) }
        out.avoid = unique(out.avoid)
        out.cheaperSlots = unique(out.cheaperSlots)
        out.unknown = unique(out.unknown)
        return out
    }

    static func strings(_ v: JSON?) -> [String] {
        guard let v = v, case .array(let items) = v else { return [] }
        var out: [String] = []
        for x in items {
            if case .string(let s) = x {
                let t = s.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty { out.append(t) }
            }
        }
        return out
    }

    /// Keep only what the planner can act on from a model's answer. Unknown terms are reported, not used.
    public static func clean(_ raw: JSON?, recipes: [Recipe]) -> PlanRequest {
        var out = PlanRequest()
        var obj: [String: JSON] = [:]
        if let raw = raw, case .object(let o) = raw { obj = o }
        for t in strings(obj["avoid"]).prefix(12) {
            if known(t, recipes) { out.avoid.append(t) } else { out.unknown.append(t) }
        }
        for t in strings(obj["boost"]).prefix(12) {
            if known(t, recipes) { out.boost.append(t) } else { out.unknown.append(t) }
        }
        let slotList = strings(obj["cheaper_slots"] ?? obj["cheaperSlots"])
        out.cheaperSlots = unique(slotList.compactMap { MealSlot(rawValue: $0) })
        if let b = obj["budget"], case .number(let n) = b, n.isFinite, n > 0, n < 2000 { out.budget = MealsCore.jsRound(n) }
        if let v = obj["variety"], case .string(let s) = v, let pv = PlanVariety(rawValue: s) { out.variety = pv }
        for t in strings(obj["unknown"]).prefix(12) where !known(t, recipes) { out.unknown.append(t) }
        let avoidAll = out.avoid
        out.boost = unique(out.boost).filter { !avoidAll.contains($0) }
        out.avoid = unique(out.avoid)
        out.unknown = unique(out.unknown)
        return out
    }

    /// What was understood, to show before the week is rebuilt: "More chicken. No fish. Cheaper breakfasts."
    public static func describe(_ r: PlanRequest) -> String {
        var parts: [String] = []
        if !r.boost.isEmpty { parts.append("More \(r.boost.joined(separator: ", ")).") }
        if !r.avoid.isEmpty { parts.append("No \(r.avoid.joined(separator: ", ")).") }
        if r.cheaperSlots.count == MealsCore.slots.count {
            parts.append("Cheaper all round.")
        } else if !r.cheaperSlots.isEmpty {
            let names = r.cheaperSlots.map { $0 == .lunch ? "lunches" : "\($0.rawValue)s" }
            parts.append("Cheaper \(names.joined(separator: ", ")).")
        }
        if let b = r.budget { parts.append("Budget $\(MealsCore.jsNum(b)).") }
        if r.variety == .varied { parts.append("More variety.") }
        if r.variety == .batch { parts.append("Fewer recipes, bigger batches.") }
        if !r.unknown.isEmpty { parts.append("Nothing in the library matches \(r.unknown.joined(separator: ", ")).") }
        return parts.joined(separator: " ")
    }
}
