import SwiftUI
import Charts
import LockInKit

struct BodyWeighInState: Identifiable {
    let id = UUID()
    let date: DateStr
}

struct BodyWeightTab: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme

    let model: BodyModel
    @Binding var toast: String?

    @State private var sheet: BodyWeighInState? = nil

    var body: some View {
        let window = model.window
        let logs = model.bodyLogs
        let series = BodyRules.weightSeries(logs, startDate: window.start, lengthDays: window.length)
        let trend = BodyRules.weightTrend(series)
        let history = Array(BodyRules.weightSeries(logs).reversed())
        let unit = model.weightUnit
        return VStack(alignment: .leading, spacing: 0) {
            if let trend = trend {
                hero(trend: trend, series: series, window: window, unit: unit)
                    .padding(.top, 22)
            } else if model.logsLoaded {
                emptyHero
                    .padding(.top, 26)
            } else {
                Color.clear.frame(height: 200)
            }
            weighInCard(logs: logs)
                .padding(.top, 22)
            photosSection(logs: logs, window: window, unit: unit)
                .padding(.top, 30)
            if !history.isEmpty {
                historySection(history: history, window: window, unit: unit)
                    .padding(.top, 30)
            }
        }
        .sheet(item: $sheet) { state in
            BodyWeighInSheet(
                model: model,
                initialDate: state.date,
                initialWeight: logs.first(where: { $0.date == state.date })?.weight,
                today: store.today,
                unit: unit,
                onClose: { message in
                    sheet = nil
                    if let message = message { toast = message }
                }
            )
            .liSheetStyle()
            .presentationDetents([.large])
        }
    }

    // MARK: hero and chart

    private func dayText(_ day: Int, window: BodyDayWindow, date: DateStr) -> String {
        return window.numbered ? "day \(day)" : LIDate.formatDateShort(date)
    }

    private func hero(trend: BodyWeightTrend, series: [BodyWeightPoint], window: BodyDayWindow, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LIBigNumber(
                BodyRules.fmt(trend.latest.weight, 1),
                unit: unit,
                label: "Latest, \(dayText(trend.latest.day, window: window, date: trend.latest.date))"
            )
            if series.count > 1 {
                HStack(spacing: 0) {
                    Text(BodyRules.signed(trend.change))
                        .foregroundColor(trend.direction == .down ? theme.accent : theme.ink)
                    Text(" \(unit) since \(dayText(trend.first.day, window: window, date: trend.first.date))\(perWeekText(trend))")
                        .foregroundColor(theme.ink2)
                }
                .liType(.sub)
            } else {
                Text("One weigh-in so far. The line starts with the next.")
                    .liType(.sub)
                    .foregroundColor(theme.ink2)
            }
            BodyWeightChart(
                series: series,
                length: window.length,
                todayDay: LIDate.dayNumber(window.start, store.today),
                startDate: window.start,
                numbered: window.numbered
            )
            .padding(.top, 6)
        }
    }

    private func perWeekText(_ trend: BodyWeightTrend) -> String {
        if let w = trend.perWeek { return ". \(BodyRules.signed(w)) a week." }
        return "."
    }

    private var emptyHero: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Weight").liType(.label).foregroundColor(theme.ink2)
            Text("No weigh-ins yet").liType(.greeting).foregroundColor(theme.ink)
            Text("Step on the scale \(BodyRules.dayName(model.weeklyDay)) morning. The line builds from there.")
                .liType(.sub)
                .foregroundColor(theme.ink2)
        }
    }

    // MARK: weigh-in card

    private func weighInCard(logs: [BodyLog]) -> some View {
        let today = store.today
        let weekStart = LIDate.weekStart(today)
        let weighDay = model.weeklyDay
        let dueDate = BodyRules.weighInDateFor(weekStart, weeklyDay: weighDay)
        let done = logs.contains { $0.weight != nil && $0.date >= weekStart && $0.date <= today }
        let due: String
        let dueLine: String
        if done {
            due = "Done"
            dueLine = "This week's weigh-in is in."
        } else if dueDate == today {
            due = "This morning"
            dueLine = "Before you eat."
        } else if dueDate > today {
            due = BodyRules.dayName(weighDay)
            dueLine = LIDate.formatDateLong(dueDate)
        } else {
            due = "Still open"
            dueLine = "\(BodyRules.dayName(weighDay))'s is open. Log it today."
        }
        return LICard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Weigh-in").liType(.label).foregroundColor(theme.ink2)
                        HStack(spacing: 8) {
                            if done {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(theme.accent)
                            }
                            Text(due)
                                .liType(.h1)
                                .foregroundColor(done ? theme.accent : theme.ink)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 8)
                    MBCircleButton(systemName: "plus", filled: true, label: "Log weight") {
                        sheet = BodyWeighInState(date: today)
                    }
                }
                Text(dueLine).liType(.sub).foregroundColor(theme.ink2)
            }
        }
    }

    // MARK: photos

    private func photosSection(logs: [BodyLog], window: BodyDayWindow, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LISectionLabel("Progress photos")
            BodyPhotoCompare(
                logs: logs,
                startDate: window.numbered ? window.start : nil,
                unit: unit,
                onAdd: { sheet = BodyWeighInState(date: store.today) }
            )
        }
    }

    // MARK: history

    private func historySection(history: [BodyWeightPoint], window: BodyDayWindow, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Weigh-ins", trailing: String(history.count))
            MBList {
                ForEach(0..<history.count, id: \.self) { i in
                    let p = history[i]
                    if i > 0 { LIHairline() }
                    MBRow(
                        title: LIDate.formatDateLong(p.date),
                        sub: historySub(history: history, index: i, window: window, unit: unit),
                        value: BodyRules.fmt(p.weight, 1),
                        action: { sheet = BodyWeighInState(date: p.date) }
                    )
                }
            }
        }
    }

    private func historySub(history: [BodyWeightPoint], index i: Int, window: BodyDayWindow, unit: String) -> String {
        let p = history[i]
        var parts: [String] = []
        let n = LIDate.dayNumber(window.start, p.date)
        if window.numbered && n >= 1 && n <= window.length { parts.append("Day \(n)") }
        if i + 1 < history.count {
            let delta = ((p.weight - history[i + 1].weight) * 10).rounded() / 10
            parts.append("\(BodyRules.signed(delta)) \(unit)")
        }
        return parts.joined(separator: ", ")
    }
}

