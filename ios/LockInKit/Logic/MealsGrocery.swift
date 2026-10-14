import Foundation

// Meal planning rules, part 3: one grocery list for the week. Quantities are
// combined across recipes in each food's own unit, rounded up to what a store
// sells, grouped by section, and priced through a PriceSource.
// Port of src/lib/logic/mealsGrocery.ts. Pure.

public struct GroceryLine: Equatable {
    /// Food name, or the typed name of an ingredient that is not in the table.
    public var name: String
    public var section: MealSection
    /// Nil for an ingredient that is not in the food table.
    public var food: MealFood?
    /// What the week's meals use, in `unit`.
    public var need: Double
    public var unit: String
    /// Packs to buy. Whole packs, or steps of a pack for food sold by weight.
    public var packs: Double
    public var packLabel: String
    /// For an unknown ingredient: what the needed amount costs, from the recipe.
    public var ownCost: Double

    public init(name: String, section: MealSection, food: MealFood?, need: Double, unit: String, packs: Double, packLabel: String, ownCost: Double) {
        self.name = name
        self.section = section
        self.food = food
        self.need = need
        self.unit = unit
        self.packs = packs
        self.packLabel = packLabel
        self.ownCost = ownCost
    }
}

public struct StoreTotal: Equatable {
    public var store: String
    public var total: Double
    /// How many lines are priced from a receipt, not an estimate.
    public var fromReceipts: Int
    public var lines: Int
    /// Dollars above the cheapest store. 0 for the cheapest.
    public var above: Double
}

public struct InstacartLineItem: Equatable {
    public var name: String
    public var quantity: Double
    public var unit: String
    public var displayText: String
}

public struct BudgetActual: Equatable {
    public var budget: Double
    public var estimated: Double
    public var spent: Double
    /// Positive: under budget.
    public var left: Double
    public var over: Bool
    /// spent minus estimated, once something is spent.
    public var offEstimate: Double?
}

public enum MealsGrocery {
    /// Buy this many packs to cover the need. A need within 3 percent of a pack does not tip into the next one.
    public static func packsFor(_ food: MealFood, _ need: Double) -> Double {
        if need <= 0 { return 0 }
        let step: Double = (food.step ?? 0) > 0 ? (food.step ?? 1) : 1
        let raw = need / food.pack / step
        let n = (raw - 0.03 / step).rounded(.up)
        return MealsCore.round(max(1, n) * step, 2)
    }

    /// Every ingredient the planned meals use, summed. Each meal's portion scales its recipe:
    /// 1.5 servings of a recipe that makes 4 uses 1.5 / 4 of the batch.
    public static func rollUp(_ meals: [PlannedMeal], _ recipes: [String: Recipe], _ index: [String: MealFood]) -> [GroceryLine] {
        var knownOrder: [String] = []
        var known: [String: (food: MealFood, need: Double)] = [:]
        var otherOrder: [String] = []
        var other: [String: GroceryLine] = [:]
        for meal in meals {
            guard let recipe = recipes[meal.recipeId], meal.servings > 0 else { continue }
            let share = meal.servings / (recipe.servings > 0 ? recipe.servings : 1)
            for ing in recipe.ingredients {
                let food = MealsCore.findFood(index, ing.name)
                var base: Double? = nil
                if let f = food { base = MealsCore.toBase(f, ing.quantity, ing.unit) }
                if let f = food, let b = base {
                    if var row = known[f.name] {
                        row.need += b * share
                        known[f.name] = row
                    } else {
                        known[f.name] = (f, b * share)
                        knownOrder.append(f.name)
                    }
                    continue
                }
                let unit = MealsCore.normalizeUnit(ing.unit)
                let key = MealsCore.foodKey(ing.name) + "|" + unit
                var row = other[key] ?? GroceryLine(name: ing.name.trimmingCharacters(in: .whitespacesAndNewlines), section: .other, food: nil, need: 0, unit: unit, packs: 0, packLabel: unit, ownCost: 0)
                if other[key] == nil { otherOrder.append(key) }
                row.need += ing.quantity * share
                row.ownCost += (ing.estCost ?? 0) * share
                other[key] = row
            }
        }
        var lines: [GroceryLine] = []
        for k in knownOrder {
            guard let entry = known[k] else { continue }
            let food = entry.food
            lines.append(GroceryLine(name: food.name, section: food.section, food: food, need: MealsCore.round(entry.need, 2), unit: food.base.rawValue, packs: packsFor(food, entry.need), packLabel: food.packLabel, ownCost: 0))
        }
        for k in otherOrder {
            guard var row = other[k] else { continue }
            row.need = MealsCore.round(row.need, 2)
            row.packs = ((other[k]?.need ?? 0) - 1e-9).rounded(.up)
            row.ownCost = MealsCore.round(row.ownCost, 2)
            lines.append(row)
        }
        return sortLines(lines)
    }

