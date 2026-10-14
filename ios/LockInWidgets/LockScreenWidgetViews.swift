import SwiftUI
import WidgetKit
import LockInKit

struct LockScreenEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let model = DayModel(entry.snapshot, at: entry.date)
        Group {
            switch family {
            case .accessoryRectangular: rectangular(model)
            case .accessoryInline: inline(model)
            default: circular(model)
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }

    private func circular(_ m: DayModel) -> some View {
        Gauge(value: Double(m.percent), in: 0...100) {
            Text("Done")
        } currentValueLabel: {
            Text(m.hasData ? "\(m.percent)" : "-")
                .font(W.medium(17))
        }
        .gaugeStyle(.accessoryCircularCapacity)
    }

    private func rectangular(_ m: DayModel) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            if !m.hasData {
                Text("Lock In").font(W.medium(13))
                Text("Open the app once").font(W.regular(12))
            } else if let next = m.next {
                Text(m.now != nil ? "Next" : "Up next").font(W.medium(10)).tracking(1.0).textCase(.uppercase).foregroundColor(.secondary)
                Text(next.name).font(W.medium(15)).lineLimit(1).widgetAccentable()
                Text(LIDate.formatTime(next.start) + (m.now == nil ? ", in \(LIDate.formatDuration(max(0, LIDate.minutesOf(next.start) - LIDate.minutesOf(LIDate.timeNY(m.at)))))" : "")).font(W.regular(12)).lineLimit(1)
            } else if let now = m.now {
                Text("Now").font(W.medium(10)).tracking(1.0).textCase(.uppercase).foregroundColor(.secondary)
                Text(now.name).font(W.medium(15)).lineLimit(1).widgetAccentable()
                Text("Until \(LIDate.formatTime(now.end))").font(W.regular(12)).lineLimit(1)
            } else {
                Text(m.label).font(W.medium(10)).tracking(1.0).textCase(.uppercase).foregroundColor(.secondary)
                Text("Nothing more today").font(W.medium(15)).lineLimit(1)
                Text("\(m.percent)% done").font(W.regular(12))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func inline(_ m: DayModel) -> some View {
        if !m.hasData { return Text("Lock In") }
        return Text("\(m.label), \(m.percent)%")
    }
}

struct LockScreenWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LockInLockScreen", provider: SnapshotProvider()) { entry in
            LockScreenEntryView(entry: entry)
        }
        .configurationDisplayName("Lock Screen")
        .description("Percent done, the next block, or Day X of 30.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
