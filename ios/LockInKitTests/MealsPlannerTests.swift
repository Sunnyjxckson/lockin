import XCTest
@testable import LockInKit

final class MealsPlannerTests: XCTestCase {
    static let recipes = MealsLibrary.withIds()
    static let foods = MealsCore.indexFoods(MealsFoods.all)
    var recipes: [Recipe] { return MealsPlannerTests.recipes }
    var foods: [String: MealFood] { return MealsPlannerTests.foods }
    static var recipeById: [String: Recipe] {
        var o: [String: Recipe] = [:]
        for r in recipes { o[r.id] = r }
        return o
    }
    var byId: [String: Recipe] { return MealsPlannerTests.recipeById }
    let week = "2026-10-05"

    func named(_ name: String) -> Recipe { return recipes.first { $0.name == name }! }

    func ctx(recipes: [Recipe]? = nil, prices: PackPrices? = nil, pantry: [String]? = nil, targets: DayTargets? = nil, targetsByDate: [DateStr: DayTargets] = [:], likes: [String] = [], dislikes: [String] = [], budget: Double = 80) -> PlanContext {
        return PlanContext(
            recipes: recipes ?? self.recipes,
            foods: foods,
            prices: prices ?? MealsPricing.basePrices,
            pantry: pantry ?? MealsFoods.staples,
            targets: targets ?? MealsCore.defaultTargets,
            targetsByDate: targetsByDate,
            likes: likes,
            dislikes: dislikes,
            budget: budget
        )
    }

    func plan(_ c: PlanContext, seed: Int = 7, prefs: PlanPrefs? = nil) -> PlanResult {
        return MealsPlanner.planWeek(c, weekStart: week, seed: seed, prefs: prefs)
    }

    // MARK: rng

    func testRngIsSeeded() {
        let a = MealsRng(seed: 42)
        let b = MealsRng(seed: 42)
        let c = MealsRng(seed: 43)
        let xs = [a.next(), a.next(), a.next()]
        XCTAssertEqual([b.next(), b.next(), b.next()], xs)
        XCTAssertNotEqual([c.next(), c.next(), c.next()], xs)
        XCTAssertTrue(xs.allSatisfy { $0 >= 0 && $0 < 1 })
    }

    func testRngMatchesTheWebValues() {
        // Computed with the TypeScript mulberry32 for seed 42.
        let a = MealsRng(seed: 42)
        XCTAssertEqual(a.next(), 0.44829055899754167, accuracy: 1e-12)
        XCTAssertEqual(a.next(), 0.8524657934904099, accuracy: 1e-12)
    }

    // MARK: solveDay

    func dayRecipes() -> [Recipe] {
        return [named("Protein oats"), named("Chicken, rice and broccoli"), named("Chicken stir fry"), named("Protein shake")]
    }

    func totals(_ day: [Recipe], _ s: [Double]) -> (Double, Double) {
        var cal = 0.0, pro = 0.0
        for (i, r) in day.enumerated() {
            cal += r.calories * s[i]
            pro += r.protein * s[i]
        }
        return (cal, pro)
    }

    func testScalesPortionsIntoRange() {
        let day = dayRecipes()
        let s = MealsPlanner.solveDay(day, MealsCore.defaultTargets)
        let (cal, pro) = totals(day, s)
        XCTAssertGreaterThanOrEqual(cal, 1900)
        XCTAssertLessThanOrEqual(cal, 2100)
        XCTAssertGreaterThanOrEqual(pro, 180)
        for (i, x) in s.enumerated() { XCTAssertTrue(MealsPlanner.portionsFor(day[i].slot).contains(x)) }
    }

    func testFollowsTighterTargets() {
        let day = dayRecipes()
        let s = MealsPlanner.solveDay(day, DayTargets(calMin: 1800, calMax: 1900, proteinMin: 185))
        let (cal, pro) = totals(day, s)
        XCTAssertGreaterThanOrEqual(cal, 1800)
        XCTAssertLessThanOrEqual(cal, 1900)
        XCTAssertGreaterThanOrEqual(pro, 185)
    }

    func testReturnsNearestMissWhenImpossible() {
        let low = [named("Peanut butter banana rice cakes"), named("Turkey spaghetti"), named("Peanut tofu noodles"), named("Protein oat bites")]
        let s = MealsPlanner.solveDay(low, DayTargets(calMin: 1500, calMax: 1600, proteinMin: 260))
        let (cal, pro) = totals(low, s)
        XCTAssertLessThan(pro, 260)
        XCTAssertGreaterThan(cal, 1400)
        XCTAssertEqual(s.count, 4)
    }

