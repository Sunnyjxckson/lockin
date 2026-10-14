import SwiftUI
import LockInKit

/// What a checklist row shows, whichever cadence it came from.
struct RowModel: Identifiable {
    var item: ChecklistItem
    var target: Target
    var log: DayLog?
    var state: ItemState
    /// False when the item was done on another day of the week and should not be edited from here.
    var editable: Bool = true
    var sub: String? = nil

    var id: String { return item.id }
    var done: Bool { return state == .done }
}

/// Today's daily items: tap to complete, type numbers and text inline.
struct ChecklistSection: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme

    private var rows: [RowModel] {
        guard let summary = store.summary else { return [] }
        return Tracks.orderByTrack(summary.items).map { r in
            RowModel(item: r.item, target: r.target, log: r.log, state: r.state)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Today", trailing: countLabel)
            LIProgressBar(value: Double(store.summary?.percent ?? 0) / 100.0, height: 2)
            if rows.isEmpty {
                LICard {
                    LIEmptyState(title: "Nothing on the checklist", message: "Add the items you want to hold yourself to in the web app.")
                }
            } else {
                ChecklistCard(rows: rows)
            }
        }
    }

    private var countLabel: String? {
        guard let s = store.summary else { return nil }
        return "\(s.done) of \(s.total)"
    }
}

/// The weekly items, done on any day of the week.
struct WeeklySection: View {
    @Environment(AppStore.self) private var store

    private var rows: [RowModel] {
        guard let week = store.week else { return [] }
        return week.items.map { r in
            let elsewhere = r.done && r.doneOn != store.today
            var state: ItemState = .open
            if r.done {
                state = .done
            } else if let log = r.log, log.checked || log.value != nil {
                state = .off
            }
            var sub: String? = nil
            if r.done {
                sub = elsewhere ? "Done " + LIDate.formatDateShort(r.doneOn ?? store.today) : "Done this week"
            }
            return RowModel(item: r.item, target: r.target, log: r.log, state: state, editable: !elsewhere, sub: sub)
        }
    }

    var body: some View {
        if let week = store.week, !week.items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                LISectionLabel("This week", trailing: "\(week.done) of \(week.total)")
                ChecklistCard(rows: rows)
            }
            .padding(.top, 28)
        }
    }
}

struct ChecklistCard: View {
    @Environment(\.liTheme) private var theme
    let rows: [RowModel]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<rows.count, id: \.self) { i in
                if i > 0 {
                    LIHairline().padding(.leading, 18)
                }
                ItemRow(model: rows[i])
            }
        }
        .background(LITileSurface(radius: 24))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

/// One checklist row. Yes/no items are a single tap. Numbers and text have an inline field.
struct ItemRow: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: RowModel

    @State private var draft = ""
    @FocusState private var focused: Bool

    private var item: ChecklistItem { return model.item }

    private var subLine: String {
        if let s = model.sub { return s }
        if model.state == .off {
            switch model.target {
            case .checkBy: return "Checked late. Does not count."
            case .text: return "Needs a note and a tick."
            default: break
            }
            if (model.log?.slips ?? 0) > 0 { return "Slip logged" }
        }
        let hint = (item.hint ?? "").trimmingCharacters(in: .whitespaces)
        let target = Targets.describeTarget(model.target, unit: item.unit)
        if item.type == .number { return target }
        if case .checkBy = model.target { return target }
        return hint
    }

    private var streakLine: String {
        guard let s = store.streaks[item.id], s.current >= 2 else { return "" }
        return "\(s.current) in a row"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch item.type {
            case .yesno:
                LICheckRow(
                    title: item.name,
                    sub: join(subLine, streakLine),
                    checked: model.done,
                    off: model.state == .off,
                    enabled: model.editable,
                    onToggle: { store.setChecked(item, !(model.log?.checked ?? false)) }
                )
            case .number:
                LICheckRow(
                    title: item.name,
                    sub: join(subLine, streakLine),
                    checked: model.done,
                    off: model.state == .off,
                    enabled: model.editable,
                    onToggle: toggleNumber,
                    trailing: { numberField }
                )
            case .text:
                LICheckRow(
                    title: item.name,
                    sub: join(subLine, streakLine),
                    checked: model.done,
                    off: model.state == .off,
                    enabled: model.editable,
                    onToggle: { store.setChecked(item, !(model.log?.checked ?? false)) }
                )
                textField
            }
        }
        .onAppear { draft = externalText }
        .onChange(of: externalText) { _, new in
            if !focused { draft = new }
        }
        .onChange(of: focused) { _, isFocused in
            if !isFocused { commit() }
        }
    }

    private func join(_ a: String, _ b: String) -> String? {
        if a.isEmpty && b.isEmpty { return nil }
        if a.isEmpty { return b }
        if b.isEmpty { return a }
        return a + ". " + b
    }

    // MARK: number

    private var externalText: String {
        switch item.type {
        case .number:
            guard let v = model.log?.value else { return "" }
            return format(v)
        case .text:
            return model.log?.text ?? ""
        case .yesno:
            return ""
        }
    }

    private func format(_ v: Double) -> String {
        if v == v.rounded() { return String(Int(v)) }
        return String(format: "%.2f", v).replacingOccurrences(of: "0+$", with: "", options: .regularExpression)
    }

    private var unitLabel: String {
        let u = item.unit ?? ""
        return u
    }

    private var numberField: some View {
        HStack(spacing: 4) {
            if unitLabel == "$" {
                Text("$").liType(.sub).foregroundColor(theme.ink2)
            }
            TextField("0", text: $draft)
                .keyboardType(.decimalPad)
                .focused($focused)
                .multilineTextAlignment(.trailing)
                .liType(.value)
                .foregroundColor(model.state == .off ? theme.warn : theme.ink)
                .frame(width: 84)
                .disabled(!model.editable)
                .submitLabel(.done)
                .onSubmit { commit() }
            if !unitLabel.isEmpty && unitLabel != "$" {
                Text(unitLabel).liType(.sub).foregroundColor(theme.ink2)
            }
        }
        .padding(.trailing, 2)
    }

    private func toggleNumber() {
        if model.log?.value != nil {
            store.setValue(item, nil)
            draft = ""
        } else {
            focused = true
        }
    }

    // MARK: text

    private var textField: some View {
        TextField(item.hint ?? "What did you do", text: $draft, axis: .vertical)
            .focused($focused)
            .liType(.sub)
            .foregroundColor(theme.ink)
            .lineLimit(1...3)
            .submitLabel(.done)
            .onSubmit { commit() }
            .disabled(!model.editable)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(theme.tile))
            .padding(.horizontal, 18)
            .padding(.bottom, 14)
    }

    // MARK: commit

    private func commit() {
        switch item.type {
        case .number:
            let cleaned = draft.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "")
            if cleaned.isEmpty {
                if model.log?.value != nil { store.setValue(item, nil) }
                return
            }
            guard let v = Double(cleaned) else {
                draft = externalText
                return
            }
            if let current = model.log?.value, current == v { return }
            store.setValue(item, v)
        case .text:
            let clean = draft.trimmingCharacters(in: .whitespacesAndNewlines)
            if clean == (model.log?.text ?? "") { return }
            store.setText(item, clean)
        case .yesno:
            break
        }
    }
}