/// Weigh-ins over a run of days, as one thin line. x is day 1 to the last day.
struct BodyWeightChart: View {
    @Environment(\.liTheme) private var theme

    let series: [BodyWeightPoint]
    let length: Int
    let todayDay: Int?
    let startDate: DateStr
    let numbered: Bool

    private func xLabel(_ day: Int) -> String {
        if numbered { return "Day \(day)" }
        return LIDate.formatDateShort(LIDate.addDays(startDate, day - 1))
    }

    var body: some View {
        let last = Swift.max(2, length)
        let domain = BodyRules.weightDomain(series)
        let mid = (last + 1) / 2
        let yMid = (domain.lo + domain.hi) / 2
        return Chart {
            if let t = todayDay, t >= 1, t <= last {
                RuleMark(x: .value("Today", t))
                    .foregroundStyle(theme.hair)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 4]))
            }
            ForEach(series, id: \.date) { p in
                LineMark(x: .value("Day", p.day), y: .value("Weight", p.weight))
                    .foregroundStyle(theme.accent)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.monotone)
                PointMark(x: .value("Day", p.day), y: .value("Weight", p.weight))
                    .foregroundStyle(theme.accent)
                    .symbolSize(40)
            }
        }
        .chartXScale(domain: 1...last)
        .chartYScale(domain: domain.lo...domain.hi)
        .chartXAxis {
            AxisMarks(values: [1, mid, last]) { value in
                AxisValueLabel {
                    if let d = value.as(Int.self) {
                        Text(xLabel(d)).liType(.caption).foregroundColor(theme.ink3)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: [domain.lo, yMid, domain.hi]) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 1))
                    .foregroundStyle(theme.hair)
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text(BodyRules.fmt(v, 1)).liType(.caption).foregroundColor(theme.ink3)
                    }
                }
            }
        }
        .frame(height: 190)
        .accessibilityLabel("Weight over time")
    }
}

// MARK: progress photo compare

struct BodyPhotoCompare: View {
    @Environment(\.liTheme) private var theme

    let logs: [BodyLog]
    let startDate: DateStr?
    let unit: String
    let onAdd: () -> Void

    @State private var beforeDate: DateStr? = nil
    @State private var afterDate: DateStr? = nil
    @State private var picking: BodyPhotoSide? = nil

