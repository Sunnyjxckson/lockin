import Foundation
import Observation

public struct FocusFinishResult: Equatable {
    public var logged: Bool
    public var minutes: Int
    public var awayCount: Int
}

/// The running focus timer and every write the Focus screen makes (src/features/focus/store.ts and useFocus.ts).
///
/// The focus_session row (end null) is the timer. Its pauses and time away are kept on the row too (`live`), so the web shows the same clock.
/// This device also holds a copy in the app group. It is written first and at once, then pushed to the row. Whichever copy is newer wins.
/// Live Activity, the shield and the end alert follow the timer from here.
@Observable
@MainActor
public final class FocusStore {
    public static let shared = FocusStore()

    // MARK: state
    public private(set) var live: FocusLiveTimer? = nil
    /// Finished sessions, newest first.
    public private(set) var sessions: [FocusSession] = []
    public private(set) var loading = true
    /// A short line about the last failed write. Cleared when shown.
    public var error: String? = nil
    /// What happened to the last session when strict mode ended or voided it. Stays until dismissed.
    public private(set) var notice: String? = nil
    /// Whether the shield is up for the running timer.
    public private(set) var shielded = false

    @ObservationIgnored private weak var app: AppStore?
    @ObservationIgnored private var pushed: Double = 0
    @ObservationIgnored private var chain: Task<Void, Never>? = nil
    /// Called when the timer starts or stops, so the block Live Activity can take over again.
    @ObservationIgnored public var onTimerChange: (() -> Void)? = nil

    private init() {
        live = FocusStore.loadSaved()
        notice = AppGroup.defaults.string(forKey: SystemPrefs.Key.focusNotice)
    }

    // MARK: this device's copy

    private static func loadSaved() -> FocusLiveTimer? {
        guard let data = AppGroup.defaults.data(forKey: SystemPrefs.Key.focusLive) else { return nil }
        return try? JSONDecoder().decode(FocusLiveTimer.self, from: data)
    }

    private func saveDevice(_ l: FocusLiveTimer?) {
        if let l = l, let data = try? JSONEncoder().encode(l) {
            AppGroup.defaults.set(data, forKey: SystemPrefs.Key.focusLive)
        } else {
            AppGroup.defaults.removeObject(forKey: SystemPrefs.Key.focusLive)
        }
    }

    public func setNotice(_ text: String?) {
        notice = text
        if let t = text {
            AppGroup.defaults.set(t, forKey: SystemPrefs.Key.focusNotice)
        } else {
            AppGroup.defaults.removeObject(forKey: SystemPrefs.Key.focusNotice)
        }
    }

    // MARK: serialized writes

    private func enqueue(_ work: @escaping @MainActor () async -> Void) {
        let previous = chain
        chain = Task { @MainActor in
            if let previous = previous { await previous.value }
            await work()
        }
    }

    // MARK: loading

    /// Connect to a signed in store and load.
    public func attach(_ store: AppStore) {
        app = store
        Task { await refresh() }
    }

    public func detach() {
        app = nil
    }

    /// Pull the sessions and the running row, and bring this device's copy in line with the row.
    public func refresh() async {
        guard let app = app else { return }
        let db = app.db
        do {
            let today = LIDate.todayNY()
            let weekFrom = LIDate.addDays(LIDate.weekStart(today), -28)
            let history = app.settings?.historyStart ?? ""
            let from = (!history.isEmpty && weekFrom < history) ? history : weekFrom
            async let rangedReq = db.list(FocusSession.self, Query(from: from, to: today, orderBy: "created_at", ascending: false))
            async let recentReq = db.list(FocusSession.self, Query(orderBy: "created_at", ascending: false, limit: 40))
            let ranged = try await rangedReq
            let recent = try await recentReq
            var byId: [String: FocusSession] = [:]
            for s in ranged { byId[s.id] = s }
            for s in recent { byId[s.id] = s }
            let all = byId.values.sorted { $0.createdAt > $1.createdAt }
            sessions = all.filter { $0.end != nil }
            reconcile(recent.first { $0.end == nil })
            loading = false
        } catch {
            loading = false
        }
    }

    /// The row is the truth about whether a timer runs. This device's copy is used while it is the newer of the two.
    private func reconcile(_ row: FocusSession?) {
        guard let row = row else {
            // Left alone for a few seconds: the saved state is written just before its row.
            if let have = live, Focus.nowMs() - have.startedAt > 10_000 {
                live = nil
                saveDevice(nil)
                syncEffects()
            }
            return
        }
        let picked = Focus.pickLive(saved: live, row: row)
        if picked.from == .row {
            if live != picked.live {
                live = picked.live
                saveDevice(picked.live)
                syncEffects()
            }
        } else {
            if row.live == nil || Focus.revOf(picked.live) > (row.live?.rev ?? 0) { push(picked.live) }
            if live == nil { live = picked.live }
            syncEffects()
        }
    }

    // MARK: the running timer

    /// Save a change to the running timer: here at once, then on the row.
    private func commit(_ next: FocusLiveTimer) {
        var n = next
        n.rev = max(Focus.nowMs(), (live?.rev ?? 0) + 1, (next.rev ?? 0) + 1)
        live = n
        saveDevice(n)
        push(n)
        syncEffects()
    }

