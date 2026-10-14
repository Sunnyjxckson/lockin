import Foundation
import Observation

// Meals: the data the screens read and the writes behind them. A port of src/features/meals/data.ts and useMeals.ts.
// Every write goes through the same DBClient calls the web makes, so the web app sees it.

public enum MealsWeek: String, Equatable {
    case this
    case next
}

/// What the screens need for one week, computed once per change.
public struct MealsSnapshot {
    public var today: DateStr
    public var weekStart: DateStr
    public var dates: [DateStr]
    public var budget: Double?
    public var likes: [String]
    public var dislikes: [String]
    public var recipeById: [String: Recipe]
    public var pantryKeys: [String]
    public var corrections: PriceCorrections
    public var source: PriceSource
    /// The store the week is priced at.
    public var store: String
    public var plan: MealPlan?
    public var meals: [PlannedMeal]
    public var targets: DayTargets
    public var ctx: PlanContext
    public var summary: PlanSummary?
    public var lines: [GroceryLine]
    public var pantry: Set<String>
    public var rows: [GroceryItem]
    public var shops: [Expense]
    public var spent: Double
    public var challengeName: String?
}

public struct MealsBuildValues {
    public var budget: Double
    public var store: String
    public var likes: [String]
    public var dislikes: [String]
    public var ask: String

    public init(budget: Double, store: String, likes: [String], dislikes: [String], ask: String) {
        self.budget = budget
        self.store = store
        self.likes = likes
        self.dislikes = dislikes
        self.ask = ask
    }
}

public struct MealsBuildOutcome {
    public var status: PlanStatus
    public var message: String
}

public struct RecipeInput {
    public var name: String
    public var slot: MealSlot
    public var servings: Double
    public var lines: [MealLine]
    public var steps: [String]
    /// Per serving, used only when an ingredient is not in the food table.
    public var manual: MealMacros?

    public init(name: String, slot: MealSlot, servings: Double, lines: [MealLine], steps: [String], manual: MealMacros? = nil) {
        self.name = name
        self.slot = slot
        self.servings = servings
        self.lines = lines
        self.steps = steps
        self.manual = manual
    }
}

public enum InstacartState: Equatable {
    case unknown
    case ready
    case off
}

public struct MealsFailure: Error, LocalizedError {
    public var message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { return message }
}

@Observable
@MainActor
public final class MealsModel {
    @ObservationIgnored public let store: AppStore
    @ObservationIgnored private var syncTail: Task<Void, Error>? = nil
    @ObservationIgnored private var keeping = false
    @ObservationIgnored private var libraryChecked = false

    public private(set) var recipes: [Recipe] = []
    public private(set) var plans: [MealPlan] = []
    public private(set) var groceryRows: [GroceryItem] = []
    public private(set) var pantryRows: [PantryItem] = []
    public private(set) var priceRows: [ReceiptPrice] = []
    public private(set) var expenses: [Expense] = []
    public private(set) var weekMealRows: [Meal] = []
    public private(set) var settings: AppSettings? = nil
    public private(set) var loading = true
    public private(set) var failure: String? = nil
    public private(set) var week: MealsWeek = .this
    public private(set) var snap: MealsSnapshot? = nil
    public private(set) var instacart: InstacartState = .unknown

    public static let foodIndex: [String: MealFood] = MealsLibrary.foodIndex

    public init(store: AppStore) {
        self.store = store
    }

    private var db: DBClient { return store.db }

    // MARK: loading

    public func load() async {
        if !store.hasData { await store.reload() }
        do {
            try await ensureLibrary()
            try await fetchAll()
            failure = nil
        } catch {
            failure = MealsModel.describe(error)
        }
        loading = false
        rebuild()
        await loadWeekMeals()
    }

    public static func describe(_ error: Error) -> String {
        if let api = error as? APIError { return api.errorDescription ?? "Something went wrong." }
        if let own = error as? MealsFailure { return own.message }
        return "Something went wrong."
    }