    static func sortLines(_ lines: [GroceryLine]) -> [GroceryLine] {
        let indexed = lines.enumerated().map { ($0.offset, $0.element) }
        let sorted = indexed.sorted { a, b in
            if a.1.section.order != b.1.section.order { return a.1.section.order < b.1.section.order }
            let c = MealsCore.localeCompare(a.1.name, b.1.name)
            if c != 0 { return c < 0 }
            return a.0 < b.0
        }
        return sorted.map { $0.1 }
    }

    /// What a line costs at the register: packs times the pack price.
    public static func linePrice(_ line: GroceryLine, _ prices: PackPrices) -> Double {
        guard let f = line.food else { return line.ownCost }
        return MealsCore.round(line.packs * prices(f), 2)
    }

    /// What the food actually eaten is worth: the used share of each pack.
    public static func lineUsedCost(_ line: GroceryLine, _ prices: PackPrices) -> Double {
        guard let f = line.food else { return line.ownCost }
        return MealsCore.costOf(f, line.need, packPrice: prices(f))
    }

    public static func pantrySet(_ names: [String]) -> Set<String> {
        return Set(names.map { MealsCore.foodKey($0) })
    }

    public static func inPantry(_ name: String, _ pantry: Set<String>) -> Bool {
        return pantry.contains(MealsCore.foodKey(name))
    }

    /// Dollars at the register for the lines that are not already at home.
    public static func listTotal(_ lines: [GroceryLine], _ prices: PackPrices, _ pantry: Set<String>) -> Double {
        var total = 0.0
        for l in lines where !pantry.contains(MealsCore.foodKey(l.name)) { total += linePrice(l, prices) }
        return MealsCore.round(total, 2)
    }

    /// The same list priced at every store, cheapest first.
    public static func compareStores(_ lines: [GroceryLine], _ source: PriceSource, _ pantry: Set<String>) -> [StoreTotal] {
        let buy = lines.filter { !pantry.contains(MealsCore.foodKey($0.name)) }
        var out: [StoreTotal] = []
        for store in MealsPricing.stores {
            var total = 0.0
            var fromReceipts = 0
            for l in buy {
                guard let f = l.food else {
                    total += l.ownCost
                    continue
                }
                let q = source.quote(f, store)
                total += l.packs * q.price
                if q.source != .estimate { fromReceipts += 1 }
            }
            out.append(StoreTotal(store: store, total: MealsCore.round(total, 2), fromReceipts: fromReceipts, lines: buy.count, above: 0))
        }
        let order = MealsPricing.stores
        let sorted = out.sorted { a, b in
            if a.total != b.total { return a.total < b.total }
            return (order.firstIndex(of: a.store) ?? 0) < (order.firstIndex(of: b.store) ?? 0)
        }
        let low = sorted.first?.total ?? 0
        return sorted.map { s in
            var x = s
            x.above = MealsCore.round(s.total - low, 2)
            return x
        }
    }

    /// Every store's price for one line, for the grocery_item row.
    public static func linePrices(_ line: GroceryLine, _ source: PriceSource) -> [String: Double] {
        var out: [String: Double] = [:]
        for store in MealsPricing.stores {
            if let f = line.food {
                out[store] = MealsCore.round(line.packs * source.quote(f, store).price, 2)
            } else {
                out[store] = line.ownCost
            }
        }
        return out
    }

