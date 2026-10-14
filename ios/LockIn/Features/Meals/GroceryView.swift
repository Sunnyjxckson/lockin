import SwiftUI
import UIKit
import LockInKit

/// One list for the week, priced at five stores. Tick as you go, record the shop, send the list.
struct GroceryView: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.openURL) private var openURL
    let model: MealsModel

    @State private var item: String? = nil
    @State private var shop = false
    @State private var sending = false
    @State private var toast: String? = nil
    @State private var shareText: ShareText? = nil

    struct ShareText: Identifiable {
        var text: String
        var id: String { return text }
    }

    var body: some View {
        Group {
            if let s = model.snap, let plan = s.plan, !s.lines.isEmpty {
                list(s, plan)
            } else {
                LIScreen {
                    LIPageHeader("Grocery list")
                    if model.loading {
                        HStack { Spacer(); ProgressView().tint(theme.ink2); Spacer() }.padding(.top, 60)
                    } else {
                        LIEmptyState(title: "Nothing to buy yet", message: "Build a week of meals. Its ingredients become one list, priced at five stores.")
                            .padding(.top, 24)
                    }
                }
            }
        }
        .task {
            if model.snap == nil { await model.load() }
            await model.checkInstacart()
        }
        .lxToast($toast)
    }

    private func rowOf(_ s: MealsSnapshot, _ line: GroceryLine) -> GroceryItem? {
        let key = MealsCore.foodKey(line.name)
        return s.rows.first { MealsCore.foodKey($0.name) == key }
    }

    private func price(_ s: MealsSnapshot, _ line: GroceryLine) -> (amount: Double, real: Bool) {
        guard let food = line.food else { return (line.ownCost, false) }
        let q = s.source.quote(food, s.store)
        return (MealsCore.round(q.price * line.packs, 2), q.source != .estimate)
    }

    private func list(_ s: MealsSnapshot, _ plan: MealPlan) -> some View {
        let stores = MealsGrocery.compareStores(s.lines, s.source, s.pantry)
        let toBuy = s.lines.filter { !s.pantry.contains(MealsCore.foodKey($0.name)) }
        let atHome = s.lines.filter { s.pantry.contains(MealsCore.foodKey($0.name)) }
        let here = stores.first { $0.store == s.store } ?? stores[0]
        let cheapest = stores[0]
        let boughtCount = toBuy.filter { rowOf(s, $0)?.bought ?? false }.count
        let title = "Groceries, week of \(LIDate.formatDateShort(s.weekStart))"
        let ba = MealsGrocery.budgetActual(budget: plan.budget, estimated: here.total, spent: s.spent)
        let maxTotal = max(stores.map { $0.total }.max() ?? 1, 1)

        return LIScreen {
            LIPageHeader("Grocery list", subtitle: "Week of \(LIDate.formatDateShort(s.weekStart))")

            // Budget and actual
            VStack(alignment: .leading, spacing: 0) {
                LIBigNumber(MealsCore.dollars(ba.estimated).replacingOccurrences(of: "$", with: ""), prefix: "$", label: "Est. at \(s.store)", size: .display)
                budgetText(ba).padding(.top, 10)
                if ba.spent > 0 {
                    HStack(alignment: .top, spacing: 14) {
                        MealsTrackStat(label: "Budget", value: MealsCore.dollars(ba.budget))
                        MealsTrackStat(label: "Spent", value: MealsCore.dollars(ba.spent))
                    }
                    .padding(.top, 18)
                }
            }
            .padding(.top, 10)
            .padding(.horizontal, 2)

            // In the cart
            LICard(feature: true) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("In the cart").liType(.label).foregroundColor(theme.ink2)
                            Text("\(boughtCount) of \(toBuy.count)").liType(.h1).foregroundColor(theme.ink)
                        }
                        Spacer()
                        LXIconButton(systemName: "receipt", label: s.shops.isEmpty ? "Done shopping, record it" : "Add another shop") { shop = true }
                    }
                    LIProgressBar(value: toBuy.isEmpty ? 0 : Double(boughtCount) / Double(toBuy.count)).padding(.top, 16)
                    Text(boughtCount == toBuy.count && !toBuy.isEmpty ? "All in. Tap the receipt to record the spend." : "Tick as you go. The receipt button records the spend.")
                        .liType(.sub).foregroundColor(theme.ink2).padding(.top, 12)
                    if !s.shops.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(s.shops) { e in
                                LIHairline()
                                shopRow(e)
                            }
                        }
                        .padding(.top, 12)
                    }
                }
            }
            .padding(.top, 20)

            // Stores
            VStack(alignment: .leading, spacing: 0) {
                LISectionLabel("Same list, five stores")
                Text("Cheapest: \(cheapest.store), est. \(MealsCore.dollars(cheapest.total))\(here.above > 0.004 ? ". \(s.store) is about \(MealsCore.dollars(here.above)) more." : ".")")
                    .liType(.sub).foregroundColor(theme.ink2).padding(.top, 8)
                VStack(spacing: 0) {
                    ForEach(Array(stores.enumerated()), id: \.element.store) { i, st in
                        if i > 0 { LIHairline() }
                        storeRow(s, st, maxTotal)
                    }
                }
                .padding(.top, 6)
                MealsEstimateNote(receipts: here.fromReceipts).padding(.top, 10)
            }
            .padding(.top, 28)

            // Sections
            ForEach(MealSection.allCases, id: \.self) { section in
                let lines = toBuy.filter { $0.section == section }
                if !lines.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        LISectionLabel(section.label, trailing: "\(lines.count)")
                        VStack(spacing: 0) {
                            ForEach(Array(lines.enumerated()), id: \.element.name) { i, line in
                                if i > 0 { LIHairline() }
                                lineRow(s, plan, line)
                            }
                        }
                        .padding(.top, 4)
                    }
                    .padding(.top, 28)
                }
            }

            if !atHome.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    LISectionLabel("Already at home", trailing: "\(atHome.count)")
                    VStack(spacing: 0) {
                        ForEach(Array(atHome.enumerated()), id: \.element.name) { i, line in
                            if i > 0 { LIHairline() }
                            Button(action: {
                                LIHaptics.tap()
                                item = MealsCore.foodKey(line.name)
                            }) {
                                HStack(spacing: 12) {
                                    Image(systemName: "house").font(.system(size: 14)).foregroundColor(theme.ink2)
                                    Text(MealsGrocery.displayName(line.name)).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                                    Spacer(minLength: 8)
                                    Text("uses \(MealsGrocery.needLabel(line))").liType(.caption).foregroundColor(theme.ink2)
                                }
                                .frame(minHeight: 52)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.top, 4)
                    Text("Not in the total. Tap one if you have run out.").liType(.caption).foregroundColor(theme.ink2).padding(.top, 10).padding(.horizontal, 2)
                }
                .padding(.top, 28)
            }

            // Send
            VStack(alignment: .leading, spacing: 12) {
                LISectionLabel("Send the list")
                if model.instacart == .ready {
                    LXPrimaryButton(title: "Order on Instacart", busy: sending) { order(title) }
                }
                HStack(spacing: 10) {
                    LXWideButton(title: "Copy list") { copy(s, title) }
                    LXWideButton(title: "Share") { shareText = ShareText(text: MealsGrocery.listAsText(s.lines, s.pantry, title: title)) }
                }
                if model.instacart == .off {
                    Text("Instacart is off. Set INSTACART_API_KEY on the server to order from here.").liType(.caption).foregroundColor(theme.ink2)
                }
            }
            .padding(.top, 28)
        }
        .refreshable { await model.refresh() }
        .sheet(isPresented: Binding<Bool>(get: { item != nil }, set: { if !$0 { item = nil } })) {
            if let key = item, let line = s.lines.first(where: { MealsCore.foodKey($0.name) == key }) {
                GroceryItemSheet(model: model, line: line, onClose: { item = nil }, onToast: { toast = $0 })
                    .liSheetStyle()
            }
        }
        .sheet(isPresented: $shop) {
            MealsShopSheet(model: model, estimate: here.total, onClose: { shop = false }, onToast: { toast = $0 })
                .liSheetStyle()
        }
        .sheet(item: $shareText) { t in
            MealsShareSheet(items: [t.text])
        }
    }

    private func budgetText(_ ba: BudgetActual) -> some View {
        var text: AttributedString
        if ba.spent > 0 {
            text = AttributedString(ba.over ? "\(MealsCore.dollars(-ba.left)) over budget." : "\(MealsCore.dollars(ba.left)) of the budget left.")
            text.foregroundColor = ba.over ? theme.warn : theme.ink
            if let off = ba.offEstimate {
                let more = abs(off) < 0.5 ? " Right on the estimate." : " \(MealsCore.dollars(abs(off))) \(off > 0 ? "more" : "less") than the estimate."
                var rest = AttributedString(more)
                rest.foregroundColor = theme.ink2
                text.append(rest)
            }
        } else {
            text = AttributedString("Budget \(MealsCore.dollars(ba.budget)). Nothing spent yet.")
            text.foregroundColor = theme.ink2
        }
        return Text(text).liType(.sub)
    }

    private func shopRow(_ e: Expense) -> some View {
        HStack(spacing: 12) {
            Text(LIDate.formatDateShort(e.date) + (e.store.map { ", \($0)" } ?? "") + ((e.note ?? "").isEmpty ? "" : ", \(e.note ?? "")"))
                .liType(.sub).foregroundColor(theme.ink2).lineLimit(1)
            Spacer(minLength: 8)
            Text(MealsCore.dollars(e.amount)).liType(.body).foregroundColor(theme.ink)
            Button(action: {
                LIHaptics.tap()
                Task {
                    do {
                        try await model.removeShop(e)
                        toast = "Shop removed"
                    } catch {
                        LIHaptics.error()
                        toast = MealsModel.describe(error)
                    }
                }
            }) {
                Image(systemName: "trash").font(.system(size: 15)).foregroundColor(theme.ink2).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Delete the \(MealsCore.dollars(e.amount)) shop")
        }
        .frame(minHeight: 48)
    }

    private func storeRow(_ s: MealsSnapshot, _ st: StoreTotal, _ maxTotal: Double) -> some View {
        let on = st.store == s.store
        return Button(action: {
            if on { return }
            LIHaptics.tap()
            Task {
                do {
                    try await model.setPlanStore(st.store)
                    toast = "Priced at \(st.store)"
                } catch {
                    LIHaptics.error()
                    toast = MealsModel.describe(error)
                }
            }
        }) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(st.store).liType(.body).foregroundColor(theme.ink)
                    if on { Image(systemName: "checkmark").font(.system(size: 12, weight: .medium)).foregroundColor(theme.accent) }
                    if st.fromReceipts > 0 { Text("\(st.fromReceipts) from receipts").liType(.caption).foregroundColor(theme.ink2) }
                    Spacer(minLength: 8)
                    LXEst(text: MealsCore.dollars(st.total), real: st.fromReceipts == st.lines && st.lines > 0).liType(.body)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(theme.hair)
                        Capsule().fill(on ? AnyShapeStyle(theme.gradient) : AnyShapeStyle(theme.ink3))
                            .frame(width: geo.size.width * CGFloat(st.total / maxTotal))
                    }
                }
                .frame(height: 2)
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(st.store), \(MealsCore.dollars(st.total))\(on ? ", shopping here" : "")")
    }

    private func lineRow(_ s: MealsSnapshot, _ plan: MealPlan, _ line: GroceryLine) -> some View {
        let row = rowOf(s, line)
        let p = price(s, line)
        let done = row?.bought ?? false
        return HStack(spacing: 6) {
            Button(action: {
                tick(s, plan, line, row, !done)
            }) {
                LICheckmark(checked: done, size: 28).frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(MealsGrocery.displayName(line.name)), \(done ? "bought" : "not bought")")
            Button(action: {
                LIHaptics.tap()
                item = MealsCore.foodKey(line.name)
            }) {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(MealsGrocery.displayName(line.name)).liType(.body).foregroundColor(done ? theme.ink2 : theme.ink).strikethrough(done).lineLimit(1)
                        Text(MealsGrocery.buyLabel(line) + (line.food != nil ? ", recipes use \(MealsGrocery.needLabel(line))" : ""))
                            .liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    LXEst(text: MealsCore.dollars(p.amount), real: p.real).liType(.body).foregroundColor(done ? theme.ink2 : theme.ink)
                }
                .frame(minHeight: 60)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func tick(_ s: MealsSnapshot, _ plan: MealPlan, _ line: GroceryLine, _ row: GroceryItem?, _ bought: Bool) {
        if bought { LIHaptics.check() } else { LIHaptics.uncheck() }
        Task {
            do {
                if let row = row {
                    try await model.setBought(row, bought)
                } else {
                    try await model.syncGrocery(planId: plan.id, store: s.store)
                    await model.refresh()
                }
            } catch {
                LIHaptics.error()
                toast = MealsModel.describe(error)
            }
        }
    }

    private func copy(_ s: MealsSnapshot, _ title: String) {
        UIPasteboard.general.string = MealsGrocery.listAsText(s.lines, s.pantry, title: title)
        LIHaptics.celebrate()
        toast = "List copied"
    }

    private func order(_ title: String) {
        if sending { return }
        sending = true
        Task {
            if let url = await model.sendToInstacart(title: title) {
                openURL(url)
            } else if let s = model.snap {
                UIPasteboard.general.string = MealsGrocery.listAsText(s.lines, s.pantry, title: title)
                LIHaptics.error()
                toast = "Instacart did not take the list. It is copied so you can paste it."
            }
            sending = false
        }
    }
}

struct MealsShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        return UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// One item: have it at home, and what a pack really costs at each store.
struct GroceryItemSheet: View {
    @Environment(\.liTheme) private var theme
    let model: MealsModel
    let line: GroceryLine
    let onClose: () -> Void
    let onToast: (String) -> Void

    var body: some View {
        let s = model.snap
        let key = MealsCore.foodKey(line.name)
        let home = s?.pantry.contains(key) ?? false
        return LXSheet(title: MealsGrocery.displayName(line.name), subtitle: "Buy \(MealsGrocery.buyLabel(line))\(line.food != nil ? ". Recipes use \(MealsGrocery.needLabel(line))." : "")") {
            VStack(alignment: .leading, spacing: 0) {
                LXToggleRow(title: "I have this at home", sub: "Off the list and out of the total.", isOn: Binding<Bool>(get: { home }, set: { toggleHome($0) }))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))

                if let food = line.food, let s = s {
                    Text("Price for one \(food.packLabel == "each" ? MealsGrocery.displayName(food.name).lowercased() : food.packLabel)").liType(.label).foregroundColor(theme.ink2).padding(.top, 24)
                    Text("Estimates. Type a receipt price and that store keeps it. Clear it to go back.").liType(.caption).foregroundColor(theme.ink2).padding(.top, 6).padding(.bottom, 12)
                    VStack(spacing: 12) {
                        ForEach(MealsPricing.stores, id: \.self) { store in
                            storeRow(s, food, store)
                        }
                    }
                } else {
                    Text("Not in the food table. Its cost comes from its recipe.").liType(.sub).foregroundColor(theme.ink2).padding(.top, 20)
                }
            }
        }
    }

    private func storeRow(_ s: MealsSnapshot, _ food: MealFood, _ store: String) -> some View {
        let own = s.corrections[MealsCore.foodKey(food.name)]?[store]
        let est = s.source.quote(food, store)
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(store).liType(.body).foregroundColor(theme.ink)
                Text(own != nil ? "From your receipt" : "Estimate \(MealsCore.dollars(est.price))").liType(.caption).foregroundColor(own != nil ? theme.accent : theme.ink2)
            }
            Spacer(minLength: 8)
            MealsPriceBox(value: own, placeholder: String(format: "%.2f", est.price)) { setPrice(food, store, $0, own) }
                .frame(width: 132)
        }
    }

    private func toggleHome(_ on: Bool) {
        Task {
            do {
                try await model.setAtHome(line.name, on)
                onToast(on ? "Marked as at home. It is off the list." : "Back on the list")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(MealsModel.describe(error))
            }
        }
    }

    private func setPrice(_ food: MealFood, _ store: String, _ price: Double?, _ current: Double?) {
        if price == current { return }
        Task {
            do {
                try await model.setReceiptPrice(food.name, store: store, price: price)
                LIHaptics.tap()
                onToast(price == nil ? "Back to the estimate at \(store)" : "Saved. \(store) uses your price from now on.")
            } catch {
                LIHaptics.error()
                onToast(MealsModel.describe(error))
            }
        }
    }
}

