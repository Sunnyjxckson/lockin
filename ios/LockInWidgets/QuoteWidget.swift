import SwiftUI
import WidgetKit
import LockInKit

/// Today's morning quote: the writer and the line, on the lock screen and the home screen. A tap opens it in the Library reader.

/// Entries at now and at each coming midnight (New York), so the quote changes with the day without the app running.
struct QuoteProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        return SnapshotEntry(date: Date(), snapshot: QuoteProvider.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        let snap = WidgetSnapshot.load()
        completion(SnapshotEntry(date: Date(), snapshot: context.isPreview && snap?.quotes == nil ? QuoteProvider.sample : snap))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let snap = WidgetSnapshot.load()
        let start = Date()
        var dates: [Date] = [start]
        var t = start
        for _ in 0..<3 {
            t = WidgetSnapshot.nextMidnight(after: t)
            dates.append(t.addingTimeInterval(30))
        }
        let entries = dates.map { SnapshotEntry(date: $0, snapshot: snap) }
        // Ask again after the last entry. The app also reloads every timeline whenever something changes.
        let last = entries.last?.date ?? start
        completion(Timeline(entries: entries, policy: .after(last.addingTimeInterval(60))))
    }

    static var sample: WidgetSnapshot {
        let today = LIDate.todayNY()
        let quote = WidgetQuote(
            date: today,
            id: "sample",
            writer: "Marcus Aurelius",
            text: "You have power over your mind, not outside events. Realize this, and you will find strength.",
            url: "/library/read"
        )
        return WidgetSnapshot(date: today, quotes: [quote])
    }
}

/// What a quote widget shows at one instant.
struct QuoteModel {
    var quote: WidgetQuote?

    init(_ snapshot: WidgetSnapshot?, at date: Date) {
        W.apply(snapshot)
        quote = snapshot?.quote(at: date)
    }

    var writer: String { return quote?.writer ?? "Lock In" }

    /// The quote cut at a word to about `max` characters, so it never runs off the widget.
    func text(max: Int) -> String {
        guard let q = quote else { return "Open the app once" }
        return Drops.trimForNotification(q.text, max: max)
    }
}

struct QuoteEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let model = QuoteModel(entry.snapshot, at: entry.date)
        Group {
            switch family {
            case .accessoryRectangular:
                rectangular(model)
                    .containerBackground(for: .widget) { Color.clear }
            case .systemMedium:
                medium(model)
                    .containerBackground(for: .widget) { WidgetBackdrop() }
            default:
                small(model)
                    .containerBackground(for: .widget) { WidgetBackdrop() }
            }
        }
        .widgetURL(model.quote?.deepLink)
    }

    private func rectangular(_ m: QuoteModel) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(m.writer)
                .font(W.medium(10))
                .tracking(1.0)
                .textCase(.uppercase)
                .foregroundColor(.secondary)
                .lineLimit(1)
            Text(m.text(max: 100))
                .font(W.regular(12))
                .lineLimit(3)
                .minimumScaleFactor(0.85)
                .widgetAccentable()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func small(_ m: QuoteModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WLabel(m.writer, color: W.accent)
            Spacer(minLength: 6)
            Text(m.text(max: 120))
                .font(W.medium(14))
                .tracking(-0.2)
                .foregroundColor(W.ink)
                .lineLimit(6)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func medium(_ m: QuoteModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WLabel(m.writer, color: W.accent)
            Spacer(minLength: 8)
            Text(m.text(max: 170))
                .font(W.medium(19))
                .tracking(-0.4)
                .foregroundColor(W.ink)
                .lineLimit(4)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct QuoteWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LockInQuote", provider: QuoteProvider()) { entry in
            QuoteEntryView(entry: entry)
        }
        .configurationDisplayName("Quote")
        .description("The morning quote, from the Library.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
