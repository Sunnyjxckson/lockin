import XCTest
@testable import LockInKit

private func bodyMeal(_ date: String, _ calories: Double, _ protein: Double, _ carbs: Double = 0, _ fat: Double = 0) -> Meal {
    return Meal(id: "\(date)-\(calories)", createdAt: "", date: date, time: "12:00", name: nil, photoUrl: nil, calories: calories, protein: protein, carbs: carbs, fat: fat)
}

private func bodyLog(_ date: String, _ weight: Double?, _ photo: String? = nil) -> BodyLog {
    return BodyLog(id: date, createdAt: "", date: date, weight: weight, photoUrl: photo)
}

private func setRow(_ date: String, _ exercise: String, _ n: Int, _ weight: Double?, _ reps: Int?) -> SetLog {
    return SetLog(id: "\(date)-\(exercise)-\(n)", createdAt: "", date: date, exercise: exercise, setNumber: n, weight: weight, reps: reps)
}

final class BodyRulesTests: XCTestCase {
    // MARK: meals and goals

    func testMealTotalsSumOnlyTheGivenDate() {
        let meals = [bodyMeal("2026-10-05", 600, 45, 50, 20), bodyMeal("2026-10-05", 450.5, 40.25, 30, 10), bodyMeal("2026-10-04", 900, 60)]
        XCTAssertEqual(BodyRules.mealTotals(meals, date: "2026-10-05"), BodyMacros(calories: 1050.5, protein: 85.3, carbs: 80, fat: 30))
        XCTAssertEqual(BodyRules.mealTotals(meals).calories, 1950.5)
        XCTAssertEqual(BodyRules.mealTotals([], date: "2026-10-05"), BodyMacros.zero)
        XCTAssertEqual(BodyRules.mealTotals([bodyMeal("2026-10-05", 100, 10, 0, Double.nan)]).fat, 0)
    }

    func testGoalsFromTargets() {
        XCTAssertEqual(BodyRules.goalFromTarget(.range(1900, 2100)), BodyGoal(min: 1900, max: 2100))
        XCTAssertEqual(BodyRules.goalFromTarget(.min(180)), BodyGoal(min: 180, max: nil))
        XCTAssertEqual(BodyRules.goalFromTarget(.check), BodyGoal.none)
        XCTAssertEqual(BodyRules.budgetGoal(200), BodyGoal(min: nil, max: 200))
        XCTAssertEqual(BodyRules.budgetGoal(0), BodyGoal.none)
    }

    func testRings() {
        let cal = BodyGoal(min: 1900, max: 2100)
        XCTAssertEqual(BodyRules.ringFor(0, cal), BodyRing(percent: 0, fill: 0, state: .empty))
        let half = BodyRules.ringFor(950, cal)
        XCTAssertEqual(half.percent, 0.5, accuracy: 0.0001)
        XCTAssertEqual(half.state, .under)
        XCTAssertEqual(BodyRules.ringFor(1900, cal).state, .met)
        XCTAssertEqual(BodyRules.ringFor(2100, cal).state, .met)
        let over = BodyRules.ringFor(2280, cal)
        XCTAssertEqual(over.state, .over)
        XCTAssertEqual(over.percent, 1.2, accuracy: 0.0001)
        XCTAssertEqual(over.fill, 1)
        XCTAssertEqual(BodyRules.ringFor(240, BodyGoal(min: 180, max: nil)).state, .met)
        XCTAssertEqual(BodyRules.ringFor(240, BodyGoal(min: 180, max: nil)).fill, 1)
        XCTAssertEqual(BodyRules.ringFor(200, BodyGoal(min: nil, max: 200)).state, .under)
        XCTAssertEqual(BodyRules.ringFor(201, BodyGoal(min: nil, max: 200)).state, .over)
        XCTAssertEqual(BodyRules.ringFor(500, BodyGoal.none), BodyRing(percent: 0, fill: 0, state: .none))
    }