    var body: some View {
        let all = BodyRules.photoEntries(logs)
        let auto = BodyRules.pickComparePhotos(logs, startDate: startDate)
        let before = all.first(where: { $0.date == beforeDate }) ?? auto.before
        let after = all.first(where: { $0.date == afterDate }) ?? auto.after
        return VStack(alignment: .leading, spacing: 12) {
            if all.isEmpty {
                LICard {
                    LIEmptyState(
                        title: "No progress photos yet",
                        message: "One now, one each Friday. Same spot, same light.",
                        actionTitle: "Add the first photo",
                        action: onAdd
                    )
                }
            } else {
                HStack(alignment: .top, spacing: 10) {
                    side("Start", entry: before, which: .before, empty: "")
                    side("Latest", entry: after, which: .after, empty: "Add another to compare.")
                }
                if let b = before, let a = after, b.date != a.date, let bw = b.weight, let aw = a.weight {
                    let change = ((aw - bw) * 10).rounded() / 10
                    HStack(spacing: 8) {
                        Text(change == 0 ? "0" : BodyRules.signed(change))
                            .liType(.stat)
                            .foregroundColor(change < 0 ? theme.accent : theme.ink)
                        Text("\(unit) between these two").liType(.sub).foregroundColor(theme.ink2)
                    }
                    .padding(.horizontal, 4)
                }
            }
        }
        .sheet(item: $picking) { which in
            pickerSheet(which: which, all: all, current: which == .before ? before : after)
                .liSheetStyle()
        }
    }

    private func label(_ entry: BodyPhotoEntry) -> String {
        if let s = startDate {
            let n = LIDate.dayNumber(s, entry.date)
            if n >= 1 { return "Day \(n)" }
        }
        return LIDate.formatDateShort(entry.date)
    }

    private func side(_ title: String, entry: BodyPhotoEntry?, which: BodyPhotoSide, empty: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let entry = entry {
                Button(action: {
                    LIHaptics.tap()
                    picking = which
                }) {
                    VStack(alignment: .leading, spacing: 10) {
                        photoFrame(entry)
                        caption(title, entry: entry)
                    }
                }
                .buttonStyle(LIPressStyle())
                .accessibilityLabel("\(title) photo, \(label(entry)). Pick another")
            } else {
                photoFrame(nil)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).liType(.label).foregroundColor(theme.ink2)
                    if !empty.isEmpty {
                        Text(empty).liType(.caption).foregroundColor(theme.ink2)
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func photoFrame(_ entry: BodyPhotoEntry?) -> some View {
        Group {
            if let entry = entry {
                MBRemoteImage(ref: entry.photoUrl)
            } else {
                ZStack {
                    LITileSurface(radius: 20)
                    Image(systemName: "camera")
                        .font(.system(size: 20, weight: .regular))
                        .foregroundColor(theme.ink3)
                }
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func caption(_ title: String, entry: BodyPhotoEntry) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).liType(.label).foregroundColor(theme.ink2)
            Text(entry.weight != nil ? "\(BodyRules.fmt(entry.weight ?? 0, 1)) \(unit)" : label(entry))
                .liType(.value)
                .foregroundColor(theme.ink)
                .lineLimit(1)
            Text(entry.weight != nil && startDate != nil ? "\(label(entry)), \(LIDate.formatDateShort(entry.date))" : LIDate.formatDateShort(entry.date))
                .liType(.caption)
                .foregroundColor(theme.ink2)
                .lineLimit(1)
        }
        .padding(.horizontal, 4)
    }

    private func pickerSheet(which: BodyPhotoSide, all: [BodyPhotoEntry], current: BodyPhotoEntry?) -> some View {
        let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
        return VStack(alignment: .leading, spacing: 14) {
            Text(which == .before ? "Pick the start photo" : "Pick the photo to compare")
                .liType(.title)
                .foregroundColor(theme.ink)
                .padding(.top, 28)
            ScrollView {
                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(all) { p in
                        Button(action: {
                            LIHaptics.tap()
                            if which == .before { beforeDate = p.date } else { afterDate = p.date }
                            picking = nil
                        }) {
                            VStack(alignment: .leading, spacing: 6) {
                                MBRemoteImage(ref: p.photoUrl)
                                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
                                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .strokeBorder(current?.date == p.date ? theme.ink : Color.clear, lineWidth: 2)
                                    )
                                Text(label(p)).liType(.sub).foregroundColor(theme.ink)
                                Text(LIDate.formatDateShort(p.date)).liType(.caption).foregroundColor(theme.ink2)
                            }
                        }
                        .buttonStyle(LIPressStyle())
                    }
                }
                .padding(.bottom, 20)
            }
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(theme.surface.ignoresSafeArea())
    }
}

enum BodyPhotoSide: String, Identifiable {
    case before
    case after
    var id: String { return rawValue }
}