/// A dollar amount that commits when the keyboard goes away.
private struct MealsPriceBox: View {
    let value: Double?
    let placeholder: String
    let onCommit: (Double?) -> Void
    @State private var entry: Double?
    @State private var seeded = false

    init(value: Double?, placeholder: String, onCommit: @escaping (Double?) -> Void) {
        self.value = value
        self.placeholder = placeholder
        self.onCommit = onCommit
        _entry = State(initialValue: value)
    }

    var body: some View {
        LXNumberField(label: nil, value: $entry, prefix: "$", placeholder: placeholder, onCommit: { onCommit(entry) })
    }
}

/// A shop is done: write the spend to Money as a groceries expense.
struct MealsShopSheet: View {
    @Environment(\.liTheme) private var theme
    let model: MealsModel
    let estimate: Double
    let onClose: () -> Void
    let onToast: (String) -> Void

    @State private var amount: Double? = nil
    @State private var store: String
    @State private var date: String
    @State private var note = ""
    @State private var busy = false

    init(model: MealsModel, estimate: Double, onClose: @escaping () -> Void, onToast: @escaping (String) -> Void) {
        self.model = model
        self.estimate = estimate
        self.onClose = onClose
        self.onToast = onToast
        _store = State(initialValue: model.snap?.store ?? MealsPricing.defaultStore)
        _date = State(initialValue: model.snap?.today ?? LIDate.todayNY())
    }