    func testRemaining() {
        let cal = BodyGoal(min: 1900, max: 2100)
        XCTAssertEqual(BodyRules.remainingFor(1200, cal), BodyRemaining(left: 700, over: 0, room: 900))
        XCTAssertEqual(BodyRules.remainingFor(2000, cal), BodyRemaining(left: 0, over: 0, room: 100))
        XCTAssertEqual(BodyRules.remainingFor(2250, cal), BodyRemaining(left: 0, over: 150, room: 0))
        XCTAssertEqual(BodyRules.remainingFor(150, BodyGoal(min: 180, max: nil)), BodyRemaining(left: 30, over: 0, room: nil))
    }

    func testRemainingLabels() {
        let cal = BodyGoal(min: 1900, max: 2100)
        XCTAssertEqual(BodyRules.remainingLabel(1200, cal), "700 left")
        XCTAssertEqual(BodyRules.remainingLabel(2000, cal), "In range")
        XCTAssertEqual(BodyRules.remainingLabel(2250, cal), "150 over")
        XCTAssertEqual(BodyRules.remainingLabel(190, BodyGoal(min: 180, max: nil), unit: "g"), "Done")
        XCTAssertEqual(BodyRules.remainingLabel(50, BodyGoal(min: nil, max: 200), unit: "g"), "150g left")
        XCTAssertEqual(BodyRules.remainingLabel(50, BodyGoal.none), "No target")
    }

    func testNumberFormatting() {
        XCTAssertEqual(BodyRules.fmt(1050.5), "1,051")
        XCTAssertEqual(BodyRules.fmt(186.4, 1), "186.4")
        XCTAssertEqual(BodyRules.fmt(186, 1), "186")
        XCTAssertEqual(BodyRules.signed(1.2), "+1.2")
        XCTAssertEqual(BodyRules.signed(-3), "-3")
        XCTAssertEqual(BodyRules.signed(0), "0")
        XCTAssertEqual(BodyRules.targetLine(BodyGoal(min: 1900, max: 2100), unit: "kcal"), "1,900 to 2,100 kcal")
        XCTAssertEqual(BodyRules.targetLine(BodyGoal(min: 180, max: nil), unit: "g"), "180 g or more")
        XCTAssertEqual(BodyRules.dayName(5), "Friday")
    }

    // MARK: weight

    private var logs: [BodyLog] {
        return [bodyLog("2026-10-16", 186.4), bodyLog("2026-10-09", 188), bodyLog("2026-10-12", nil), bodyLog("2026-09-20", 195), bodyLog("2026-10-23", 185)]
    }

    func testWeightSeriesInsideTheChallenge() {
        let s = BodyRules.weightSeries(logs, startDate: "2026-10-05", lengthDays: 30)
        XCTAssertEqual(s.map { $0.date }, ["2026-10-09", "2026-10-16", "2026-10-23"])
        XCTAssertEqual(s.map { $0.day }, [5, 12, 19])
        XCTAssertEqual(BodyRules.weightSeries(logs).count, 4)
    }

    func testWeightTrend() {
        let t = BodyRules.weightTrend(BodyRules.weightSeries(logs, startDate: "2026-10-05", lengthDays: 30))
        XCTAssertEqual(t?.change, -3)
        XCTAssertEqual(t?.perWeek, -1.5)
        XCTAssertEqual(t?.sinceLast, -1.4)
        XCTAssertEqual(t?.direction, .down)
    }

    func testTrendWithZeroAndOneWeighIn() {
        XCTAssertNil(BodyRules.weightTrend([]))
        let t = BodyRules.weightTrend(BodyRules.weightSeries([bodyLog("2026-10-09", 188)], startDate: "2026-10-05", lengthDays: 30))
        XCTAssertEqual(t?.change, 0)
        XCTAssertNil(t?.perWeek)
        XCTAssertNil(t?.sinceLast)
        XCTAssertEqual(t?.direction, .flat)
    }

