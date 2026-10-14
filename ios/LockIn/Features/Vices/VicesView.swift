import SwiftUI
import LockInKit

struct VicesView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme

    @State private var model = VicesModel()
    @State private var sheet: VicesSheet? = nil
    @State private var toast: String? = nil

    var body: some View {
        let library = model.library(store)
        let active = library.filter { $0.item.active }
        ZStack(alignment: .bottom) {
            LIScreen {
                header
                if model.loading && !store.hasData {
                    ProgressView().tint(theme.ink2).frame(maxWidth: .infinity).padding(.top, 60)
                } else {
                    if active.isEmpty {
                        LICard {
                            LIEmptyState(title: "Nothing on yet", message: "Turn one on below, or add your own. Each keeps its own streak.")
                        }
                        .padding(.top, 8)
                    } else {
                        todaySection(active)
                    }
                    librarySection(library, activeCount: active.count)
                }
            }
            .refreshable {
                await store.reload()
                await model.load(store)
            }
            if let toast = toast {
                Text(toast)
                    .liType(.sub)
                    .foregroundColor(theme.ink)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(theme.surface2))
                    .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
                    .padding(.bottom, 16)
                    .transition(.opacity)
            }
        }
        .task {
            if !store.hasData { await store.reload() }
            await model.load(store)
        }
        .viceSheets($sheet, vices: library, model: model, say: say)
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            if toast == text { toast = nil }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            LIPageHeader("Vices")
            Spacer()
            Button {
                LIHaptics.tap()
                sheet = .vice(item: nil)
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 19))
                    .foregroundColor(theme.ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(theme.tile))
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Add your own")
        }
    }

    private func todaySection(_ active: [ViceView]) -> some View {
        let clean = active.filter { $0.state == .clean }.count
        return VStack(alignment: .leading, spacing: 0) {
            LISectionLabel("Today", trailing: "\(clean) of \(active.count) clean")
                .padding(.top, 8)
                .padding(.bottom, 4)
            ForEach(Array(active.enumerated()), id: \.element.id) { index, view in
                if index > 0 { LIHairline() }
                block(view)
            }
        }
    }

    private func block(_ view: ViceView) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            NavigationLink(destination: ViceDetailView(itemId: view.item.id, model: model)) {
                HStack(spacing: 16) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(view.streak.current)")
                            .liType(.num)
                            .foregroundColor(view.state == .clean ? theme.accent : theme.ink)
                        Text(view.streak.current == 1 ? "day" : "days").liType(.caption).foregroundColor(theme.ink2)
                    }
                    .frame(width: 92, alignment: .leading)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(view.item.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                        Text(view.rule + (view.kept.map { ", \(ViceRules.formatDollars($0.kept)) kept" } ?? ""))
                            .liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.system(size: 13)).foregroundColor(theme.ink3)
                }
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(LIPressStyle())
            ViceTodayControl(view: view, onSlip: { sheet = .slip(itemId: view.item.id, slip: nil, note: nil) }, onAdd: { sheet = .amount(itemId: view.item.id) })
        }
        .padding(.vertical, 18)
    }

    private func librarySection(_ library: [ViceView], activeCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LISectionLabel("Library", trailing: "\(activeCount) on").padding(.top, 28)
            VStack(spacing: 0) {
                ForEach(Array(library.enumerated()), id: \.element.id) { index, view in
                    if index > 0 { LIHairline() }
                    libraryRow(view)
                }
            }
            .background(LITileSurface(radius: 20))
            LISecondaryButton("Add your own") {
                sheet = .vice(item: nil)
            }
        }
    }

    private func libraryRow(_ view: ViceView) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(view.item.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                if view.item.active {
                    Text(view.rule).liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Toggle(view.item.name, isOn: Binding(
                get: { view.item.active },
                set: { on in toggle(view, on) }
            ))
            .labelsHidden()
            .tint(theme.accent)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
    }

    private func toggle(_ view: ViceView, _ on: Bool) {
        LIHaptics.tap()
        Task {
            do {
                if !on {
                    try await store.viceSetActive(view.item, false, today: store.today)
                    say("Off from today. Past days keep their record.")
                } else if view.item.tracksMoney && view.spend == nil {
                    // A money vice asks for a typical spend on the way in.
                    sheet = .vice(item: view.item)
                } else {
                    try await store.viceSetActive(view.item, true, today: store.today)
                }
            } catch {
                say(PlanErrorText.text(error))
            }
        }
    }
}

