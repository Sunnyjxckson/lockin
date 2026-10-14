import XCTest
@testable import LockInKit

final class MealsGroceryTests: XCTestCase {
    let recipes = MealsLibrary.withIds()
    let foods = MealsCore.indexFoods(MealsFoods.all)

    func food(_ n: String) -> MealFood { return foods[n]! }
    var byId: [String: Recipe] {
        var o: [String: Recipe] = [:]
        for r in recipes { o[r.id] = r }
        return o
    }
    func named(_ name: String) -> Recipe { return recipes.first { $0.name == name }! }
    func meal(_ name: String, _ servings: Double, _ date: String = "2026-10-05") -> PlannedMeal {
        let r = named(name)
        return PlannedMeal(date: date, slot: r.slot, recipeId: r.id, servings: servings)
    }
    func line(_ lines: [GroceryLine], _ name: String) -> GroceryLine { return lines.first { $0.name == name }! }

    // MARK: packsFor

    func testRoundsUpToWholePacks() {
        XCTAssertEqual(MealsGrocery.packsFor(food("eggs"), 1), 1)
        XCTAssertEqual(MealsGrocery.packsFor(food("eggs"), 12), 1)
        XCTAssertEqual(MealsGrocery.packsFor(food("eggs"), 13), 2)
        XCTAssertEqual(MealsGrocery.packsFor(food("black beans"), 600), 3)
        XCTAssertEqual(MealsGrocery.packsFor(food("banana"), 2.5), 3)
    }

    func testSellsMeatByTheQuarterPound() {
        XCTAssertEqual(MealsGrocery.packsFor(food("chicken breast"), 680), 1.5)
        XCTAssertEqual(MealsGrocery.packsFor(food("chicken breast"), 700), 1.75)
        XCTAssertEqual(MealsGrocery.packsFor(food("chicken breast"), 100), 0.25)
    }

    func testDoesNotBuyASecondPackForAFewGrams() {
        XCTAssertEqual(MealsGrocery.packsFor(food("pasta"), 460), 1)
        XCTAssertEqual(MealsGrocery.packsFor(food("pasta"), 480), 2)
    }

    func testBuysNothingForNothing() {
        XCTAssertEqual(MealsGrocery.packsFor(food("pasta"), 0), 0)
    }

    // MARK: rollUp

    func testCombinesSameFoodAcrossRecipesAndDays() {
        let meals = [meal("Chicken, rice and broccoli", 1.5), meal("Chicken, rice and broccoli", 1.5, "2026-10-06"), meal("Chicken stir fry", 2)]
        let lines = MealsGrocery.rollUp(meals, byId, foods)
        XCTAssertEqual(line(lines, "chicken breast").need, 850)
        XCTAssertEqual(line(lines, "rice").need, 300)
        XCTAssertEqual(line(lines, "frozen broccoli").need, 510)
        XCTAssertEqual(lines.filter { $0.name == "chicken breast" }.count, 1)

        XCTAssertEqual(line(lines, "olive oil").need, 1.25 * 14.7868, accuracy: 0.1)
        XCTAssertEqual(line(lines, "olive oil").unit, "ml")
        XCTAssertEqual(line(lines, "soy sauce").need, 3.5 * 14.7868, accuracy: 0.1)
        XCTAssertEqual(line(lines, "honey").need, 10.5, accuracy: 0.1)

        XCTAssertEqual(line(lines, "chicken breast").packs, 2)
        XCTAssertEqual(line(lines, "rice").packs, 1)
        XCTAssertEqual(line(lines, "frozen broccoli").packs, 2)
        XCTAssertEqual(MealsGrocery.buyLabel(line(lines, "chicken breast")), "2 lb")
        XCTAssertEqual(MealsGrocery.buyLabel(line(lines, "frozen broccoli")), "2 x 12 oz bag")
        XCTAssertEqual(MealsGrocery.buyLabel(line(lines, "rice")), "2 lb bag")
        XCTAssertEqual(MealsGrocery.needLabel(line(lines, "chicken breast")), "850 g")

        let sections = lines.map { $0.section }
        func firstOf(_ s: MealSection) -> Int { return sections.firstIndex(of: s) ?? -1 }
        XCTAssertLessThan(firstOf(.meat), firstOf(.pantry))
        XCTAssertLessThan(firstOf(.pantry), firstOf(.frozen))
        XCTAssertLessThan(firstOf(.frozen), firstOf(.spices))
    }

