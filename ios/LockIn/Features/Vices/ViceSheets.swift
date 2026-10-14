import SwiftUI
import LockInKit

private func parseNumber(_ text: String) -> Double? {
    let cleaned = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "").replacingOccurrences(of: "$", with: "")
    if cleaned.isEmpty { return nil }
    return Double(cleaned)
}

private func numberText(_ n: Double?) -> String {
    guard let n = n else { return "" }
    if n == n.rounded() { return String(Int(n)) }
    return String(n)
}

/// A number field in the app's style.
private struct ViceNumberField: View {
    @Environment(\.liTheme) private var theme
    let label: String
    let prefix: String?
    let unit: String?
    let placeholder: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).liType(.label).foregroundColor(theme.ink2)
            HStack(spacing: 6) {
                if let prefix = prefix { Text(prefix).liType(.body).foregroundColor(theme.ink2) }
                TextField(placeholder, text: $text)
                    .keyboardType(.decimalPad)
                    .liType(.body)
                    .foregroundColor(theme.ink)
                    .tint(theme.accent)
                if let unit = unit { Text(unit).liType(.sub).foregroundColor(theme.ink2) }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.tile))
        }
    }
}

/// Wraps a sheet body in the app's navigation chrome.
private struct ViceSheetFrame<Content: View>: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LIBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        content
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } }
            }
        }
    }
}

// MARK: slip

struct ViceSlipSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    let vices: [ChecklistItem]
    let itemId: String?
    let slip: ViceSlip?
    let note: String?
    let onDone: (String) -> Void

    @State private var pick: String? = nil
    @State private var date: DateStr = ""
    @State private var time: TimeStr = "12:00"
    @State private var chips: Set<String> = []
    @State private var extra = ""
    @State private var amount = ""
    @State private var busy = false
    @State private var error: String? = nil
    @State private var ready = false

    private var item: ChecklistItem? { return vices.first(where: { $0.id == pick }) }

    private var yesterday: DateStr { return LIDate.addDays(store.today, -1) }

    private var canYesterday: Bool {
        if slip != nil { return false }
        let installed = store.settings.map { LIDate.nyParts(iso: $0.createdAt).date }
        return LIDate.isDayEditable(yesterday, now: store.now, installedOn: installed)
    }

    var body: some View {
        ViceSheetFrame(title: slip == nil ? "Log a slip" : "Edit slip") {
            Text(note ?? (slip != nil ? LIDate.formatDateLong(slip?.date ?? store.today) : "Restarts this one streak. Nothing else."))
                .liType(.sub).foregroundColor(theme.ink2)
            if vices.count > 1 && slip == nil {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Which one").liType(.label).foregroundColor(theme.ink2)
                    FlowChips(items: vices.map { ($0.id, $0.name) }, isOn: { $0 == pick }) { pick = $0 }
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("When").liType(.label).foregroundColor(theme.ink2)
                if canYesterday {
                    LISegmentedControl(options: [(value: store.today, title: "Today"), (value: yesterday, title: "Yesterday")], selection: $date)
                }
                PlanTimeField(label: "Time", time: $time)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("What set it off").liType(.label).foregroundColor(theme.ink2)
                FlowChips(items: ViceRules.triggerChips.map { ($0, $0) }, isOn: { chips.contains($0) }) { c in
                    if chips.contains(c) { chips.remove(c) } else { chips.insert(c) }
                }
                PlanTextField(label: "", placeholder: "Something else", text: $extra)
            }
            if item?.tracksMoney == true {
                ViceNumberField(label: "Amount spent", prefix: "$", unit: nil, placeholder: "0", text: $amount)
            }
            if let error = error { LINotice(error) }
            HStack(spacing: 12) {
                if slip != nil {
                    Button {
                        remove()
                    } label: {
                        Text("Remove").liType(.body).foregroundColor(theme.danger).frame(minWidth: 96, minHeight: 52)
                    }
                    .buttonStyle(LIPressStyle())
                    .disabled(busy)
                }
                LIPrimaryButton("Save", busy: busy) { save() }
                    .disabled(item == nil)
                    .opacity(item == nil ? 0.5 : 1)
            }
        }
        .onAppear { setup() }
    }

    private func setup() {
        if ready { return }
        ready = true
        date = slip?.date ?? store.today
        time = slip?.time ?? LIDate.timeNY(store.now)
        pick = slip?.itemId ?? itemId ?? (vices.count == 1 ? vices[0].id : nil)
        let before = ViceRules.splitTriggers(slip?.trigger)
        let known = Set(ViceRules.triggerChips)
        chips = Set(before.filter { known.contains($0) })
        extra = before.filter { !known.contains($0) }.joined(separator: ", ")
        amount = numberText(slip?.amount)
    }

    private func save() {
        guard let item = item else { return }
        busy = true
        let trigger = ViceRules.joinTriggers(ViceRules.triggerChips.filter { chips.contains($0) }, text: extra)
        let spent: Double? = item.tracksMoney ? parseNumber(amount) : nil
        Task {
            do {
                try await store.viceSaveSlip(id: slip?.id, itemId: item.id, date: date, time: time, trigger: trigger, amount: spent)
                LIHaptics.tap()
                dismiss()
                onDone(slip == nil ? "Logged" : "Saved")
            } catch {
                self.error = PlanErrorText.text(error)
                busy = false
            }
        }
    }

    private func remove() {
        guard let slip = slip else { return }
        busy = true
        Task {
            do {
                try await store.viceRemoveSlip(slip)
                LIHaptics.uncheck()
                dismiss()
                onDone("Removed")
            } catch {
                self.error = PlanErrorText.text(error)
                busy = false
            }
        }
    }
}

