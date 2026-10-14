import SwiftUI
import LockInKit

/// One planned meal: the recipe scaled to the planned portion, the portion itself, "Cooked, log it", and swap.
struct PlannedMealSheet: View {
    @Environment(\.liTheme) private var theme
    let model: MealsModel
    let date: DateStr
    let slot: MealSlot
    let onClose: () -> Void
    let onToast: (String) -> Void

    private enum Mode { case cook, swap }
    private enum Amount { case portion, batch }

    @State private var mode: Mode = .cook
    @State private var amount: Amount = .portion
    @State private var scope: SwapScope = .day
    @State private var picked: String? = nil
    @State private var busy = false
    /// The portion being tried. Nil until it is changed, then it is saved or put back.
    @State private var draft: Double? = nil
    @State private var options: [SwapOption] = []

    static let portionStep = 0.25
    static let portionMin = 0.25
    static let portionMax = 4.0

    private func signedMoney(_ n: Double) -> String {
        if abs(n) < 0.005 { return "no change" }
        return (n > 0 ? "+" : "-") + MealsCore.dollars(abs(n))
    }

    var body: some View {
        Group {
            if let s = model.snap, let plan = s.plan, let meal = s.meals.first(where: { $0.date == date && $0.slot == slot }) {
                if let recipe = s.recipeById[meal.recipeId] {
                    if mode == .swap {
                        swapView(s, plan, meal, recipe)
                    } else {
                        cookView(s, plan, meal, recipe)
                    }
                } else {
                    LXSheet(title: "Recipe removed", subtitle: "This meal's recipe is no longer in your library.") {
                        Text("Rebuild the week to replace it.").liType(.sub).foregroundColor(theme.ink2)
                    }
                }
            } else {
                LXSheet(title: "Not on the plan", subtitle: "This meal is no longer in the week.") { EmptyView() }
            }
        }
    }

    // MARK: cook

    private func replaced(_ s: MealsSnapshot, servings: Double) -> [PlannedMeal] {
        return s.meals.map { x in
            var y = x
            if x.date == date && x.slot == slot { y.servings = servings }
            return y
        }
    }

