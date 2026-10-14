import SwiftUI
import LockInKit

private let recordWeekdayHeads = ["M", "T", "W", "T", "F", "S", "S"]

private func kindLabel(_ kind: ProgressCellKind) -> String {
    switch kind {
    case .full: return "locked in"
    case .partial: return "partial"
    case .missed: return "missed"
    case .open: return "nothing checked yet"
    case .future: return "not here yet"
    case .before: return "before your history starts"
    }
}

/// One day as a square tile. `dated` cells belong to the ongoing view and are named by their date, not a day count.
struct RecordDayCell: View {
    @Environment(\.liTheme) private var theme
    let cell: ProgressCell
    var dated: Bool = false
    let onOpen: (ProgressCell) -> Void

    private var future: Bool { return cell.kind == .future || cell.kind == .before }

    var body: some View {
        Button {
            LIHaptics.tap()
            onOpen(cell)
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(fill)
                Text("\(cell.day)")
                    .liType(.body)
                    .foregroundColor(textColor)
                if cell.kind == .partial {
                    Capsule().fill(theme.hair)
                        .frame(width: 16, height: 2)
                        .overlay(alignment: .leading) {
                            Capsule().fill(theme.gradient).frame(width: 16 * CGFloat(max(20, cell.percent)) / 100, height: 2)
                        }
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 7)
                } else if cell.kind == .missed {
                    Circle().fill(theme.danger).frame(width: 4, height: 4)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 6)
                }
            }
            .overlay {
                if cell.isToday {
                    RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(theme.ink, lineWidth: 1.5).padding(-3)
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .frame(minHeight: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(LIPressStyle())
        .disabled(future)
        .accessibilityLabel(label)
    }

    private var fill: AnyShapeStyle {
        switch cell.kind {
        case .full: return AnyShapeStyle(theme.gradient)
        case .partial, .open, .missed: return AnyShapeStyle(theme.tile)
        case .future, .before: return AnyShapeStyle(Color.clear)
        }
    }

    private var textColor: Color {
        switch cell.kind {
        case .full: return theme.accentInk
        case .partial, .open: return theme.ink
        case .missed: return theme.ink2
        case .future, .before: return theme.ink3
        }
    }

    private var label: String {
        var text = dated ? "" : "Day \(cell.day), "
        text += "\(LIDate.formatDateLong(cell.date)), \(cell.isToday ? "today, " : "")\(kindLabel(cell.kind))"
        if !future { text += ", \(cell.done) of \(cell.total) done" }
        return text
    }
}

struct RecordWeekdayHeads: View {
    @Environment(\.liTheme) private var theme
    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<7, id: \.self) { i in
                Text(recordWeekdayHeads[i]).liType(.label).foregroundColor(theme.ink2).frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }
}

struct RecordLegend: View {
    @Environment(\.liTheme) private var theme
    var body: some View {
        HStack(spacing: 16) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 4, style: .continuous).fill(theme.gradient).frame(width: 10, height: 10)
                Text("Full")
            }
            HStack(spacing: 6) {
                Capsule().fill(theme.gradient).frame(width: 12, height: 2)
                Text("Partial")
            }
            HStack(spacing: 6) {
                Circle().fill(theme.danger).frame(width: 4, height: 4)
                Text("Missed")
            }
        }
        .liType(.caption)
        .foregroundColor(theme.ink2)
        .accessibilityHidden(true)
    }
}

/// A run of day cells laid out seven across, with `lead` blank cells first.
struct RecordCellGrid: View {
    let cells: [ProgressCell]
    let lead: Int
    var dated: Bool = false
    let onOpen: (ProgressCell) -> Void

    var body: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)
        LazyVGrid(columns: cols, spacing: 6) {
            ForEach(0..<lead, id: \.self) { _ in
                Color.clear.frame(height: 1)
            }
            ForEach(cells, id: \.date) { cell in
                RecordDayCell(cell: cell, dated: dated, onOpen: onOpen)
            }
        }
    }
}

