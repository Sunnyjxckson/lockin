import SwiftUI
import LockInKit

/// The checklist: what a day is made of. Changes apply from today forward, past days keep their own targets.
struct SettingsChecklistPage: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: SettingsModel

    @State private var toast: String? = nil
    @State private var editing: ChecklistItem? = nil
    @State private var adding = false
    @State private var readCount: Double? = 10
    @State private var readOn = false
    @State private var readLoaded = false

    private var rows: [ChecklistItem] {
        return store.items.filter { $0.active && !$0.archived }.sorted { $0.sortOrder < $1.sortOrder }
    }

    var body: some View {
        SettingsPage("Checklist", subtitle: "Changes apply from today forward.") {
            HStack {
                Spacer()
                LISecondaryButton("Add an item") { adding = true }
            }
            .padding(.top, 4)
            .padding(.bottom, 14)

            if rows.isEmpty {
                LIEmptyState(title: "Nothing on the list", message: "Add the first thing you want to do every day.", actionTitle: "Add an item") { adding = true }
            } else {
                SettingsList(rows) { item in
                    Button { editing = item } label: {
                        LXRow(title: item.name, sub: SettingsText.target(item.target, unit: item.unit) + (item.cadence == .weekly ? ", weekly" : ""), value: nil)
                    }
                    .buttonStyle(LIPressStyle())
                }
            }

            SettingsLabel("Reading")
            SettingsTile {
                LXToggleRow(title: "Read quotes every day", sub: "A number goal on Today, fed by the library.", isOn: Binding(
                    get: { readOn },
                    set: { v in
                        readOn = v
                        lxRun($toast) {
                            if v { try await model.enableReading(SettingsModel.clampReadTarget(readCount)) } else { try await model.disableReading() }
                        }
                    }
                ))
                if readOn {
                    LXNumberField(label: "Quotes a day", value: $readCount, placeholder: "10", decimal: false, onCommit: {
                        lxRun($toast) { try await model.enableReading(SettingsModel.clampReadTarget(readCount)) }
                    })
                }
            }
        }
        .lxToast($toast)
        .task {
            if readLoaded { return }
            readLoaded = true
            if let r = await model.readItem(), r.active, !r.archived {
                readOn = true
                if case .min(let m) = r.target { readCount = m }
            }
        }
        .sheet(isPresented: $adding) {
            ChecklistItemSheet(model: model, item: nil, rows: rows, onClose: { adding = false }, onToast: { toast = $0 })
                .liSheetStyle()
        }
        .sheet(item: $editing) { item in
            ChecklistItemSheet(model: model, item: item, rows: rows, onClose: { editing = nil }, onToast: { toast = $0 })
                .liSheetStyle()
        }
    }
}

private enum NumberMode: Hashable {
    case min, max, range
}

struct ChecklistItemSheet: View {
    @Environment(\.liTheme) private var theme
    let model: SettingsModel
    let item: ChecklistItem?
    let rows: [ChecklistItem]
    let onClose: () -> Void
    let onToast: (String) -> Void

    @State private var name: String
    @State private var type: ItemType
    @State private var cadence: Cadence
    @State private var checkBy: Bool
    @State private var by: String
    @State private var numberMode: NumberMode
    @State private var a: Double?
    @State private var b: Double?
    @State private var unit: String
    @State private var hint: String
    @State private var track: Track?
    @State private var busy = false
    @State private var confirm = false

    init(model: SettingsModel, item: ChecklistItem?, rows: [ChecklistItem], onClose: @escaping () -> Void, onToast: @escaping (String) -> Void) {
        self.model = model
        self.item = item
        self.rows = rows
        self.onClose = onClose
        self.onToast = onToast
        _name = State(initialValue: item?.name ?? "")
        _type = State(initialValue: item?.type ?? .yesno)
        _cadence = State(initialValue: item?.cadence ?? .daily)
        var cb = false
        var time = "08:00"
        var mode: NumberMode = .min
        var first: Double? = nil
        var second: Double? = nil
        switch item?.target ?? .check {
        case .checkBy(let t): cb = true; time = t
        case .min(let n): mode = .min; first = n
        case .max(let n): mode = .max; first = n
        case .range(let lo, let hi): mode = .range; first = lo; second = hi
        default: break
        }
        _checkBy = State(initialValue: cb)
        _by = State(initialValue: time)
        _numberMode = State(initialValue: mode)
        _a = State(initialValue: first)
        _b = State(initialValue: second)
        _unit = State(initialValue: item?.unit ?? "")
        _hint = State(initialValue: item?.hint ?? "")
        _track = State(initialValue: item.map { Tracks.trackOf($0) })
    }

    private var isNew: Bool { return item == nil }

