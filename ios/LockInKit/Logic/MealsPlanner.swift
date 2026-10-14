import Foundation

// Meal planning rules, part 2: the week planner. Pure and deterministic: the
// same input and seed always give the same week. Port of mealsPlanner.ts.
//
// A week is 7 days of breakfast, lunch, dinner and a snack. A few recipes per
// slot repeat across the week (batch cooking), which keeps the grocery list
// short. Portions are scaled per day so each day lands in its calorie range
// and reaches its protein minimum. Cost is what the week's list costs at the
// register (whole packs, pantry items left out).

public enum PlanVariety: String, Equatable {
    case batch
    case balanced
    case varied
}

public struct PlanPrefs: Equatable {
    /// Lean toward these, on top of the saved likes.
    public var boost: [String]
    /// Leave these out, on top of the saved dislikes.
    public var avoid: [String]
    /// Pick the cheapest options for these slots.
    public var cheaperSlots: [MealSlot]
    public var variety: PlanVariety?

    public init(boost: [String] = [], avoid: [String] = [], cheaperSlots: [MealSlot] = [], variety: PlanVariety? = nil) {
        self.boost = boost
        self.avoid = avoid
        self.cheaperSlots = cheaperSlots
        self.variety = variety
    }
}

public struct PlanContext {
    public var recipes: [Recipe]
    public var foods: [String: MealFood]
    public var prices: PackPrices
    /// Food names already at home. They cost nothing.
    public var pantry: [String]
    public var targets: DayTargets
    /// A different target on some dates, for a challenge that starts or ends mid week.
    public var targetsByDate: [DateStr: DayTargets]
    public var likes: [String]
    public var dislikes: [String]
    public var budget: Double

    public init(recipes: [Recipe], foods: [String: MealFood], prices: @escaping PackPrices, pantry: [String] = [], targets: DayTargets, targetsByDate: [DateStr: DayTargets] = [:], likes: [String] = [], dislikes: [String] = [], budget: Double) {
        self.recipes = recipes
        self.foods = foods
        self.prices = prices
        self.pantry = pantry
        self.targets = targets
        self.targetsByDate = targetsByDate
        self.likes = likes
        self.dislikes = dislikes
        self.budget = budget
    }
}

public struct DayPlan: Equatable {
    public var date: DateStr
    public var calories: Double
    public var protein: Double
    public var carbs: Double
    public var fat: Double
    /// Food eaten that day at its share of each pack.
    public var cost: Double
    public var calOk: Bool
    public var proteinOk: Bool
    public var ok: Bool
    /// kcal outside the range: negative under, positive over, 0 inside.
    public var calOff: Double
    /// Grams short of the protein minimum, 0 when reached.
    public var proteinShort: Double
    public var targets: DayTargets
}

public struct PlanSummary {
    public var days: [DayPlan]
    /// Estimated dollars at the register for the week's list, pantry left out.
    public var cost: Double
    /// Estimated dollars of food actually eaten.
    public var foodCost: Double
    public var budget: Double
    /// Dollars over budget, 0 when inside it.
    public var overBy: Double
    public var allDaysOk: Bool
    /// Distinct things to buy.
    public var items: Int
}

public enum PlanStatus: String, Equatable {
    case ok
    case overBudget = "over_budget"
    case targetsMissed = "targets_missed"
    case noRecipes = "no_recipes"
}

public struct PlanResult {
    public var summary: PlanSummary
    public var status: PlanStatus
    /// One plain sentence or two about what happened. Empty when all is well.
    public var message: String
    public var meals: [PlannedMeal]
    public var recipeIds: [String]
}

public struct SwapOption {
    public var recipe: Recipe
    public var meals: [PlannedMeal]
    /// The swapped day after its portions are re-scaled.
    public var day: DayPlan
    /// The new portion of the new dish on that day.
    public var servings: Double
    public var weekCost: Double
    /// Dollars the week's list moves by. Negative is cheaper.
    public var costDelta: Double
    public var overBudget: Bool
    public var liked: Bool
    /// How many days change.
    public var days: Int
}

public enum SwapScope: String {
    case day
    case week
}

/// mulberry32: small, fast, and the same on every device.
public final class MealsRng {
    private var a: UInt32

    public init(seed: Int) {
        a = UInt32(bitPattern: Int32(truncatingIfNeeded: seed)) &+ 0x6d2b79f5
    }

