import SwiftUI
import UIKit
import UserNotifications
import Observation
import LockInKit

/// Keeps the system features in step with the app: local notifications, the Live Activity, the focus lock schedules and the focus timer.
/// Mounted once, by SystemHost in the tab root. It follows AppStore through `.lockInSnapshotChanged`, which refreshWidgets posts after every change.
@Observable
@MainActor
final class SystemCoordinator {
    static let shared = SystemCoordinator()

    let focus = FocusStore.shared
    var notificationStatus: UNAuthorizationStatus = .notDetermined
    var activitiesEnabled = true

    @ObservationIgnored private weak var store: AppStore?
    @ObservationIgnored private var reminders: [Reminder] = []
    @ObservationIgnored private var remindersLoaded = false
    @ObservationIgnored private var tomorrowDate: DateStr = ""
    @ObservationIgnored private var tomorrowBlocks: [DayBlock] = []
    @ObservationIgnored private var loadedAt: Date? = nil
    @ObservationIgnored private var observer: NSObjectProtocol? = nil
    @ObservationIgnored private var settingsObserver: NSObjectProtocol? = nil
    @ObservationIgnored private var debounce: Task<Void, Never>? = nil
    @ObservationIgnored private var timer: Timer? = nil
    @ObservationIgnored private var rescheduling = false
    @ObservationIgnored private var rescheduleAgain = false
    @ObservationIgnored private var studySignature = ""

    private init() {}

    // MARK: lifecycle

