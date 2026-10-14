import SwiftUI
import LockInKit

/// The recipe table: search, filter by meal, read one, add your own.
struct RecipesView: View {
    @Environment(\.liTheme) private var theme
    let model: MealsModel

    @State private var slot: MealSlot? = nil
    @State private var query = ""
    @State private var viewing: Recipe? = nil
    @State private var editing: RecipeEdit? = nil
    @State private var toast: String? = nil

    struct RecipeEdit: Identifiable {
        var recipe: Recipe?
        var id: String { return recipe?.id ?? "new" }
    }

    private var shown: [Recipe] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return model.recipes.filter { r in
            if let s = slot, r.slot != s { return false }
            if q.isEmpty { return true }
            return r.name.lowercased().contains(q) || r.ingredients.contains { $0.name.lowercased().contains(q) } || r.tags.contains(q)
        }
    }

    var body: some View {
        LIScreen {
            HStack(alignment: .top) {
                LIPageHeader("Recipes", subtitle: model.recipes.isEmpty ? nil : "\(model.recipes.count) recipes. Numbers are per serving.")
                LXIconButton(systemName: "plus", label: "Add a recipe") { editing = RecipeEdit(recipe: nil) }
                    .padding(.top, 14)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    LIChip("All", on: slot == nil) { slot = nil }
                    ForEach(MealsCore.slots, id: \.self) { s in
                        LIChip(MealsCore.slotLabel(s), on: slot == s) { slot = s }
                    }
                }
            }
            .padding(.top, 6)
            LXShell {
                Image(systemName: "magnifyingglass").font(.system(size: 15)).foregroundColor(theme.ink2)
                TextField(text: $query, prompt: Text("Search by name or ingredient").foregroundColor(theme.ink3)) { Text("Search recipes") }
                    .liType(.body)
                    .foregroundColor(theme.ink)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding(.top, 12)

            if model.loading || (model.recipes.isEmpty && query.isEmpty) {
                HStack { Spacer(); ProgressView().tint(theme.ink2); Spacer() }.padding(.top, 60)
            } else if shown.isEmpty {
                LIEmptyState(title: "No recipes match", message: "Try another word, or add your own recipe.", actionTitle: "Add a recipe") { editing = RecipeEdit(recipe: nil) }
                    .padding(.top, 20)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, r in
                        if i > 0 { LIHairline() }
                        Button(action: {
                            LIHaptics.tap()
                            viewing = r
                        }) {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(r.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                                    Text(sub(r)).liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
                                }
                                Spacer(minLength: 8)
                                LXEst(text: MealsCore.dollars(r.estCost)).liType(.body)
                            }
                            .padding(.vertical, 12)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 8)
            }
            Text("Costs are estimates per serving, not a store's shelf price.").liType(.caption).foregroundColor(theme.ink2).padding(.top, 12).padding(.horizontal, 2)
        }
        .scrollDismissesKeyboard(.interactively)
        .task { if model.recipes.isEmpty { await model.load() } }
        .lxToast($toast)
        .sheet(item: $viewing) { r in
            detail(model.recipes.first { $0.id == r.id } ?? r)
                .liSheetStyle()
        }
        .sheet(item: $editing) { e in
            RecipeEditor(model: model, recipe: e.recipe, defaultSlot: slot ?? .dinner, onClose: { editing = nil }, onToast: { toast = $0 })
                .liSheetStyle()
        }
    }

    private func sub(_ r: Recipe) -> String {
        var s = "\(MealsCore.slotLabel(r.slot)), \(MealsCore.fmt(r.calories)) kcal, \(MealsCore.fmt(r.protein))g protein"
        if r.source == .user { s += ", yours" }
        if MealsCore.isExcluded(r, model.snap?.dislikes ?? []) { s += ", left out" }
        return s
    }

    private func detail(_ r: Recipe) -> some View {
        let excluded = MealsCore.isExcluded(r, model.snap?.dislikes ?? [])
        return LXSheet(title: r.name, subtitle: "\(MealsCore.slotLabel(r.slot)), makes \(MealsCore.jsNum(r.servings)) \(r.servings == 1 ? "serving" : "servings")") {
            VStack(alignment: .leading, spacing: 0) {
                MealsMacroRow(calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat)
                HStack(spacing: 4) {
                    Text("Per serving,").foregroundColor(theme.ink2)
                    LXEst(text: MealsCore.dollars(r.estCost))
                    if excluded { Text("Left out of plans by your dislikes.").foregroundColor(theme.warn) }
                }
                .liType(.sub)
                .padding(.top, 16)
                Text("Ingredients, whole batch").liType(.label).foregroundColor(theme.ink2).padding(.top, 24).padding(.bottom, 4)
                MealsIngredientList(rows: r.ingredients.map { (name: MealsGrocery.displayName($0.name), amount: MealsCore.amountLabel($0.quantity, $0.unit)) })
                Text("Steps").liType(.label).foregroundColor(theme.ink2).padding(.top, 24).padding(.bottom, 12)
                if r.steps.isEmpty {
                    Text("No steps written.").liType(.sub).foregroundColor(theme.ink2)
                } else {
                    MealsStepList(steps: r.steps)
                }
            }
        } footer: {
            LXWideButton(title: "Edit recipe") {
                viewing = nil
                editing = RecipeEdit(recipe: r)
            }
        }
    }
}