/// Today's control for one vice: a clean check for a quit vice, the amount against the cap for a capped one.
struct ViceTodayControl: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let view: ViceView
    let onSlip: () -> Void
    let onAdd: () -> Void

    var body: some View {
        if case .max(let cap) = view.target {
            capped(cap)
        } else {
            quit
        }
    }

    private func capped(_ cap: Double) -> some View {
        let value = view.log?.value
        let over = (value ?? 0) > cap
        let shown = value.map { ViceRules.formatAmount($0, unit: view.item.unit == "$" ? "$" : nil) } ?? "0"
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(shown).liType(.value).foregroundColor(over ? theme.warn : (view.state == .clean ? theme.accent : theme.ink))
                    Text("of \(ViceRules.formatAmount(cap, unit: view.item.unit)) today").liType(.sub).foregroundColor(theme.ink2).lineLimit(1)
                }
                Spacer(minLength: 4)
                if value == nil {
                    smallButton("None today") { store.setValue(view.item, 0) }
                }
                smallButton("Add", action: onAdd)
            }
            LIProgressBar(value: cap > 0 ? min(1, (value ?? 0) / cap) : ((value ?? 0) > 0 ? 1 : 0))
            if over { Text("Over the cap today.").liType(.caption).foregroundColor(theme.ink2) }
        }
    }

    private var quit: some View {
        let slipped = !view.slipsToday.isEmpty
        let clean = view.state == .clean
        return HStack(spacing: 10) {
            if slipped {
                Text("Slip logged at \(LIDate.formatTime(view.slipsToday[0].time))" + (view.slipsToday.count > 1 ? ", \(view.slipsToday.count) today" : ""))
                    .liType(.sub)
                    .foregroundColor(theme.ink2)
                    .lineLimit(1)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .background(Capsule().fill(theme.tile))
            } else {
                Button {
                    clean ? LIHaptics.uncheck() : LIHaptics.check()
                    store.setChecked(view.item, !clean)
                } label: {
                    HStack(spacing: 8) {
                        if clean { Image(systemName: "checkmark").font(.system(size: 13, weight: .semibold)) }
                        Text(clean ? "Clean today" : "Mark clean today").liType(.sub)
                    }
                    .foregroundColor(clean ? theme.accentInk : theme.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Capsule().fill(clean ? AnyShapeStyle(theme.gradient) : AnyShapeStyle(theme.tile)))
                }
                .buttonStyle(LIPressStyle())
                .accessibilityLabel("\(view.item.name): clean today")
                .accessibilityValue(clean ? "On" : "Off")
            }
            smallButton("Log a slip", action: onSlip)
        }
    }

    private func smallButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button {
            LIHaptics.tap()
            action()
        } label: {
            Text(title)
                .liType(.sub)
                .foregroundColor(theme.ink)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(Capsule().fill(theme.tile))
                .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
    }
}

extension View {
    /// The slip, amount and vice sheets, shared by the list and the detail screen.
    func viceSheets(_ sheet: Binding<VicesSheet?>, vices: [ViceView], model: VicesModel, say: @escaping (String) -> Void) -> some View {
        modifier(ViceSheetsModifier(sheet: sheet, vices: vices, model: model, say: say))
    }
}

struct ViceSheetsModifier: ViewModifier {
    @Environment(AppStore.self) private var store
    @Binding var sheet: VicesSheet?
    let vices: [ViceView]
    let model: VicesModel
    let say: (String) -> Void

    func body(content: Content) -> some View {
        content.sheet(item: $sheet) { which in
            sheetBody(which).liSheetStyle()
        }
    }

    @ViewBuilder
    private func sheetBody(_ which: VicesSheet) -> some View {
        switch which {
        case .slip(let itemId, let slip, let note):
            let one = vices.first(where: { $0.item.id == (slip?.itemId ?? itemId) })
            ViceSlipSheet(
                vices: one.map { [$0.item] } ?? vices.filter { $0.item.active }.map { $0.item },
                itemId: itemId,
                slip: slip,
                note: note
            ) { message in
                say(message)
                Task { await model.load(store) }
            }
        case .amount(let itemId):
            if let v = vices.first(where: { $0.item.id == itemId }), case .max(let cap) = v.target {
                ViceAmountSheet(view: v, cap: cap) {
                    sheet = .slip(itemId: itemId, slip: nil, note: "That put today over the cap. Note what set it off if you want.")
                }
            }
        case .vice(let item):
            ViceEditSheet(item: item) { message in
                say(message)
                Task { await model.load(store) }
            }
        }
    }
}
