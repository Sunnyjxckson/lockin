import Foundation

// Meal planning rules, part 1: foods, units, and what a recipe adds up to.
// Port of src/lib/logic/meals.ts. Pure, no network. Every recipe number is computed from the food table.
// All prices are estimates until the user types one from a receipt.

public struct MealMacros: Equatable {
    public var calories: Double
    public var protein: Double
    public var carbs: Double
    public var fat: Double

    public init(calories: Double = 0, protein: Double = 0, carbs: Double = 0, fat: Double = 0) {
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }
}

public enum MealBaseUnit: String, Equatable {
    case g
    case ml
    case each
}

public enum MealSection: String, CaseIterable, Equatable {
    case produce
    case meat
    case dairy
    case bakery
    case pantry
    case frozen
    case spices
    case other

    public var label: String {
        switch self {
        case .produce: return "Produce"
        case .meat: return "Meat and fish"
        case .dairy: return "Dairy and eggs"
        case .bakery: return "Bread"
        case .pantry: return "Pantry"
        case .frozen: return "Frozen"
        case .spices: return "Spices and oil"
        case .other: return "Other"
        }
    }

    /// Position in the store walk. Lists sort by it.
    public var order: Int {
        return MealSection.allCases.firstIndex(of: self) ?? 0
    }
}

/// One row of the food table.
public struct MealFood: Equatable {
    public var name: String
    public var section: MealSection
    public var base: MealBaseUnit
    /// Per 100 g, per 100 ml, or per one, by `base`.
    public var per: MealMacros
    /// Base units in one pack as sold.
    public var pack: Double
    /// How a pack reads on a list: "lb", "dozen", "can".
    public var packLabel: String
    /// Estimated dollars for one pack at a mid priced store.
    public var price: Double
    /// Smallest part of a pack you can buy. 0.25 for meat sold by weight.
    public var step: Double?
    /// Grams in a teaspoon, for a food weighed in g that recipes spoon or cup.
    public var tspGrams: Double?
    public var tags: [String]
    /// Salt, oil, spices: assumed to be at home until the user says otherwise.
    public var staple: Bool

    public init(name: String, section: MealSection, base: MealBaseUnit, per: MealMacros, pack: Double, packLabel: String, price: Double, step: Double? = nil, tspGrams: Double? = nil, tags: [String] = [], staple: Bool = false) {
        self.name = name
        self.section = section
        self.base = base
        self.per = per
        self.pack = pack
        self.packLabel = packLabel
        self.price = price
        self.step = step
        self.tspGrams = tspGrams
        self.tags = tags
        self.staple = staple
    }
}

/// What the user or the library writes down: a food and how much goes in the whole batch.
public struct MealLine: Equatable {
    public var name: String
    public var quantity: Double
    public var unit: String
    /// Only for a food that is not in the table: what this quantity costs.
    public var estCost: Double?
    public var category: String?

    public init(name: String, quantity: Double, unit: String, estCost: Double? = nil, category: String? = nil) {
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.estCost = estCost
        self.category = category
    }
}

public struct MealRecipeNumbers {
    public var calories: Double
    public var protein: Double
    public var carbs: Double
    public var fat: Double
    /// Estimated dollars for one serving.
    public var estCost: Double
    public var ingredients: [Ingredient]
    /// Ingredient names that are not in the food table, or whose unit does not convert.
    public var unknown: [String]
}

public struct DayTargets: Equatable {
    public var calMin: Double
    public var calMax: Double
    public var proteinMin: Double

    public init(calMin: Double, calMax: Double, proteinMin: Double) {
        self.calMin = calMin
        self.calMax = calMax
        self.proteinMin = proteinMin
    }
}

public enum MealsCore {
    public static let slots: [MealSlot] = [.breakfast, .lunch, .dinner, .snack]

    public static func slotLabel(_ s: MealSlot) -> String {
        switch s {
        case .breakfast: return "Breakfast"
        case .lunch: return "Lunch"
        case .dinner: return "Dinner"
        case .snack: return "Snack"
        }
    }

    public static let defaultTargets = DayTargets(calMin: 1900, calMax: 2100, proteinMin: 180)

    // MARK: numbers

