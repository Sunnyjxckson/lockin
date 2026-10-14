import Foundation

/// The app group shared by the app and every extension.
public enum AppGroup {
    public static let id = "group.com.sunnyjackson.lockin"

    /// Defaults shared with the extensions. Falls back to standard defaults when the group is not available (unit tests, unsigned builds).
    public static var defaults: UserDefaults {
        return UserDefaults(suiteName: id) ?? UserDefaults.standard
    }

    public static var containerURL: URL? {
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    }

    public static let baseURLKey = "lockin.baseURL"
    public static let snapshotKey = "lockin.widgetSnapshot"
    public static let focusSelectionKey = "lockin.focusSelection"
    public static let defaultBaseURL = "https://lockin-jacksonsunny-2811s-projects.vercel.app"

    /// The server the app talks to. Set on the login screen.
    public static var baseURLString: String {
        get { return defaults.string(forKey: baseURLKey) ?? defaultBaseURL }
        set { defaults.set(newValue, forKey: baseURLKey) }
    }
}