/// The days of a challenge as a calendar of tiles, straight on the page.
struct RecordGrid: View {
    let grid: ProgressGrid
    let onOpen: (ProgressCell) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            RecordWeekdayHeads()
            RecordCellGrid(cells: grid.cells, lead: grid.lead, onOpen: onOpen)
            RecordLegend().padding(.top, 4).padding(.horizontal, 4)
        }
    }
}

// MARK: streaks and rates

struct RecordStreakRow: View {
    @Environment(\.liTheme) private var theme
    let row: StreakRow
    let rate: ItemRate?

    private var note: (text: String, color: Color) {
        switch row.health {
        case .broken: return ("Lost a run of \(ProgressRules.countLabel(row.best, row.unit))", theme.warn)
        case .cold: return ("Not started", theme.ink2)
        case .behind: return ("Best \(row.best)", theme.ink2)
        case .best: return ("Best run yet", theme.accent)
        }
    }

    private var rateText: String {
        guard let r = rate else { return "" }
        if r.rate == nil { return ", due this week" }
        return ", \(r.done) of \(r.total)\(r.unit == .week ? " wk" : "")"
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(row.item.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                        if row.item.category == .vice {
                            Text("Vice").liType(.label).foregroundColor(theme.ink2)
                        }
                    }
                    (Text(note.text).foregroundColor(note.color) + Text(rateText).foregroundColor(theme.ink2))
                        .liType(.caption)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(row.current)").liType(.value).foregroundColor(row.current == 0 ? theme.ink2 : theme.ink)
                    Text(row.unit == .week ? "wk" : (row.current == 1 ? "day" : "days")).liType(.caption).foregroundColor(theme.ink2)
                }
            }
            .frame(minHeight: 60)
            LIProgressBar(value: rate?.rate ?? 0, height: 2)
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
    }
}

struct RecordRates: View {
    @Environment(\.liTheme) private var theme
    let rows: [ItemRate]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(rows, id: \.item.id) { r in
                VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.item.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                            Text((r.rate == nil ? "Due this week" : "\(r.done) of \(r.total)\(r.unit == .week ? " wk" : "")") + (r.current ? "" : ", removed"))
                                .liType(.caption).foregroundColor(theme.ink2)
                        }
                        Spacer(minLength: 8)
                        if let rate = r.rate {
                            HStack(alignment: .firstTextBaseline, spacing: 2) {
                                Text("\(Int((rate * 100).rounded()))").liType(.value).foregroundColor(theme.ink)
                                Text("%").liType(.caption).foregroundColor(theme.ink2)
                            }
                        }
                    }
                    .frame(minHeight: 52)
                    LIProgressBar(value: r.rate ?? 0, height: 2)
                }
                .padding(.horizontal, 4)
            }
        }
    }
}

// MARK: weeks and months

/// The once a week items under a week.
struct RecordWeeklyItems: View {
    @Environment(\.liTheme) private var theme
    let rows: [WeeklyResult]
    let past: Bool

    var body: some View {
        if !rows.isEmpty {
            VStack(spacing: 8) {
                ForEach(rows, id: \.item.id) { r in
                    HStack(spacing: 10) {
                        LICheckmark(checked: r.done, size: 18)
                        Text(r.item.name).liType(.sub).foregroundColor(theme.ink).lineLimit(1)
                        Spacer(minLength: 8)
                        Text(r.done && r.doneOn != nil ? LIDate.formatDateShort(r.doneOn ?? "") : (past ? "Missed" : "By Sunday"))
                            .liType(.caption)
                            .foregroundColor(r.done ? theme.accent : (past ? theme.danger : theme.ink2))
                    }
                }
            }
            .padding(.top, 12)
            .padding(.horizontal, 4)
        }
    }
}

struct RecordWeekRow: View {
    @Environment(\.liTheme) private var theme
    let week: WeekRollup
    let grid: ProgressGrid