    public func next() -> Double {
        a = a &+ 0x6d2b79f5
        var t: UInt32 = (a ^ (a >> 15)) &* (1 | a)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return Double(t ^ (t >> 14)) / 4294967296.0
    }
}

public enum MealsPlanner {
    // Portions stay near a normal plate: nobody wants half a lunch and a triple dinner.
    static let mainPortions: [Double] = [0.75, 1, 1.25, 1.5, 1.75, 2]
    static let snackPortions: [Double] = [0.5, 1, 1.5, 2]

    public static func portionsFor(_ slot: MealSlot) -> [Double] {
        return slot == .snack ? snackPortions : mainPortions
    }

    static func targetsOn(_ ctx: PlanContext, _ date: DateStr) -> DayTargets {
        return ctx.targetsByDate[date] ?? ctx.targets
    }

    struct Miss {
        var calOff: Double
        var proteinShort: Double
        var penalty: Double
    }

    static func miss(_ calories: Double, _ protein: Double, _ t: DayTargets) -> Miss {
        var calOff = 0.0
        if calories < t.calMin { calOff = calories - t.calMin } else if calories > t.calMax { calOff = calories - t.calMax }
        let proteinShort = max(0, t.proteinMin - protein)
        return Miss(calOff: calOff, proteinShort: proteinShort, penalty: abs(calOff) / 10 + proteinShort * 4)
    }

    /// Portions for one day's recipes that land in the calorie range and reach the protein minimum
    /// at the lowest cost, staying near one serving where it can. Tries every combination of quarter
    /// servings (halves for a snack). When the numbers cannot be hit it returns the nearest miss.
    public static func solveDay(_ recipes: [Recipe], _ t: DayTargets) -> [Double] {
        let n = recipes.count
        if n == 0 { return [] }
        let options = recipes.map { portionsFor($0.slot) }
        var pick = [Double](repeating: 0, count: n)
        var best = [Double](repeating: 1, count: n)
        var bestScore = Double.infinity

        func walk(_ i: Int, _ cal: Double, _ pro: Double, _ cost: Double, _ away: Double) {
            if i == n {
                let m = miss(cal, pro, t)
                let score = m.penalty * 1000 + cost * 3 + away
                if score < bestScore - 1e-9 {
                    bestScore = score
                    best = pick
                }
                return
            }
            let r = recipes[i]
            for s in options[i] {
                pick[i] = s
                walk(i + 1, cal + r.calories * s, pro + r.protein * s, cost + r.estCost * s, away + (s - 1) * (s - 1) * 8)
            }
        }
        walk(0, 0, 0, 0, 0)
        return best
    }

    // MARK: summary of any set of meals

    static func byId(_ recipes: [Recipe]) -> [String: Recipe] {
        var out: [String: Recipe] = [:]
        for r in recipes { out[r.id] = r }
        return out
    }

    public static func weekDates(_ weekStart: DateStr) -> [DateStr] {
        return (0..<7).map { LIDate.addDays(weekStart, $0) }
    }

    /// Macros, cost and budget for a set of planned meals. The planner, a swap, and the screen all read the week through this.
    public static func summarizePlan(_ meals: [PlannedMeal], _ ctx: PlanContext, dates: [DateStr]? = nil) -> PlanSummary {
        let recipes = byId(ctx.recipes)
        let pantry = MealsGrocery.pantrySet(ctx.pantry)
        let allDates: [DateStr] = dates ?? Array(Set(meals.map { $0.date })).sorted()
        var days: [DayPlan] = []
        for date in allDates {
            let t = targetsOn(ctx, date)
            var calories = 0.0, protein = 0.0, carbs = 0.0, fat = 0.0, cost = 0.0
            for m in meals where m.date == date {
                guard let r = recipes[m.recipeId] else { continue }
                calories += r.calories * m.servings
                protein += r.protein * m.servings
                carbs += r.carbs * m.servings
                fat += r.fat * m.servings
                cost += r.estCost * m.servings
            }
            let ms = miss(calories, protein, t)
            days.append(DayPlan(
                date: date,
                calories: MealsCore.round(calories),
                protein: MealsCore.round(protein),
                carbs: MealsCore.round(carbs),
                fat: MealsCore.round(fat),
                cost: MealsCore.round(cost, 2),
                calOk: ms.calOff == 0,
                proteinOk: ms.proteinShort == 0,
                ok: ms.penalty == 0,
                calOff: MealsCore.round(ms.calOff),
                proteinShort: MealsCore.round(ms.proteinShort),
                targets: t
            ))
        }
        let lines = MealsGrocery.rollUp(meals, recipes, ctx.foods)
        let cost = MealsGrocery.listTotal(lines, ctx.prices, pantry)
        var foodCost = 0.0
        for l in lines { foodCost += MealsGrocery.lineUsedCost(l, ctx.prices) }
        return PlanSummary(
            days: days,
            cost: cost,
            foodCost: MealsCore.round(foodCost, 2),
            budget: ctx.budget,
            overBy: MealsCore.round(max(0, cost - ctx.budget), 2),
            allDaysOk: !days.isEmpty && days.allSatisfy { $0.ok },
            items: lines.filter { !pantry.contains($0.name) }.count
        )
    }

