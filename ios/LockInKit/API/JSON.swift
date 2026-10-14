import Foundation

/// A loosely typed JSON value. Used for /api/db arguments, where the web sends plain objects.
public enum JSON: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let d = try? c.decode(Double.self) {
            self = .number(d)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSON].self) {
            self = .array(a)
        } else if let o = try? c.decode([String: JSON].self) {
            self = .object(o)
        } else {
            self = .null
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    public static func str(_ s: String?) -> JSON {
        if let s = s { return .string(s) }
        return .null
    }

    public static func num(_ d: Double?) -> JSON {
        if let d = d { return .number(d) }
        return .null
    }

    public static func int(_ i: Int) -> JSON {
        return .number(Double(i))
    }

    /// Any Encodable value as JSON (a Target, a rule list).
    public static func from<T: Encodable>(_ value: T) -> JSON {
        guard let data = try? JSONEncoder().encode(value) else { return .null }
        // Top level fragments such as a bare string are fine for JSONDecoder on iOS 13+.
        return (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
    }

    public var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }
}

extension JSON: ExpressibleByStringLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
}

extension JSON: ExpressibleByIntegerLiteral {
    public init(integerLiteral value: Int) { self = .number(Double(value)) }
}

extension JSON: ExpressibleByFloatLiteral {
    public init(floatLiteral value: Double) { self = .number(value) }
}

extension JSON: ExpressibleByBooleanLiteral {
    public init(booleanLiteral value: Bool) { self = .bool(value) }
}

extension JSON: ExpressibleByNilLiteral {
    public init(nilLiteral: ()) { self = .null }
}

extension JSON: ExpressibleByArrayLiteral {
    public init(arrayLiteral elements: JSON...) { self = .array(elements) }
}

extension JSON: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, JSON)...) {
        var d: [String: JSON] = [:]
        for (k, v) in elements { d[k] = v }
        self = .object(d)
    }
}

public typealias JSONObject = [String: JSON]