    func testCarriesAnIngredientThatIsNotInTheTable() {
        let own = Recipe(id: "own", name: "Hot chicken", slot: .dinner, ingredients: [
            Ingredient(name: "chicken breast", quantity: 1, unit: "lb", estCost: 2.99, category: "meat"),
            Ingredient(name: "Sriracha", quantity: 2, unit: "tbsp", estCost: 0.4, category: "other"),
        ], servings: 2, calories: 300, protein: 40, carbs: 0, fat: 5, estCost: 2, tags: [])
        let l = MealsGrocery.rollUp([PlannedMeal(date: "2026-10-05", slot: .dinner, recipeId: "own", servings: 3)], ["own": own], foods)
        XCTAssertEqual(line(l, "chicken breast").need, 680.39, accuracy: 0.1)
        let s = line(l, "Sriracha")
        XCTAssertNil(s.food)
        XCTAssertEqual(s.need, 3)
        XCTAssertEqual(s.unit, "tbsp")
        XCTAssertEqual(s.ownCost, 0.6)
        XCTAssertEqual(s.section, .other)
        XCTAssertEqual(MealsGrocery.linePrice(s, MealsPricing.basePrices), 0.6)
    }

    func testSkipsMealsWhoseRecipeIsGone() {
        XCTAssertEqual(MealsGrocery.rollUp([PlannedMeal(date: "2026-10-05", slot: .dinner, recipeId: "nope", servings: 1)], byId, foods), [])
    }

    // MARK: pricing

    func pricingLines() -> [GroceryLine] {
        return MealsGrocery.rollUp([meal("Chicken, rice and broccoli", 4), meal("Protein oats", 2), meal("Boiled eggs and string cheese", 3)], byId, foods)
    }

    func testPricesWholePacksAndLeavesThePantryOut() {
        let lines = pricingLines()
        let pantry = MealsGrocery.pantrySet(MealsFoods.staples)
        XCTAssertEqual(MealsGrocery.linePrice(line(lines, "chicken breast"), MealsPricing.basePrices), 4.49)
        let total = MealsGrocery.listTotal(lines, MealsPricing.basePrices, pantry)
        let everything = MealsGrocery.listTotal(lines, MealsPricing.basePrices, Set())
        XCTAssertGreaterThan(everything, total)
        let more = MealsGrocery.pantrySet(MealsFoods.staples + ["Whey Protein"])
        XCTAssertEqual(MealsGrocery.listTotal(lines, MealsPricing.basePrices, more), total - 15.99, accuracy: 0.01)
    }

    func testEstimatesEachStore() {
        XCTAssertEqual(MealsPricing.stores, ["Aldi", "Walmart", "Food Lion", "Harris Teeter", "Publix"])
        XCTAssertTrue(MealsPricing.estimateSource.estimated)
        XCTAssertEqual(MealsPricing.estimateSource.quote(food("chicken breast"), "Food Lion"), PriceQuote(price: 2.99, source: .estimate))
        XCTAssertEqual(MealsPricing.estimateSource.quote(food("chicken breast"), "Aldi"), PriceQuote(price: 2.69, source: .estimate))
        XCTAssertLessThan(MealsPricing.storeLevel("Aldi", .pantry), MealsPricing.storeLevel("Walmart", .pantry))
        XCTAssertGreaterThan(MealsPricing.storeLevel("Harris Teeter", .meat), 1)
        XCTAssertTrue(MealsPricing.isStore("Aldi"))
        XCTAssertFalse(MealsPricing.isStore("Costco"))
    }

    func testComparesStoresCheapestFirst() {
        let lines = pricingLines()
        let pantry = MealsGrocery.pantrySet(MealsFoods.staples)
        let c = MealsGrocery.compareStores(lines, MealsPricing.estimateSource, pantry)
        XCTAssertEqual(c.map { $0.store }, ["Aldi", "Walmart", "Food Lion", "Publix", "Harris Teeter"])
        XCTAssertEqual(c[0].above, 0)
        XCTAssertEqual(c[4].above, c[4].total - c[0].total, accuracy: 0.01)
        XCTAssertTrue(c.allSatisfy { $0.fromReceipts == 0 })
        XCTAssertEqual(c[0].total, MealsGrocery.listTotal(lines, MealsPricing.pricesAt(MealsPricing.estimateSource, "Aldi"), pantry))
        XCTAssertEqual(c[0].lines, lines.filter { !pantry.contains($0.name) }.count)
    }