    // MARK: choosing recipes

    /// Which of a slot's recipes each weekday eats. Runs of the same dish are the batch.
    static func rotation(_ v: PlanVariety, _ slot: MealSlot) -> [Int] {
        switch v {
        case .batch:
            switch slot {
            case .breakfast: return [0, 0, 0, 0, 0, 0, 0]
            case .lunch: return [0, 0, 0, 0, 1, 1, 1]
            case .dinner: return [0, 0, 0, 1, 1, 1, 1]
            case .snack: return [0, 0, 0, 0, 0, 0, 0]
            }
        case .balanced:
            switch slot {
            case .breakfast: return [0, 0, 0, 0, 1, 1, 1]
            case .lunch: return [0, 0, 0, 1, 1, 1, 1]
            case .dinner: return [0, 0, 1, 1, 2, 2, 0]
            case .snack: return [0, 1, 0, 1, 0, 1, 0]
            }
        case .varied:
            switch slot {
            case .breakfast: return [0, 0, 1, 1, 2, 2, 0]
            case .lunch: return [0, 0, 1, 1, 2, 2, 2]
            case .dinner: return [0, 0, 1, 1, 2, 2, 3]
            case .snack: return [0, 1, 2, 0, 1, 2, 0]
            }
        }
    }

    static func countFor(_ v: PlanVariety, _ slot: MealSlot) -> Int {
        return (rotation(v, slot).max() ?? 0) + 1
    }

    typealias Picks = [MealSlot: [Recipe]]

    static func mealsFrom(_ picks: Picks, _ weekStart: DateStr, _ variety: PlanVariety, _ ctx: PlanContext, _ cache: inout [String: [Double]]) -> [PlannedMeal] {
        let dates = weekDates(weekStart)
        var out: [PlannedMeal] = []
        for (i, date) in dates.enumerated() {
            var day: [Recipe] = []
            for slot in MealsCore.slots {
                let list = picks[slot] ?? []
                if list.isEmpty { continue }
                day.append(list[rotation(variety, slot)[i] % list.count])
            }
            let t = targetsOn(ctx, date)
            let key = day.map { $0.id }.joined(separator: "|") + "|" + MealsCore.jsNum(t.calMin) + "|" + MealsCore.jsNum(t.calMax) + "|" + MealsCore.jsNum(t.proteinMin)
            var portions = cache[key]
            if portions == nil {
                portions = solveDay(day, t)
                cache[key] = portions
            }
            let p = portions ?? []
            for (j, r) in day.enumerated() {
                out.append(PlannedMeal(date: date, slot: r.slot, recipeId: r.id, servings: p[j]))
            }
        }
        return out
    }

    static func sharedFoods(_ r: Recipe, _ chosen: Set<String>, _ pantry: Set<String>) -> Int {
        var n = 0
        for i in r.ingredients where chosen.contains(i.name) && !pantry.contains(i.name) { n += 1 }
        return n
    }

    struct Scored {
        var meals: [PlannedMeal]
        var picks: Picks
        var summary: PlanSummary
        var penalty: Double
        var like: Double
        /// Dollars of food in the slots the user asked to make cheaper.
        var cheapSlots: Double
    }

    static func totalPenalty(_ s: PlanSummary) -> Double {
        var a = 0.0
        for d in s.days { a += abs(d.calOff) / 10 + d.proteinShort * 4 }
        return a
    }

