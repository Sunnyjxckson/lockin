import Foundation

/// Port of workoutsFor in src/lib/db/helpers.ts and the display helpers on Today.
public enum Workouts {
    /// The main workout and the core routine for a weekday. Either can be nil.
    public static func workoutsFor(_ all: [Workout], weekday: Int) -> (main: Workout?, core: Workout?) {
        let main = all.first { $0.weekday == weekday && $0.slot == .main }
        let core = all.first { $0.weekday == weekday && $0.slot == .core }
        return (main, core)
    }

    public static func kindLabel(_ k: WorkoutKind) -> String {
        switch k {
        case .lift: return "Lift"
        case .cardio: return "Cardio"
        case .sport: return "Sport"
        case .rest: return "Rest"
        }
    }

    /// "4 x 6 to 8" or, for a single set, just "10 min".
    public static func formatSets(_ e: Exercise) -> String {
        let base = e.sets > 1 ? "\(e.sets) x \(e.reps)" : e.reps
        let w = (e.weight ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return w.isEmpty ? base : "\(base) \u{00B7} \(w)"
    }
}
