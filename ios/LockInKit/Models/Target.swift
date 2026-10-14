import Foundation

/// What "done" means for an item. Mirrors the Target union in src/lib/types.ts.
public enum Target: Codable, Equatable {
    case check
    case checkBy(String)
    case min(Double)
    case max(Double)
    case range(Double, Double)
    case text

    private enum Keys: String, CodingKey {
        case kind, by, min, max
    }

    public init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: Keys.self) else {
            self = .check
            return
        }
        let kind: String = c.or(.kind, "check")
        switch kind {
        case "check_by":
            self = .checkBy(c.or(.by, "00:00"))
        case "min":
            self = .min(c.or(.min, 0))
        case "max":
            self = .max(c.or(.max, 0))
        case "range":
            self = .range(c.or(.min, 0), c.or(.max, 0))
        case "text":
            self = .text
        default:
            self = .check
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .check:
            try c.encode("check", forKey: .kind)
        case .checkBy(let by):
            try c.encode("check_by", forKey: .kind)
            try c.encode(by, forKey: .by)
        case .min(let v):
            try c.encode("min", forKey: .kind)
            try c.encode(v, forKey: .min)
        case .max(let v):
            try c.encode("max", forKey: .kind)
            try c.encode(v, forKey: .max)
        case .range(let lo, let hi):
            try c.encode("range", forKey: .kind)
            try c.encode(lo, forKey: .min)
            try c.encode(hi, forKey: .max)
        case .text:
            try c.encode("text", forKey: .kind)
        }
    }

    /// The `kind` string the API uses.
    public var kindName: String {
        switch self {
        case .check: return "check"
        case .checkBy: return "check_by"
        case .min: return "min"
        case .max: return "max"
        case .range: return "range"
        case .text: return "text"
        }
    }
}