    private var ok: Bool { return (amount ?? 0) > 0 }

    var body: some View {
        LXSheet(title: "Record the shop", subtitle: "The estimate was \(MealsCore.dollars(estimate)).") {
            VStack(alignment: .leading, spacing: 18) {
                LXNumberField(label: "Receipt total", value: $amount, prefix: "$", placeholder: String(format: "%.2f", estimate))
                VStack(alignment: .leading, spacing: 8) {
                    Text("Store").liType(.sub).foregroundColor(theme.ink2)
                    LXFlow(spacing: 8) {
                        ForEach(MealsPricing.stores + ["Other"], id: \.self) { s in
                            LIChip(s, on: store == s) { store = s }
                        }
                    }
                }
                LXDateField(label: "Date", day: $date, max: model.snap?.today ?? LIDate.todayNY())
                LXField(label: "Note", text: $note, placeholder: "Optional")
            }
        } footer: {
            LXPrimaryButton(title: "Record spend", busy: busy, disabled: !ok) { save() }
        }
    }

    private func save() {
        guard let a = amount, a > 0, !busy else { return }
        busy = true
        Task {
            do {
                try await model.recordShop(date: date, amount: a, store: store, note: note)
                LIHaptics.celebrate()
                onToast("\(MealsCore.dollars(a)) recorded. It shows on Money as groceries.")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(MealsModel.describe(error))
                busy = false
            }
        }
    }
}