    func start(store newStore: AppStore) {
        if store === newStore { return }
        store = newStore
        reminders = []
        remindersLoaded = false
        loadedAt = nil
        studySignature = ""
        focus.attach(newStore)
        focus.onTimerChange = { [weak self] in
            Task { @MainActor in await self?.syncBlockActivity() }
        }
        if observer == nil {
            observer = NotificationCenter.default.addObserver(forName: .lockInSnapshotChanged, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.dataChanged() }
            }
        }
        if settingsObserver == nil {
            settingsObserver = NotificationCenter.default.addObserver(forName: .lockInNotificationsChanged, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in await self?.remindersChanged() }
            }
        }
        Task { await foreground() }
    }

    /// Signed out: take everything this app put on the phone back off it.
    func stop() {
        store = nil
        debounce?.cancel()
        timer?.invalidate()
        timer = nil
        focus.detach()
        Task {
            await NotificationScheduler.clearReminders()
            await LiveActivityManager.shared.endAll()
            FocusLock.cancelStudyBlocks()
            if FocusLock.focusRunning { FocusLock.end() }
        }
    }

    func foreground() async {
        guard store != nil else { return }
        notificationStatus = await NotificationScheduler.status()
        activitiesEnabled = LiveActivityManager.shared.isAllowed
        if notificationStatus == .notDetermined && SystemPrefs.reminders {
            _ = await NotificationScheduler.requestAuthorization()
            notificationStatus = await NotificationScheduler.status()
        }
        if NotificationScheduler.isAllowed(notificationStatus) {
            UIApplication.shared.registerForRemoteNotifications()
        }
        startTimer()
        await focus.appDidBecomeActive()
        await loadSystemData(force: false)
        await reschedule()
        await syncBlockActivity()
        scheduleAutoLock(force: true)
    }

    func background() {
        timer?.invalidate()
        timer = nil
        focus.appDidEnterBackground()
    }

    private func startTimer() {
        if timer != nil { return }
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self = self, let s = self.store else { return }
                // Rolls the day over at midnight and moves now and next along.
                s.tick()
                await self.syncBlockActivity()
            }
        }
    }

    // MARK: data

    /// Reminders, and tomorrow's blocks for the block relative ones. Today's blocks come from AppStore.
    private func loadSystemData(force: Bool) async {
        guard let s = store else { return }
        let tomorrow = LIDate.addDays(s.today, 1)
        if !force, let at = loadedAt, Date().timeIntervalSince(at) < 300, tomorrowDate == tomorrow, remindersLoaded { return }
        let db = s.db
        do {
            let rems = try await db.list(Reminder.self, Query(orderBy: "sort_order"))
            let rows = try await db.list(ScheduleBlock.self, Query(eq: ["date": .string(tomorrow)]))
            let template = try await db.list(ScheduleTemplate.self, Query(eq: ["weekday": .int(LIDate.weekdayOf(tomorrow))]))
            reminders = rems
            tomorrowBlocks = Blocks.resolveBlocks(tomorrow, rows: rows, template: template)
            tomorrowDate = tomorrow
            remindersLoaded = true
            loadedAt = Date()
        } catch {
            // Keep what was loaded before. The next foreground tries again.
        }
    }

    /// Call after a reminder or the schedule was edited, so the phone follows at once.
    func remindersChanged() async {
        await loadSystemData(force: true)
        await reschedule()
        scheduleAutoLock(force: true)
    }

    /// The store changed (a check off, new earnings, a reload). Debounced, no network.
    private func dataChanged() {
        debounce?.cancel()
        debounce = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 800_000_000)
            if Task.isCancelled { return }
            await self.reschedule()
            await self.syncBlockActivity()
            self.scheduleAutoLock(force: false)
        }
    }

    // MARK: notifications

    func requestNotifications() async {
        _ = await NotificationScheduler.requestAuthorization()
        notificationStatus = await NotificationScheduler.status()
        if NotificationScheduler.isAllowed(notificationStatus) {
            UIApplication.shared.registerForRemoteNotifications()
        }
        await reschedule()
    }

    func reschedule() async {
        guard let s = store, s.hasData, remindersLoaded else { return }
        notificationStatus = await NotificationScheduler.status()
        if !SystemPrefs.reminders || !NotificationScheduler.isAllowed(notificationStatus) {
            await NotificationScheduler.clearReminders()
            // The drops take what the reminders leave, which is now everything.
            AppStore.tomorrowDropBlocks = tomorrowDate == LIDate.addDays(s.today, 1) ? (date: tomorrowDate, blocks: tomorrowBlocks) : nil
            await s.rescheduleDrops()
            return
        }
        if rescheduling {
            rescheduleAgain = true
            return
        }
        rescheduling = true
        repeat {
            rescheduleAgain = false
            guard let s = store else { break }
            var byDate: [DateStr: [DayBlock]] = [:]
            if tomorrowDate == LIDate.addDays(s.today, 1) { byDate[tomorrowDate] = tomorrowBlocks }
            byDate[s.today] = s.blocks
            let plan = NotificationScheduler.plan(
                reminders: reminders,
                blocksByDate: byDate,
                today: s.today,
                earned: s.moneyToday,
                floor: s.floor,
                quietStart: s.settings?.quietStart ?? "22:00",
                quietEnd: s.settings?.quietEnd ?? "07:00",
                restToday: s.mainWorkout?.kind == .rest,
                dropsPerDay: s.settings?.dropsEnabled == true ? Drops.dropsPerDay(s.settings?.dropsPerDay) : nil,
                now: Date()
            )
            await NotificationScheduler.apply(plan)
            AppStore.tomorrowDropBlocks = tomorrowDate == LIDate.addDays(s.today, 1) ? (date: tomorrowDate, blocks: tomorrowBlocks) : nil
            // Reminders first, then the quote drops fill the budget that is left.
            await s.rescheduleDrops()
        } while rescheduleAgain
        rescheduling = false
    }

    // MARK: Live Activity

    /// The current schedule block, unless a focus timer owns the activity.
    func syncBlockActivity() async {
        guard let s = store, s.hasData else { return }
        activitiesEnabled = LiveActivityManager.shared.isAllowed
        if focus.live != nil { return }
        if !SystemPrefs.liveBlocks {
            await LiveActivityManager.shared.endBlock()
            return
        }
        let now = Date()
        let nn = Blocks.nowAndNext(s.blocks, time: LIDate.timeNY(now))
        await LiveActivityManager.shared.syncBlock(nn.now, date: s.today, now: now)
    }

    // MARK: focus lock during study blocks

    func scheduleAutoLock(force: Bool) {
        guard let s = store, s.hasData else { return }
        if !SystemPrefs.autoLockStudy || !FocusLock.canShield {
            if force || !studySignature.isEmpty {
                FocusLock.cancelStudyBlocks()
                studySignature = ""
            }
            return
        }
        var windows: [FocusLock.StudyWindow] = []
        var days: [(DateStr, [DayBlock])] = [(s.today, s.blocks)]
        if tomorrowDate == LIDate.addDays(s.today, 1) { days.append((tomorrowDate, tomorrowBlocks)) }
        for (date, blocks) in days {
            for b in blocks where b.kind == .study {
                let start = LIDate.nyInstant(date, b.start)
                let minutes = b.duration > 0 ? b.duration : LIDate.durationMinutes(b.start, b.end)
                windows.append(FocusLock.StudyWindow(id: "\(date).\(b.id)", start: start, end: start.addingTimeInterval(Double(minutes) * 60.0)))
            }
        }
        let signature = windows.map { "\($0.id)|\($0.start.timeIntervalSince1970)|\($0.end.timeIntervalSince1970)" }.joined(separator: ";")
        if !force && signature == studySignature { return }
        studySignature = signature
        FocusLock.scheduleStudyBlocks(windows)
    }
}

/// Mounted on the tab root. Starts the coordinator when the user is signed in and follows the app coming to the front and going away.
struct SystemHost: ViewModifier {
    @Environment(AppStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .task { @MainActor in SystemCoordinator.shared.start(store: store) }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    Task { await SystemCoordinator.shared.foreground() }
                } else if phase == .background {
                    SystemCoordinator.shared.background()
                }
            }
            .onDisappear { SystemCoordinator.shared.stop() }
    }
}
