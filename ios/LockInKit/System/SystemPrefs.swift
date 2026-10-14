import Foundation

/// Per device switches for the system features. They live in the app group so the extensions can read them.
public enum SystemPrefs {
    public enum Key {
        public static let reminders = "lockin.pref.reminders"
        public static let liveBlocks = "lockin.pref.liveBlocks"
        public static let lockDuringFocus = "lockin.pref.lockDuringFocus"
        public static let autoLockStudy = "lockin.pref.autoLockStudy"
        public static let strictMode = "lockin.pref.strictMode"
        public static let strictGrace = "lockin.pref.strictGrace"
        public static let fullScreen = "lockin.pref.fullScreen"
        public static let focusEndsAt = "lockin.focusEndsAt"
        public static let focusRunning = "lockin.focusRunning"
        public static let studyEnds = "lockin.studyEnds"
        public static let focusLive = "lockin.focusLive"
        public static let focusNotice = "lockin.focusNotice"
        public static let autoTicks = "lockin.focusAutoTicks"
        public static let askedNotifications = "lockin.askedNotifications"
    }

    static var defaults: UserDefaults { return AppGroup.defaults }

    static func flag(_ key: String, _ fallback: Bool) -> Bool {
        if let v = defaults.object(forKey: key) as? Bool { return v }
        return fallback
    }

    /// Local reminder notifications.
    public static var reminders: Bool {
        get { return flag(Key.reminders, true) }
        set { defaults.set(newValue, forKey: Key.reminders) }
    }

    /// A Live Activity for the current schedule block.
    public static var liveBlocks: Bool {
        get { return flag(Key.liveBlocks, true) }
        set { defaults.set(newValue, forKey: Key.liveBlocks) }
    }

    /// Shield the chosen apps while a focus session runs.
    public static var lockDuringFocus: Bool {
        get { return flag(Key.lockDuringFocus, true) }
        set { defaults.set(newValue, forKey: Key.lockDuringFocus) }
    }

    /// Shield the chosen apps during study blocks, with no timer running.
    public static var autoLockStudy: Bool {
        get { return flag(Key.autoLockStudy, false) }
        set { defaults.set(newValue, forKey: Key.autoLockStudy) }
    }

    /// What happens when the app is left during a session.
    public static var strictMode: FocusStrictMode {
        get { return FocusStrictMode(rawValue: defaults.string(forKey: Key.strictMode) ?? "") ?? .off }
        set { defaults.set(newValue.rawValue, forKey: Key.strictMode) }
    }

    public static var strictGrace: Int {
        get {
            let v = defaults.integer(forKey: Key.strictGrace)
            return v > 0 ? v : 60
        }
        set { defaults.set(newValue, forKey: Key.strictGrace) }
    }

    /// Start sessions in the full screen focus view.
    public static var fullScreen: Bool {
        get { return flag(Key.fullScreen, false) }
        set { defaults.set(newValue, forKey: Key.fullScreen) }
    }
}