    /// Lower is better. Feasible and inside budget first, then liked, then cheap.
    static func better(_ a: Scored, _ b: Scored?, _ budget: Double) -> Bool {
        guard let b = b else { return true }
        func tier(_ s: Scored) -> Int { return s.penalty > 0 ? 2 : (s.summary.cost > budget + 0.004 ? 1 : 0) }
        let ta = tier(a)
        let tb = tier(b)
        if ta != tb { return ta < tb }
        if ta == 2 {
            return a.penalty != b.penalty ? a.penalty < b.penalty : a.summary.cost < b.summary.cost
        }
        if ta == 1 { return a.summary.cost < b.summary.cost }
        func value(_ s: Scored) -> Double {
            return s.like * 4 - (s.summary.cost / max(1, budget)) * 10 - Double(s.summary.items) * 0.1 - s.cheapSlots * 0.6
        }
        return value(a) > value(b) + 1e-9
    }

    static func slotWord(_ s: MealSlot) -> String {
        switch s {
        case .breakfast: return "breakfasts"
        case .lunch: return "lunches"
        case .dinner: return "dinners"
        case .snack: return "snacks"
        }
    }

    static func money(_ n: Double) -> String {
        return MealsCore.dollars(n)
    }

    /// A budget is a round number the user typed: "$15", not "$15.00". Cents only when it has them.
    static func budgetMoney(_ n: Double) -> String {
        return n == n.rounded() ? "$" + MealsCore.group(n) : money(n)
    }

