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

        public init(title: String, kind: Kind, start: Date, end: Date, paused: Bool = false) {
            self.title = title
            self.kind = kind
            self.start = start
            self.end = end
            self.paused = paused
        }
    }

    /// Fixed for the life of the activity.
    public var name: String

    public init(name: String) {
        self.name = name
    }
}
