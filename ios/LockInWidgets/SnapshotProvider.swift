import SwiftUI
import WidgetKit
import LockInKit

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?

    init(date: Date, snapshot: WidgetSnapshot?) {
        self.date = date
        self.snapshot = snapshot
        W.apply(snapshot)
    }
}

/// What a widget shows at one instant, worked out from the snapshot the app wrote. A snapshot from an earlier day shows a fresh day
/// instead of yesterday's numbers.
struct DayModel {
    var hasData = false
    var label = "Lock In"
    var percent = 0
    var done = 0
    var total = 0
    var items: [WidgetItem] = []
    var now: WidgetBlock? = nil
    var next: WidgetBlock? = nil
    var moneyToday = 0.0
    var moneyFloor = 0.0
    var at = Date()
    var challenge = false

    init(_ snapshot: WidgetSnapshot?, at date: Date) {
        at = date
        W.apply(snapshot)
        guard let s = snapshot else { return }
        hasData = true
        let today = LIDate.todayNY(date)
        let current = s.isCurrent(at: date)
        let gap = current ? 0 : max(0, LIDate.diffDays(s.date.isEmpty ? today : s.date, today))
        if let n = s.dayNumber, let len = s.dayLength, len > 0 {
            challenge = true
            label = "Day \(min(len, n + gap)) of \(len)"
        } else {
            label = LIDate.formatDateShort(today)
        }
        total = s.total
        moneyFloor = s.moneyFloor
        if current {
            percent = s.percent
            done = s.done
            items = s.items
            moneyToday = s.moneyToday
            let nn = s.nowNext(at: date)
            now = nn.now
            next = nn.next
        } else {
            items = s.items.map { WidgetItem(id: $0.id, name: $0.name, done: false, type: $0.type) }
        }
    }

    var nextLine: String? {
        guard let b = next else { return nil }
        return "\(b.name), \(LIDate.formatTime(b.start))"
    }
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        return SnapshotEntry(date: Date(), snapshot: SnapshotProvider.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        let snap = WidgetSnapshot.load()
        completion(SnapshotEntry(date: Date(), snapshot: context.isPreview && snap == nil ? SnapshotProvider.sample : snap))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let snap = WidgetSnapshot.load()
        let start = Date()
        var dates: [Date] = [start]
        if let s = snap {
            let midnight = WidgetSnapshot.nextMidnight(after: start)
            // Every block boundary, plus a quarter hour tick so "42m left" stays honest.
            dates.append(contentsOf: s.boundaries(after: start))
            var t = start.addingTimeInterval(15 * 60)
            while t < midnight {
                dates.append(t)
                t = t.addingTimeInterval(15 * 60)
            }
            dates.append(midnight.addingTimeInterval(30))
        } else {
            dates.append(start.addingTimeInterval(30 * 60))
        }
        let unique = Array(Set(dates)).sorted().prefix(120)
        let entries = unique.map { SnapshotEntry(date: $0, snapshot: snap) }
        // Ask again after the last entry. The app also reloads every timeline whenever something changes.
        let last = entries.last?.date ?? start
        completion(Timeline(entries: entries, policy: .after(last.addingTimeInterval(60))))
    }

    static let sample = WidgetSnapshot(
        date: LIDate.todayNY(),
        dayNumber: 7,
        dayLength: 30,
        percent: 62,
        done: 5,
        total: 8,
        items: [
            WidgetItem(id: "1", name: "Wake early", done: true, type: "yesno"),
            WidgetItem(id: "2", name: "Workout", done: true, type: "yesno"),
            WidgetItem(id: "3", name: "Study", done: false, type: "yesno"),
        ],
        now: WidgetBlock(name: "Study", start: "14:00", end: "16:00", kind: "study"),
        next: WidgetBlock(name: "Delivery", start: "17:00", end: "20:00", kind: "delivery"),
        moneyToday: 64,
        moneyFloor: 100,
        moneyTotal: 400,
        moneyTarget: 1000,
        streak: 6,
        updatedAt: "",
        blocks: nil
    )
}
