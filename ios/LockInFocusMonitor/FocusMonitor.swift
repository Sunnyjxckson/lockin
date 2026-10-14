import DeviceActivity
import Foundation
import LockInKit

/// Runs outside the app. Raises the shield when a watched interval starts and lifts it when it ends, even if Lock In is closed.
/// "lockin.focus" is a focus session (scheduled by the app for the planned end). "lockin.study.<block>" is a study block,
/// used when auto lock for study blocks is on.
final class FocusMonitor: DeviceActivityMonitor {
    private func isStudy(_ activity: DeviceActivityName) -> Bool {
        return activity.rawValue.hasPrefix(FocusLock.studyPrefix)
    }

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        let defaults = AppGroup.defaults
        if isStudy(activity) {
            if !SystemPrefs.autoLockStudy { return }
            let ends = defaults.dictionary(forKey: SystemPrefs.Key.studyEnds) as? [String: Double]
            if let end = ends?[activity.rawValue] {
                defaults.set(end, forKey: SystemPrefs.Key.focusEndsAt)
            }
        }
        FocusShieldStore.apply()
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        let defaults = AppGroup.defaults
        if isStudy(activity) {
            // A focus session that is still running keeps its own shield.
            if defaults.bool(forKey: SystemPrefs.Key.focusRunning) { return }
        } else {
            defaults.set(false, forKey: SystemPrefs.Key.focusRunning)
        }
        defaults.removeObject(forKey: SystemPrefs.Key.focusEndsAt)
        FocusShieldStore.clear()
    }
}