    private func fetchAll() async throws {
        async let r = db.list(Recipe.self, Query(orderBy: "name"))
        async let p = db.list(MealPlan.self)
        async let g = db.list(GroceryItem.self)
        async let h = db.list(PantryItem.self, Query(orderBy: "name"))
        async let c = db.list(ReceiptPrice.self)
        async let e = db.list(Expense.self, Query(orderBy: "date"))
        async let s = db.get(AppSettings.self, id: "app")
        recipes = try await r
        plans = try await p
        groceryRows = try await g
        pantryRows = try await h
        priceRows = try await c
        expenses = try await e
        settings = try await s
    }

    /// Read everything again after a write, and rebuild the week.
    public func refresh() async {
        do {
            try await fetchAll()
            failure = nil
        } catch {
            failure = MealsModel.describe(error)
        }
        rebuild()
        await loadWeekMeals()
    }

    public func setWeek(_ w: MealsWeek) async {
        if w == week { return }
        week = w
        rebuild()
        await loadWeekMeals()
    }

    private func loadWeekMeals() async {
        guard let s = snap else { return }
        do {
            weekMealRows = try await db.list(Meal.self, Query(from: s.dates[0], to: s.dates[6], orderBy: "date"))
        } catch {
            // Logged marks are a nicety. Keep the last ones.
        }
    }

    /// Whether a planned meal's logged id still points at a meal row.
    public func isLogged(_ meal: PlannedMeal) -> Bool {
        guard let id = meal.logged else { return false }
        return weekMealRows.contains { $0.id == id }
    }

    // MARK: derived

    public func rebuild() {
        let today = store.today
        let start = week == .next ? LIDate.addDays(LIDate.weekStart(today), 7) : LIDate.weekStart(today)
        let dates = (0..<7).map { LIDate.addDays(start, $0) }
        let pantryKeys = pantryRows.map { MealsCore.foodKey($0.name) }
        let corrections = MealsPricing.corrections(from: priceRows)
        let source = MealsPricing.withCorrections(MealsPricing.estimateSource, corrections)
        let pref = settings?.preferredStore
        let bookStore = (pref != nil && MealsPricing.isStore(pref)) ? (pref ?? MealsPricing.defaultStore) : MealsPricing.defaultStore
        let plan = plans.first { $0.weekStart == start }
        var planStore = bookStore
        if let ps = plan?.store, MealsPricing.isStore(ps) { planStore = ps }

        let cal = store.items.first { $0.key == "calories" }
        let pro = store.items.first { $0.key == "protein" }
        let versions = store.versions
        func on(_ date: DateStr) -> DayTargets {
            if cal == nil && pro == nil { return MealsCore.defaultTargets }
            let c: Target? = cal.map { Targets.targetOn($0, versions, date) }
            let p: Target? = pro.map { Targets.targetOn($0, versions, date) }
            return MealsCore.dayTargets(calories: c, protein: p)
        }
        let inWeek = today >= start && today <= dates[6]
        let targets = on(inWeek ? today : start)
        var byDate: [DateStr: DayTargets] = [:]
        for d in dates { byDate[d] = on(d) }

        let likes = settings?.foodLikes ?? []
        let dislikes = settings?.foodDislikes ?? []
        let budget = settings?.weeklyFoodBudget
        var byId: [String: Recipe] = [:]
        for r in recipes { byId[r.id] = r }
        let ctx = PlanContext(
            recipes: recipes,
            foods: MealsModel.foodIndex,
            prices: MealsPricing.pricesAt(source, planStore),
            pantry: pantryKeys,
            targets: targets,
            targetsByDate: byDate,
            likes: likes,
            dislikes: dislikes,
            budget: plan?.budget ?? budget ?? 0
        )
        let meals = plan?.meals ?? []
        let pantry = MealsGrocery.pantrySet(pantryKeys)
        var lines: [GroceryLine] = []
        var summary: PlanSummary? = nil
        var rows: [GroceryItem] = []
        var shops: [Expense] = []
        if let plan = plan {
            lines = MealsGrocery.rollUp(meals, byId, MealsModel.foodIndex)
            if !meals.isEmpty { summary = MealsPlanner.summarizePlan(meals, ctx, dates: dates) }
            rows = groceryRows.filter { $0.planId == plan.id }
            shops = expenses.filter { $0.category == "groceries" && $0.planId == plan.id }
        }
        var challengeName: String? = nil
        if let c = store.mode.challenge, let rules = c.rules {
            let hit = rules.contains { r in r.itemId == cal?.id || r.itemId == pro?.id }
            if hit { challengeName = c.name }
        }
        snap = MealsSnapshot(
            today: today, weekStart: start, dates: dates, budget: budget, likes: likes, dislikes: dislikes,
            recipeById: byId, pantryKeys: pantryKeys, corrections: corrections, source: source, store: planStore,
            plan: plan, meals: meals, targets: targets, ctx: ctx, summary: summary, lines: lines, pantry: pantry,
            rows: rows, shops: shops, spent: shops.reduce(0) { $0 + $1.amount }, challengeName: challengeName
        )
    }