/// Wrapping chips.
struct FlowChips: View {
    let items: [(String, String)]
    let isOn: (String) -> Bool
    let onTap: (String) -> Void

    var body: some View {
        ViceFlowLayout(spacing: 8) {
            ForEach(0..<items.count, id: \.self) { i in
                let entry = items[i]
                LIChip(entry.1, on: isOn(entry.0)) { onTap(entry.0) }
            }
        }
    }
}

struct ViceFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                widest = max(widest, x - spacing)
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        widest = max(widest, x - spacing)
        return CGSize(width: proposal.width ?? widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            sub.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: amount

struct ViceAmountSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    let view: ViceView
    let cap: Double
    let onWentOver: () -> Void

    @State private var add = ""
    @FocusState private var focused: Bool

    private var item: ChecklistItem { return view.item }
    private var so: Double { return view.log?.value ?? 0 }
    private var addValue: Double? { return parseNumber(add) }
    private var total: Double { return so + (addValue ?? 0) }
    private var dollars: Bool { return item.unit == "$" }

    var body: some View {
        ViceSheetFrame(title: item.name) {
            Text("\(ViceRules.formatAmount(so, unit: item.unit)) so far today. Cap is \(ViceRules.formatAmount(cap, unit: item.unit)).")
                .liType(.sub).foregroundColor(theme.ink2)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if dollars { Text("$").liType(.h2).foregroundColor(theme.accent) }
                TextField("0", text: $add)
                    .keyboardType(.decimalPad)
                    .focused($focused)
                    .liType(.display)
                    .foregroundColor(theme.ink)
                    .tint(theme.accent)
                    .multilineTextAlignment(.leading)
                if !dollars, let unit = item.unit { Text(unit).liType(.h2).foregroundColor(theme.ink2) }
            }
            .padding(.vertical, 6)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ViceRules.quickAdds(unit: item.unit), id: \.self) { n in
                        LIChip("+\(numberText(n))", on: false) {
                            add = numberText((addValue ?? 0) + n)
                        }
                    }
                }
            }
            LIPrimaryButton(addValue == nil ? "Add" : "Add, total \(ViceRules.formatAmount(total, unit: item.unit))") { save() }
                .disabled(addValue == nil)
                .opacity(addValue == nil ? 0.5 : 1)
        }
        .onAppear { focused = true }
    }

    private func save() {
        guard addValue != nil else { return }
        let was = so
        let now = total
        store.setValue(item, now)
        LIHaptics.tap()
        dismiss()
        if was <= cap && now > cap { onWentOver() }
    }
}

// MARK: add or edit a vice