    // MARK: how a line reads

    static func plural(_ label: String, _ n: Double) -> String {
        if n == 1 { return label }
        if let f = label.unicodeScalars.first, f.value >= 48 && f.value <= 57 { return label }
        if label == "each" || label == "lb" { return label }
        if label == "dozen" { return "dozen" }
        if label.hasSuffix("x") { return label + "es" }
        return label + "s"
    }

    static func num(_ n: Double) -> String {
        return MealsCore.jsNum(MealsCore.round(n, 2))
    }

    /// "2 lb", "1 dozen", "3 cans", "2 x 12 oz bag".
    public static func buyLabel(_ line: GroceryLine) -> String {
        guard line.food != nil else {
            let unit = line.unit == "each" ? "" : line.unit
            return (num(line.need) + " " + unit).trimmingCharacters(in: .whitespaces)
        }
        let n = line.packs
        let label = line.packLabel
        if label == "each" { return num(n) }
        if let f = label.unicodeScalars.first, f.value >= 48 && f.value <= 57 {
            return n == 1 ? label : num(n) + " x " + label
        }
        return num(n) + " " + plural(label, n)
    }

    /// What the recipes use, in kitchen terms: "680 g", "8", "1.4 L".
    public static func needLabel(_ line: GroceryLine) -> String {
        if line.unit == "each" { return num(MealsCore.round(line.need, 1)) }
        if line.unit == "g" || line.unit == "ml" {
            let n = line.need
            if n >= 1000 {
                return MealsCore.jsNum(MealsCore.round(n / 1000, 2)) + " " + (line.unit == "g" ? "kg" : "L")
            }
            return MealsCore.jsNum(MealsCore.jsRound(n)) + " " + line.unit
        }
        return num(line.need) + " " + line.unit
    }

    public static func displayName(_ name: String) -> String {
        var base = name
        let frozen = name.hasPrefix("frozen ")
        if frozen { base = String(name.dropFirst(7)) }
        let cap = base.prefix(1).uppercased() + base.dropFirst()
        return cap + (frozen ? ", frozen" : "")
    }

    /// The list as plain text, to copy or share. Sections as headings, one item per line.
    public static func listAsText(_ lines: [GroceryLine], _ pantry: Set<String>, title: String) -> String {
        var out: [String] = [title]
        var section: MealSection? = nil
        for l in lines {
            if pantry.contains(MealsCore.foodKey(l.name)) { continue }
            if l.section != section {
                section = l.section
                out.append("")
                out.append(l.section.label)
            }
            out.append("[ ] " + displayName(l.name) + ", " + buyLabel(l))
        }
        return out.joined(separator: "\n")
    }

    /// Line items for Instacart's "create shopping list page" call. Weights go as grams or milliliters
    /// of what the recipes need, counts as each, so Instacart matches a product size itself.
    public static func instacartItems(_ lines: [GroceryLine], _ pantry: Set<String>) -> [InstacartLineItem] {
        var out: [InstacartLineItem] = []
        for l in lines {
            if pantry.contains(MealsCore.foodKey(l.name)) || !(l.need > 0) { continue }
            let unit: String
            switch l.unit {
            case "g": unit = "gram"
            case "ml": unit = "milliliter"
            default: unit = l.unit
            }
            let quantity: Double = l.unit == "each" ? (l.need - 1e-9).rounded(.up) : l.need.rounded(.up)
            out.append(InstacartLineItem(name: l.name, quantity: quantity, unit: unit, displayText: displayName(l.name) + ", " + buyLabel(l)))
        }
        return out
    }

    public static func budgetActual(budget: Double, estimated: Double, spent: Double) -> BudgetActual {
        return BudgetActual(
            budget: budget,
            estimated: MealsCore.round(estimated, 2),
            spent: MealsCore.round(spent, 2),
            left: MealsCore.round(budget - spent, 2),
            over: spent > budget + 0.004,
            offEstimate: spent > 0 ? MealsCore.round(spent - estimated, 2) : nil
        )
    }
}
