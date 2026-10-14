import XCTest
@testable import LockInKit

final class MealsCoreTests: XCTestCase {
    let index = MealsCore.indexFoods(MealsFoods.all)

    func food(_ name: String) -> MealFood {
        return index[name]!
    }

    // MARK: food table

    func testFoodNamesAreUniqueLowercaseAndSane() {
        XCTAssertEqual(Set(MealsFoods.all.map { $0.name }).count, MealsFoods.all.count)
        for f in MealsFoods.all {
            XCTAssertEqual(f.name, f.name.lowercased())
            XCTAssertGreaterThan(f.pack, 0)
            XCTAssertGreaterThan(f.price, 0)
            XCTAssertFalse(f.packLabel.isEmpty)
        }
    }

    func testMacrosAgreeWithCalories() {
        for f in MealsFoods.all {
            if f.per.calories < 40 { continue }
            let fromMacros = f.per.protein * 4 + f.per.carbs * 4 + f.per.fat * 9
            let slack: Double = f.section == .spices ? 0.45 : (f.section == .produce ? 0.25 : 0.2)
            XCTAssertLessThan(abs(fromMacros - f.per.calories) / f.per.calories, slack, f.name)
        }
    }

    func testStaples() {
        XCTAssertTrue(MealsFoods.staples.contains("olive oil"))
        XCTAssertTrue(MealsFoods.staples.contains("salt"))
        XCTAssertFalse(MealsFoods.staples.contains("chicken breast"))
    }

    // MARK: units

    func testConvertsMassToGrams() {
        XCTAssertEqual(MealsCore.toBase(food("chicken breast"), 1, "lb")!, 453.592, accuracy: 0.01)
        XCTAssertEqual(MealsCore.toBase(food("chicken breast"), 8, "oz")!, 226.8, accuracy: 0.1)
        XCTAssertEqual(MealsCore.toBase(food("chicken breast"), 200, "g")!, 200)
    }

    func testConvertsSpoonsAndCups() {
        XCTAssertEqual(MealsCore.toBase(food("olive oil"), 1, "tbsp")!, 14.79, accuracy: 0.01)
        XCTAssertEqual(MealsCore.toBase(food("milk"), 1, "cup")!, 236.59, accuracy: 0.01)
        XCTAssertEqual(MealsCore.toBase(food("oats"), 0.5, "cup")!, 40.08, accuracy: 0.1)
        XCTAssertEqual(MealsCore.toBase(food("peanut butter"), 1, "tbsp")!, 16, accuracy: 0.5)
    }

    func testRefusesAUnitThatMakesNoSense() {
        XCTAssertNil(MealsCore.toBase(food("eggs"), 100, "g"))
        XCTAssertNil(MealsCore.toBase(food("chicken breast"), 1, "cup"))
        XCTAssertNil(MealsCore.toBase(food("milk"), 1, "lb"))
        XCTAssertEqual(MealsCore.toBase(food("bread"), 2, "each")!, 2)
    }

    func testAcceptsLongUnitNames() {
        XCTAssertEqual(MealsCore.toBase(food("olive oil"), 2, "Tablespoons")!, 29.57, accuracy: 0.01)
        XCTAssertEqual(MealsCore.toBase(food("eggs"), 3, "")!, 3)
    }

    func testListsUnitsAFoodCanUse() {
        XCTAssertEqual(MealsCore.unitsFor(food("eggs")), ["each"])
        XCTAssertTrue(MealsCore.unitsFor(food("milk")).contains("cup"))
        XCTAssertEqual(MealsCore.unitsFor(food("pasta")), ["g", "oz", "lb"])
    }

    // MARK: recipe numbers

    func testAddsUpARecipeByHand() {
        let n = MealsCore.recipeNumbers([
            MealLine(name: "Chicken Breast", quantity: 200, unit: "g"),
            MealLine(name: "eggs", quantity: 2, unit: "each"),
        ], servings: 2, index: index)
        XCTAssertEqual(n.calories, 192)
        XCTAssertEqual(n.protein, 28.8)
        XCTAssertEqual(n.carbs, 0.4)
        XCTAssertEqual(n.fat, 7.4)
        XCTAssertEqual(n.estCost, 0.91)
        XCTAssertEqual(n.unknown, [])
        XCTAssertEqual(n.ingredients[0], Ingredient(name: "chicken breast", quantity: 200, unit: "g", estCost: 1.32, category: "meat"))
    }

    func testKeepsAnUnknownIngredientAndCountsItsCost() {
        let n = MealsCore.recipeNumbers([
            MealLine(name: "eggs", quantity: 2, unit: "each"),
            MealLine(name: "Sriracha", quantity: 1, unit: "tbsp", estCost: 0.2),
        ], servings: 1, index: index)
        XCTAssertEqual(n.unknown, ["Sriracha"])
        XCTAssertEqual(n.calories, 144)
        XCTAssertEqual(n.estCost, 0.7)
    }

    func testFlagsAUnitThatDoesNotConvert() {
        XCTAssertEqual(MealsCore.recipeNumbers([MealLine(name: "eggs", quantity: 100, unit: "g")], servings: 1, index: index).unknown, ["eggs"])
    }