    // MARK: library

    static func recipeRow(_ r: Recipe) -> JSONObject {
        guard case .object(var o) = JSON.from(r) else { return [:] }
        o.removeValue(forKey: "id")
        o.removeValue(forKey: "created_at")
        return o
    }

    /// Put the built in recipes in the table. A library recipe added in a later version is added on the next visit.
    public func ensureLibrary() async throws {
        if libraryChecked { return }
        let have = Set(try await db.list(Recipe.self).map { $0.name })
        let missing = MealsLibrary.recipes.filter { !have.contains($0.name) }
        if !missing.isEmpty {
            try await db.insertMany(Recipe.self, missing.map { MealsModel.recipeRow($0) })
        }
        libraryChecked = true
    }

    // MARK: book

    public func setAtHome(_ name: String, _ atHome: Bool) async throws {
        let key = MealsCore.foodKey(name)
        if atHome {
            try await db.upsert(PantryItem.self, ["name": .string(key)], conflict: ["name"])
        } else {
            try await db.removeWhere(PantryItem.self, eq: ["name": .string(key)])
        }
        await refresh()
    }

    /// Save what a pack really cost at a store, from a receipt. Nil goes back to the estimate.
    public func setReceiptPrice(_ name: String, store storeName: String, price: Double?) async throws {
        let key = MealsCore.foodKey(name)
        if let p = price, p >= 0 {
            try await db.upsert(ReceiptPrice.self, ["name": .string(key), "store": .string(storeName), "price": .number(MealsCore.round(p, 2))], conflict: ["name", "store"])
        } else {
            try await db.removeWhere(ReceiptPrice.self, eq: ["name": .string(key), "store": .string(storeName)])
        }
        await refresh()
    }

    private func patchSettings(_ patch: JSONObject) async throws {
        settings = try await db.update(AppSettings.self, id: "app", patch: patch)
    }

    public func setPreferredStore(_ storeName: String) async throws {
        try await patchSettings(["preferred_store": .string(storeName)])
    }

    public func saveFoodSettings(budget: Double?, likes: [String], dislikes: [String]) async throws {
        try await patchSettings([
            "weekly_food_budget": JSON.num(budget),
            "food_likes": .array(likes.map { JSON.string($0) }),
            "food_dislikes": .array(dislikes.map { JSON.string($0) }),
        ])
    }

    // MARK: plans

    private func costAt(_ meals: [PlannedMeal], _ storeName: String) -> Double {
        var byId: [String: Recipe] = [:]
        for r in recipes { byId[r.id] = r }
        let source = MealsPricing.withCorrections(MealsPricing.estimateSource, MealsPricing.corrections(from: priceRows))
        let lines = MealsGrocery.rollUp(meals, byId, MealsModel.foodIndex)
        let pantry = MealsGrocery.pantrySet(pantryRows.map { MealsCore.foodKey($0.name) })
        return MealsGrocery.listTotal(lines, MealsPricing.pricesAt(source, storeName), pantry)
    }

    /// Write the week and bring its grocery rows in line with it.
    @discardableResult
    public func savePlan(weekStart: DateStr, meals: [PlannedMeal], budget: Double, store storeName: String) async throws -> MealPlan {
        var seen = Set<String>()
        var ids: [JSON] = []
        for m in meals where !seen.contains(m.recipeId) {
            seen.insert(m.recipeId)
            ids.append(.string(m.recipeId))
        }
        let row: JSONObject = [
            "week_start": .string(weekStart),
            "budget": .number(budget),
            "recipe_ids": .array(ids),
            "meals": JSON.from(meals),
            "total_cost": .number(costAt(meals, storeName)),
            "store": .string(storeName),
        ]
        let plan = try await db.upsert(MealPlan.self, row, conflict: ["week_start"])
        try await syncGrocery(planId: plan.id, store: storeName)
        await refresh()
        return plan
    }