    /// Write the running state to its row, for other devices. A failure is left for the next change to retry.
    private func push(_ l: FocusLiveTimer) {
        let rev = Focus.revOf(l)
        if rev <= pushed { return }
        pushed = rev
        guard let db = app?.db else { return }
        enqueue { [weak self] in
            guard let self = self else { return }
            // The timer may have finished while this waited its turn.
            if self.live?.id != l.id { return }
            do {
                _ = try await db.update(FocusSession.self, id: l.id, patch: ["live": Focus.stateJSON(l)])
            } catch {
                if self.pushed == rev { self.pushed = 0 }
            }
        }
    }

    /// Change the live timer, if there is one. Nothing is written when the change is a no-op.
    private func change(_ fn: (FocusLiveTimer) -> FocusLiveTimer) {
        guard let l = live else { return }
        let next = fn(l)
        if next == l { return }
        commit(next)
    }

    /// Start a timer. Returns false when the row could not be written.
    @discardableResult
    public func start(label: String, plannedSeconds: Int?, blockId: String? = nil) async -> Bool {
        guard let app = app else { return false }
        let db = app.db
        do {
            let recent = try await db.list(FocusSession.self, Query(orderBy: "created_at", ascending: false, limit: 40))
            let existing = recent.first { $0.end == nil }
            if let e = existing, let have = live, have.id == e.id { return true }
            if let e = existing { try await db.remove(FocusSession.self, id: e.id) }
            let now = Focus.nowMs()
            let id = UUID().uuidString.lowercased()
            var l = Focus.newLive(id: id, startedAt: now, label: Focus.cleanLabel(label), plannedSeconds: plannedSeconds.map { Double($0) }, blockId: blockId)
            l.rev = now
            // The saved state goes in before the row, so nothing ever sees the row without it.
            live = l
            saveDevice(l)
            var row = Focus.startRow(now: now, label: l.label, blockId: blockId, live: l)
            row["id"] = .string(id)
            do {
                _ = try await db.insert(FocusSession.self, row)
            } catch {
                live = nil
                saveDevice(nil)
                throw error
            }
            pushed = now
            LIHaptics.check()
            syncEffects()
            return true
        } catch {
            self.error = message(error, fallback: "Could not start the timer.")
            LIHaptics.error()
            return false
        }
    }

    /// Pause at the instant the clock on screen was drawn for (epoch ms), so the number the user paused on is the number that stays.
    public func pause(at drawn: Double? = nil) {
        change { Focus.pause($0, now: drawn ?? Focus.nowMs()) }
        LIHaptics.tap()
    }

    public func resume() {
        change { Focus.resume($0, now: Focus.nowMs()) }
        LIHaptics.tap()
    }

    /// "Keep going" after a countdown ended: no more planned length.
    public func keepGoing() {
        change { l in
            var n = l
            n.plannedSeconds = nil
            return n
        }
    }

    public func reviewAways(counted: Bool) {
        change { Focus.reviewAways($0, counted: counted) }
    }

    // MARK: finishing

    /// Close the running timer. `at` is when it really ended (the moment the user left, for strict mode).
    /// `minutes` overrides the computed number when the user was asked what really happened.
    @discardableResult
    public func finish(at: Double? = nil, minutes override: Int? = nil) async -> FocusFinishResult? {
        guard let l = live, let app = app else { return nil }
        let db = app.db
        let done = Focus.finish(l, at: at ?? Focus.nowMs())
        let minutes = override ?? done.minutes
        let logged = override != nil ? minutes >= 1 : done.log
        live = nil
        saveDevice(nil)
        syncEffects()
        do {
            let row = try await db.get(FocusSession.self, id: l.id)
            guard let saved = row else { return FocusFinishResult(logged: false, minutes: 0, awayCount: 0) }
            if !logged {
                try await db.remove(FocusSession.self, id: l.id)
                await refresh()
                return FocusFinishResult(logged: false, minutes: 0, awayCount: done.meta.awayCount)
            }
            _ = try await db.update(FocusSession.self, id: l.id, patch: done.patch(minutes: override))
            await app.syncStudy(date: saved.date)
            await refresh()
            LIHaptics.celebrate()
            return FocusFinishResult(logged: true, minutes: minutes, awayCount: done.meta.awayCount)
        } catch {
            // Keep the timer so the user can try again.
            live = l
            saveDevice(l)
            syncEffects()
            self.error = message(error, fallback: "Could not save the session.")
            LIHaptics.error()
            return nil
        }
    }

    /// Throw the running timer away. Nothing is logged.
    public func discard() async {
        guard let l = live, let app = app else { return }
        live = nil
        saveDevice(nil)
        syncEffects()
        do {
            if let row = try await app.db.get(FocusSession.self, id: l.id) {
                try await app.db.remove(FocusSession.self, id: row.id)
            }
            await refresh()
        } catch {
            live = l
            saveDevice(l)
            syncEffects()
            self.error = message(error, fallback: "Could not throw the timer out.")
        }
    }

    // MARK: by hand