    func testPrefersAReceiptPriceOnlyAtThatStore() {
        let lines = pricingLines()
        let pantry = MealsGrocery.pantrySet(MealsFoods.staples)
        let source = MealsPricing.withCorrections(MealsPricing.estimateSource, ["chicken breast": ["Publix": 1.99], "whey protein": ["Publix": 9.99]])
        XCTAssertEqual(source.quote(food("chicken breast"), "Publix"), PriceQuote(price: 1.99, source: .receipt))
        XCTAssertEqual(source.quote(food("chicken breast"), "Aldi").source, .estimate)
        let c = MealsGrocery.compareStores(lines, source, pantry)
        let publix = c.first { $0.store == "Publix" }!
        XCTAssertEqual(publix.fromReceipts, 2)
        XCTAssertLessThan(c.firstIndex { $0.store == "Publix" }!, 3)
        let prices = MealsGrocery.linePrices(line(lines, "chicken breast"), source)
        XCTAssertEqual(prices["Publix"], 2.99)
        XCTAssertEqual(Set(prices.keys), Set(MealsPricing.stores))
    }

    func testIgnoresABadCorrection() {
        let source = MealsPricing.withCorrections(MealsPricing.estimateSource, ["chicken breast": ["Aldi": Double.nan]])
        XCTAssertEqual(source.quote(food("chicken breast"), "Aldi").source, .estimate)
    }

    func testFoldsReceiptRowsIntoCorrections() {
        let rows = [ReceiptPrice(name: "Chicken  Breast", store: "Aldi", price: 2.5), ReceiptPrice(name: "eggs", store: "Publix", price: 3.1)]
        let c = MealsPricing.corrections(from: rows)
        XCTAssertEqual(c["chicken breast"]?["Aldi"], 2.5)
        XCTAssertEqual(c["eggs"]?["Publix"], 3.1)
    }

    // MARK: text and instacart

    func testWritesAPlainChecklistBySection() {
        let lines = MealsGrocery.rollUp([meal("Chicken, rice and broccoli", 4), meal("Boiled eggs and string cheese", 3)], byId, foods)
        let pantry = MealsGrocery.pantrySet(MealsFoods.staples)
        let text = MealsGrocery.listAsText(lines, pantry, title: "Groceries, week of Oct 5")
        XCTAssertEqual(text.components(separatedBy: "\n")[0], "Groceries, week of Oct 5")
        XCTAssertTrue(text.contains("Meat and fish\n[ ] Chicken breast, 1.5 lb"))
        XCTAssertTrue(text.contains("[ ] Eggs, 1 dozen"))
        XCTAssertTrue(text.contains("[ ] Broccoli, frozen, 2 x 12 oz bag"))
        XCTAssertFalse(text.contains("Olive oil"))
    }

    func testBuildsInstacartItems() {
        let lines = MealsGrocery.rollUp([meal("Chicken, rice and broccoli", 4), meal("Boiled eggs and string cheese", 3)], byId, foods)
        let items = MealsGrocery.instacartItems(lines, MealsGrocery.pantrySet(MealsFoods.staples))
        XCTAssertEqual(items.first { $0.name == "chicken breast" }, InstacartLineItem(name: "chicken breast", quantity: 680, unit: "gram", displayText: "Chicken breast, 1.5 lb"))
        let eggs = items.first { $0.name == "eggs" }!
        XCTAssertEqual(eggs.quantity, 6)
        XCTAssertEqual(eggs.unit, "each")
        XCTAssertFalse(items.contains { $0.name == "salt" })
    }

    func testNamesThingsForAList() {
        XCTAssertEqual(MealsGrocery.displayName("frozen green beans"), "Green beans, frozen")
        XCTAssertEqual(MealsGrocery.displayName("greek yogurt"), "Greek yogurt")
    }

    // MARK: budget