    func testWeightDomain() {
        let one = BodyRules.weightDomain(BodyRules.weightSeries([bodyLog("2026-10-05", 190)], startDate: "2026-10-05", lengthDays: 30))
        XCTAssertEqual(one.lo, 187)
        XCTAssertEqual(one.hi, 193)
        let many = BodyRules.weightDomain(BodyRules.weightSeries(logs, startDate: "2026-10-05", lengthDays: 30))
        XCTAssertLessThan(many.lo, 185)
        XCTAssertGreaterThan(many.hi, 188)
    }

    func testWeighInDate() {
        XCTAssertEqual(BodyRules.weighInDateFor("2026-10-05", weeklyDay: 5), "2026-10-09")
        XCTAssertEqual(BodyRules.weighInDateFor("2026-10-05", weeklyDay: 0), "2026-10-11")
        XCTAssertEqual(BodyRules.weighInDateFor("2026-10-05", weeklyDay: nil), "2026-10-09")
    }

    func testDayWindowOutsideAChallenge() {
        let info = ModeInfo(mode: .ongoing, challenge: nil, day: nil, length: nil, lastDay: nil, finished: nil, upcoming: nil, historyStart: "2026-09-01")
        let w = BodyRules.dayWindow(info, today: "2026-10-14", ongoingDays: 30)
        XCTAssertEqual(w.start, "2026-09-15")
        XCTAssertEqual(w.length, 30)
        XCTAssertFalse(w.numbered)
        let young = ModeInfo(mode: .ongoing, challenge: nil, day: nil, length: nil, lastDay: nil, finished: nil, upcoming: nil, historyStart: "2026-10-10")
        XCTAssertEqual(BodyRules.dayWindow(young, today: "2026-10-14", ongoingDays: 30).start, "2026-10-10")
    }

    // MARK: progress photos

    func testPhotosPickDayOneAndLatest() {
        let rows = [bodyLog("2026-10-16", 186, "c"), bodyLog("2026-10-05", 190, "a"), bodyLog("2026-10-09", 188, "b"), bodyLog("2026-10-23", 185)]
        XCTAssertEqual(BodyRules.photoEntries(rows).map { $0.photoUrl }, ["a", "b", "c"])
        let pair = BodyRules.pickComparePhotos(rows, startDate: "2026-10-05")
        XCTAssertEqual(pair.before?.photoUrl, "a")
        XCTAssertEqual(pair.after?.photoUrl, "c")
    }

    func testFirstPhotoInTheChallengeIsDayOne() {
        let rows = [bodyLog("2026-09-01", 200, "old"), bodyLog("2026-10-07", 190, "a"), bodyLog("2026-10-14", 188, "b")]
        XCTAssertEqual(BodyRules.pickComparePhotos(rows, startDate: "2026-10-05").before?.photoUrl, "a")
        XCTAssertEqual(BodyRules.pickComparePhotos(rows).before?.photoUrl, "old")
    }

    func testOnePhotoHasNoAfter() {
        let pair = BodyRules.pickComparePhotos([bodyLog("2026-10-05", 190, "a")], startDate: "2026-10-05")
        XCTAssertEqual(pair.before, BodyPhotoEntry(date: "2026-10-05", photoUrl: "a", weight: 190))
        XCTAssertNil(pair.after)
        let none = BodyRules.pickComparePhotos([bodyLog("2026-10-05", 190)], startDate: "2026-10-05")
        XCTAssertNil(none.before)
        XCTAssertNil(none.after)
    }

    func testEveryPhotoBeforeTheStartFallsBackToTheOldest() {
        let pair = BodyRules.pickComparePhotos([bodyLog("2026-09-01", 200, "x"), bodyLog("2026-09-10", 199, "y")], startDate: "2026-10-05")
        XCTAssertEqual(pair.before?.photoUrl, "x")
        XCTAssertEqual(pair.after?.photoUrl, "y")
    }
}

final class BodyWorkoutRulesTests: XCTestCase {
    private let bench = Exercise(name: "Bench press", sets: 4, reps: "6 to 8")

