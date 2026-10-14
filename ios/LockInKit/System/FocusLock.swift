import Foundation
import FamilyControls
import ManagedSettings
import DeviceActivity

/// The phone side of focus: Screen Time authorization, the shield on the chosen apps, and the DeviceActivity schedules that let
/// the LockInFocusMonitor extension lift the shield at the planned end even when the app is closed.
/// Needs the Family Controls entitlement (distribution needs Apple's approval, see the report).
public enum FocusLock {
    public static let focusName = DeviceActivityName("lockin.focus")
    public static let studyPrefix = "lockin.study."
    /// DeviceActivity refuses a schedule shorter than this.
    static let minIntervalSeconds: TimeInterval = 16 * 60
    static let maxStudyBlocks = 10

    // MARK: authorization and selection

    public static var status: AuthorizationStatus {
        return AuthorizationCenter.shared.authorizationStatus
    }

    public static var isAuthorized: Bool {
        return status == .approved
    }

    @discardableResult
    public static func requestAuthorization() async -> Bool {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        } catch {
            return false
        }
        return isAuthorized
    }

    public static func hasSelection(_ selection: FamilyActivitySelection) -> Bool {
        return !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty || !selection.webDomainTokens.isEmpty
    }

    public static var hasSavedSelection: Bool {
        return hasSelection(FocusShieldStore.load())
    }

    /// True when a session may raise the shield right now.
    public static var canShield: Bool {
        return isAuthorized && hasSavedSelection
    }

    /// When the shield is due to lift, for the line on the blocked app.
    public static var endsAt: Date? {
        let t = AppGroup.defaults.double(forKey: SystemPrefs.Key.focusEndsAt)
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }

    public static var focusRunning: Bool {
        return AppGroup.defaults.bool(forKey: SystemPrefs.Key.focusRunning)
    }

    // MARK: a focus session

    /// Raise the shield for a session and schedule the monitor to lift it at `plannedEnd` (or after the longest believable session).
    public static func begin(plannedEnd: Date?, now: Date = Date()) {
        guard canShield else { return }
        let end = plannedEnd ?? now.addingTimeInterval(Double(Focus.maxSessionSeconds))
        AppGroup.defaults.set(true, forKey: SystemPrefs.Key.focusRunning)
        AppGroup.defaults.set(end.timeIntervalSince1970, forKey: SystemPrefs.Key.focusEndsAt)
        FocusShieldStore.apply()
        schedule(name: focusName, from: now, to: end)
    }

    /// The planned end moved (paused, resumed, kept going). Move the monitor with it.
    public static func update(plannedEnd: Date?, now: Date = Date()) {
        guard focusRunning, canShield else { return }
        let end = plannedEnd ?? now.addingTimeInterval(Double(Focus.maxSessionSeconds))
        AppGroup.defaults.set(end.timeIntervalSince1970, forKey: SystemPrefs.Key.focusEndsAt)
        schedule(name: focusName, from: now, to: end)
    }

    /// Lift the shield and stop watching. A study block that is running keeps its own shield if auto lock is on.
    public static func end(now: Date = Date()) {
        DeviceActivityCenter().stopMonitoring([focusName])
        AppGroup.defaults.set(false, forKey: SystemPrefs.Key.focusRunning)
        AppGroup.defaults.removeObject(forKey: SystemPrefs.Key.focusEndsAt)
        FocusShieldStore.clear()
        if SystemPrefs.autoLockStudy, let until = runningStudyEnd(now: now) {
            AppGroup.defaults.set(until.timeIntervalSince1970, forKey: SystemPrefs.Key.focusEndsAt)
            FocusShieldStore.apply()
        }
    }

    private static func schedule(name: DeviceActivityName, from start: Date, to end: Date) {
        var from = start
        // Start a minute early so "now" is inside the interval.
        from = from.addingTimeInterval(-60)
        var to = end
        if to.timeIntervalSince(from) < minIntervalSeconds { to = from.addingTimeInterval(minIntervalSeconds) }
        let units: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let cal = Calendar.current
        let schedule = DeviceActivitySchedule(
            intervalStart: cal.dateComponents(units, from: from),
            intervalEnd: cal.dateComponents(units, from: to),
            repeats: false
        )
        let center = DeviceActivityCenter()
        center.stopMonitoring([name])
        do {
            try center.startMonitoring(name, during: schedule)
        } catch {
            // The app still lifts the shield itself when the session ends.
        }
    }

    // MARK: study blocks

    public struct StudyWindow: Equatable {
        public var id: String
        public var start: Date
        public var end: Date

        public init(id: String, start: Date, end: Date) {
            self.id = id
            self.start = start
            self.end = end
        }
    }

    static func runningStudyEnd(now: Date) -> Date? {
        guard let dict = AppGroup.defaults.dictionary(forKey: SystemPrefs.Key.studyEnds) as? [String: Double] else { return nil }
        let ends = dict.values.map { Date(timeIntervalSince1970: $0) }.filter { $0 > now }
        return ends.min()
    }

    /// Watch the day's study blocks so the monitor raises the shield when one starts and lifts it when it ends.
    public static func scheduleStudyBlocks(_ windows: [StudyWindow], now: Date = Date()) {
        cancelStudyBlocks()
        guard canShield else { return }
        let usable = windows
            .filter { $0.end > now && $0.end.timeIntervalSince($0.start) >= minIntervalSeconds }
            .sorted { $0.start < $1.start }
            .prefix(maxStudyBlocks)
        var ends: [String: Double] = [:]
        let center = DeviceActivityCenter()
        let units: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let cal = Calendar.current
        for w in usable {
            let name = DeviceActivityName(studyPrefix + w.id)
            let schedule = DeviceActivitySchedule(
                intervalStart: cal.dateComponents(units, from: w.start),
                intervalEnd: cal.dateComponents(units, from: w.end),
                repeats: false
            )
            do {
                try center.startMonitoring(name, during: schedule)
                ends[name.rawValue] = w.end.timeIntervalSince1970
            } catch {
                continue
            }
        }
        AppGroup.defaults.set(ends, forKey: SystemPrefs.Key.studyEnds)
    }

    public static func cancelStudyBlocks() {
        let center = DeviceActivityCenter()
        let names = center.activities.filter { $0.rawValue.hasPrefix(studyPrefix) }
        if !names.isEmpty { center.stopMonitoring(names) }
        AppGroup.defaults.removeObject(forKey: SystemPrefs.Key.studyEnds)
    }
}