    private var target: Target? {
        switch type {
        case .yesno: return checkBy ? .checkBy(by) : .check
        case .text: return .text
        case .number:
            guard let x = a, x.isFinite, x >= 0 else { return nil }
            switch numberMode {
            case .min: return .min(x)
            case .max: return .max(x)
            case .range:
                guard let y = b, y.isFinite, y >= x else { return nil }
                return .range(x, y)
            }
        }
    }

    private var problem: String? {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Give it a name." }
        if target == nil { return numberMode == .range ? "The top of the range is at or above the bottom." : "Set a number." }
        return nil
    }

    var body: some View {
        let index = item.flatMap { it in rows.firstIndex { $0.id == it.id } }
        return LXSheet(title: isNew ? "New item" : "Item", subtitle: isNew ? "It shows on Today from now on." : "Changes apply from today forward.") {
            VStack(alignment: .leading, spacing: 18) {
                LXField(label: "Name", text: $name, placeholder: "Stretch")
                if isNew {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Kind").liType(.sub).foregroundColor(theme.ink2)
                        LISegmentedControl(options: [(value: ItemType.yesno, title: "Yes or no"), (value: ItemType.number, title: "Number"), (value: ItemType.text, title: "Text")], selection: $type)
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("How often").liType(.sub).foregroundColor(theme.ink2)
                    LISegmentedControl(options: [(value: Cadence.daily, title: "Daily"), (value: Cadence.weekly, title: "Weekly")], selection: $cadence)
                }
                if type == .yesno {
                    LXToggleRow(title: "Check by a time", sub: "Late counts as missed.", isOn: $checkBy)
                    if checkBy { LXTimeField(label: "Check by", time: $by) }
                }
                if type == .number {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Goal").liType(.sub).foregroundColor(theme.ink2)
                        LISegmentedControl(options: [(value: NumberMode.min, title: "At least"), (value: NumberMode.max, title: "At most"), (value: NumberMode.range, title: "Between")], selection: $numberMode)
                    }
                    HStack(spacing: 10) {
                        LXNumberField(label: numberMode == .range ? "From" : "Number", value: $a)
                        if numberMode == .range { LXNumberField(label: "To", value: $b) }
                    }
                    LXField(label: "Unit", text: $unit, placeholder: "pages", capitalization: .never)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Counts toward").liType(.sub).foregroundColor(theme.ink2)
                    SettingsChips(options: Tracks.all.map { (value: Optional($0), title: Tracks.label($0)) }, selection: $track)
                }
                LXField(label: "Hint", text: $hint, placeholder: "Optional", lines: 3)

                if let i = index, let it = item {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Order").liType(.sub).foregroundColor(theme.ink2)
                        HStack(spacing: 10) {
                            LXWideButton(title: "Earlier", disabled: i == 0) { move(it, i - 1) }
                            LXWideButton(title: "Later", disabled: i >= rows.count - 1) { move(it, i + 1) }
                        }
                    }
                    LXDangerButton(title: confirm ? "Tap again to remove it from today on" : "Remove from the checklist") {
                        if !confirm {
                            confirm = true
                            return
                        }
                        remove(it)
                    }
                }
            }
        } footer: {
            VStack(spacing: 8) {
                if let p = problem, !name.isEmpty {
                    Text(p).liType(.caption).foregroundColor(theme.ink2)
                }
                LXPrimaryButton(title: isNew ? "Add" : "Save", busy: busy, disabled: problem != nil) { save() }
            }
        }
    }

    private func draft() -> ChecklistDraft? {
        guard let t = target else { return nil }
        let u = unit.trimmingCharacters(in: .whitespaces)
        let h = hint.trimmingCharacters(in: .whitespacesAndNewlines)
        return ChecklistDraft(name: name, type: type, cadence: cadence, target: t, unit: u.isEmpty ? nil : u, hint: h.isEmpty ? nil : h, track: track)
    }

    private func save() {
        guard !busy, let d = draft() else { return }
        busy = true
        Task {
            do {
                if let it = item { _ = try await model.saveItem(it, d) } else { _ = try await model.addItem(d) }
                LIHaptics.celebrate()
                onClose()
            } catch {
                LIHaptics.error()
                onToast(SettingsModel.describe(error))
                busy = false
            }
        }
    }

    private func move(_ it: ChecklistItem, _ to: Int) {
        var ids = rows.map { $0.id }
        guard let from = ids.firstIndex(of: it.id), to >= 0, to < ids.count else { return }
        ids.remove(at: from)
        ids.insert(it.id, at: to)
        Task {
            do {
                try await model.reorderItems(ids)
                LIHaptics.tap()
            } catch {
                LIHaptics.error()
                onToast(SettingsModel.describe(error))
            }
        }
    }

    private func remove(_ it: ChecklistItem) {
        guard !busy else { return }
        busy = true
        Task {
            do {
                try await model.removeItem(it)
                onToast("Removed from today on")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(SettingsModel.describe(error))
                busy = false
            }
        }
    }
}