    func testEmptyDay() {
        XCTAssertEqual(MealsPlanner.solveDay([], MealsCore.defaultTargets), [])
    }

    // MARK: parity with the web planner

    func testMatchesTheWebPlannerForTheSameInput() {
        // Values produced by the TypeScript planWeek with the same library, prices and seed.
        let a = mainPlan()
        XCTAssertEqual(a.summary.cost, 74.11, accuracy: 0.001)
        XCTAssertEqual(Set(a.recipeIds), Set("lib02,lib30,lib48,lib66,lib54,lib45,lib25,lib10,lib36".components(separatedBy: ",")))
        XCTAssertEqual(a.meals.prefix(8).map { $0.servings }, [1, 1.25, 1.25, 0.5, 1, 1.25, 1, 1])
        let b = plan(ctx(budget: 30))
        XCTAssertEqual(b.status, .overBudget)
        XCTAssertEqual(b.summary.cost, 64.79, accuracy: 0.001)
        XCTAssertEqual(Set(b.recipeIds), Set("lib10,lib30,lib48,lib54,lib65,lib36,lib17,lib02,lib41".components(separatedBy: ",")))
    }

    // MARK: planWeek

    static var mainPlan: PlanResult? = nil
    func mainPlan() -> PlanResult {
        if let p = MealsPlannerTests.mainPlan { return p }
        let p = plan(ctx())
        MealsPlannerTests.mainPlan = p
        return p
    }

