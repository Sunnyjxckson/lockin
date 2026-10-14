import Foundation

/// The APNs device token, kept in the app group until the server can take it (/api/push/apns comes later).
public enum PushToken {
    static let key = "lockin.apnsToken"

    public static var token: String? {
        return AppGroup.defaults.string(forKey: key)
    }

    public static func store(_ data: Data) {
        let hex = data.map { String(format: "%02x", $0) }.joined()
        AppGroup.defaults.set(hex, forKey: key)
    }
}