/// Add or edit a recipe. Calories, macros and estimated cost are worked out from the ingredients as you type.
struct RecipeEditor: View {
    @Environment(\.liTheme) private var theme
    let model: MealsModel
    let recipe: Recipe?
    let defaultSlot: MealSlot
    let onClose: () -> Void
    let onToast: (String) -> Void

    private static let other = "@other"

    struct Row: Identifiable {
        var id = UUID()
        /// A food table name, or "@other".
        var food: String
        var custom: String = ""
        var quantity: Double?
        var unit: String
        var cost: Double?
    }

    @State private var name: String
    @State private var slot: MealSlot
    @State private var servings: Double?
    @State private var rows: [Row]
    @State private var steps: String
    @State private var calories: Double?
    @State private var protein: Double?
    @State private var carbs: Double?
    @State private var fat: Double?
    @State private var busy = false
    @State private var confirmDelete = false

    private static let foodNames: [String] = MealsFoods.all.map { $0.name }.sorted { MealsCore.localeLess($0, $1) }

    init(model: MealsModel, recipe: Recipe?, defaultSlot: MealSlot, onClose: @escaping () -> Void, onToast: @escaping (String) -> Void) {
        self.model = model
        self.recipe = recipe
        self.defaultSlot = defaultSlot
        self.onClose = onClose
        self.onToast = onToast
        _name = State(initialValue: recipe?.name ?? "")
        _slot = State(initialValue: recipe?.slot ?? defaultSlot)
        _servings = State(initialValue: recipe?.servings ?? 1)
        _steps = State(initialValue: recipe?.steps.joined(separator: "\n") ?? "")
        _calories = State(initialValue: recipe?.calories)
        _protein = State(initialValue: recipe?.protein)
        _carbs = State(initialValue: recipe?.carbs)
        _fat = State(initialValue: recipe?.fat)
        if let r = recipe {
            _rows = State(initialValue: r.ingredients.map { RecipeEditor.row(from: $0) })
        } else {
            _rows = State(initialValue: [Row(food: "chicken breast", quantity: nil, unit: "g")])
        }
    }

    private static func row(from i: Ingredient) -> Row {
        if let food = MealsCore.findFood(MealsModel.foodIndex, i.name) {
            return Row(food: food.name, quantity: i.quantity, unit: i.unit)
        }
        return Row(food: other, custom: i.name, quantity: i.quantity, unit: i.unit, cost: i.estCost)
    }

    private var lines: [MealLine] {
        return rows.compactMap { r in
            guard let q = r.quantity, q > 0 else { return nil }
            if r.food == RecipeEditor.other {
                let n = r.custom.trimmingCharacters(in: .whitespaces)
                if n.isEmpty { return nil }
                return MealLine(name: n, quantity: q, unit: r.unit, estCost: r.cost ?? 0, category: "other")
            }
            return MealLine(name: r.food, quantity: q, unit: r.unit)
        }
    }

    private var numbers: MealRecipeNumbers {
        return MealsCore.recipeNumbers(lines, servings: servings ?? 1, index: MealsModel.foodIndex)
    }

    private func unitsOf(_ food: String) -> [String] {
        if food != RecipeEditor.other, let f = MealsCore.findFood(MealsModel.foodIndex, food) { return MealsCore.unitsFor(f) }
        return MealsCore.units
    }

    private var canSave: Bool {
        return !name.trimmingCharacters(in: .whitespaces).isEmpty && !lines.isEmpty && (servings ?? 0) > 0 && !busy
    }

    var body: some View {
        let n = numbers
        let hasOther = !n.unknown.isEmpty
        let shownCal = hasOther ? (calories ?? n.calories) : n.calories
        let shownPro = hasOther ? (protein ?? n.protein) : n.protein
        let shownCarb = hasOther ? (carbs ?? n.carbs) : n.carbs
        let shownFat = hasOther ? (fat ?? n.fat) : n.fat
        return LXSheet(title: recipe == nil ? "New recipe" : "Edit recipe") {
            VStack(alignment: .leading, spacing: 18) {
                LXField(label: "Name", text: $name, placeholder: "Chicken and rice")
                VStack(alignment: .leading, spacing: 8) {
                    Text("Meal").liType(.sub).foregroundColor(theme.ink2)
                    LXFlow(spacing: 8) {
                        ForEach(MealsCore.slots, id: \.self) { s in
                            LIChip(MealsCore.slotLabel(s), on: slot == s) { slot = s }
                        }
                    }
                }
                LXNumberField(label: "Makes", value: $servings, unit: "servings", placeholder: "1", decimal: false)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Ingredients, whole batch").liType(.label).foregroundColor(theme.ink2)
                    ForEach($rows) { $r in
                        ingredientCard($r)
                    }
                    LXWideButton(title: "Add ingredient") {
                        rows.append(Row(food: "chicken breast", quantity: nil, unit: "g"))
                    }
                }

                if hasOther {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(n.unknown.joined(separator: ", ")) \(n.unknown.count == 1 ? "is" : "are") not in the food table. Type the macros per serving.")
                            .liType(.sub).foregroundColor(theme.ink)
                        HStack(spacing: 10) {
                            LXNumberField(label: "Calories", value: $calories, unit: "kcal", decimal: false)
                            LXNumberField(label: "Protein", value: $protein, unit: "g")
                        }
                        HStack(spacing: 10) {
                            LXNumberField(label: "Carbs", value: $carbs, unit: "g")
                            LXNumberField(label: "Fat", value: $fat, unit: "g")
                        }
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.warnSoft))
                }