    /// Runs one at a time and reads the plan again when its turn comes.
    public func syncGrocery(planId: String, store storeName: String? = nil) async throws {
        let previous = syncTail
        let run = Task { @MainActor in
            if let p = previous { _ = await p.result }
            try await self.syncGroceryNow(planId: planId, fallbackStore: storeName)
        }
        syncTail = run
        try await run.value
    }

    private func syncGroceryNow(planId: String, fallbackStore: String?) async throws {
        guard let plan = try await db.get(MealPlan.self, id: planId) else { return }
        let pref = fallbackStore ?? settings?.preferredStore
        let bookStore = (pref != nil && MealsPricing.isStore(pref)) ? (pref ?? MealsPricing.defaultStore) : MealsPricing.defaultStore
        var storeName = bookStore
        if let ps = plan.store, MealsPricing.isStore(ps) { storeName = ps }
        let source = MealsPricing.withCorrections(MealsPricing.estimateSource, MealsPricing.corrections(from: priceRows))
        var byId: [String: Recipe] = [:]
        for r in recipes { byId[r.id] = r }
        let lines = MealsGrocery.rollUp(plan.meals, byId, MealsModel.foodIndex)
        let rows = try await db.list(GroceryItem.self, Query(eq: ["plan_id": .string(plan.id)]))
        var byName: [String: GroceryItem] = [:]
        for r in rows {
            let key = MealsCore.foodKey(r.name)
            if byName[key] != nil {
                // A second row for the same food is left over from an older build. One is enough.
                try await db.remove(GroceryItem.self, id: r.id)
            } else {
                byName[key] = r
            }
        }
        var keep = Set<String>()
        for line in lines {
            let key = MealsCore.foodKey(line.name)
            keep.insert(key)
            let prices = MealsGrocery.linePrices(line, source)
            var pricesJSON: JSONObject = [:]
            for (k, v) in prices { pricesJSON[k] = .number(v) }
            let price: Double? = prices[storeName]
            let next: JSONObject = [
                "name": .string(line.name),
                "quantity": .number(line.packs),
                "unit": .string(line.packLabel),
                "category": .string(line.section.rawValue),
                "store": .string(storeName),
                "price": JSON.num(price),
                "prices": .object(pricesJSON),
            ]
            if let row = byName[key] {
                let changed = row.quantity != line.packs || row.price != price || row.store != storeName || row.prices != prices
                if changed {
                    var patch = next
                    // More to buy than was ticked off: the tick no longer holds.
                    patch["bought"] = .bool(row.bought && line.packs <= row.quantity)
                    try await db.update(GroceryItem.self, id: row.id, patch: patch)
                }
            } else {
                var row = next
                row["plan_id"] = .string(plan.id)
                row["bought"] = .bool(false)
                try await db.insert(GroceryItem.self, row)
            }
        }
        for (key, r) in byName where !keep.contains(key) {
            try await db.remove(GroceryItem.self, id: r.id)
        }
        let total = costAt(plan.meals, storeName)
        if plan.totalCost != total {
            try await db.update(MealPlan.self, id: plan.id, patch: ["total_cost": .number(total)])
        }
    }

    /// The saved grocery rows and the week total follow the plan. They go stale when a receipt price, the pantry or a recipe moves.
    public func keepInStep() async {
        guard !keeping, !loading, let s = snap, let plan = s.plan else { return }
        let total = MealsGrocery.listTotal(s.lines, s.ctx.prices, s.pantry)
        let stale = abs(total - plan.totalCost) > 0.004 || s.rows.count != s.lines.count || s.rows.contains { $0.store != s.store }
        if !stale { return }
        keeping = true
        do {
            try await syncGrocery(planId: plan.id, store: s.store)
            try await fetchAll()
            rebuild()
        } catch {
            // The next visit tries again.
        }
        keeping = false
    }