    var body: some View {
        let cells = grid.cells.filter { $0.date >= week.from && $0.date <= week.to }
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("Week \(week.index)").liType(.h2).foregroundColor(theme.ink)
                        if week.state == .current { Text("Now").liType(.label).foregroundColor(theme.accent) }
                    }
                    Text("\(LIDate.formatDateShort(week.from)) to \(LIDate.formatDateShort(week.to))")
                        .liType(.caption).foregroundColor(theme.ink2)
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(week.percent ?? 0)").liType(.stat).foregroundColor(theme.ink)
                    Text("%").liType(.caption).foregroundColor(theme.ink2)
                }
            }
            HStack(spacing: 4) {
                ForEach(cells, id: \.date) { c in
                    Capsule().fill(color(c.kind)).frame(height: 3)
                }
            }
            .padding(.top, 12)
            .accessibilityHidden(true)
            RecordWeeklyItems(rows: week.weekly, past: week.state == .past)
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Week \(week.index), \(week.full) full, \(week.partial) partial, \(week.missed) missed")
    }

    private func color(_ kind: ProgressCellKind) -> AnyShapeStyle {
        switch kind {
        case .full: return AnyShapeStyle(theme.gradient)
        case .partial: return AnyShapeStyle(theme.ink3)
        case .missed: return AnyShapeStyle(theme.danger)
        case .open, .future, .before: return AnyShapeStyle(theme.hair)
        }
    }
}

struct RecordOngoingWeek: View {
    @Environment(\.liTheme) private var theme
    let week: OngoingWeek
    let onOpen: (ProgressCell) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(week.label).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                    if week.isCurrent { Text("Now").liType(.label).foregroundColor(theme.accent) }
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("\(week.tally.full)").liType(.value).foregroundColor(week.tally.percent == 100 ? theme.accent : theme.ink)
                    Text("/\(week.tally.days)").liType(.caption).foregroundColor(theme.ink2)
                }
            }
            .padding(.horizontal, 4)
            RecordCellGrid(cells: week.cells, lead: 0, dated: true, onOpen: onOpen)
            RecordWeeklyItems(rows: week.weekly, past: !week.isCurrent)
        }
    }
}

struct RecordOngoingMonth: View {
    @Environment(\.liTheme) private var theme
    let month: OngoingMonth
    let onOpen: (ProgressCell) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(month.label).liType(.h2).foregroundColor(theme.ink)
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("\(month.tally.full)").liType(.value).foregroundColor(month.tally.percent == 100 ? theme.accent : theme.ink)
                    Text("/\(month.tally.days)").liType(.caption).foregroundColor(theme.ink2)
                }
            }
            .padding(.horizontal, 4)
            RecordWeekdayHeads()
            RecordCellGrid(cells: month.cells, lead: month.lead, dated: true, onOpen: onOpen)
        }
    }
}

// MARK: day sheet

private func formatValue(_ n: Double, _ unit: String?) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.maximumFractionDigits = 2
    f.locale = Locale(identifier: "en_US")
    let s = f.string(from: NSNumber(value: n)) ?? "\(n)"
    guard let unit = unit, !unit.isEmpty else { return s }
    if unit == "$" { return "$" + s }
    return unit.count <= 2 ? s + unit : s + " " + unit
}

private func resultDetail(_ r: ItemResult) -> String {
    let target = Targets.describeTarget(r.target, unit: r.item.unit)
    let value = r.log?.value
    var numeric = false
    var isText = false
    var isCheckBy = false
    switch r.target {
    case .min, .max, .range: numeric = true
    case .text: isText = true
    case .checkBy: isCheckBy = true
    case .check: break
    }
    if r.done {
        if numeric, let v = value { return formatValue(v, r.item.unit) }
        if isText, let t = r.log?.text { return t }
        return ""
    }
    if r.state == .off {
        if numeric, let v = value { return "Logged \(formatValue(v, r.item.unit)). Needed \(target)" }
        if isCheckBy { return "Checked after the cutoff" }
        if isText { return r.log?.checked == true ? "Checked with nothing written" : "Written but not checked" }
        return "Logged, did not count"
    }
    if numeric { return "Nothing logged. Needed \(target)" }
    return ""
}