    private func cookView(_ s: MealsSnapshot, _ plan: MealPlan, _ meal: PlannedMeal, _ recipe: Recipe) -> some View {
        let repeats = s.meals.filter { $0.slot == slot && $0.recipeId == meal.recipeId }
        let weekServings = repeats.reduce(0) { $0 + $1.servings }
        let portion = draft ?? meal.servings
        let changed = draft != nil && abs((draft ?? 0) - meal.servings) > 0.001
        let preview: PlanSummary? = changed ? MealsPlanner.summarizePlan(replaced(s, servings: portion), s.ctx, dates: s.dates) : s.summary
        let day = preview?.days.first { $0.date == date } ?? s.summary?.days.first { $0.date == date }
        let logged = model.isLogged(meal)
        let canLog = date <= s.today && !logged
        let divisor = recipe.servings > 0 ? recipe.servings : 1
        let scale = (amount == .batch ? weekServings - meal.servings + portion : portion) / divisor

        return LXSheet(title: recipe.name, subtitle: "\(MealsCore.slotLabel(slot)), \(LIDate.formatDateLong(date))") {
            VStack(alignment: .leading, spacing: 0) {
                MealsMacroRow(calories: recipe.calories * portion, protein: recipe.protein * portion, carbs: recipe.carbs * portion, fat: recipe.fat * portion)

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Your portion").liType(.label).foregroundColor(theme.ink2)
                        HStack(spacing: 4) {
                            Text(MealsCore.servingsLabel(portion)).liType(.value).foregroundColor(theme.ink)
                            Text(",").liType(.sub).foregroundColor(theme.ink2)
                            LXEst(text: MealsCore.dollars(MealsCore.round(recipe.estCost * portion, 2))).liType(.sub).foregroundColor(theme.ink2)
                        }
                    }
                    Spacer(minLength: 8)
                    if !logged {
                        HStack(spacing: 8) {
                            LXIconButton(systemName: "minus", label: "Smaller portion", disabled: busy || portion <= PlannedMealSheet.portionMin) { step(-PlannedMealSheet.portionStep, portion, meal) }
                            LXIconButton(systemName: "plus", label: "Larger portion", disabled: busy || portion >= PlannedMealSheet.portionMax) { step(PlannedMealSheet.portionStep, portion, meal) }
                        }
                    }
                }
                .padding(.leading, 16)
                .padding(.trailing, 8)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
                .padding(.top, 20)

                if let day = day, let preview = preview {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 0) {
                            Text("Day: ").foregroundColor(theme.ink2)
                            Text(MealsCore.macroLine(calories: day.calories, protein: day.protein)).foregroundColor(day.ok ? theme.ink : theme.warn)
                            if !day.ok { Text(" (off target)").foregroundColor(theme.warn) }
                        }
                        HStack(spacing: 0) {
                            Text("Week: ").foregroundColor(theme.ink2)
                            Text("est. " + MealsCore.dollars(preview.cost)).foregroundColor(theme.ink)
                            let overBudget = preview.cost > preview.budget + 0.004
                            Text(" of \(MealsCore.dollars(preview.budget))" + (changed && s.summary != nil ? " (\(signedMoney(preview.cost - (s.summary?.cost ?? 0))))" : ""))
                                .foregroundColor(overBudget ? theme.warn : theme.ink2)
                        }
                    }
                    .liType(.sub)
                    .padding(.top, 12)
                    .padding(.horizontal, 2)
                }

                if repeats.count > 1 {
                    LISegmentedControl(
                        options: [(value: Amount.portion, title: "This portion"), (value: Amount.batch, title: "Batch for \(repeats.count) days")],
                        selection: $amount
                    )
                    .padding(.top, 16)
                }

                Text("Ingredients" + (amount == .batch ? ", \(MealsCore.servingsLabel(weekServings))" : "")).liType(.label).foregroundColor(theme.ink2).padding(.top, 24).padding(.bottom, 4)
                MealsIngredientList(rows: recipe.ingredients.map { (name: MealsGrocery.displayName($0.name), amount: MealsCore.amountLabel($0.quantity * scale, $0.unit)) })

                Text("Steps").liType(.label).foregroundColor(theme.ink2).padding(.top, 24).padding(.bottom, 12)
                MealsStepList(steps: recipe.steps)
                if recipe.servings > 1 {
                    Text("Steps describe the full batch of \(MealsCore.jsNum(recipe.servings)) servings. Amounts above are scaled.").liType(.caption).foregroundColor(theme.ink2).padding(.top, 16)
                }
            }
        } footer: {
            if changed {
                HStack(spacing: 10) {
                    LXWideButton(title: "Put back", disabled: busy) { draft = nil }
                        .frame(maxWidth: 140)
                    LXPrimaryButton(title: "Save portion", busy: busy) { savePortion(s, plan, portion) }
                }
            } else {
                HStack(spacing: 10) {
                    LXWideButton(title: "Swap", disabled: busy || logged) {
                        mode = .swap
                        loadOptions(s)
                    }
                    .frame(maxWidth: 130)
                    LXPrimaryButton(title: logged ? "Logged" : (date > s.today ? "Log it on the day" : "Cooked, log it"), busy: busy, disabled: !canLog) { log(recipe, meal) }
                }
            }
        }
    }

    private func step(_ by: Double, _ portion: Double, _ meal: PlannedMeal) {
        let raw = ((portion + by) / PlannedMealSheet.portionStep).rounded() * PlannedMealSheet.portionStep
        let next = min(PlannedMealSheet.portionMax, max(PlannedMealSheet.portionMin, raw))
        LIHaptics.tap()
        draft = abs(next - meal.servings) < 0.001 ? nil : next
    }

    private func savePortion(_ s: MealsSnapshot, _ plan: MealPlan, _ portion: Double) {
        if busy { return }
        busy = true
        let next = replaced(s, servings: portion)
        Task {
            do {
                try await model.savePlan(weekStart: s.weekStart, meals: next, budget: plan.budget, store: s.store)
                LIHaptics.celebrate()
                onToast("Portion set to \(MealsCore.servingsLabel(portion))")
                draft = nil
            } catch {
                LIHaptics.error()
                onToast(MealsModel.describe(error))
            }
            busy = false
        }
    }

    private func log(_ recipe: Recipe, _ meal: PlannedMeal) {
        if busy { return }
        busy = true
        Task {
            do {
                try await model.logCooked(date: date, slot: slot)
                LIHaptics.celebrate()
                onToast("Logged \(MealsCore.fmt(recipe.calories * meal.servings)) kcal and \(MealsCore.fmt(recipe.protein * meal.servings))g protein")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(MealsModel.describe(error))
                busy = false
            }
        }
    }

    // MARK: swap

    private func loadOptions(_ s: MealsSnapshot) {
        options = MealsPlanner.swapOptions(s.meals, date: date, slot: slot, scope: scope, ctx: s.ctx)
    }

    private func swapView(_ s: MealsSnapshot, _ plan: MealPlan, _ meal: PlannedMeal, _ recipe: Recipe) -> some View {
        let repeats = s.meals.filter { $0.slot == slot && $0.recipeId == meal.recipeId }
        let choice = options.first { $0.recipe.id == picked }
        return LXSheet(title: "Swap \(MealsCore.slotLabel(slot).lowercased())", subtitle: "For \(recipe.name). Best fit first.") {
            VStack(alignment: .leading, spacing: 0) {
                if repeats.count > 1 {
                    LISegmentedControl(
                        options: [(value: SwapScope.day, title: "Just this day"), (value: SwapScope.week, title: "All \(repeats.count) days")],
                        selection: Binding<SwapScope>(get: { scope }, set: { v in
                            scope = v
                            picked = nil
                            options = MealsPlanner.swapOptions(s.meals, date: date, slot: slot, scope: v, ctx: s.ctx)
                        })
                    )
                    .padding(.bottom, 12)
                }
                VStack(spacing: 8) {
                    ForEach(options, id: \.recipe.id) { o in
                        optionRow(o)
                    }
                }
                if options.isEmpty {
                    Text("No other \(MealsCore.slotLabel(slot).lowercased()) recipes fit your dislikes. Add one in Recipes.").liType(.sub).foregroundColor(theme.ink2).padding(.top, 8)
                }
                Text("Dollar changes are estimates.").liType(.caption).foregroundColor(theme.ink2).padding(.top, 12).padding(.horizontal, 2)
            }
        } footer: {
            VStack(alignment: .leading, spacing: 10) {
                if let c = choice {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 0) {
                            Text("Day: ").foregroundColor(theme.ink2)
                            Text(MealsCore.macroLine(calories: c.day.calories, protein: c.day.protein)).foregroundColor(c.day.ok ? theme.ink : theme.warn)
                            if !c.day.ok { Text(" (off target)").foregroundColor(theme.warn) }
                        }
                        HStack(spacing: 0) {
                            Text("Week: ").foregroundColor(theme.ink2)
                            Text("est. " + MealsCore.dollars(c.weekCost)).foregroundColor(theme.ink)
                            Text(" (\(signedMoney(c.costDelta))\(c.overBudget ? ", over budget" : ""))").foregroundColor(c.overBudget ? theme.warn : theme.ink2)
                        }
                    }
                    .liType(.sub)
                    .padding(.horizontal, 2)
                }
                HStack(spacing: 10) {
                    LXWideButton(title: "Back", disabled: busy) {
                        mode = .cook
                        picked = nil
                    }
                    .frame(maxWidth: 120)
                    LXPrimaryButton(title: choice != nil ? "Confirm swap" : "Pick a meal", busy: busy, disabled: choice == nil) {
                        if let c = choice { confirmSwap(s, plan, c) }
                    }
                }
            }
        }
    }

    private func optionRow(_ o: SwapOption) -> some View {
        let on = o.recipe.id == picked
        return Button(action: {
            LIHaptics.tap()
            picked = o.recipe.id
        }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(o.recipe.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                    Text("\(MealsCore.servingsLabel(o.servings)), day \(MealsCore.macroLine(calories: o.day.calories, protein: o.day.protein))").liType(.caption).foregroundColor(theme.ink2)
                    if o.liked || !o.day.ok || o.overBudget {
                        HStack(spacing: 8) {
                            if o.liked { Text("You like this").foregroundColor(theme.accent) }
                            if !o.day.ok { Text("Day off target").foregroundColor(theme.warn) }
                            if o.overBudget { Text("Over budget").foregroundColor(theme.warn) }
                        }
                        .liType(.caption)
                    }
                }
                Spacer(minLength: 8)
                Text(signedMoney(o.costDelta)).liType(.sub).foregroundColor(theme.ink)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(on ? theme.surface3 : theme.tile))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(on ? theme.ink : theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
    }

    private func confirmSwap(_ s: MealsSnapshot, _ plan: MealPlan, _ choice: SwapOption) {
        if busy { return }
        busy = true
        let next = MealsPlanner.applySwap(s.meals, date: date, slot: slot, recipeId: choice.recipe.id, scope: scope, ctx: s.ctx)
        Task {
            do {
                try await model.savePlan(weekStart: s.weekStart, meals: next, budget: plan.budget, store: s.store)
                LIHaptics.celebrate()
                onToast("Swapped to \(choice.recipe.name). The day is re-portioned.")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(MealsModel.describe(error))
                busy = false
            }
        }
    }
}