struct ViceEditSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    let item: ChecklistItem?
    let onDone: (String) -> Void

    @State private var name = ""
    @State private var mode: ViceMode = .quit
    @State private var cap = ""
    @State private var unit = "min"
    @State private var money = false
    @State private var spend = ""
    @State private var period: SpendPeriod = .week
    @State private var busy = false
    @State private var error: String? = nil
    @State private var ready = false
    @State private var confirmRemove = false

    private var seeded: Bool { return item?.key != nil }
    private var turningOn: Bool { return item != nil && item?.active == false }

    private var capValue: Double? { return parseNumber(cap) }

    private var valid: Bool {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
        if mode == .cap { return (capValue ?? -1) >= 0 }
        return true
    }

    var body: some View {
        ViceSheetFrame(title: item == nil ? "Add your own" : (turningOn ? (item?.name ?? "Turn on") : "Edit")) {
            if item != nil {
                Text(turningOn ? "Counts from today." : "Applies from today. Past days keep their rule.")
                    .liType(.sub).foregroundColor(theme.ink2)
            }
            if !seeded {
                PlanTextField(label: "Name", placeholder: mode == .cap ? "Social media" : "No late night snacks", text: $name)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Rule").liType(.label).foregroundColor(theme.ink2)
                LISegmentedControl(options: [(value: ViceMode.quit, title: "Quit completely"), (value: ViceMode.cap, title: "Cap it")], selection: $mode)
            }
            if mode == .cap {
                ViceNumberField(label: "Daily cap", prefix: unit == "$" ? "$" : nil, unit: unit == "$" ? nil : unit, placeholder: "30", text: $cap)
                Text("Clean means at or under this.").liType(.caption).foregroundColor(theme.ink2)
                FlowChips(items: ViceRules.capUnits.map { ($0.value, $0.label) }, isOn: { $0 == unit }) { unit = $0 }
            }
            if !seeded {
                PlanToggleRow(title: "Costs money", sub: "Shows dollars kept.", isOn: $money)
            }
            if money {
                ViceNumberField(label: "Typical spend", prefix: "$", unit: nil, placeholder: "0", text: $spend)
                LISegmentedControl(options: [(value: SpendPeriod.day, title: "Per day"), (value: SpendPeriod.week, title: "Per week")], selection: $period)
            }
            if let error = error { LINotice(error) }
            HStack(spacing: 12) {
                if item != nil && !seeded && !turningOn {
                    Button {
                        confirmRemove = true
                    } label: {
                        Text("Remove").liType(.body).foregroundColor(theme.danger).frame(minWidth: 96, minHeight: 52)
                    }
                    .buttonStyle(LIPressStyle())
                    .disabled(busy)
                }
                LIPrimaryButton(item == nil ? "Add" : (turningOn ? "Turn on" : "Save"), busy: busy) { save() }
                    .disabled(!valid)
                    .opacity(valid ? 1 : 0.5)
            }
        }
        .onAppear { setup() }
        .confirmationDialog("Remove this one?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { remove() }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("Past days keep their record.")
        }
    }

    private func setup() {
        if ready { return }
        ready = true
        guard let item = item else { return }
        name = item.name
        mode = item.mode == .cap ? .cap : .quit
        if case .max(let m) = item.target { cap = numberText(m) }
        if item.mode == .cap, let u = item.unit, !u.isEmpty { unit = u }
        money = item.tracksMoney
        if let s = ViceRules.spendOf(item) {
            spend = numberText(s.amount)
            period = s.period
        }
    }

    private func input() -> ViceRules.ViceInput {
        let amount = parseNumber(spend)
        let typical: TypicalSpend? = (money && (amount ?? 0) > 0) ? TypicalSpend(amount: amount ?? 0, period: period) : nil
        return ViceRules.ViceInput(
            name: name,
            mode: mode,
            cap: mode == .cap ? capValue : nil,
            unit: mode == .cap ? unit : nil,
            tracksMoney: money,
            spend: typical
        )
    }

    private func save() {
        if !valid { return }
        busy = true
        let built = input()
        let today = store.today
        let existing = item
        let on = turningOn
        Task {
            do {
                if let existing = existing {
                    try await store.viceUpdate(existing, built, today: today)
                    onDone(on ? "On from today" : "Saved. Applies from today.")
                } else {
                    try await store.viceCreate(built, today: today)
                    onDone("On from today")
                }
                LIHaptics.check()
                dismiss()
            } catch {
                self.error = PlanErrorText.text(error)
                busy = false
            }
        }
    }

    private func remove() {
        guard let item = item else { return }
        busy = true
        let today = store.today
        Task {
            do {
                try await store.viceRemove(item, today: today)
                LIHaptics.uncheck()
                dismiss()
                onDone("Removed. Past days keep their record.")
            } catch {
                self.error = PlanErrorText.text(error)
                busy = false
            }
        }
    }
}