    public func setPlanStore(_ storeName: String) async throws {
        guard let plan = snap?.plan else { return }
        try await setPreferredStore(storeName)
        try await db.update(MealPlan.self, id: plan.id, patch: ["store": .string(storeName)])
        try await syncGrocery(planId: plan.id, store: storeName)
        await refresh()
    }

    /// Tick or untick at once, put it back if the write fails.
    public func setBought(_ row: GroceryItem, _ bought: Bool) async throws {
        let before = groceryRows
        if let i = groceryRows.firstIndex(where: { $0.id == row.id }) {
            groceryRows[i].bought = bought
            rebuild()
        }
        do {
            try await db.update(GroceryItem.self, id: row.id, patch: ["bought": .bool(bought)])
        } catch {
            groceryRows = before
            rebuild()
            throw error
        }
    }

    public func removePlan() async throws {
        guard let plan = snap?.plan else { return }
        try await db.removeWhere(GroceryItem.self, eq: ["plan_id": .string(plan.id)])
        try await db.remove(MealPlan.self, id: plan.id)
        await refresh()
    }

    // MARK: building a week

    /// Ask the server to read a request with the model. Nil means read it locally.
    private func askModel(_ text: String) async -> PlanRequest? {
        var words: [String] = []
        var seen = Set<String>()
        for r in recipes {
            for w in r.tags + r.ingredients.map({ $0.name }) where !seen.contains(w) {
                seen.insert(w)
                words.append(w)
            }
        }
        let body: JSON = .object(["text": .string(text), "words": .array(words.map { JSON.string($0) })])
        guard let data = try? JSONEncoder().encode(body) else { return nil }
        guard let (out, status) = try? await db.api.send(path: "/api/meals/request", method: "POST", body: data) else { return nil }
        if !(200..<300).contains(status) { return nil }
        guard let json = try? JSONDecoder().decode(JSON.self, from: out), case .object(let o) = json else { return nil }
        guard case .string(let src)? = o["source"], src == "ai" else { return nil }
        return MealsRequest.clean(o["request"], recipes: recipes)
    }

    private static func seedKey(_ weekStart: DateStr) -> String { return "meals:seed:" + weekStart }

    public func note(for weekStart: DateStr) -> String {
        return UserDefaults.standard.string(forKey: "meals:note:" + weekStart) ?? ""
    }

    public func lastAsk(for weekStart: DateStr) -> String {
        return UserDefaults.standard.string(forKey: "meals:ask:" + weekStart) ?? ""
    }

    private func remember(_ key: String, _ value: String) {
        if value.isEmpty { UserDefaults.standard.removeObject(forKey: key) } else { UserDefaults.standard.set(value, forKey: key) }
    }

    /// Build or rebuild the week from today on. Days already behind us keep what was planned on them.
    public func build(_ v: MealsBuildValues, shuffle: Bool) async throws -> MealsBuildOutcome {
        guard let s = snap else { throw MealsFailure("Still loading.") }
        try await saveFoodSettings(budget: v.budget, likes: v.likes, dislikes: v.dislikes)
        try await setPreferredStore(v.store)

        var request: PlanRequest? = nil
        if !v.ask.isEmpty {
            let asked = await askModel(v.ask)
            request = asked ?? MealsRequest.parse(v.ask, recipes: recipes)
        }
        var budget = v.budget
        if let rb = request?.budget, rb > 0 {
            budget = rb
            if rb != v.budget { try await saveFoodSettings(budget: rb, likes: v.likes, dislikes: v.dislikes) }
        }
        var prefs: PlanPrefs? = nil
        if let r = request, !r.isEmpty { prefs = r.prefs }

        let key = MealsModel.seedKey(s.weekStart)
        let stored = Int(UserDefaults.standard.string(forKey: key) ?? "") ?? 0
        let base = stored != 0 ? stored : LIDate.diffDays("2026-01-05", s.weekStart)
        let seed = base + (shuffle ? 1 : 0)
        UserDefaults.standard.set(String(seed), forKey: key)

        // Let the spinner paint before the planner takes the thread.
        try? await Task.sleep(nanoseconds: 40_000_000)
        var ctx = s.ctx
        ctx.prices = MealsPricing.pricesAt(s.source, v.store)
        ctx.likes = v.likes
        ctx.dislikes = v.dislikes
        ctx.budget = budget
        let result = MealsPlanner.planWeek(ctx, weekStart: s.weekStart, seed: seed, prefs: prefs)
        if result.status == .noRecipes {
            remember("meals:note:" + s.weekStart, result.message)
            return MealsBuildOutcome(status: result.status, message: result.message)
        }
        let past = s.meals.filter { $0.date < s.today }
        let pastDates = Set(past.map { $0.date })
        let meals = past + result.meals.filter { !pastDates.contains($0.date) }
        try await savePlan(weekStart: s.weekStart, meals: meals, budget: budget, store: v.store)

        let heard = request.map { MealsRequest.describe($0) } ?? ""
        var parts: [String] = []
        if !result.message.isEmpty { parts.append(result.message) }
        if !heard.isEmpty { parts.append("Heard: " + heard) }
        let message = parts.joined(separator: " ")
        remember("meals:note:" + s.weekStart, message)
        remember("meals:ask:" + s.weekStart, v.ask)
        return MealsBuildOutcome(status: result.status, message: message)
    }

