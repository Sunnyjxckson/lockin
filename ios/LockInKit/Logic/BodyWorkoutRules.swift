import Foundation

/// Weight and reps for one set.
public struct SetValues: Equatable {
    public var weight: Double?
    public var reps: Int?

    public init(weight: Double? = nil, reps: Int? = nil) {
        self.weight = weight
        self.reps = reps
    }
}

public struct WorkoutProgress: Equatable {
    public var logged: Int
    public var total: Int
    public var complete: Bool
}

/// Set logging rules: last session per exercise, what to prefill, how many sets are logged.
/// Port of src/lib/logic/workout.ts. Added to Workouts without touching Workouts.swift.
extension Workouts {
    public static func sameExercise(_ a: String, _ b: String) -> Bool {
        return a.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == b.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func hasNumbers(_ l: SetLog) -> Bool {
        return l.reps != nil || l.weight != nil
    }

    /// The sets of the most recent session of an exercise before `before`, in set order.
    public static func lastSession(_ logs: [SetLog], exercise: String, before: DateStr) -> [SetLog] {
        var latest: DateStr? = nil
        for l in logs {
            if l.date >= before || !hasNumbers(l) || !sameExercise(l.exercise, exercise) { continue }
            if latest == nil || l.date > (latest ?? "") { latest = l.date }
        }
        guard let day = latest else { return [] }
        return logs
            .filter { $0.date == day && hasNumbers($0) && sameExercise($0.exercise, exercise) }
            .sorted { $0.setNumber < $1.setNumber }
    }

    /// The logged sets of one exercise on one date, in set order.
    public static func setsOn(_ logs: [SetLog], exercise: String, date: DateStr) -> [SetLog] {
        return logs
            .filter { $0.date == date && sameExercise($0.exercise, exercise) }
            .sorted { $0.setNumber < $1.setNumber }
    }

    /// First whole number in a reps note: "6 to 8" is 6. Nil for timed work.
    public static func parseReps(_ reps: String) -> Int? {
        let range = NSRange(reps.startIndex..<reps.endIndex, in: reps)
        if let timed = try? NSRegularExpression(pattern: "\\b(sec|secs|seconds?|min|mins|minutes?)\\b", options: [.caseInsensitive]),
           timed.firstMatch(in: reps, options: [], range: range) != nil {
            return nil
        }
        var digits = ""
        for ch in reps {
            if ch.isASCII && ch.isNumber {
                digits.append(ch)
            } else if !digits.isEmpty {
                break
            }
        }
        return Int(digits)
    }

    static func numbers(in text: String) -> [Double] {
        guard let re = try? NSRegularExpression(pattern: "[0-9]+(\\.[0-9]+)?", options: []) else { return [] }
        let ns = text as NSString
        return re.matches(in: text, options: [], range: NSRange(location: 0, length: ns.length)).compactMap { Double(ns.substring(with: $0.range)) }
    }

    /// The weight to start from, from the plan text: "40s (try 45s)" is 40, "7.5 lb" is 7.5, "Light" is nil.
    public static func parseWeight(_ weight: String?) -> Double? {
        guard let weight = weight else { return nil }
        return numbers(in: weight).first
    }

    /// The top of a rep range: "8 to 10" is 10, "10" is 10. Nil for timed or non numeric text.
    public static func topReps(_ reps: String) -> Int? {
        let range = NSRange(reps.startIndex..<reps.endIndex, in: reps)
        if let timed = try? NSRegularExpression(pattern: "\\b(sec|secs|seconds?|min|mins|minutes?|hours?|hrs?)\\b", options: [.caseInsensitive]),
           timed.firstMatch(in: reps, options: [], range: range) != nil {
            return nil
        }
        guard let top = numbers(in: reps).last else { return nil }
        return Int(top)
    }

    public static let weightStep: Double = 5

    /// The +5 lb rule: when the last session logged every planned set at the top of the rep range, the next one goes up 5.
    public static func suggestedWeight(_ exercise: Exercise, last: [SetLog]) -> Double? {
        guard let top = topReps(exercise.reps), exercise.sets > 0 else { return nil }
        let sets = last.filter { $0.setNumber >= 1 && $0.setNumber <= exercise.sets }
        if Set(sets.map { $0.setNumber }).count < exercise.sets { return nil }
        var heaviest: Double = 0
        for l in sets {
            guard let r = l.reps, r >= top, let w = l.weight, w > 0 else { return nil }
            heaviest = max(heaviest, w)
        }
        return heaviest + weightStep
    }

    /// What a set starts out as, so logging it is one tap when nothing changed:
    /// 1. Same set last session (or last session's final set when it had fewer).
    /// 2. If the set just before it today was logged heavier or lighter than last time, carry that weight forward.
    /// 3. With no history, the planned reps and the planned weight when it is a number.
    /// A last session at the top of the range on every set starts set 1 five pounds higher.
    public static func prefillSet(_ exercise: Exercise, setNumber: Int, last: [SetLog], today: [SetLog]) -> SetValues {
        let lastSame: SetLog? = last.first(where: { $0.setNumber == setNumber }) ?? last.last
        let prevToday: SetLog? = today.first(where: { $0.setNumber == setNumber - 1 })
        let lastPrev: SetLog? = last.first(where: { $0.setNumber == setNumber - 1 })
        var weight: Double? = lastSame?.weight
        var reps: Int? = lastSame?.reps ?? parseReps(exercise.reps)
        if lastSame == nil { weight = parseWeight(exercise.weight) }
        if setNumber == 1, let bump = suggestedWeight(exercise, last: last) { weight = bump }
        if let p = prevToday, let pw = p.weight, lastPrev == nil || lastPrev?.weight != pw {
            weight = pw
        }
        if lastSame == nil, let p = prevToday {
            weight = p.weight
            reps = p.reps ?? reps
        }
        return SetValues(weight: weight, reps: reps)
    }

    /// "135 x 8", "8 reps" for bodyweight, "135" with no reps. Empty when blank.
    public static func formatSet(_ v: SetValues?) -> String {
        guard let v = v else { return "" }
        if v.weight == nil && v.reps == nil { return "" }
        if let w = v.weight {
            let text = BodyRules.fmt(w, 1)
            if let r = v.reps { return "\(text) x \(r)" }
            return text
        }
        return "\(v.reps ?? 0) reps"
    }

    /// Sets logged on `date` out of the sets the workout plans. Extra sets do not count.
    public static func workoutProgress(_ workout: Workout?, logs: [SetLog], date: DateStr) -> WorkoutProgress {
        guard let workout = workout else { return WorkoutProgress(logged: 0, total: 0, complete: false) }
        var logged = 0
        var total = 0
        for e in workout.exercises {
            total += e.sets
            var done = Set<Int>()
            for l in setsOn(logs, exercise: e.name, date: date) where l.setNumber >= 1 && l.setNumber <= e.sets {
                done.insert(l.setNumber)
            }
            logged += done.count
        }
        return WorkoutProgress(logged: logged, total: total, complete: total > 0 && logged >= total)
    }

    /// Total weight moved for an exercise session: sum of weight times reps.
    public static func sessionVolume(_ sets: [SetValues]) -> Double {
        return sets.reduce(0.0) { $0 + ($1.weight ?? 0) * Double($1.reps ?? 0) }
    }

    /// Only lifting days have sets worth logging.
    public static func isLoggable(_ workout: Workout?) -> Bool {
        guard let w = workout else { return false }
        return w.kind == .lift && !w.exercises.isEmpty
    }
}
