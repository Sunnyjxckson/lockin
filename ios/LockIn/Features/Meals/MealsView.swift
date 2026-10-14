import SwiftUI
import LockInKit

/// Meals: a week built from the recipe table, one grocery list, and a budget it stays under.
struct MealsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        MealsRoot(store: store)
    }
}

struct MealKey: Identifiable, Equatable {
    var date: DateStr
    var slot: MealSlot
    var id: String { return date + "-" + slot.rawValue }
}

private struct MealsRoot: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: MealsModel
    @State private var busy = false
    @State private var adjust = false
    @State private var open: MealKey? = nil
    @State private var toast: String? = nil
    @State private var notes: [String: String] = [:]
    @State private var asks: [String: String] = [:]

    init(store: AppStore) {
        _model = State(initialValue: MealsModel(store: store))
    }

    var body: some View {
        content
            .task { await model.load() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await model.refresh() } }
            }
            .lxToast($toast)
            .sheet(item: $open) { key in
                PlannedMealSheet(model: model, date: key.date, slot: key.slot, onClose: { open = nil }, onToast: { toast = $0 })
                    .liSheetStyle()
            }
            .sheet(isPresented: $adjust) {
                if let s = model.snap {
                    LXSheet(title: "Adjust the week", subtitle: "Rebuilds from today on. Past days stay.") {
                        MealsSetupForm(initial: values(s), targets: s.targets, challengeName: s.challengeName, busy: busy, submitLabel: "Rebuild the week", onSubmit: { build($0) })
                    }
                    .liSheetStyle()
                }
            }
    }

    // MARK: pieces

    private func values(_ s: MealsSnapshot) -> MealsBuildValues {
        return MealsBuildValues(budget: s.plan?.budget ?? s.budget ?? 0, store: s.store, likes: s.likes, dislikes: s.dislikes, ask: asks[s.weekStart] ?? model.lastAsk(for: s.weekStart))
    }

    private var header: some View {
        HStack(alignment: .top) {
            LIPageHeader("Meals", subtitle: model.recipes.isEmpty ? nil : "\(model.recipes.count) recipes, one grocery list.")
            NavigationLink {
                RecipesView(model: model)
            } label: {
                Image(systemName: "book")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundColor(theme.ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(theme.tile))
                    .overlay(Circle().strokeBorder(theme.tileLine, lineWidth: 1))
            }
            .padding(.top, 14)
            .accessibilityLabel("Recipes")
        }
    }

    private var weekPicker: some View {
        LISegmentedControl(
            options: [(value: MealsWeek.this, title: "This week"), (value: MealsWeek.next, title: "Next week")],
            selection: Binding<MealsWeek>(get: { model.week }, set: { w in Task { await model.setWeek(w) } })
        )
    }

    @ViewBuilder
    private var content: some View {
        if model.loading || model.snap == nil {
            LIScreen {
                header
                if let failure = model.failure {
                    LINotice(failure, actionTitle: "Try again") { Task { await model.load() } }.padding(.top, 8)
                } else {
                    HStack { Spacer(); ProgressView().tint(theme.ink2); Spacer() }.padding(.top, 60)
                }
            }
        } else if let s = model.snap {
            LIScreen {
                header
                if let failure = model.failure {
                    LINotice(failure, actionTitle: "Retry") { Task { await model.refresh() } }.padding(.bottom, 10)
                }
                weekPicker
                if let plan = s.plan, !s.meals.isEmpty, let sum = s.summary {
                    planned(s, plan, sum)
                } else {
                    empty(s)
                }
            }
            .refreshable { await model.refresh() }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    // MARK: no plan

    private func empty(_ s: MealsSnapshot) -> some View {
        let note = notes[s.weekStart] ?? model.note(for: s.weekStart)
        return VStack(alignment: .leading, spacing: 0) {
            Text("No plan for the week of \(LIDate.formatDateShort(s.weekStart))").liType(.greeting).foregroundColor(theme.ink).padding(.top, 28)
            Text("Set a budget. It builds 7 days from \(model.recipes.count) recipes, with one grocery list.")
                .liType(.sub).foregroundColor(theme.ink2).padding(.top, 10)
            if !note.isEmpty { noticeView(note).padding(.top, 18) }
            LICard(feature: true) {
                MealsSetupForm(initial: values(s), targets: s.targets, challengeName: s.challengeName, busy: busy, submitLabel: "Build the week", onSubmit: { build($0) })
            }
            .padding(.top, 20)
        }
    }

    private func noticeView(_ text: String) -> some View {
        // "Heard: ..." alone is a confirmation, anything else is a problem to read.
        return LINotice(text, warn: !text.hasPrefix("Heard:"))
    }

    // MARK: a plan

    private func planned(_ s: MealsSnapshot, _ plan: MealPlan, _ sum: PlanSummary) -> some View {
        let budget = plan.budget
        let over = sum.cost > budget + 0.004
        let bought = s.rows.filter { $0.bought && !s.pantry.contains(MealsCore.foodKey($0.name)) }.count
        let toBuy = s.lines.filter { !s.pantry.contains(MealsCore.foodKey($0.name)) }.count
        let slots = MealsCore.slots.filter { slot in s.meals.contains { $0.slot == slot } }
        let note = notes[s.weekStart] ?? model.note(for: s.weekStart)

        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                LIBigNumber(MealsCore.dollars(sum.cost).replacingOccurrences(of: "$", with: ""), prefix: "$", label: "Est. at \(s.store), week of \(LIDate.formatDateShort(s.weekStart))", size: .display)
                LIProgressBar(value: budget > 0 ? sum.cost / budget : 1)
                    .padding(.top, 16)
                    .opacity(over ? 0.6 : 1)
                budgetLine(s, sum, budget, over).padding(.top, 12)
                MealsEstimateNote(store: s.store).padding(.top, 6)
            }
            .padding(.top, 18)
            .padding(.horizontal, 2)

            if !note.isEmpty {
                noticeView(note).padding(.top, 18)
            } else if !sum.allDaysOk {
                noticeView("Some days are off target. Swap a meal or shuffle the week.").padding(.top, 18)
            }

            weekGrid(s, sum, slots).padding(.top, 20)

            LICard(feature: true) {
                HStack(spacing: 12) {
                    NavigationLink {
                        GroceryView(model: model)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Grocery list").liType(.label).foregroundColor(theme.ink2)
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("\(toBuy)").liType(.h1).foregroundColor(theme.ink)
                                Text(bought > 0 ? "items, \(bought) bought" : "items").liType(.sub).foregroundColor(theme.ink2)
                                Image(systemName: "chevron.right").font(.system(size: 12)).foregroundColor(theme.ink3)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    LXIconButton(systemName: "shuffle", label: "Shuffle", disabled: busy) {
                        build(values(s), shuffle: true)
                    }
                    LXIconButton(systemName: "slider.horizontal.3", label: "Adjust", disabled: busy) {
                        adjust = true
                    }
                }
            }
            .padding(.top, 22)

            HStack(alignment: .top, spacing: 14) {
                MealsTrackStat(label: "Food eaten", value: MealsCore.dollars(MealsCore.jsRound(sum.foodCost)), estimated: true)
                MealsTrackStat(label: "Left in packs", value: MealsCore.dollars(MealsCore.jsRound(max(0, sum.cost - sum.foodCost))), estimated: true)
                MealsTrackStat(label: "A day", value: MealsCore.dollars(MealsCore.round(sum.cost / 7, 2)), estimated: true)
            }
            .padding(.top, 24)
            .padding(.horizontal, 2)
        }
    }

    private func budgetLine(_ s: MealsSnapshot, _ sum: PlanSummary, _ budget: Double, _ over: Bool) -> some View {
        var text = AttributedString(over ? "About \(MealsCore.dollars(sum.overBy)) over budget" : "About \(MealsCore.dollars(budget - sum.cost)) under budget")
        text.foregroundColor = over ? theme.warn : theme.ink
        var rest = AttributedString(" of \(MealsCore.dollars(budget)).")
        rest.foregroundColor = theme.ink2
        text.append(rest)
        if s.spent > 0 {
            var spent = AttributedString(" Spent so far: \(MealsCore.dollars(s.spent)), \(s.spent > budget ? "\(MealsCore.dollars(s.spent - budget)) over budget" : "\(MealsCore.dollars(budget - s.spent)) left").")
            spent.foregroundColor = theme.ink2
            text.append(spent)
        }
        return Text(text).liType(.sub)
    }

    private func weekGrid(_ s: MealsSnapshot, _ sum: PlanSummary, _ slots: [MealSlot]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .bottom, spacing: 4) {
                Text("kcal, g").liType(.caption).foregroundColor(theme.ink2).frame(width: 46, alignment: .leading).padding(.leading, 4)
                ForEach(slots, id: \.self) { slot in
                    Text(MealsCore.slotLabel(slot)).liType(.caption).foregroundColor(theme.ink2).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 3)
                }
            }
            .padding(.bottom, 4)
            ForEach(s.dates, id: \.self) { date in
                dayRow(s, sum, date, slots)
            }
            Text("Each day: \(MealsCore.describeTargets(s.targets))\(s.challengeName.map { ", from \($0)" } ?? "").")
                .liType(.caption).foregroundColor(theme.ink2).padding(.top, 8).padding(.horizontal, 4)
        }
    }

    private func dayRow(_ s: MealsSnapshot, _ sum: PlanSummary, _ date: DateStr, _ slots: [MealSlot]) -> some View {
        let day = sum.days.first { $0.date == date }
        let isToday = date == s.today
        let tone = (day?.ok ?? true) ? theme.ink2 : theme.warn
        return HStack(alignment: .top, spacing: 4) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(MealsDates.dayName(date)) \(MealsDates.dayOfMonth(date))")
                    .liType(.sub).foregroundColor(isToday ? theme.accent : theme.ink)
                Text(MealsCore.fmt(day?.calories ?? 0)).liType(.caption).foregroundColor(tone)
                Text(MealsCore.fmt(day?.protein ?? 0) + "g").liType(.caption).foregroundColor(tone)
            }
            .frame(width: 46, alignment: .leading)
            .padding(.leading, 4)
            ForEach(slots, id: \.self) { slot in
                cell(s, date, slot, isToday)
            }
        }
    }

    @ViewBuilder
    private func cell(_ s: MealsSnapshot, _ date: DateStr, _ slot: MealSlot, _ isToday: Bool) -> some View {
        if let meal = s.meals.first(where: { $0.date == date && $0.slot == slot }) {
            let r = s.recipeById[meal.recipeId]
            let done = model.isLogged(meal)
            Button(action: {
                LIHaptics.tap()
                open = MealKey(date: date, slot: slot)
            }) {
                Text(r?.name ?? "Recipe removed")
                    .font(LIFont.regular(11.5))
                    .foregroundColor(done ? theme.accentInk : theme.ink)
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 5)
                    .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(done ? AnyShapeStyle(theme.gradient) : AnyShapeStyle(theme.tile)))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(done ? Color.clear : (isToday ? theme.ink3 : theme.tileLine), lineWidth: 1))
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("\(r?.name ?? "Recipe removed"), \(MealsCore.slotLabel(slot))\(done ? ", logged" : "")")
        } else {
            Color.clear.frame(maxWidth: .infinity, minHeight: 58)
        }
    }

    // MARK: build

    private func build(_ v: MealsBuildValues, shuffle: Bool = false) {
        if busy { return }
        busy = true
        let week = model.snap?.weekStart ?? ""
        Task {
            do {
                let out = try await model.build(v, shuffle: shuffle)
                notes[week] = out.message
                asks[week] = v.ask
                if out.status == .noRecipes {
                    LIHaptics.error()
                    toast = out.message
                } else {
                    adjust = false
                    if out.status == .ok {
                        LIHaptics.celebrate()
                        toast = shuffle ? "New week built" : "Week built"
                    } else {
                        LIHaptics.error()
                    }
                }
            } catch {
                LIHaptics.error()
                toast = MealsModel.describe(error)
            }
            busy = false
        }
    }
}