    // MARK: cooking

    private func syncDayTotals(_ date: DateStr) async throws {
        let meals = try await db.list(Meal.self, Query(eq: ["date": .string(date)]))
        let none = meals.isEmpty
        let cal = meals.reduce(0) { $0 + $1.calories }
        let pro = meals.reduce(0) { $0 + $1.protein }
        try await setValueByKey("calories", date, none ? nil : MealsCore.jsRound(cal))
        try await setValueByKey("protein", date, none ? nil : MealsCore.jsRound(pro))
    }

    private func setValueByKey(_ key: String, _ date: DateStr, _ value: Double?) async throws {
        guard let item = store.items.first(where: { $0.key == key }) else { return }
        let has = value != nil
        let prev = try await db.first(DayLog.self, Query(eq: ["date": .string(date), "item_id": .string(item.id)]))
        let at = LIDate.nowIso()
        let row = AppStore.logRow(date: date, itemId: item.id, value: value, checked: has, text: prev?.text, completedAt: has ? at : nil, slips: prev?.slips ?? 0)
        try await db.upsert(DayLog.self, row, conflict: ["date", "item_id"])
    }

    /// "Cooked, log it": write the meal through Body's own path, which also pushes the day's calories and protein to the checklist.
    public func logCooked(date: DateStr, slot: MealSlot) async throws {
        guard let s = snap, let plan = s.plan else { return }
        guard let at = plan.meals.firstIndex(where: { $0.date == date && $0.slot == slot }) else { return }
        let planned = plan.meals[at]
        guard let recipe = s.recipeById[planned.recipeId] else { throw MealsFailure("That recipe is gone.") }
        if date > s.today { throw MealsFailure("Log it on the day.") }
        if planned.logged != nil && isLogged(planned) { return }
        let sv = planned.servings
        func one(_ n: Double) -> Double { return (n * 10).rounded() / 10 }
        let row: JSONObject = [
            "date": .string(date),
            "time": .string(LIDate.timeNY()),
            "photo_url": .null,
            "name": .string(recipe.name),
            "calories": .number(MealsCore.round(recipe.calories * sv)),
            "protein": .number(one(MealsCore.round(recipe.protein * sv, 1))),
            "carbs": .number(one(MealsCore.round(recipe.carbs * sv, 1))),
            "fat": .number(one(MealsCore.round(recipe.fat * sv, 1))),
        ]
        let meal = try await db.insert(Meal.self, row)
        try await syncDayTotals(date)
        var next = plan.meals
        next[at].logged = meal.id
        try await db.update(MealPlan.self, id: plan.id, patch: ["meals": JSON.from(next)])
        await refresh()
        await store.reload()
    }

    // MARK: money