    public func logManual(date: DateStr, minutes: Int, label: String, start: TimeStr) async -> Bool {
        guard let app = app else { return false }
        do {
            _ = try await app.db.insert(FocusSession.self, Focus.manualRow(date: date, minutes: minutes, label: label, start: start))
            await app.syncStudy(date: date)
            await refresh()
            LIHaptics.check()
            return true
        } catch {
            self.error = message(error, fallback: "Could not save.")
            LIHaptics.error()
            return false
        }
    }

    public func edit(_ session: FocusSession, date: DateStr, minutes: Int, label: String) async -> Bool {
        guard let app = app else { return false }
        do {
            var patch = Focus.editPatch(start: session.start, date: date, minutes: minutes, label: label)
            // An edited length is the user's word, so the countdown no longer vouches for it.
            if minutes != session.minutes { patch["completed"] = .bool(false) }
            _ = try await app.db.update(FocusSession.self, id: session.id, patch: patch)
            await app.syncStudy(date: session.date)
            if date != session.date { await app.syncStudy(date: date) }
            await refresh()
            return true
        } catch {
            self.error = message(error, fallback: "Could not save.")
            LIHaptics.error()
            return false
        }
    }

    public func delete(_ session: FocusSession) async -> Bool {
        guard let app = app else { return false }
        do {
            try await app.db.remove(FocusSession.self, id: session.id)
            await app.syncStudy(date: session.date)
            await refresh()
            return true
        } catch {
            self.error = message(error, fallback: "Could not delete.")
            LIHaptics.error()
            return false
        }
    }

    // MARK: leaving the app (FocusWatcher.tsx)

    /// The app went to the background with a timer running: write the moment down at once.
    public func appDidEnterBackground() {
        guard live != nil else { return }
        let before = live
        change { Focus.leave($0, now: Focus.nowMs()) }
        if live != before { NotificationScheduler.scheduleAwayNudge() }
    }

    /// The app came back. Bring the timer in line with the row, close the time away, and apply strict mode.
    public func appDidBecomeActive() async {
        NotificationScheduler.cancelAwayNudge()
        guard live != nil else {
            await refresh()
            return
        }
        let now = Focus.nowMs()
        await refresh()
        change { Focus.comeBack($0, now: now) }
        guard let l = live else { return }
        // Left running for hours: the screen asks what really happened.
        if Focus.staleInfo(l, now: now) != nil { return }
        let mode = SystemPrefs.strictMode
        let grace = SystemPrefs.strictGrace
        guard let breach = Focus.strictBreach(l, mode: mode, graceSeconds: grace, now: now) else { return }
        if breach.action == .void {
            await discard()
            setNotice("Session voided. You left for \(Focus.formatAway(breach.awaySeconds)) and strict mode allows \(Focus.formatAway(grace)).")
        } else {
            let res = await finish(at: breach.at)
            if let r = res, r.logged {
                setNotice("Session ended when you left. \(r.minutes) min logged. You were gone \(Focus.formatAway(breach.awaySeconds)).")
            } else {
                setNotice("Session ended when you left, with under a minute on the clock. Nothing was logged.")
            }
        }
        LIHaptics.error()
    }

    // MARK: effects: Live Activity, shield, alerts

    private func message(_ error: Error, fallback: String) -> String {
        if let api = error as? APIError {
            return api.isOffline ? "You look offline." : (api.errorDescription ?? fallback)
        }
        return fallback
    }

    /// Make the Live Activity, the shield and the end alert match the timer as it is now.
    private func syncEffects() {
        let l = live
        let lockOn = SystemPrefs.lockDuringFocus
        Task { @MainActor in
            if let l = l {
                let now = Date()
                let clock = Focus.clockOf(l, now: now.timeIntervalSince1970 * 1000.0)
                await LiveActivityManager.shared.showFocus(l, clock: clock, now: now)
                if let remaining = clock.remaining, remaining > 0, !clock.paused {
                    NotificationScheduler.scheduleFocusEnd(in: Double(remaining), label: l.label)
                } else {
                    NotificationScheduler.cancelFocusEnd()
                }
                if lockOn && FocusLock.canShield {
                    var plannedEnd: Date? = nil
                    if let remaining = clock.remaining {
                        // Paused, the clock is not moving. Leave room for the break.
                        plannedEnd = now.addingTimeInterval(Double(remaining) + (clock.paused ? 900 : 0))
                    }
                    if FocusLock.focusRunning {
                        FocusLock.update(plannedEnd: plannedEnd, now: now)
                    } else {
                        FocusLock.begin(plannedEnd: plannedEnd, now: now)
                    }
                    shielded = true
                } else {
                    if FocusLock.focusRunning { FocusLock.end() }
                    shielded = false
                }
            } else {
                await LiveActivityManager.shared.endFocus()
                NotificationScheduler.cancelFocusEnd()
                if FocusLock.focusRunning { FocusLock.end() }
                shielded = false
            }
            onTimerChange?()
        }
    }

    /// Lift or raise the shield now, after the user changed the setting or the apps while a timer runs.
    public func lockSettingChanged() {
        syncEffects()
    }
}
