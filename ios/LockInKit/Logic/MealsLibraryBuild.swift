import Foundation

// A library recipe as a row, with every number computed from the food table.
// Port of buildRecipe and libraryWithIds in src/lib/logic/mealsLibrary.ts.

extension MealsLibrary {
    public static let foodIndex: [String: MealFood] = MealsCore.indexFoods(MealsFoods.all)

    /// Parse "chicken breast 680; olive oil 1 tbsp; eggs 2". Returns nil when a line cannot be read.
    public static func parseLines(_ text: String, index: [String: MealFood] = MealsLibrary.foodIndex) -> [MealLine]? {
        var out: [MealLine] = []
        for raw in text.split(separator: ";") {
            let part = raw.trimmingCharacters(in: .whitespaces)
            if part.isEmpty { continue }
            guard let re = try? NSRegularExpression(pattern: "^(.+?)\\s+(\\d+(?:\\.\\d+)?)(?:\\s+([a-z ]+))?$") else { return nil }
            let ns = part as NSString
            guard let m = re.firstMatch(in: part, range: NSRange(location: 0, length: ns.length)) else { return nil }
            let name = ns.substring(with: m.range(at: 1))
            guard let food = index[name], let q = Double(ns.substring(with: m.range(at: 2))) else { return nil }
            var unit = food.base.rawValue
            if m.range(at: 3).location != NSNotFound { unit = ns.substring(with: m.range(at: 3)) }
            out.append(MealLine(name: food.name, quantity: q, unit: unit))
        }
        return out
    }

    /// A recipe row from a definition, with every number computed from the food table.
    public static func build(_ def: RecipeDef, index: [String: MealFood] = MealsLibrary.foodIndex) -> Recipe {
        let n = MealsCore.recipeNumbers(def.lines, servings: def.servings, index: index)
        return Recipe(
            name: def.name,
            slot: def.slot,
            ingredients: n.ingredients,
            steps: def.steps,
            servings: def.servings,
            calories: n.calories,
            protein: n.protein,
            carbs: n.carbs,
            fat: n.fat,
            estCost: n.estCost,
            tags: MealsCore.derivedTags(def.lines, index: index, own: def.tags),
            photoUrl: nil,
            source: .seed
        )
    }

    /// The whole library as rows ready to insert.
    public static var recipes: [Recipe] {
        return defs.map { build($0) }
    }

    /// The library with stable ids, for tests and for planning before anything is saved.
    public static func withIds() -> [Recipe] {
        var out: [Recipe] = []
        for (i, r) in recipes.enumerated() {
            var x = r
            x.id = "lib" + (i + 1 < 10 ? "0" : "") + String(i + 1)
            x.createdAt = "2026-01-01T00:00:00.000Z"
            out.append(x)
        }
        return out
    }
}

extension MealsFoods {
    /// Salt, oil, spices: assumed to be at home until the user says otherwise.
    public static var staples: [String] {
        return all.filter { $0.staple }.map { $0.name }
    }
}
