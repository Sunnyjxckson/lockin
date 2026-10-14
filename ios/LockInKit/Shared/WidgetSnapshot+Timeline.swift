import Foundation

extension Notification.Name {
    /// Posted by AppStore.refreshWidgets, so the system features (notifications, Live Activity) follow what the widgets show.
    public static let lockInSnapshotChanged = Notification.Name("lockin.snapshotChanged")
}

extension WidgetSnapshot {
    /// True when the snapshot was written for the New York day of `at`.
    public func isCurrent(at: Date) -> Bool {
        return !date.isEmpty && date == LIDate.todayNY(at)
    }

    /// The block the clock is inside and the next one to start, at `at`. Works from the whole day when the snapshot has it.
    /// A snapshot from another day has no blocks to offer.
    public func nowNext(at: Date) -> (now: WidgetBlock?, next: WidgetBlock?) {
        if !isCurrent(at: at) { return (nil, nil) }
        guard let all = blocks, !all.isEmpty else { return (now, next) }
        let t = LIDate.minutesOf(LIDate.timeNY(at))
        let sorted = all.sorted { a, b in
            let sa = LIDate.minutesOf(a.start)
            let sb = LIDate.minutesOf(b.start)
            if sa != sb { return sa < sb }
            return LIDate.minutesOf(a.end) < LIDate.minutesOf(b.end)
        }
        var current: WidgetBlock? = nil
        for b in sorted {
            let s = LIDate.minutesOf(b.start)
            let e = s + LIDate.durationMinutes(b.start, b.end)
            if s <= t && t < e { current = b }
        }
        let upcoming = sorted.first { LIDate.minutesOf($0.start) > t }
        return (current, upcoming)
    }

    /// Minutes left in a block at `at`, never negative.
    public static func minutesLeft(_ block: WidgetBlock, at: Date) -> Int {
        let t = LIDate.minutesOf(LIDate.timeNY(at))
        let e = LIDate.minutesOf(block.start) + LIDate.durationMinutes(block.start, block.end)
        return max(0, e - t)
    }

    /// 0 to 1 through a block at `at`.
    public static func progress(_ block: WidgetBlock, at: Date) -> Double {
        let t = LIDate.minutesOf(LIDate.timeNY(at))
        let s = LIDate.minutesOf(block.start)
        let d = max(1, LIDate.durationMinutes(block.start, block.end))
        return max(0, min(1, Double(t - s) / Double(d)))
    }

    /// The first instant after midnight in New York following `at`.
    public static func nextMidnight(after at: Date) -> Date {
        return LIDate.nyInstant(LIDate.addDays(LIDate.todayNY(at), 1), "00:00")
    }

    /// Every instant after `at` today when the picture changes: each block start and end, then midnight.
    public func boundaries(after at: Date) -> [Date] {
        var out: [Date] = []
        let day = LIDate.todayNY(at)
        for b in blocks ?? [] {
            let start = LIDate.nyInstant(day, b.start)
            let end = start.addingTimeInterval(Double(LIDate.durationMinutes(b.start, b.end)) * 60.0)
            if start > at { out.append(start) }
            if end > at { out.append(end) }
        }
        let midnight = WidgetSnapshot.nextMidnight(after: at)
        out = out.filter { $0 < midnight }
        out.append(midnight)
        return Array(Set(out)).sorted()
    }
}