/// What happened on one day: exactly which items were done and which were not.
struct RecordDaySheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let cell: ProgressCell
    let title: String?

    private var pending: Bool { return cell.isToday }

    private var statusLine: String {
        switch cell.kind {
        case .full: return "Locked in"
        case .partial: return "Partial"
        case .missed: return "Missed"
        default: return "Nothing checked yet"
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LIBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if let s = cell.summary {
                            summary(s)
                        } else {
                            Text("This day has not started yet.").liType(.sub).foregroundColor(theme.ink2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle(title ?? "Day \(cell.day)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
    }

    @ViewBuilder
    private func summary(_ s: DaySummary) -> some View {
        Text(LIDate.formatDateLong(cell.date)).liType(.sub).foregroundColor(theme.ink2)
        Text(pending ? "Today so far" : statusLine).liType(.label).foregroundColor(theme.ink2).padding(.top, 16)
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(s.done)").liType(.display).foregroundColor(theme.ink)
            Text("of \(s.total)").liType(.h2).foregroundColor(theme.ink2)
        }
        .padding(.top, 6)
        LIProgressBar(value: s.total > 0 ? Double(s.done) / Double(s.total) : 0).padding(.top, 14)
        if s.total == 0 {
            Text("No daily items were in the checklist on this day.").liType(.sub).foregroundColor(theme.ink2).padding(.top, 16)
        }
        group(pending ? "Still open" : "Not done", s.items.filter { !$0.done })
        group("Done", s.items.filter { $0.done })
    }

    @ViewBuilder
    private func group(_ title: String, _ rows: [ItemResult]) -> some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                LISectionLabel(title, trailing: "\(rows.count)")
                ForEach(rows, id: \.item.id) { r in
                    row(r)
                }
            }
            .padding(.top, 28)
        }
    }

    private func row(_ r: ItemResult) -> some View {
        let detail = resultDetail(r)
        return HStack(spacing: 12) {
            if r.done {
                LICheckmark(checked: true, size: 22)
            } else {
                Image(systemName: r.state == .off ? "minus.circle" : (pending ? "circle" : "xmark.circle"))
                    .font(.system(size: 20, weight: .regular))
                    .foregroundColor(r.state == .off ? theme.warn : (pending ? theme.ink3 : theme.danger))
                    .frame(width: 22, height: 22)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(r.item.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                if !detail.isEmpty { Text(detail).liType(.caption).foregroundColor(theme.ink2).lineLimit(2) }
            }
            Spacer(minLength: 8)
            Text(r.done ? "Done" : (r.state == .off ? "Off target" : (pending ? "Open" : "Missed")))
                .liType(.caption)
                .foregroundColor(r.done ? theme.accent : (r.state == .off ? theme.warn : (pending ? theme.ink2 : theme.danger)))
        }
        .frame(minHeight: 56)
    }
}

// MARK: weekly review

/// The latest Sunday review as a card. A real empty state before the first one exists.
struct RecordWeeklyReview: View {
    @Environment(\.liTheme) private var theme
    let note: CoachNote?
    let today: DateStr

    var body: some View {
        if let note = note {
            LICard(feature: true) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Week of \(LIDate.formatDateShort(LIDate.weekStart(note.date))) to \(LIDate.formatDateShort(note.date))")
                        .liType(.label).foregroundColor(theme.ink2)
                    ForEach(Array(lines(note.body).enumerated()), id: \.offset) { _, line in
                        Text(line).liType(.body).foregroundColor(theme.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    Text(note.source == .ai ? "Written by the coach" : "Written from your numbers")
                        .liType(.caption).foregroundColor(theme.ink2)
                }
            }
        } else {
            LICard {
                LIEmptyState(title: "First review lands \(LIDate.formatDateLong(LIDate.weekEnd(today)))", message: "What held, what slipped, one change.")
            }
        }
    }

    private func lines(_ body: String) -> [String] {
        return body.split(whereSeparator: { $0 == "\n" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }
}
