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

    /// What a set starts out as, so logging it is one tap when nothing changed:
    /// 1. Same set last session (or last session's final set when it had fewer).
    /// 2. If the set just before it today was logged heavier or lighter than last time, carry that weight forward.
    /// 3. With no history, the planned reps and no weight.
    public static func prefillSet(_ exercise: Exercise, setNumber: Int, last: [SetLog], today: [SetLog]) -> SetValues {
        let lastSame: SetLog? = last.first(where: { $0.setNumber == setNumber }) ?? last.last
        let prevToday: SetLog? = today.first(where: { $0.setNumber == setNumber - 1 })
        let lastPrev: SetLog? = last.first(where: { $0.setNumber == setNumber - 1 })
        var weight: Double? = lastSame?.weight
        var reps: Int? = lastSame?.reps ?? parseReps(exercise.reps)
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
