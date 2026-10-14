import Foundation
import ActivityKit

/// Starts, updates and ends the Live Activity. One at a time: the running focus timer when there is one,
/// otherwise the current schedule block. The widget extension draws it (LockInLiveActivity).
@MainActor
public final class LiveActivityManager {
    public static let shared = LiveActivityManager()

    private var current: Activity<LockInActivityAttributes>? = nil
    private var currentKey: String? = nil
    private var cleaned = false

    private init() {}

    public var isAllowed: Bool {
        return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // MARK: schedule block

    /// Show `block` (the one the clock is inside) or end the activity when there is none. Does nothing when the block is already showing.
    public func syncBlock(_ block: DayBlock?, date: DateStr, now: Date) async {
        await cleanUpOnce()
        guard let b = block, isAllowed else {
            await endBlock()
            return
        }
        let start = LIDate.nyInstant(date, b.start)
        let minutes = b.duration > 0 ? b.duration : LIDate.durationMinutes(b.start, b.end)
        let end = start.addingTimeInterval(Double(minutes) * 60.0)
        if end <= now {
            await endBlock()
            return
        }
        let key = "block|\(date)|\(b.id)|\(b.start)|\(b.end)"
        if currentKey == key, current != nil { return }
        await endCurrent()
        let state = LockInActivityAttributes.ContentState(title: b.blockName, kind: .block, start: start, end: end)
        await request(name: "block", key: key, state: state, stale: end)
    }

    /// End the activity if it is a block one.
    public func endBlock() async {
        if let key = currentKey, key.hasPrefix("block|") { await endCurrent() }
    }

    // MARK: focus timer

    /// Show the running timer, or move the one showing to the timer's new state.
    public func showFocus(_ live: FocusLiveTimer, clock: FocusClock, now: Date = Date()) async {
        await cleanUpOnce()
        if !isAllowed { return }
        let title = live.label
        let state: LockInActivityAttributes.ContentState
        var stale: Date? = nil
        if let remaining = clock.remaining {
            let end = now.addingTimeInterval(Double(max(1, remaining)))
            let planned = Double(live.plannedSeconds ?? Double(remaining))
            let start = end.addingTimeInterval(-max(planned, 1))
            state = LockInActivityAttributes.ContentState(title: title, kind: .focus, start: start, end: end, paused: clock.paused, countsUp: false, frozenSeconds: clock.paused ? remaining : nil)
            stale = clock.paused ? nil : end.addingTimeInterval(60 * 60)
        } else {
            let start = now.addingTimeInterval(-Double(clock.focusedSeconds))
            let end = start.addingTimeInterval(Double(Focus.maxSessionSeconds))
            state = LockInActivityAttributes.ContentState(title: title, kind: .focus, start: start, end: end, paused: clock.paused, countsUp: true, frozenSeconds: clock.paused ? clock.focusedSeconds : nil)
        }
        let key = "focus|\(live.id)"
        if currentKey == key, let activity = current {
            await activity.update(ActivityContent(state: state, staleDate: stale))
            return
        }
        await endCurrent()
        await request(name: "focus", key: key, state: state, stale: stale)
    }

    public func endFocus() async {
        if let key = currentKey, key.hasPrefix("focus|") { await endCurrent() }
    }

    /// End whatever is showing.
    public func endAll() async {
        await endCurrent()
        for activity in Activity<LockInActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    // MARK: plumbing

    private func request(name: String, key: String, state: LockInActivityAttributes.ContentState, stale: Date?) async {
        do {
            let content = ActivityContent(state: state, staleDate: stale)
            let activity = try Activity.request(attributes: LockInActivityAttributes(name: name), content: content, pushType: nil)
            current = activity
            currentKey = key
        } catch {
            current = nil
            currentKey = nil
        }
    }

    private func endCurrent() async {
        if let activity = current {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        current = nil
        currentKey = nil
    }

    /// Activities left over from a previous launch are not tracked here. End them once, so there are never two.
    private func cleanUpOnce() async {
        if cleaned { return }
        cleaned = true
        for activity in Activity<LockInActivityAttributes>.activities {
            if activity.id != current?.id {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
