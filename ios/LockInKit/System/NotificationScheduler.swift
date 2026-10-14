import Foundation
import UserNotifications

/// Local notifications: the `reminder` table, planned by Reminders.planDay, the 8 pm earnings nudge, and the focus timer's own alerts.
/// Everything this app schedules has an identifier starting with "lockin.", so it can be cleared without touching anything else.
public enum NotificationScheduler {
    static let reminderPrefix = "lockin.rem."
    static let focusEndId = "lockin.focus.end"
    static let focusAwayId = "lockin.focus.away"
    /// iOS keeps at most 64 pending requests and silently drops the rest. The budget:
    /// reminders go first (two days of them, at most `maxPending`), the quote drops fill what is left, and a safety margin
    /// plus room for the two focus alerts is never used. See `dropBudget`.
    public static let systemLimit = 64
    public static let safetyMargin = 4
    public static let focusReserve = 2
    public static let maxPending = 44
    /// The drops look at most this many days ahead, whatever the budget allows.
    public static let dropHorizonDays = 7

    /// How many quote drops may be pending, given every pending identifier. Everything that is not a drop and not a
    /// focus alert counts against the budget; the focus alerts are reserved for whether or not they are pending.
    public static func dropBudget(pendingIds: [String]) -> Int {
        let others = pendingIds.filter { !$0.hasPrefix(Drops.identifierPrefix) && !$0.hasPrefix("lockin.focus") }.count
        return max(0, systemLimit - safetyMargin - focusReserve - others)
    }
    /// The nudge used when the reminder table has none of its own.
    public static let nudgeTime = "20:00"

    // MARK: permission

    public static func status() async -> UNAuthorizationStatus {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus
    }

    @discardableResult
    public static func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    public static func isAllowed(_ status: UNAuthorizationStatus) -> Bool {
        return status == .authorized || status == .provisional || status == .ephemeral
    }

    // MARK: planning (pure)

    /// What to schedule for today and tomorrow, soonest first. The earnings nudge is left out once today's floor is met.
    public static func plan(reminders: [Reminder], blocksByDate: [DateStr: [DayBlock]], today: DateStr, earned: Double, floor: Double, quietStart: TimeStr, quietEnd: TimeStr, restToday: Bool, now: Date) -> [PlannedNotification] {
        var rems = reminders
        let hasNudge = rems.contains { $0.enabled && $0.kind == .earningsNudge && $0.time != nil }
        if !hasNudge && floor > 0 {
            rems.append(Reminder(id: "local-nudge", kind: .earningsNudge, label: "Earnings nudge", body: nil, time: nudgeTime))
        }
        let opts = ReminderPlanOptions(floor: floor, quietStart: quietStart, quietEnd: quietEnd)
        let tomorrow = LIDate.addDays(today, 1)
        var out: [PlannedNotification] = []
        for date in [today, tomorrow] {
            let blocks = (blocksByDate[date] ?? []).map { ReminderBlock($0) }
            let day = ReminderDay(date: date, blocks: blocks, earned: date == today ? earned : 0, restDay: date == today ? restToday : false)
            out.append(contentsOf: Reminders.planDay(rems, day, opts, forSend: true))
        }
        let cutoff = now.addingTimeInterval(5)
        let future = out.filter { $0.at > cutoff }.sorted { a, b in
            if a.at != b.at { return a.at < b.at }
            return a.key < b.key
        }
        return Array(future.prefix(maxPending))
    }

    // MARK: scheduling

    /// Replace everything scheduled from the reminder table with `plan`.
    public static func apply(_ plan: [PlannedNotification]) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let old = pending.map { $0.identifier }.filter { $0.hasPrefix(reminderPrefix) }
        if !old.isEmpty { center.removePendingNotificationRequests(withIdentifiers: old) }
        let now = Date()
        for n in plan {
            let interval = n.at.timeIntervalSince(now)
            if interval < 2 { continue }
            let content = UNMutableNotificationContent()
            content.title = n.title
            content.body = n.body
            content.sound = .default
            content.threadIdentifier = "lockin.reminders"
            content.userInfo = ["url": n.url, "kind": n.kind.rawValue]
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            let request = UNNotificationRequest(identifier: reminderPrefix + n.key, content: content, trigger: trigger)
            try? await center.add(request)
        }
    }

    /// Clear every reminder this app scheduled.
    public static func clearReminders() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let old = pending.map { $0.identifier }.filter { $0.hasPrefix(reminderPrefix) }
        if !old.isEmpty { center.removePendingNotificationRequests(withIdentifiers: old) }
    }

    // MARK: focus alerts

    /// A countdown reached its length.
    public static func scheduleFocusEnd(in seconds: Double, label: String) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [focusEndId])
        if seconds < 2 { return }
        let content = UNMutableNotificationContent()
        content.title = "Time is up"
        content.body = "\(label) is done. Finish it, or keep going."
        content.sound = .default
        content.userInfo = ["url": "/focus"]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        center.add(UNNotificationRequest(identifier: focusEndId, content: content, trigger: trigger))
    }

    public static func cancelFocusEnd() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [focusEndId])
    }

    /// The app was left with a timer running. Fires shortly after, and is cancelled if the user comes straight back.
    public static func scheduleAwayNudge(after seconds: Double = 30) {
        let center = UNUserNotificationCenter.current()
        let content = UNMutableNotificationContent()
        content.title = "Still in a focus session"
        content.body = "The clock is not counting while you are away. Come back to it."
        content.sound = .default
        content.userInfo = ["url": "/focus"]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        center.add(UNNotificationRequest(identifier: focusAwayId, content: content, trigger: trigger))
    }

    public static func cancelAwayNudge() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [focusAwayId])
        center.removeDeliveredNotifications(withIdentifiers: [focusAwayId])
    }
}
