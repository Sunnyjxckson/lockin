import SwiftUI
import WidgetKit
import LockInKit

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: Date(), snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snapshot: WidgetSnapshot.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let entry = SnapshotEntry(date: Date(), snapshot: WidgetSnapshot.load())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(900))))
    }
}

struct TodayWidgetView: View {
    let entry: SnapshotEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Lock In").font(.caption)
            if let s = entry.snapshot {
                Text("\(s.done) of \(s.total)").font(.title2)
            } else {
                Text("Open the app").font(.footnote)
            }
        }
        .containerBackground(.black, for: .widget)
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LockInToday", provider: SnapshotProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("How many items are done today.")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct LockInWidgetBundle: WidgetBundle {
    var body: some Widget { TodayWidget() }
}
