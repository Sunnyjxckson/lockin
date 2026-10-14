import Foundation
import ActivityKit

/// The Live Activity for the current schedule block or a running focus timer.
public struct LockInActivityAttributes: ActivityAttributes {
    public enum Kind: String, Codable, Hashable {
        case block
        case focus
    }

    public struct ContentState: Codable, Hashable {
        public var title: String
        public var kind: Kind
        public var start: Date
        public var end: Date
        public var paused: Bool
        /// A focus timer with no planned length counts up from `start` and has no end.
        public var countsUp: Bool
        /// While paused, the number of seconds to show (left on a countdown, or focused so far when counting up).
        public var frozenSeconds: Int?

        public init(title: String, kind: Kind, start: Date, end: Date, paused: Bool = false, countsUp: Bool = false, frozenSeconds: Int? = nil) {
            self.title = title
            self.kind = kind
            self.start = start
            self.end = end
            self.paused = paused
            self.countsUp = countsUp
            self.frozenSeconds = frozenSeconds
        }
    }

    /// Fixed for the life of the activity.
    public var name: String

    public init(name: String) {
        self.name = name
    }
}