    /// JavaScript Math.round: halves go up.
    public static func jsRound(_ x: Double) -> Double {
        return (x + 0.5).rounded(.down)
    }

    /// round() from meals.ts: to `places` decimals, with the epsilon nudge.
    public static func round(_ n: Double, _ places: Int = 0) -> Double {
        let f = pow(10.0, Double(places))
        return jsRound((n + Double.ulpOfOne) * f) / f
    }

    /// How JavaScript prints a number in a template: 2 not 2.0, 1.5 as 1.5.
    public static func jsNum(_ d: Double) -> String {
        if d == d.rounded() && abs(d) < 1e15 { return String(Int(d)) }
        return "\(d)"
    }

    static let usFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.usesGroupingSeparator = true
        f.roundingMode = .halfUp
        return f
    }()

    /// toLocaleString("en-US") with the given decimals.
    public static func group(_ n: Double, decimals: Int = 0) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.usesGroupingSeparator = true
        f.roundingMode = .halfUp
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    public static func dollars(_ n: Double) -> String {
        return "$" + group(n, decimals: 2)
    }

    /// A whole number with thousands separators.
    public static func fmt(_ n: Double) -> String {
        return group(jsRound(n), decimals: 0)
    }

    public static func macroLine(calories: Double, protein: Double) -> String {
        return "\(fmt(calories)) kcal, \(fmt(protein))g protein"
    }

    /// 1.25 reads "1 1/4", 0.5 reads "1/2". Quarters only, anything else one decimal.
    public static func fraction(_ n: Double) -> String {
        let whole = (n + 1e-9).rounded(.down)
        let part = round(n - whole, 2)
        var f: String? = nil
        if part == 0.25 { f = "1/4" } else if part == 0.5 { f = "1/2" } else if part == 0.75 { f = "3/4" }
        if part == 0 { return jsNum(whole) }
        guard let word = f else { return jsNum(round(n, 1)) }
        return whole == 0 ? word : "\(jsNum(whole)) \(word)"
    }

    public static func servingsLabel(_ n: Double) -> String {
        return "\(fraction(n)) \(n == 1 ? "serving" : "servings")"
    }

    /// An ingredient amount for the cook: grams to the nearest 5, spoons and cups in quarters, counts in halves.
    public static func amountLabel(_ quantity: Double, _ unit: String) -> String {
        let u = normalizeUnit(unit)
        if u == "g" || u == "ml" {
            let q: Double = quantity >= 20 ? jsRound(quantity / 5) * 5 : max(1, jsRound(quantity))
            return "\(group(q)) \(u)"
        }
        if u == "each" {
            return fraction(max(0.5, jsRound(quantity * 2) / 2))
        }
        let q = max(0.25, jsRound(quantity * 4) / 4)
        return "\(fraction(q)) \(u)"
    }

    // MARK: units

    static let mass: [String: Double] = ["g": 1, "kg": 1000, "oz": 28.3495, "lb": 453.592]
    static let volume: [String: Double] = ["ml": 1, "l": 1000, "tsp": 4.92892, "tbsp": 14.7868, "cup": 236.588, "fl oz": 29.5735]
    static let spoons: [String: Double] = ["tsp": 1, "tbsp": 3, "cup": 48]

    public static let units: [String] = ["g", "oz", "lb", "ml", "tsp", "tbsp", "cup", "each"]

    public static func normalizeUnit(_ unit: String?) -> String {
        var u = (unit ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if u.hasSuffix(".") { u.removeLast() }
        switch u {
        case "", "ea", "whole", "piece", "pieces": return "each"
        case "grams", "gram": return "g"
        case "ounce", "ounces": return "oz"
        case "pound", "pounds", "lbs": return "lb"
        case "teaspoon", "teaspoons": return "tsp"
        case "tablespoon", "tablespoons": return "tbsp"
        case "cups": return "cup"
        case "milliliter", "milliliters": return "ml"
        default: return u
        }
    }

    /// A quantity in the food's base unit, or nil when the unit cannot be converted for that food.
    public static func toBase(_ food: MealFood, _ quantity: Double, _ unit: String) -> Double? {
        let u = normalizeUnit(unit)
        if !quantity.isFinite { return nil }
        switch food.base {
        case .each:
            return u == "each" ? quantity : nil
        case .g:
            if let m = mass[u] { return quantity * m }
            if let s = spoons[u], let t = food.tspGrams, t > 0 { return quantity * s * t }
            return nil
        case .ml:
            if let v = volume[u] { return quantity * v }
            return nil
        }
    }

    /// The units a recipe can use for a food.
    public static func unitsFor(_ food: MealFood) -> [String] {
        switch food.base {
        case .each: return ["each"]
        case .ml: return ["ml", "tsp", "tbsp", "cup"]
        case .g:
            if let t = food.tspGrams, t > 0 { return ["g", "oz", "lb", "tsp", "tbsp", "cup"] }
            return ["g", "oz", "lb"]
        }
    }

    // MARK: food lookup

    public static func indexFoods(_ foods: [MealFood]) -> [String: MealFood] {
        var out: [String: MealFood] = [:]
        for f in foods { out[f.name] = f }
        return out
    }

    public static func foodKey(_ name: String) -> String {
        // Fast path: already lowercase letters, digits and single inner spaces.
        var clean = true
        var lastSpace = true
        for u in name.utf8 {
            if (u >= 97 && u <= 122) || (u >= 48 && u <= 57) {
                lastSpace = false
            } else if u == 32 && !lastSpace {
                lastSpace = true
            } else {
                clean = false
                break
            }
        }
        if clean && (name.isEmpty || !lastSpace) { return name }
        let parts = name.lowercased().split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "\n" })
        return parts.joined(separator: " ")
    }

    public static func findFood(_ index: [String: MealFood], _ name: String) -> MealFood? {
        return index[foodKey(name)]
    }

    public static func macrosOf(_ food: MealFood, _ baseQty: Double) -> MealMacros {
        let k: Double = food.base == .each ? baseQty : baseQty / 100
        return MealMacros(calories: food.per.calories * k, protein: food.per.protein * k, carbs: food.per.carbs * k, fat: food.per.fat * k)
    }

    /// Dollars for a quantity at a pack price: the share of the pack that gets used.
    public static func costOf(_ food: MealFood, _ baseQty: Double, packPrice: Double? = nil) -> Double {
        let p = packPrice ?? food.price
        return (p / food.pack) * baseQty
    }

    // MARK: a recipe from its ingredients

    /// One serving of a recipe from its ingredient lines. Calories are whole numbers, macros one decimal, cost in cents.
    public static func recipeNumbers(_ lines: [MealLine], servings: Double, index: [String: MealFood]) -> MealRecipeNumbers {
        let n: Double = servings > 0 ? servings : 1
        var sum = MealMacros()
        var cost = 0.0
        var unknown: [String] = []
        var ingredients: [Ingredient] = []
        for line in lines {
            let unit = normalizeUnit(line.unit)
            let food = findFood(index, line.name)
            var base: Double? = nil
            if let f = food { base = toBase(f, line.quantity, unit) }
            guard let f = food, let b = base else {
                var own = 0.0
                if let c = line.estCost, c.isFinite { own = c }
                cost += own
                unknown.append(line.name)
                ingredients.append(Ingredient(name: line.name.trimmingCharacters(in: .whitespacesAndNewlines), quantity: line.quantity, unit: unit, estCost: round(own, 2), category: line.category ?? "other"))
                continue
            }
            let m = macrosOf(f, b)
            sum.calories += m.calories
            sum.protein += m.protein
            sum.carbs += m.carbs
            sum.fat += m.fat
            let c = costOf(f, b)
            cost += c
            ingredients.append(Ingredient(name: f.name, quantity: line.quantity, unit: unit, estCost: round(c, 2), category: f.section.rawValue))
        }
        return MealRecipeNumbers(
            calories: round(sum.calories / n),
            protein: round(sum.protein / n, 1),
            carbs: round(sum.carbs / n, 1),
            fat: round(sum.fat / n, 1),
            estCost: round(cost / n, 2),
            ingredients: ingredients,
            unknown: unknown
        )
    }

    /// Tags a recipe gets from what is in it, on top of the ones written for it.
    public static func derivedTags(_ lines: [MealLine], index: [String: MealFood], own: [String] = []) -> [String] {
        var tags = Set<String>(own.map { $0.lowercased() })
        var animal = false
        for line in lines {
            guard let food = findFood(index, line.name) else { continue }
            for t in food.tags {
                tags.insert(t)
                if t == "meat" || t == "fish" || t == "seafood" { animal = true }
            }
        }
        if !animal && !lines.isEmpty { tags.insert("vegetarian") }
        return tags.sorted()
    }

    // MARK: likes and dislikes

    static func stem(_ word: String) -> String {
        let w = word.lowercased()
        if w.count > 4 && w.hasSuffix("ies") { return String(w.dropLast(3)) + "y" }
        if w.count > 4 && w.hasSuffix("oes") { return String(w.dropLast(2)) }
        if w.count > 3 && w.hasSuffix("s") && !w.hasSuffix("ss") { return String(w.dropLast(1)) }
        return w
    }

    static func words(_ text: String) -> [String] {
        var out: [String] = []
        var current = ""
        for u in text.lowercased().unicodeScalars {
            let v = u.value
            let isAlnum = (v >= 97 && v <= 122) || (v >= 48 && v <= 57)
            if isAlnum {
                current.unicodeScalars.append(u)
            } else if !current.isEmpty {
                out.append(stem(current))
                current = ""
            }
        }
        if !current.isEmpty { out.append(stem(current)) }
        return out
    }

    /// Does a like or dislike apply to this recipe? It matches a tag, an ingredient, or the recipe name, whole words only, plural or not.
    public static func matchesTerm(_ recipe: Recipe, _ term: String) -> Bool {
        let want = words(term)
        if want.isEmpty { return false }
        func has(_ text: String) -> Bool {
            let w = words(text)
            if w.count < want.count { return false }
            var i = 0
            while i + want.count <= w.count {
                var all = true
                var j = 0
                while j < want.count {
                    if w[i + j] != want[j] { all = false; break }
                    j += 1
                }
                if all { return true }
                i += 1
            }
            return false
        }
        var tagWords = Set<String>()
        for t in recipe.tags { for w in words(t) { tagWords.insert(w) } }
        var allTags = true
        for x in want where !tagWords.contains(x) { allTags = false }
        if allTags { return true }
        for i in recipe.ingredients where has(i.name) { return true }
        return has(recipe.name)
    }

    public static func matchCount(_ recipe: Recipe, _ terms: [String]) -> Int {
        var n = 0
        for t in terms where matchesTerm(recipe, t) { n += 1 }
        return n
    }

    public static func isExcluded(_ recipe: Recipe, _ dislikes: [String]) -> Bool {
        for t in dislikes where matchesTerm(recipe, t) { return true }
        return false
    }

    // MARK: targets

    /// The planner's numbers for a day from the Calories and Protein checklist targets, challenge rules included.
    public static func dayTargets(calories: Target?, protein: Target?) -> DayTargets {
        var out = defaultTargets
        if let c = calories {
            switch c {
            case .range(let lo, let hi):
                if hi > 0 {
                    out.calMin = Swift.min(lo, hi)
                    out.calMax = Swift.max(lo, hi)
                }
            case .max(let hi):
                if hi > 0 {
                    out.calMax = hi
                    out.calMin = Swift.max(0, hi - 200)
                }
            case .min(let lo):
                if lo > 0 {
                    out.calMin = lo
                    out.calMax = lo + 200
                }
            default:
                break
            }
        }
        if let p = protein {
            switch p {
            case .min(let lo):
                if lo > 0 { out.proteinMin = lo }
            case .range(let lo, _):
                if lo > 0 { out.proteinMin = lo }
            default:
                break
            }
        }
        return out
    }

    public static func describeTargets(_ t: DayTargets) -> String {
        return "\(group(t.calMin)) to \(group(t.calMax)) kcal, \(jsNum(t.proteinMin))g protein or more"
    }

    // MARK: sorting

    /// A stand in for String.localeCompare that is the same on every device: case blind first, then lowercase before uppercase.
    public static func localeCompare(_ a: String, _ b: String) -> Int {
        let la = a.lowercased()
        let lb = b.lowercased()
        if la != lb { return la < lb ? -1 : 1 }
        if a == b { return 0 }
        return a < b ? 1 : -1
    }

    public static func localeLess(_ a: String, _ b: String) -> Bool {
        return localeCompare(a, b) < 0
    }
}