    func testFillsSevenDaysOfFourMeals() {
        let p = mainPlan()
        XCTAssertEqual(p.status, .ok)
        XCTAssertEqual(p.message, "")
        XCTAssertEqual(p.meals.count, 28)
        XCTAssertEqual(p.summary.days.map { $0.date }, ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"])
        for d in p.summary.days {
            let slots = p.meals.filter { $0.date == d.date }.map { $0.slot }
            XCTAssertEqual(slots, [.breakfast, .lunch, .dinner, .snack])
        }
    }

    func testHitsTargetsEveryDay() {
        let p = mainPlan()
        for d in p.summary.days {
            XCTAssertGreaterThanOrEqual(d.calories, 1900, d.date)
            XCTAssertLessThanOrEqual(d.calories, 2100, d.date)
            XCTAssertGreaterThanOrEqual(d.protein, 180, d.date)
            XCTAssertTrue(d.ok)
        }
        XCTAssertTrue(p.summary.allDaysOk)
    }

    func testStaysInsideBudgetAndCostIsTheListCost() {
        let p = mainPlan()
        XCTAssertLessThanOrEqual(p.summary.cost, 80)
        XCTAssertEqual(p.summary.overBy, 0)
        let lines = MealsGrocery.rollUp(p.meals, byId, foods)
        XCTAssertEqual(p.summary.cost, MealsGrocery.listTotal(lines, MealsPricing.basePrices, MealsGrocery.pantrySet(MealsFoods.staples)))
        XCTAssertGreaterThan(p.summary.foodCost, 30)
    }

    func testKeepsEachMealsRecipeAndARealPortion() {
        let p = mainPlan()
        for m in p.meals {
            XCTAssertEqual(byId[m.recipeId]!.slot, m.slot)
            XCTAssertTrue(MealsPlanner.portionsFor(m.slot).contains(m.servings))
        }
        XCTAssertEqual(p.recipeIds.sorted(), Array(Set(p.meals.map { $0.recipeId })).sorted())
    }

    func testBatchCooks() {
        let p = mainPlan()
        XCTAssertLessThanOrEqual(p.recipeIds.count, 9)
        XCTAssertLessThanOrEqual(p.summary.items, 28)
        let dinners = p.meals.filter { $0.slot == .dinner }.map { $0.recipeId }
        XCTAssertLessThanOrEqual(Set(dinners).count, 3)
    }

    func testIsDeterministicForASeed() {
        let again = plan(ctx())
        XCTAssertEqual(again.meals, mainPlan().meals)
        XCTAssertEqual(again.summary.cost, mainPlan().summary.cost)
        var others = Set<String>()
        for seed in [1, 2, 3] {
            others.insert(plan(ctx(budget: 110), seed: seed).recipeIds.joined(separator: ","))
        }
        XCTAssertGreaterThan(others.count, 1)
    }

    func testNeverPlansADislikedIngredient() {
        let dislikes = ["fish", "whey", "pork"]
        let p = plan(ctx(dislikes: dislikes, budget: 120))
        XCTAssertEqual(p.status, .ok)
        for id in p.recipeIds { XCTAssertFalse(MealsCore.isExcluded(byId[id]!, dislikes), byId[id]!.name) }
    }

    func testLeansTowardLikes() {
        let likes = ["turkey"]
        let withLikes = plan(ctx(likes: likes, budget: 120))
        let without = plan(ctx(budget: 120))
        func count(_ p: PlanResult) -> Int { return p.meals.filter { MealsCore.matchCount(byId[$0.recipeId]!, likes) > 0 }.count }
        XCTAssertEqual(withLikes.status, .ok)
        XCTAssertGreaterThan(count(withLikes), count(without))
        XCTAssertGreaterThanOrEqual(count(withLikes), 6)
    }

    func testTakesExtraAsks() {
        let p = plan(ctx(budget: 120), prefs: PlanPrefs(boost: ["beef"], avoid: ["chicken"], variety: .varied))
        XCTAssertEqual(p.status, .ok)
        for id in p.recipeIds { XCTAssertFalse(MealsCore.isExcluded(byId[id]!, ["chicken"])) }
        XCTAssertTrue(p.recipeIds.contains { MealsCore.matchCount(byId[$0]!, ["beef"]) > 0 })
        XCTAssertEqual(Set(p.meals.filter { $0.slot == .dinner }.map { $0.recipeId }).count, 4)

        let batch = plan(ctx(budget: 120), prefs: PlanPrefs(variety: .batch))
        XCTAssertEqual(Set(batch.meals.filter { $0.slot == .breakfast }.map { $0.recipeId }).count, 1)

        func cost(_ p2: PlanResult, _ slot: MealSlot) -> Double {
            return p2.meals.filter { $0.slot == slot }.reduce(0.0) { $0 + byId[$1.recipeId]!.estCost * $1.servings }
        }
        let cheap = plan(ctx(budget: 120), prefs: PlanPrefs(cheaperSlots: [.breakfast]))
        let normal = plan(ctx(budget: 120))
        XCTAssertLessThanOrEqual(cost(cheap, .breakfast), cost(normal, .breakfast))
    }

    func testCostsLessWhenMoreIsAtHome() {
        let stocked = plan(ctx(pantry: MealsFoods.staples + ["whey protein", "rice", "oats"], budget: 60))
        XCTAssertEqual(stocked.status, .ok)
        XCTAssertLessThanOrEqual(stocked.summary.cost, 60)
    }

    func testCheaperAtADiscountStore() {
        let aldi = plan(ctx(prices: MealsPricing.pricesAt(MealsPricing.estimateSource, "Aldi"), budget: 40))
        let teeter = plan(ctx(prices: MealsPricing.pricesAt(MealsPricing.estimateSource, "Harris Teeter"), budget: 40))
        XCTAssertLessThan(aldi.summary.cost, teeter.summary.cost)
    }

    func testUsesADatesOwnTargets() {
        let tight = DayTargets(calMin: 1700, calMax: 1800, proteinMin: 190)
        let p = plan(ctx(targetsByDate: ["2026-10-08": tight, "2026-10-09": tight], budget: 120))
        XCTAssertEqual(p.status, .ok)
        let thu = p.summary.days.first { $0.date == "2026-10-08" }!
        XCTAssertGreaterThanOrEqual(thu.calories, 1700)
        XCTAssertLessThanOrEqual(thu.calories, 1800)
        XCTAssertGreaterThanOrEqual(thu.protein, 190)
        XCTAssertGreaterThanOrEqual(p.summary.days[0].calories, 1900)
    }

    // MARK: when it cannot be done

    func testBudgetTooLow() {
        let p = plan(ctx(budget: 30))
        XCTAssertEqual(p.status, .overBudget)
        XCTAssertEqual(p.meals.count, 28)
        XCTAssertTrue(p.summary.allDaysOk)
        for d in p.summary.days { XCTAssertGreaterThanOrEqual(d.protein, 180) }
        XCTAssertGreaterThan(p.summary.cost, 30)
        XCTAssertEqual(p.summary.overBy, p.summary.cost - 30, accuracy: 0.01)
        XCTAssertTrue(p.message.contains("$30 a week is not enough"))
        XCTAssertTrue(p.message.contains("180g protein"))
        XCTAssertTrue(p.message.contains(MealsCore.dollars(p.summary.cost)))
        XCTAssertTrue(p.message.contains("estimated"))
        for u in p.message.unicodeScalars { XCTAssertLessThan(u.value, 128) }

        // A budget at the floor works.
        let ok = plan(ctx(budget: p.summary.cost.rounded(.up) + 1), seed: 7)
        XCTAssertEqual(ok.status, .ok)
    }

    func testTargetsOutOfReach() {
        let p = plan(ctx(targets: DayTargets(calMin: 1200, calMax: 1300, proteinMin: 260), budget: 200))
        XCTAssertEqual(p.status, .targetsMissed)
        XCTAssertEqual(p.meals.count, 28)
        XCTAssertFalse(p.summary.allDaysOk)
        XCTAssertTrue(p.message.contains("cannot hit your numbers"))
        XCTAssertTrue(p.message.contains(MealsCore.dollars(p.summary.cost)))
        XCTAssertTrue(p.summary.days.contains { $0.proteinShort > 0 || $0.calOff != 0 })
    }

    func tiny() -> [Recipe] {
        return [named("Protein oats"), named("Chicken stir fry"), named("Chicken, rice and broccoli"), named("Protein shake")]
    }

    func testSaysWhichSlotHasNothingLeft() {
        let p = plan(ctx(recipes: tiny(), dislikes: ["whey"]))
        XCTAssertEqual(p.status, .noRecipes)
        XCTAssertEqual(p.meals, [])
        XCTAssertTrue(p.message.contains("breakfasts and snacks"))
        XCTAssertEqual(p.summary.days.count, 7)
    }

    func testStillPlansFromATinyLibrary() {
        let p = plan(ctx(recipes: tiny(), budget: 150))
        XCTAssertEqual(p.meals.count, 28)
        XCTAssertEqual(p.recipeIds.count, 4)
        XCTAssertEqual(p.status, .ok)
    }

    // MARK: summarizePlan

    func testSummarizesAnyMeals() {
        let oats = named("Protein oats")
        let meals = [
            PlannedMeal(date: week, slot: .breakfast, recipeId: oats.id, servings: 2),
            PlannedMeal(date: week, slot: .snack, recipeId: "gone", servings: 1),
        ]
        let s = MealsPlanner.summarizePlan(meals, ctx(budget: 5))
        XCTAssertEqual(s.days.count, 1)
        XCTAssertEqual(s.days[0].calories, oats.calories * 2)
        XCTAssertEqual(s.days[0].protein, MealsCore.jsRound(oats.protein * 2))
        XCTAssertFalse(s.days[0].ok)
        XCTAssertEqual(s.days[0].calOff, oats.calories * 2 - 1900)
        XCTAssertEqual(s.days[0].cost, oats.estCost * 2, accuracy: 0.01)
        XCTAssertEqual(s.items, 4)
        XCTAssertEqual(s.cost, 3.99 + 15.99 + 2.29 + 0.25, accuracy: 0.001)
        XCTAssertEqual(s.overBy, s.cost - 5, accuracy: 0.01)
        XCTAssertLessThan(s.foodCost, s.cost)
    }

    // MARK: swapping a meal

    let date = "2026-10-07"

    func testOffersEveryOtherRecipeBestFitFirst() {
        let c = ctx(budget: 100)
        let p = plan(c)
        let before = MealsPlanner.summarizePlan(p.meals, c)
        let options = MealsPlanner.swapOptions(p.meals, date: date, slot: .dinner, scope: .day, ctx: c)
        let current = p.meals.first { $0.date == date && $0.slot == .dinner }!
        XCTAssertEqual(options.count, recipes.filter { $0.slot == .dinner }.count - 1)
        XCTAssertTrue(options.allSatisfy { $0.recipe.slot == .dinner && $0.recipe.id != current.recipeId })
        let first = options[0]
        XCTAssertTrue(first.day.ok)
        XCTAssertEqual(first.costDelta, first.weekCost - before.cost, accuracy: 0.01)
        XCTAssertEqual(first.days, 1)
        if let firstMiss = options.firstIndex(where: { !$0.day.ok }) {
            XCTAssertTrue(options[firstMiss...].allSatisfy { !$0.day.ok || $0.overBudget })
        }
        let okOnes = options.filter { $0.day.ok }
        if let firstOver = okOnes.firstIndex(where: { $0.overBudget }) {
            XCTAssertTrue(okOnes[firstOver...].allSatisfy { $0.overBudget })
        }
    }

    func testRescalesTheDayAfterASwap() {
        let c = ctx(budget: 100)
        let p = plan(c)
        let options = MealsPlanner.swapOptions(p.meals, date: date, slot: .dinner, scope: .day, ctx: c)
        let pick = options.first { $0.day.ok }!
        let next = MealsPlanner.applySwap(p.meals, date: date, slot: .dinner, recipeId: pick.recipe.id, scope: .day, ctx: c)
        XCTAssertEqual(next, pick.meals)
        let s = MealsPlanner.summarizePlan(next, c)
        let day = s.days.first { $0.date == date }!
        XCTAssertGreaterThanOrEqual(day.calories, 1900)
        XCTAssertLessThanOrEqual(day.calories, 2100)
        XCTAssertGreaterThanOrEqual(day.protein, 180)
        XCTAssertEqual(next.filter { $0.date != date }, p.meals.filter { $0.date != date })
        XCTAssertEqual(next.first { $0.date == date && $0.slot == .dinner }!.recipeId, pick.recipe.id)
        XCTAssertEqual(s.cost, pick.weekCost)
    }

    func testCanSwapEveryDayTheDishRepeats() {
        let c = ctx(budget: 100)
        let p = plan(c)
        let current = p.meals.first { $0.date == date && $0.slot == .dinner }!
        let repeats = p.meals.filter { $0.slot == .dinner && $0.recipeId == current.recipeId }.count
        let options = MealsPlanner.swapOptions(p.meals, date: date, slot: .dinner, scope: .week, ctx: c)
        XCTAssertEqual(options[0].days, repeats)
        XCTAssertFalse(options[0].meals.contains { $0.slot == .dinner && $0.recipeId == current.recipeId })
        for d in MealsPlanner.summarizePlan(options[0].meals, c).days { XCTAssertTrue(d.ok) }
    }

    func testLeavesDislikesOutOfOptionsAndMarksLikes() {
        let p = plan(ctx(budget: 100))
        let c = ctx(likes: ["tofu"], dislikes: ["beef"], budget: 100)
        let options = MealsPlanner.swapOptions(p.meals, date: date, slot: .dinner, scope: .day, ctx: c)
        XCTAssertFalse(options.contains { MealsCore.matchCount($0.recipe, ["beef"]) > 0 })
        XCTAssertTrue(options.first { $0.recipe.name == "Peanut tofu noodles" }!.liked)
    }

    func testFlagsAnOptionThatPushesTheWeekOverBudget() {
        let p = plan(ctx(budget: 100))
        let before = MealsPlanner.summarizePlan(p.meals, ctx(budget: 100))
        let tight = ctx(budget: before.cost)
        let options = MealsPlanner.swapOptions(p.meals, date: date, slot: .dinner, scope: .day, ctx: tight)
        XCTAssertTrue(options.contains { $0.overBudget && $0.costDelta > 0 })
        XCTAssertTrue(options.filter { !$0.overBudget }.allSatisfy { $0.costDelta <= 0.004 })
    }

    func testRebalancesHandEditedPortions() {
        let c = ctx(budget: 100)
        let p = plan(c)
        var broken = p.meals
        for i in broken.indices where broken[i].date == date { broken[i].servings = 0.5 }
        XCTAssertFalse(MealsPlanner.summarizePlan(broken, c).days.first { $0.date == date }!.ok)
        let fixed = MealsPlanner.rebalanceDay(broken, date, c)
        XCTAssertTrue(MealsPlanner.summarizePlan(fixed, c).days.first { $0.date == date }!.ok)
    }

    func testDoesNothingForAnUnplannedSlot() {
        let c = ctx(budget: 100)
        XCTAssertEqual(MealsPlanner.applySwap([], date: date, slot: .dinner, recipeId: "x", scope: .day, ctx: c), [])
        XCTAssertEqual(MealsPlanner.swapOptions([], date: date, slot: .dinner, scope: .day, ctx: c).count, 0)
    }
}