    func testBudgetAgainstActual() {
        XCTAssertEqual(MealsGrocery.budgetActual(budget: 60, estimated: 54.2, spent: 0), BudgetActual(budget: 60, estimated: 54.2, spent: 0, left: 60, over: false, offEstimate: nil))
        XCTAssertEqual(MealsGrocery.budgetActual(budget: 60, estimated: 54.2, spent: 57.13), BudgetActual(budget: 60, estimated: 54.2, spent: 57.13, left: 2.87, over: false, offEstimate: 2.93))
        let over = MealsGrocery.budgetActual(budget: 60, estimated: 54.2, spent: 66)
        XCTAssertEqual(over.left, -6)
        XCTAssertTrue(over.over)
    }

    // MARK: requests

    func testReadsMoreNoAndCheaper() {
        let r = MealsRequest.parse("More chicken, no fish, cheaper breakfasts", recipes: recipes)
        XCTAssertEqual(r.boost, ["chicken"])
        XCTAssertEqual(r.avoid, ["fish"])
        XCTAssertEqual(r.cheaperSlots, [.breakfast])
        XCTAssertNil(r.budget)
        XCTAssertNil(r.variety)
        XCTAssertEqual(r.unknown, [])
        XCTAssertEqual(r.prefs, PlanPrefs(boost: ["chicken"], avoid: ["fish"], cheaperSlots: [.breakfast], variety: nil))
        XCTAssertEqual(MealsRequest.describe(r), "More chicken. No fish. Cheaper breakfasts.")
    }

    func testReadsOtherPhrasings() {
        let a = MealsRequest.parse("I don't like tofu or tuna and I love turkey", recipes: recipes)
        XCTAssertEqual(a.avoid, ["tofu", "tuna"])
        XCTAssertEqual(a.boost, ["turkey"])
        let b = MealsRequest.parse("skip the eggs. extra beef please", recipes: recipes)
        XCTAssertEqual(b.avoid, ["eggs"])
        XCTAssertEqual(b.boost, ["beef"])
        XCTAssertEqual(MealsRequest.parse("cheaper", recipes: recipes).cheaperSlots, [.breakfast, .lunch, .dinner, .snack])
        XCTAssertEqual(MealsRequest.parse("cheap lunches and dinners", recipes: recipes).cheaperSlots, [.lunch, .dinner])
        let c = MealsRequest.parse("keep it under $55, more variety", recipes: recipes)
        XCTAssertEqual(c.budget, 55)
        XCTAssertEqual(c.variety, .varied)
        XCTAssertEqual(MealsRequest.parse("less cooking", recipes: recipes).variety, .batch)
    }

    func testReportsWordsThatMatchNothing() {
        let r = MealsRequest.parse("more lobster, no chicken", recipes: recipes)
        XCTAssertEqual(r.boost, [])
        XCTAssertEqual(r.unknown, ["lobster"])
        XCTAssertEqual(r.avoid, ["chicken"])
        XCTAssertTrue(MealsRequest.describe(r).contains("Nothing in the library matches lobster."))
    }

    func testSmallTalkIsEmpty() {
        XCTAssertTrue(MealsRequest.parse("hello there", recipes: recipes).isEmpty)
        XCTAssertTrue(MealsRequest.parse("", recipes: recipes).isEmpty)
    }

    func testAvoidWinsOverBoost() {
        let r = MealsRequest.parse("more fish, no fish", recipes: recipes)
        XCTAssertEqual(r.boost, [])
        XCTAssertEqual(r.avoid, ["fish"])
    }

    func testKeepsOnlyUsablePartsOfAModelAnswer() {
        let raw: JSON = .object([
            "boost": .array([.string("Chicken"), .string("unicorn"), .number(7)]),
            "avoid": .array([.string("fish")]),
            "cheaper_slots": .array([.string("breakfast"), .string("brunch")]),
            "budget": .number(54.6),
            "variety": .string("wild"),
            "extra": .string("x"),
        ])
        let r = MealsRequest.clean(raw, recipes: recipes)
        XCTAssertEqual(r.boost, ["chicken"])
        XCTAssertEqual(r.avoid, ["fish"])
        XCTAssertEqual(r.cheaperSlots, [.breakfast])
        XCTAssertEqual(r.budget, 55)
        XCTAssertNil(r.variety)
        XCTAssertEqual(r.unknown, ["unicorn"])
        XCTAssertTrue(MealsRequest.clean(nil, recipes: recipes).isEmpty)
        XCTAssertNil(MealsRequest.clean(.object(["budget": .number(-4)]), recipes: recipes).budget)
    }
}
