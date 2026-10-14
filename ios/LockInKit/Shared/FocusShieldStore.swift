import Foundation
import FamilyControls
import ManagedSettings

/// The apps the user picked to block during focus. The selection lives in the app group so the monitor and shield extensions can read it.
public enum FocusShieldStore {
    public static func save(_ selection: FamilyActivitySelection) {
        guard let data = try? JSONEncoder().encode(selection) else { return }
        AppGroup.defaults.set(data, forKey: AppGroup.focusSelectionKey)
    }

    public static func load() -> FamilyActivitySelection {
        guard let data = AppGroup.defaults.data(forKey: AppGroup.focusSelectionKey),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else {
            return FamilyActivitySelection()
        }
        return selection
    }

    /// Shield everything in the saved selection.
    public static func apply() {
        let selection = load()
        let store = ManagedSettingsStore()
        if selection.applicationTokens.isEmpty {
            store.shield.applications = nil
        } else {
            store.shield.applications = selection.applicationTokens
        }
        if selection.webDomainTokens.isEmpty {
            store.shield.webDomains = nil
        } else {
            store.shield.webDomains = selection.webDomainTokens
        }
        if selection.categoryTokens.isEmpty {
            store.shield.applicationCategories = nil
        } else {
            store.shield.applicationCategories = .specific(selection.categoryTokens)
        }
    }

    /// Lift every shield.
    public static func clear() {
        ManagedSettingsStore().clearAllSettings()
    }
}
