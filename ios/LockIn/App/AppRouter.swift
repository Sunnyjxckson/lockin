import SwiftUI
import Observation
import LockInKit

/// Where a tapped notification wants to go. The notification delegate drops the app path in `pending`, and the tab root
/// (MainTabs) takes it from there once it is on screen, so a tap that launches the app works too.
@Observable
final class AppRouter {
    static let shared = AppRouter()

    /// An app path such as "/money" or "/library/read?w=seneca&q=abc". The tab root clears it once it has acted.
    var pending: String? = nil

    private init() {}

    func open(_ url: String) {
        pending = url
    }

    /// What a path means for the tab root.
    enum Destination: Equatable {
        case tab(AppTab)
        case reader(LibraryScope, String)
        case yours
        case focus
    }

    static func destination(for url: String) -> Destination {
        let parts = url.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let path = parts.first.map(String.init) ?? ""
        let query = parts.count > 1 ? String(parts[1]) : ""
        switch path {
        case "/library/read":
            var quote: String? = nil
            var rest: [String] = []
            for piece in query.split(separator: "&") {
                if piece.hasPrefix("q=") {
                    let raw = String(piece.dropFirst(2))
                    quote = raw.removingPercentEncoding ?? raw
                } else {
                    rest.append(String(piece))
                }
            }
            if let q = quote, !q.isEmpty, let scope = LibraryScopes.scopeFromQuery(rest.joined(separator: "&")) {
                return .reader(scope, q)
            }
            return .tab(.library)
        case "/library/yours": return .yours
        case "/library": return .tab(.library)
        case "/money": return .tab(.money)
        case "/body", "/body/workout": return .tab(.body)
        case "/plan": return .tab(.plan)
        case "/record": return .tab(.record)
        case "/focus": return .focus
        default: return .tab(.today)
        }
    }
}