    /// Build a week. Tries many seeded combinations of recipes, scales each day's portions, prices the
    /// week's grocery list, and keeps the best: every day on target and inside the budget if that exists,
    /// leaning toward likes. When no such week exists it says why and returns the closest one.
    public static func planWeek(_ ctx: PlanContext, weekStart: DateStr, seed: Int, prefs: PlanPrefs? = nil) -> PlanResult {
        let variety = prefs?.variety ?? .balanced
        let dislikes = ctx.dislikes + (prefs?.avoid ?? [])
        let likes = ctx.likes + (prefs?.boost ?? [])
        let cheaper = Set(prefs?.cheaperSlots ?? [])
        let pantry = MealsGrocery.pantrySet(ctx.pantry)
        let dates = weekDates(weekStart)

        var pools: [MealSlot: [Recipe]] = [:]
        var empty: [MealSlot] = []
        for slot in MealsCore.slots {
            let list = ctx.recipes
                .filter { $0.slot == slot && !MealsCore.isExcluded($0, dislikes) }
                .sorted { MealsCore.localeCompare($0.id, $1.id) < 0 }
            pools[slot] = list
            if list.isEmpty { empty.append(slot) }
        }
        if !empty.isEmpty {
            let s = summarizePlan([], ctx, dates: dates)
            let what = empty.map { slotWord($0) }.joined(separator: " and ")
            return PlanResult(summary: s, status: .noRecipes, message: "No \(what) are left after your dislikes. Remove a dislike or add a recipe, then build again.", meals: [], recipeIds: [])
        }

        var likeOf: [String: Int] = [:]
        for r in ctx.recipes { likeOf[r.id] = MealsCore.matchCount(r, likes) }
        // Dollars per 30 g of protein with pantry items free: the planner's idea of cheap.
        var leanCost: [String: Double] = [:]
        for r in ctx.recipes {
            var cost = 0.0
            for i in r.ingredients {
                if let food = MealsCore.findFood(ctx.foods, i.name), pantry.contains(food.name) { continue }
                cost += i.estCost ?? 0
            }
            let perServing = cost / (r.servings > 0 ? r.servings : 1)
            leanCost[r.id] = (perServing / max(5, r.protein)) * 30
        }

        var costOfRecipe: [String: Double] = [:]
        for r in ctx.recipes { costOfRecipe[r.id] = r.estCost }
        var cache: [String: [Double]] = [:]
        let rng = MealsRng(seed: seed)

        func score(_ picks: Picks) -> Scored {
            let meals = mealsFrom(picks, weekStart, variety, ctx, &cache)
            let summary = summarizePlan(meals, ctx, dates: dates)
            var like = 0.0
            var cheapSlots = 0.0
            for m in meals {
                like += Double(likeOf[m.recipeId] ?? 0)
                if cheaper.contains(m.slot) { cheapSlots += (costOfRecipe[m.recipeId] ?? 0) * m.servings }
            }
            return Scored(meals: meals, picks: picks, summary: summary, penalty: totalPenalty(summary), like: like / 28, cheapSlots: cheapSlots)
        }

        func choose(_ costWeight: Double, _ jitter: Double) -> Picks {
            var picks: Picks = [:]
            var chosenFoods = Set<String>()
            for slot in MealsCore.slots {
                let pool = pools[slot] ?? []
                let want = min(countFor(variety, slot), pool.count)
                let w: Double = cheaper.contains(slot) ? costWeight * 3 + 2 : costWeight
                var taken: [Recipe] = []
                var left = pool
                while taken.count < want {
                    var bestIndex = 0
                    var bestValue = -Double.infinity
                    for (i, r) in left.enumerated() {
                        let density = (r.protein * 4) / max(1, r.calories)
                        var value = density * 6
                        value += Double(likeOf[r.id] ?? 0) * 2.5
                        value -= (leanCost[r.id] ?? 0) * w
                        value += Double(sharedFoods(r, chosenFoods, pantry)) * 0.35
                        value += rng.next() * jitter
                        if value > bestValue {
                            bestValue = value
                            bestIndex = i
                        }
                    }
                    let r = left.remove(at: bestIndex)
                    taken.append(r)
                    for i in r.ingredients { chosenFoods.insert(i.name) }
                }
                picks[slot] = taken
            }
            return picks
        }

        var tried: [Scored] = []
        let attempts = 140
        for k in 0..<attempts {
            // The first few runs are plain greedy at rising cost pressure, so a tight budget always gets an
            // honest cheapest try. The rest explore.
            let costWeight: Double = k < 6 ? Double(k) * 0.8 : rng.next() * 3
            let jitter: Double = k < 6 ? 0 : 1 + rng.next() * 3
            tried.append(score(choose(costWeight, jitter)))
        }
        let budget = ctx.budget
        let order = tried.enumerated().sorted { x, y in
            if better(x.element, y.element, budget) { return true }
            if better(y.element, x.element, budget) { return false }
            return x.offset < y.offset
        }
        tried = order.map { $0.element }
        var winner = tried[0]

        // Over budget or off target: take the best few starts and walk each one downhill a recipe at a time
        // until no single change helps, so "cannot be done" is not a guess from a handful of tries.
        if winner.penalty > 0 || winner.summary.cost > budget + 0.004 {
            var starts: [Scored] = []
            var seen = Set<String>()
            for s in tried {
                let key = MealsCore.slots.map { slot in (s.picks[slot] ?? []).map { $0.id }.joined(separator: ",") }.joined(separator: "/")
                if seen.contains(key) { continue }
                seen.insert(key)
                starts.append(s)
                if starts.count == 3 { break }
            }
            for start in starts {
                var at = start
                var improved = true
                var guardCount = 0
                while improved && guardCount < 12 {
                    improved = false
                    guardCount += 1
                    for slot in MealsCore.slots {
                        let count = at.picks[slot]?.count ?? 0
                        for i in 0..<count {
                            for alt in pools[slot] ?? [] {
                                if (at.picks[slot] ?? []).contains(where: { $0.id == alt.id }) { continue }
                                var picks = at.picks
                                var list = picks[slot] ?? []
                                list[i] = alt
                                picks[slot] = list
                                let s = score(picks)
                                if better(s, at, budget) {
                                    at = s
                                    improved = true
                                }
                            }
                        }
                    }
                }
                if better(at, winner, budget) { winner = at }
            }
        }

        let summary = winner.summary
        let meals = winner.meals
        let t = ctx.targets
        let range = "\(MealsCore.group(t.calMin)) to \(MealsCore.group(t.calMax)) kcal"
        var status: PlanStatus = .ok
        var message = ""
        if winner.penalty > 0 {
            status = .targetsMissed
            let off = summary.days.filter { !$0.ok }.count
            let short = summary.days.map { $0.proteinShort }.max() ?? 0
            let why: String
            if short > 0 {
                why = "The closest it gets is \(MealsCore.jsNum(short))g short of \(MealsCore.jsNum(t.proteinMin))g protein inside \(range)."
            } else {
                why = "The closest it gets is outside \(range) on \(off) of 7 days."
            }
            message = "These recipes cannot hit your numbers every day. \(why) This is the nearest week, at about \(money(summary.cost))."
        } else if summary.cost > budget + 0.004 {
            status = .overBudget
            message = "\(budgetMoney(budget)) a week is not enough to reach \(MealsCore.jsNum(t.proteinMin))g protein and \(range) every day at these estimated prices. The cheapest week found costs about \(money(summary.cost)), which is \(money(summary.overBy)) over. Raise the budget to about \(budgetMoney(summary.cost.rounded(.up))), or mark what you already have at home."
        }
        var ids: [String] = []
        for m in meals where !ids.contains(m.recipeId) { ids.append(m.recipeId) }
        return PlanResult(summary: summary, status: status, message: message, meals: meals, recipeIds: ids)
    }