    private var logs: [SetLog] {
        return [
            setRow("2026-10-05", "Bench press", 2, 135, 7),
            setRow("2026-10-05", "Bench press", 1, 135, 8),
            setRow("2026-10-12", "Bench press", 1, 140, 8),
            setRow("2026-10-12", "bench press ", 2, 140, 6),
            setRow("2026-10-12", "Barbell row", 1, 115, 8),
            setRow("2026-10-19", "Bench press", 1, 145, 6),
        ]
    }

    func testLastSessionIsTheMostRecentEarlierOne() {
        let last = Workouts.lastSession(logs, exercise: "Bench press", before: "2026-10-19")
        XCTAssertEqual(last.map { $0.date }, ["2026-10-12", "2026-10-12"])
        XCTAssertEqual(last.map { $0.setNumber }, [1, 2])
        XCTAssertEqual(last.map { $0.weight }, [140, 140])
    }

    func testLastSessionNeverIncludesTheDayItself() {
        XCTAssertTrue(Workouts.lastSession(logs, exercise: "Bench press", before: "2026-10-05").isEmpty)
        XCTAssertTrue(Workouts.lastSession(logs, exercise: "Back squat", before: "2026-10-19").isEmpty)
        XCTAssertEqual(Workouts.lastSession(logs, exercise: "Bench press", before: "2026-10-12")[0].date, "2026-10-05")
    }

    func testLastSessionSkipsBlankRows() {
        let withBlank = logs + [setRow("2026-10-15", "Bench press", 1, nil, nil)]
        XCTAssertEqual(Workouts.lastSession(withBlank, exercise: "Bench press", before: "2026-10-19")[0].date, "2026-10-12")
    }

    func testPrefill() {
        let last = Workouts.lastSession(logs, exercise: "Bench press", before: "2026-10-19")
        XCTAssertEqual(Workouts.prefillSet(bench, setNumber: 1, last: last, today: []), SetValues(weight: 140, reps: 8))
        XCTAssertEqual(Workouts.prefillSet(bench, setNumber: 2, last: last, today: []), SetValues(weight: 140, reps: 6))
        XCTAssertEqual(Workouts.prefillSet(bench, setNumber: 4, last: last, today: []), SetValues(weight: 140, reps: 6))
        let today = Workouts.setsOn(logs, exercise: "Bench press", date: "2026-10-19")
        XCTAssertEqual(Workouts.prefillSet(bench, setNumber: 2, last: last, today: today), SetValues(weight: 145, reps: 6))
        XCTAssertEqual(Workouts.prefillSet(bench, setNumber: 1, last: [], today: []), SetValues(weight: nil, reps: 6))
        XCTAssertEqual(Workouts.prefillSet(Exercise(name: "Plank", sets: 3, reps: "45 sec"), setNumber: 1, last: [], today: []), SetValues(weight: nil, reps: nil))
        XCTAssertEqual(Workouts.prefillSet(bench, setNumber: 2, last: [], today: [setRow("2026-10-19", "Bench press", 1, 95, 10)]), SetValues(weight: 95, reps: 10))
    }

    func testParseWeightAndTopReps() {
        XCTAssertEqual(Workouts.parseWeight("40s (try 45s)"), 40)
        XCTAssertEqual(Workouts.parseWeight("200"), 200)
        XCTAssertEqual(Workouts.parseWeight("7.5 lb"), 7.5)
        XCTAssertNil(Workouts.parseWeight("Light"))
        XCTAssertNil(Workouts.parseWeight(nil))
        XCTAssertEqual(Workouts.topReps("8 to 10"), 10)
        XCTAssertEqual(Workouts.topReps("10"), 10)
        XCTAssertNil(Workouts.topReps("10 min"))
        XCTAssertNil(Workouts.topReps("close to failure"))
    }

