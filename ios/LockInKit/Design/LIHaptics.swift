import UIKit

/// Haptics. One switch for the whole app (app_settings.haptics).
public enum LIHaptics {
    public static var enabled = true

    /// A light tap: selecting, opening.
    public static func tap() {
        if !enabled { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// A check landing.
    public static func check() {
        if !enabled { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    public static func uncheck() {
        if !enabled { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    /// The last item of the day.
    public static func celebrate() {
        if !enabled { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    public static func error() {
        if !enabled { return }
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