    // MARK: library

    func testLibraryIsBigEnoughToLiveOn() {
        let recipes = MealsLibrary.recipes
        XCTAssertGreaterThanOrEqual(recipes.count, 60)
        func count(_ s: MealSlot) -> Int { return recipes.filter { $0.slot == s }.count }
        XCTAssertGreaterThanOrEqual(count(.breakfast), 12)
        XCTAssertGreaterThanOrEqual(count(.lunch), 14)
        XCTAssertGreaterThanOrEqual(count(.dinner), 16)
        XCTAssertGreaterThanOrEqual(count(.snack), 10)
        XCTAssertEqual(Set(recipes.map { $0.name }).count, recipes.count)
        XCTAssertGreaterThanOrEqual(recipes.filter { $0.tags.contains("batch") }.count, 25)
        XCTAssertGreaterThanOrEqual(recipes.filter { $0.tags.contains("vegetarian") }.count, 10)
    }

    func testLibraryOnlyUsesKnownFoodsInUnitsThatConvert() {
        for def in MealsLibrary.defs {
            for line in def.lines {
                guard let f = index[line.name] else {
                    XCTFail("\(def.name): \(line.name)")
                    continue
                }
                XCTAssertNotNil(MealsCore.toBase(f, line.quantity, line.unit), "\(def.name): \(line.name)")
            }
        }
    }

    func testLibraryStoresWhatTheIngredientsAddUpTo() {
        for r in MealsLibrary.recipes {
            var cal = 0.0, pro = 0.0, carb = 0.0, fat = 0.0, cost = 0.0
            for ing in r.ingredients {
                let f = index[ing.name]!
                let base = MealsCore.toBase(f, ing.quantity, ing.unit)!
                let k: Double = f.base == .each ? base : base / 100
                cal += f.per.calories * k
                pro += f.per.protein * k
                carb += f.per.carbs * k
                fat += f.per.fat * k
                cost += (f.price / f.pack) * base
            }
            XCTAssertEqual(r.calories, MealsCore.jsRound(cal / r.servings), r.name)
            XCTAssertLessThanOrEqual(abs(r.protein - pro / r.servings), 0.0501, r.name)
            XCTAssertLessThanOrEqual(abs(r.carbs - carb / r.servings), 0.0501, r.name)
            XCTAssertLessThanOrEqual(abs(r.fat - fat / r.servings), 0.0501, r.name)
            XCTAssertLessThanOrEqual(abs(r.estCost - cost / r.servings), 0.0051, r.name)
            let shown = r.ingredients.reduce(0.0) { $0 + ($1.estCost ?? 0) }
            XCTAssertLessThan(abs(shown / r.servings - r.estCost), 0.03, r.name)
        }
    }

    func testLibraryCaloriesAgreeWithMacros() {
        for r in MealsLibrary.recipes {
            let fromMacros = r.protein * 4 + r.carbs * 4 + r.fat * 9
            XCTAssertLessThan(abs(fromMacros - r.calories) / r.calories, 0.1, r.name)
        }
    }

    func testLibraryIsHighProteinAndCheapWithRealSteps() {
        let recipes = MealsLibrary.recipes
        for r in recipes {
            XCTAssertGreaterThanOrEqual((r.protein * 4) / r.calories, 0.24, r.name)
            XCTAssertLessThan(r.estCost, 4.5, r.name)
            XCTAssertGreaterThanOrEqual(r.steps.count, 1, r.name)
            XCTAssertGreaterThanOrEqual(r.ingredients.count, 2, r.name)
            XCTAssertEqual(r.source, .seed)
            if r.slot == .snack { XCTAssertLessThan(r.calories, 350, r.name) } else { XCTAssertGreaterThan(r.calories, 220, r.name) }
        }
        let mains = recipes.filter { $0.slot != .snack }
        let avg = mains.reduce(0.0) { $0 + $1.protein } / Double(mains.count)
        XCTAssertGreaterThan(avg, 40)
    }

    func testLibraryIsPlainAscii() {
        for d in MealsLibrary.defs {
            for s in [d.name] + d.steps + d.tags {
                for u in s.unicodeScalars { XCTAssertLessThan(u.value, 128, s) }
            }
        }
    }

    func testBuildsSameRowsEveryTimeWithIds() {
        XCTAssertEqual(MealsLibrary.build(MealsLibrary.defs[0]), MealsLibrary.recipes[0])
        let lib = MealsLibrary.withIds()
        XCTAssertEqual(Set(lib.map { $0.id }).count, lib.count)
        for s in MealsCore.slots { XCTAssertTrue(lib.contains { $0.slot == s }) }
    }

    func testReadsIngredientShorthand() {
        let lines = MealsLibrary.parseLines("chicken breast 680; olive oil 1 tbsp; eggs 2; bell pepper 0.5")!
        XCTAssertEqual(lines, [
            MealLine(name: "chicken breast", quantity: 680, unit: "g"),
            MealLine(name: "olive oil", quantity: 1, unit: "tbsp"),
            MealLine(name: "eggs", quantity: 2, unit: "each"),
            MealLine(name: "bell pepper", quantity: 0.5, unit: "each"),
        ])
        XCTAssertNil(MealsLibrary.parseLines("dragon fruit 2"))
    }