    @discardableResult
    public func recordShop(date: DateStr, amount: Double, store storeName: String?, note: String?) async throws -> Expense {
        guard let plan = snap?.plan else { throw MealsFailure("No plan to record against.") }
        let trimmed = (note ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let made = try await db.insert(Expense.self, [
            "date": .string(date),
            "amount": .number(MealsCore.round(amount, 2)),
            "category": .string("groceries"),
            "note": trimmed.isEmpty ? JSON.null : JSON.string(trimmed),
            "store": JSON.str(storeName),
            "plan_id": .string(plan.id),
        ])
        await refresh()
        return made
    }

    public func removeShop(_ expense: Expense) async throws {
        try await db.remove(Expense.self, id: expense.id)
        await refresh()
    }

    // MARK: recipes

    public static func recipeFields(_ input: RecipeInput) -> JSONObject {
        let n = MealsCore.recipeNumbers(input.lines, servings: input.servings, index: MealsModel.foodIndex)
        var m = MealMacros(calories: n.calories, protein: n.protein, carbs: n.carbs, fat: n.fat)
        if !n.unknown.isEmpty, let manual = input.manual { m = manual }
        let steps = input.steps.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        let tags = MealsCore.derivedTags(input.lines, index: MealsModel.foodIndex)
        return [
            "name": .string(input.name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "slot": .string(input.slot.rawValue),
            "servings": .number(input.servings > 0 ? input.servings : 1),
            "ingredients": JSON.from(n.ingredients),
            "steps": .array(steps.map { JSON.string($0) }),
            "calories": .number(MealsCore.round(m.calories)),
            "protein": .number(MealsCore.round(m.protein, 1)),
            "carbs": .number(MealsCore.round(m.carbs, 1)),
            "fat": .number(MealsCore.round(m.fat, 1)),
            "est_cost": .number(n.estCost),
            "tags": .array(tags.map { JSON.string($0) }),
        ]
    }

    @discardableResult
    public func saveRecipe(_ input: RecipeInput, existing: Recipe?) async throws -> Recipe {
        var row = MealsModel.recipeFields(input)
        let made: Recipe
        if let existing = existing {
            // Keep the tags a library recipe came with (batch, quick) beside the derived ones.
            let keepers: Set<String> = ["batch", "quick", "freezer", "nocook"]
            var tags = Set<String>()
            if case .array(let derived)? = row["tags"] { for t in derived { if let s = t.stringValue { tags.insert(s) } } }
            for t in existing.tags where keepers.contains(t) { tags.insert(t) }
            row["tags"] = .array(tags.sorted().map { JSON.string($0) })
            made = try await db.update(Recipe.self, id: existing.id, patch: row)
        } else {
            row["photo_url"] = .null
            row["source"] = .string("user")
            made = try await db.insert(Recipe.self, row)
        }
        await refresh()
        return made
    }

    public func deleteRecipe(_ recipe: Recipe) async throws {
        try await db.remove(Recipe.self, id: recipe.id)
        await refresh()
    }

    // MARK: instacart

    public func checkInstacart() async {
        do {
            let (data, status) = try await db.api.send(path: "/api/meals/instacart", method: "GET")
            if (200..<300).contains(status), let json = try? JSONDecoder().decode(JSON.self, from: data), case .object(let o) = json, case .bool(true)? = o["connected"] {
                instacart = .ready
            } else {
                instacart = .off
            }
        } catch {
            instacart = .off
        }
    }

    /// Sends the list to Instacart. Returns the page to open, or nil when Instacart did not take it.
    public func sendToInstacart(title: String) async -> URL? {
        guard let s = snap else { return nil }
        let items = MealsGrocery.instacartItems(s.lines, s.pantry)
        let list: [JSON] = items.map { i in
            .object(["name": .string(i.name), "quantity": .number(i.quantity), "unit": .string(i.unit), "display_text": .string(i.displayText)])
        }
        var body: JSONObject = ["title": .string(title), "items": .array(list)]
        let base = db.api.baseURL.absoluteString
        if base.hasPrefix("https://") { body["linkback"] = .string(base + "/meals/grocery") }
        guard let data = try? JSONEncoder().encode(JSON.object(body)) else { return nil }
        guard let (out, _) = try? await db.api.send(path: "/api/meals/instacart", method: "POST", body: data) else { return nil }
        guard let json = try? JSONDecoder().decode(JSON.self, from: out), case .object(let o) = json, case .string(let url)? = o["url"] else { return nil }
        return URL(string: url)
    }
}
