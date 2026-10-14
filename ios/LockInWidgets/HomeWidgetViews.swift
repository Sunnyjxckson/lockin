import SwiftUI
import WidgetKit
import AppIntents
import LockInKit

struct OpenAppHint: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            WLabel("Lock In")
            Text("Open the app once").font(W.medium(17)).foregroundColor(W.ink)
            Text("Your day shows here.").font(W.regular(12)).foregroundColor(W.ink2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: small

struct SmallWidgetView: View {
    let model: DayModel

    var body: some View {
        if !model.hasData {
            OpenAppHint()
        } else {
            VStack(alignment: .leading, spacing: 0) {
                WLabel(model.label, color: W.accent)
                Spacer(minLength: 6)
                WRing(percent: model.percent, size: 82, stroke: 6, numberSize: 28)
                Spacer(minLength: 6)
                Text(model.total > 0 ? "\(model.done) of \(model.total) done" : "Nothing on the list")
                    .font(W.regular(12))
                    .foregroundColor(W.ink2)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

// MARK: medium

struct MediumWidgetView: View {
    let model: DayModel

    var body: some View {
        if !model.hasData {
            OpenAppHint()
        } else {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 6) {
                        if model.now != nil { Circle().fill(W.accent).frame(width: 5, height: 5) }
                        WLabel(model.now != nil ? "Now" : "Next", color: W.accent)
                    }
                    Spacer(minLength: 4)
                    if let now = model.now {
                        Text(now.name).font(W.medium(21)).tracking(-0.4).foregroundColor(W.ink).lineLimit(2).minimumScaleFactor(0.8)
                        Text("\(LIDate.formatDuration(WidgetSnapshot.minutesLeft(now, at: model.at))) left").font(W.regular(12)).foregroundColor(W.ink2)
                        WBar(value: WidgetSnapshot.progress(now, at: model.at)).padding(.top, 6)
                    } else if let next = model.next {
                        Text(next.name).font(W.medium(21)).tracking(-0.4).foregroundColor(W.ink).lineLimit(2).minimumScaleFactor(0.8)
                        Text("at \(LIDate.formatTime(next.start))").font(W.regular(12)).foregroundColor(W.ink2)
                    } else {
                        Text("Nothing scheduled").font(W.medium(19)).foregroundColor(W.ink).lineLimit(2)
                    }
                    Spacer(minLength: 4)
                    if model.now != nil, let line = model.nextLine {
                        Text("Next, \(line)").font(W.regular(11)).foregroundColor(W.ink2).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

                Rectangle().fill(W.hair).frame(width: 1)

                VStack(alignment: .leading, spacing: 0) {
                    WLabel(model.label)
                    Spacer(minLength: 4)
                    WRing(percent: model.percent, size: 64, stroke: 5, numberSize: 22)
                    Spacer(minLength: 4)
                    if model.moneyFloor > 0 {
                        HStack(alignment: .firstTextBaseline, spacing: 3) {
                            Text(wMoney(model.moneyToday)).font(W.medium(15)).foregroundColor(model.moneyToday >= model.moneyFloor ? W.accent : W.ink)
                            Text("of \(wMoney(model.moneyFloor))").font(W.regular(11)).foregroundColor(W.ink2)
                        }
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    } else {
                        Text("\(model.done) of \(model.total)").font(W.regular(11)).foregroundColor(W.ink2)
                    }
                }
                .frame(width: 96, alignment: .leading)
            }
        }
    }
}

// MARK: large

struct LargeWidgetView: View {
    let model: DayModel
    private let maxRows = 8

    var body: some View {
        if !model.hasData {
            OpenAppHint()
        } else {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    WLabel(model.label, color: W.accent)
                    Spacer()
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text("\(model.percent)").font(W.medium(26)).tracking(-0.7).foregroundColor(W.ink)
                        Text("%").font(W.medium(11)).foregroundColor(W.ink2)
                    }
                }
                WBar(value: Double(model.percent) / 100.0)
                if model.items.isEmpty {
                    Spacer()
                    Text("Nothing on the checklist").font(W.medium(15)).foregroundColor(W.ink2).frame(maxWidth: .infinity)
                    Spacer()
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(model.items.prefix(maxRows).enumerated()), id: \.element.id) { _, item in
                            row(item)
                        }
                    }
                    if model.items.count > maxRows {
                        Text("\(model.items.count - maxRows) more in the app").font(W.regular(11)).foregroundColor(W.ink2)
                    }
                    Spacer(minLength: 0)
                }
                footer
            }
        }
    }

    @ViewBuilder
    private func row(_ item: WidgetItem) -> some View {
        let content = HStack(spacing: 12) {
            WTick(done: item.done, size: 22)
            Text(item.name)
                .font(W.regular(15))
                .foregroundColor(item.done ? W.ink2 : W.ink)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .frame(height: 33)
        .contentShape(Rectangle())
        if item.type == "yesno" {
            Button(intent: ToggleItemIntent(itemId: item.id)) { content }
                .buttonStyle(.plain)
        } else {
            content
        }
    }

    @ViewBuilder
    private var footer: some View {
        HStack {
            if let now = model.now {
                Text("Now, \(now.name)").font(W.regular(11)).foregroundColor(W.ink2).lineLimit(1)
            } else if let line = model.nextLine {
                Text("Next, \(line)").font(W.regular(11)).foregroundColor(W.ink2).lineLimit(1)
            }
            Spacer(minLength: 8)
            if model.moneyFloor > 0 {
                Text("\(wMoney(model.moneyToday)) of \(wMoney(model.moneyFloor))")
                    .font(W.medium(11))
                    .foregroundColor(model.moneyToday >= model.moneyFloor ? W.accent : W.ink2)
            }
        }
    }
}

// MARK: widget

struct HomeWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let model = DayModel(entry.snapshot, at: entry.date)
        Group {
            switch family {
            case .systemMedium: MediumWidgetView(model: model)
            case .systemLarge: LargeWidgetView(model: model)
            default: SmallWidgetView(model: model)
            }
        }
        .containerBackground(for: .widget) { WidgetBackdrop() }
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LockInToday", provider: SnapshotProvider()) { entry in
            HomeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Your day: percent done, what is on now, and the checklist.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