    // MARK: likes and dislikes

    let lib = MealsLibrary.withIds()
    func named(_ n: String) -> Recipe { return lib.first { $0.name == n }! }

    func testMatchesByTagIngredientOrName() {
        XCTAssertTrue(MealsCore.matchesTerm(named("Tuna rice bowl"), "fish"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Baked tilapia with rice and broccoli"), "Fish"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Shrimp fried rice"), "shellfish"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Egg white veggie scramble"), "eggs"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Chicken stir fry"), "chickens"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Turkey spaghetti"), "pasta"))
        XCTAssertFalse(MealsCore.matchesTerm(named("Chicken stir fry"), "fish"))
        XCTAssertFalse(MealsCore.matchesTerm(named("Protein shake"), "ice"))
        XCTAssertFalse(MealsCore.matchesTerm(named("Chicken stir fry"), ""))
    }

    func testMatchesTwoWordTerms() {
        XCTAssertFalse(MealsCore.matchesTerm(named("Protein oats"), "peanut butter"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Peanut butter banana shake"), "peanut butter"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Pork loin with sweet potatoes"), "sweet potato"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Protein oats"), "protein powder"))
        XCTAssertFalse(MealsCore.matchesTerm(named("Chicken stir fry"), "protein powder"))
        XCTAssertTrue(MealsCore.matchesTerm(named("Cottage cheese and apple"), "cottage cheese"))
        XCTAssertFalse(MealsCore.matchesTerm(named("Turkey melt toast"), "cottage cheese"))
    }

    func testExcludesOnAnyDislike() {
        XCTAssertTrue(MealsCore.isExcluded(named("Tilapia tacos"), ["beef", "fish"]))
        XCTAssertFalse(MealsCore.isExcluded(named("Chicken fajitas"), ["beef", "fish"]))
        XCTAssertFalse(MealsCore.isExcluded(named("Chicken fajitas"), []))
    }

    func testDerivesTagsFromWhatIsInTheRecipe() {
        XCTAssertEqual(MealsCore.derivedTags([MealLine(name: "tofu", quantity: 1, unit: "g"), MealLine(name: "rice", quantity: 1, unit: "g")], index: index, own: ["Batch"]), ["batch", "rice", "soy", "tofu", "vegetarian"])
        XCTAssertFalse(MealsCore.derivedTags([MealLine(name: "canned tuna", quantity: 1, unit: "g")], index: index).contains("vegetarian"))
        XCTAssertTrue(named("Tofu edamame rice bowls").tags.contains("vegetarian"))
        XCTAssertFalse(named("Chicken stir fry").tags.contains("vegetarian"))
    }

    // MARK: targets

    func testReadsChecklistTargets() {
        XCTAssertEqual(MealsCore.dayTargets(calories: .range(1900, 2100), protein: .min(180)), MealsCore.defaultTargets)
        XCTAssertEqual(MealsCore.dayTargets(calories: .range(1700, 1800), protein: .min(200)), DayTargets(calMin: 1700, calMax: 1800, proteinMin: 200))
        XCTAssertEqual(MealsCore.dayTargets(calories: .max(2000), protein: .min(150)), DayTargets(calMin: 1800, calMax: 2000, proteinMin: 150))
        XCTAssertEqual(MealsCore.dayTargets(calories: nil, protein: nil), MealsCore.defaultTargets)
        XCTAssertEqual(MealsCore.dayTargets(calories: .check, protein: .check), MealsCore.defaultTargets)
    }

    // MARK: display

    func testWritesQuartersAsFractions() {
        XCTAssertEqual(MealsCore.fraction(1), "1")
        XCTAssertEqual(MealsCore.fraction(0.5), "1/2")
        XCTAssertEqual(MealsCore.fraction(1.25), "1 1/4")
        XCTAssertEqual(MealsCore.fraction(2.75), "2 3/4")
        XCTAssertEqual(MealsCore.fraction(1.4), "1.4")
    }

    func testRoundsAmountsLikeACook() {
        XCTAssertEqual(MealsCore.amountLabel(212.4, "g"), "210 g")
        XCTAssertEqual(MealsCore.amountLabel(7.4, "g"), "7 g")
        XCTAssertEqual(MealsCore.amountLabel(1.3, "each"), "1 1/2")
        XCTAssertEqual(MealsCore.amountLabel(0.4, "tbsp"), "1/2 tbsp")
        XCTAssertEqual(MealsCore.amountLabel(1250, "ml"), "1,250 ml")
        XCTAssertEqual(MealsCore.round(1.005, 2), 1.01)
    }

    func testFormatsDollars() {
        XCTAssertEqual(MealsCore.dollars(1234.5), "$1,234.50")
        XCTAssertEqual(MealsCore.dollars(0), "$0.00")
    }
}