    func testSuggestedWeightAndPlanPrefill() {
        let press = Exercise(name: "Incline DB press", sets: 3, reps: "8 to 10", weight: "40s (try 45s)")
        let full = [1, 2, 3].map { setRow("2026-10-12", "Incline DB press", $0, 40, 10) }
        XCTAssertEqual(Workouts.suggestedWeight(press, last: full), 45)
        let short = [setRow("2026-10-12", "Incline DB press", 1, 40, 10), setRow("2026-10-12", "Incline DB press", 2, 40, 9), setRow("2026-10-12", "Incline DB press", 3, 40, 10)]
        XCTAssertNil(Workouts.suggestedWeight(press, last: short))
        XCTAssertNil(Workouts.suggestedWeight(press, last: Array(full.prefix(2))))
        XCTAssertEqual(Workouts.prefillSet(press, setNumber: 1, last: [], today: []), SetValues(weight: 40, reps: 8))
        XCTAssertEqual(Workouts.prefillSet(press, setNumber: 1, last: full, today: []), SetValues(weight: 45, reps: 10))
        XCTAssertEqual(Workouts.prefillSet(press, setNumber: 2, last: full, today: []), SetValues(weight: 40, reps: 10))
        XCTAssertEqual(Workouts.formatSets(press), "3 x 8 to 10 \u{00B7} 40s (try 45s)")
    }

    func testParseReps() {
        XCTAssertEqual(Workouts.parseReps("6 to 8"), 6)
        XCTAssertEqual(Workouts.parseReps("10 each leg"), 10)
        XCTAssertNil(Workouts.parseReps("10 min"))
        XCTAssertNil(Workouts.parseReps("to failure"))
    }

    func testFormatSet() {
        XCTAssertEqual(Workouts.formatSet(SetValues(weight: 135, reps: 8)), "135 x 8")
        XCTAssertEqual(Workouts.formatSet(SetValues(weight: 42.5, reps: 10)), "42.5 x 10")
        XCTAssertEqual(Workouts.formatSet(SetValues(weight: nil, reps: 9)), "9 reps")
        XCTAssertEqual(Workouts.formatSet(SetValues(weight: nil, reps: nil)), "")
        XCTAssertEqual(Workouts.formatSet(nil), "")
    }

    func testProgressCountsLoggedSetsAgainstThePlan() {
        let w = Workout(id: "w", createdAt: "", weekday: 1, slot: .main, name: "Push", kind: .lift, detail: nil, exercises: [bench, Exercise(name: "Barbell row", sets: 4, reps: "8")])
        XCTAssertEqual(Workouts.workoutProgress(w, logs: logs, date: "2026-10-12"), WorkoutProgress(logged: 3, total: 8, complete: false))
        XCTAssertEqual(Workouts.workoutProgress(w, logs: logs, date: "2026-10-13"), WorkoutProgress(logged: 0, total: 8, complete: false))
        XCTAssertEqual(Workouts.workoutProgress(nil, logs: logs, date: "2026-10-12"), WorkoutProgress(logged: 0, total: 0, complete: false))
        let extra = logs + [setRow("2026-10-12", "Bench press", 9, 100, 5)]
        XCTAssertEqual(Workouts.workoutProgress(w, logs: extra, date: "2026-10-12").logged, 3)
        let one = Workout(id: "o", createdAt: "", weekday: 1, slot: .main, name: "Row", kind: .lift, detail: nil, exercises: [Exercise(name: "Barbell row", sets: 1, reps: "8")])
        XCTAssertTrue(Workouts.workoutProgress(one, logs: logs, date: "2026-10-12").complete)
    }

    func testVolumeAndLoggable() {
        XCTAssertEqual(Workouts.sessionVolume([SetValues(weight: 100, reps: 5), SetValues(weight: nil, reps: 8)]), 500)
        let lift = Workout(id: "l", createdAt: "", weekday: 1, slot: .main, name: "Push", kind: .lift, detail: nil, exercises: [bench])
        let sport = Workout(id: "s", createdAt: "", weekday: 1, slot: .main, name: "Hoop", kind: .sport, detail: nil, exercises: [bench])
        XCTAssertTrue(Workouts.isLoggable(lift))
        XCTAssertFalse(Workouts.isLoggable(sport))
        XCTAssertFalse(Workouts.isLoggable(nil))
    }
}
