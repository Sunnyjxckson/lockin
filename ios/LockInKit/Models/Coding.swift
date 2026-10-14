import Foundation

// Tolerant decoding helpers. A missing, null or odd column never fails a whole row.
extension KeyedDecodingContainer {
    func opt<T: Decodable>(_ key: Key) -> T? {
        let v: T? = try? decodeIfPresent(T.self, forKey: key)
        return v
    }

    func or<T: Decodable>(_ key: Key, _ fallback: T) -> T {
        let v: T? = try? decodeIfPresent(T.self, forKey: key)
        return v ?? fallback
    }

    /// Free text that may arrive as a number ("8 to 10", 10).
    func flexString(_ key: Key) -> String {
        if let s: String = try? decodeIfPresent(String.self, forKey: key) { return s }
        if let i: Int = try? decodeIfPresent(Int.self, forKey: key) { return String(i) }
        if let d: Double = try? decodeIfPresent(Double.self, forKey: key) { return String(d) }
        return ""
    }
}
