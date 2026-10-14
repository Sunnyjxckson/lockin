import Foundation

/// Small text and number helpers the coach uses. Port of the formatters in src/lib/logic/coach.ts and text.ts.
public enum CoachText {
    /// JavaScript's Math.round: halves go up.
    static func jsRound(_ x: Double) -> Double {
        return (x + 0.5).rounded(.down)
    }

    public static func round1(_ n: Double) -> Double {
        return jsRound(n * 10) / 10
    }

    static func decimal(_ n: Double, minFraction: Int, maxFraction: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.minimumFractionDigits = minFraction
        f.maximumFractionDigits = maxFraction
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    /// "$1,000", "$42.50".
    public static func money(_ n: Double) -> String {
        let finite = n.isFinite ? n : 0
        let v = jsRound(finite * 100) / 100
        let whole = v == v.rounded(.down)
        return "$" + decimal(v, minFraction: whole ? 0 : 2, maxFraction: 2)
    }

    /// "180g", "$100", "2,050 kcal", "30 min".
    public static func withUnit(_ n: Double, _ unit: String?) -> String {
        let v = decimal(round1(n), minFraction: 0, maxFraction: 3)
        guard let unit = unit, !unit.isEmpty else { return v }
        if unit == "$" { return money(n) }
        return unit.count <= 2 ? v + unit : v + " " + unit
    }

    /// "No smoking" to "smoking". Other names come back lower case.
    public static func viceName(_ name: String) -> String {
        var s = name
        if let r = s.range(of: "^no\\s+", options: [.regularExpression, .caseInsensitive]) {
            s.removeSubrange(r)
        }
        return s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    public static func plural(_ n: Int, _ one: String, _ many: String? = nil) -> String {
        return "\(n) \(n == 1 ? one : (many ?? one + "s"))"
    }

    static func replace(_ text: String, _ pattern: String, _ template: String, multiline: Bool = false) -> String {
        let options: NSRegularExpression.Options = multiline ? [.anchorsMatchLines] : []
        guard let re = try? NSRegularExpression(pattern: pattern, options: options) else { return text }
        let range = NSRange(location: 0, length: (text as NSString).length)
        return re.stringByReplacingMatches(in: text, options: [], range: range, withTemplate: template)
    }

    /// No em or en dashes, ever. A dash between two numbers becomes "to", any other becomes a comma, and a minus sign a hyphen.
    public static func stripDashes(_ text: String) -> String {
        var s = replace(text, "(\\d)\\s*[\\u2012\\u2013\\u2014\\u2015\\u2212]\\s*(\\d)", "$1 to $2")
        s = replace(s, "\\s*[\\u2012\\u2013\\u2014\\u2015]\\s*", ", ")
        s = s.replacingOccurrences(of: "\u{2212}", with: "-")
        s = replace(s, ",\\s*,", ",")
        return s
    }

    /// What a model wrote, made safe to show: no dashes, plain quotes, no list marks or headings.
    public static func cleanCoachText(_ text: String) -> String {
        var s = stripDashes(text)
        s = replace(s, "[\\u2018\\u2019]", "'")
        s = replace(s, "[\\u201c\\u201d]", "\"")
        s = replace(s, "^[ \\t]*[-*\\u2022][ \\t]+", "", multiline: true)
        s = replace(s, "^#+\\s*", "", multiline: true)
        s = replace(s, "\\*\\*(.+?)\\*\\*", "$1")
        s = replace(s, "[ \\t]+\\n", "\n")
        s = replace(s, "\\n{3,}", "\n\n")
        s = replace(s, ",\\s*,", ",")
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