    // MARK: editing a plan

    /// Re-scale one day's portions around the recipes it has now. Other days are untouched.
    public static func rebalanceDay(_ meals: [PlannedMeal], _ date: DateStr, _ ctx: PlanContext) -> [PlannedMeal] {
        let recipes = byId(ctx.recipes)
        var idx: [Int] = []
        for (i, m) in meals.enumerated() where m.date == date && recipes[m.recipeId] != nil { idx.append(i) }
        if idx.isEmpty { return meals }
        let day: [Recipe] = idx.compactMap { recipes[meals[$0].recipeId] }
        let portions = solveDay(day, targetsOn(ctx, date))
        var out = meals
        for (k, i) in idx.enumerated() { out[i].servings = portions[k] }
        return out
    }

    /// Put another recipe in a slot, on one day or on every day that slot has the same dish, then re-scale those days.
    public static func applySwap(_ meals: [PlannedMeal], date: DateStr, slot: MealSlot, recipeId: String, scope: SwapScope, ctx: PlanContext) -> [PlannedMeal] {
        guard let current = meals.first(where: { $0.date == date && $0.slot == slot }) else { return meals }
        var touched: [DateStr] = []
        var next: [PlannedMeal] = meals.map { m in
            let hit = m.slot == slot && (scope == .week ? m.recipeId == current.recipeId : m.date == date)
            if !hit { return m }
            if !touched.contains(m.date) { touched.append(m.date) }
            // Anything else stored on the meal is dropped, so a cooked mark does not follow it to a different dish.
            return PlannedMeal(date: m.date, slot: m.slot, recipeId: recipeId, servings: m.servings)
        }
        for d in touched { next = rebalanceDay(next, d, ctx) }
        return next
    }

    /// Every other recipe that could go in a slot, best fit first: the day still hits its numbers, the week
    /// stays inside budget, liked dishes, then cheapest. Each option carries the whole week as it would be,
    /// so the screen shows the effect before anything is saved.
    public static func swapOptions(_ meals: [PlannedMeal], date: DateStr, slot: MealSlot, scope: SwapScope, ctx: PlanContext) -> [SwapOption] {
        let current = meals.first(where: { $0.date == date && $0.slot == slot })
        let dates = Array(Set(meals.map { $0.date })).sorted()
        let before = summarizePlan(meals, ctx, dates: dates)
        var out: [SwapOption] = []
        for recipe in ctx.recipes {
            if recipe.slot != slot || recipe.id == current?.recipeId || MealsCore.isExcluded(recipe, ctx.dislikes) { continue }
            let next = applySwap(meals, date: date, slot: slot, recipeId: recipe.id, scope: scope, ctx: ctx)
            let s = summarizePlan(next, ctx, dates: dates)
            guard let day = s.days.first(where: { $0.date == date }) else { continue }
            var changed = 0
            for (i, m) in next.enumerated() where i < meals.count && m.recipeId != meals[i].recipeId { changed += 1 }
            out.append(SwapOption(
                recipe: recipe,
                meals: next,
                day: day,
                servings: next.first(where: { $0.date == date && $0.slot == slot })?.servings ?? 1,
                weekCost: s.cost,
                costDelta: MealsCore.round(s.cost - before.cost, 2),
                overBudget: s.cost > ctx.budget + 0.004,
                liked: MealsCore.matchCount(recipe, ctx.likes) > 0,
                days: changed
            ))
        }
        func rank(_ o: SwapOption) -> Int { return (o.day.ok ? 0 : 2) + (o.overBudget ? 1 : 0) }
        func off(_ o: SwapOption) -> Double { return abs(o.day.calOff) / 10 + o.day.proteinShort * 4 }
        let sorted = out.enumerated().sorted { x, y in
            let a = x.element
            let b = y.element
            if rank(a) != rank(b) { return rank(a) < rank(b) }
            if off(a) != off(b) { return off(a) < off(b) }
            if a.liked != b.liked { return a.liked }
            if a.costDelta != b.costDelta { return a.costDelta < b.costDelta }
            let c = MealsCore.localeCompare(a.recipe.name, b.recipe.name)
            if c != 0 { return c < 0 }
            return x.offset < y.offset
        }
        return sorted.map { $0.element }
    }
}