                LXField(label: "Steps", text: $steps, placeholder: "One step per line", lines: 8)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Per serving").liType(.label).foregroundColor(theme.ink2)
                    HStack(spacing: 4) {
                        Text("\(MealsCore.fmt(shownCal)) kcal, \(MealsCore.fmt(shownPro))g protein, \(MealsCore.fmt(shownCarb))g carbs, \(MealsCore.fmt(shownFat))g fat,").foregroundColor(theme.ink)
                        LXEst(text: MealsCore.dollars(n.estCost))
                    }
                    .liType(.sub)
                }
            }
        } footer: {
            HStack(spacing: 10) {
                if let r = recipe, r.source == .user {
                    LXDangerButton(title: "Delete", busy: busy) { confirmDelete = true }
                        .frame(maxWidth: 120)
                }
                LXPrimaryButton(title: recipe == nil ? "Add recipe" : "Save recipe", busy: busy, disabled: !canSave) { save(hasOther, shownCal, shownPro, shownCarb, shownFat) }
            }
        }
        .confirmationDialog("Delete this recipe?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { remove() }
            Button("Keep it", role: .cancel) {}
        }
    }

    private func ingredientCard(_ r: Binding<Row>) -> some View {
        let units = unitsOf(r.wrappedValue.food)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Menu {
                    Picker("Food", selection: Binding<String>(get: { r.wrappedValue.food }, set: { v in
                        r.wrappedValue.food = v
                        let u = unitsOf(v)
                        if !u.contains(r.wrappedValue.unit) {
                            if v != RecipeEditor.other, let f = MealsCore.findFood(MealsModel.foodIndex, v) { r.wrappedValue.unit = f.base.rawValue } else { r.wrappedValue.unit = u.first ?? "g" }
                        }
                    })) {
                        ForEach(RecipeEditor.foodNames, id: \.self) { f in
                            Text(MealsGrocery.displayName(f)).tag(f)
                        }
                        Text("Something else").tag(RecipeEditor.other)
                    }
                } label: {
                    HStack {
                        Text(r.wrappedValue.food == RecipeEditor.other ? "Something else" : MealsGrocery.displayName(r.wrappedValue.food)).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 12)).foregroundColor(theme.ink2)
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(theme.surface3))
                }
                Button(action: {
                    LIHaptics.tap()
                    if rows.count > 1 { rows.removeAll { $0.id == r.wrappedValue.id } }
                }) {
                    Image(systemName: "xmark").font(.system(size: 14)).foregroundColor(theme.ink2).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Remove ingredient")
            }
            if r.wrappedValue.food == RecipeEditor.other {
                HStack(spacing: 8) {
                    LXField(label: nil, text: r.custom, placeholder: "Ingredient name")
                    LXNumberField(label: nil, value: r.cost, prefix: "$", placeholder: "Cost")
                        .frame(maxWidth: 120)
                }
            }
            HStack(spacing: 8) {
                LXNumberField(label: nil, value: r.quantity, placeholder: "Amount")
                Menu {
                    Picker("Unit", selection: r.unit) {
                        ForEach(units, id: \.self) { u in Text(u).tag(u) }
                    }
                } label: {
                    HStack {
                        Text(units.contains(r.wrappedValue.unit) ? r.wrappedValue.unit : (units.first ?? "g")).liType(.body).foregroundColor(theme.ink)
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 12)).foregroundColor(theme.ink2)
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 52)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.tile))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
    }

    private func save(_ hasOther: Bool, _ c: Double, _ p: Double, _ cb: Double, _ f: Double) {
        if !canSave { return }
        busy = true
        let input = RecipeInput(
            name: name,
            slot: slot,
            servings: servings ?? 1,
            lines: lines,
            steps: steps.components(separatedBy: "\n"),
            manual: hasOther ? MealMacros(calories: c, protein: p, carbs: cb, fat: f) : nil
        )
        Task {
            do {
                try await model.saveRecipe(input, existing: recipe)
                LIHaptics.celebrate()
                onToast(recipe == nil ? "Recipe added" : "Recipe saved")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(MealsModel.describe(error))
                busy = false
            }
        }
    }

    private func remove() {
        guard let r = recipe, !busy else { return }
        busy = true
        Task {
            do {
                try await model.deleteRecipe(r)
                onToast("Recipe deleted")
                onClose()
            } catch {
                onToast(MealsModel.describe(error))
                busy = false
            }
        }
    }
}
