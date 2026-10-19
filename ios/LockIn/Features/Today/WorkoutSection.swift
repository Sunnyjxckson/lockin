import SwiftUI
import LockInKit

/// Today's main workout and the core rotation.
struct WorkoutSection: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Today's workout")
            if store.mainWorkout == nil && store.coreWorkout == nil {
                LICard {
                    LIEmptyState(title: "No workout set", message: "Pick exercises for this weekday in the web app.")
                }
            } else {
                if let main = store.mainWorkout {
                    WorkoutCard(workout: main, tag: Workouts.kindLabel(main.kind))
                }
                if let core = store.coreWorkout {
                    WorkoutCard(workout: core, tag: "Core")
                }
            }
        }
    }
}

struct WorkoutCard: View {
    @Environment(\.liTheme) private var theme
    let workout: Workout
    let tag: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(workout.name).liType(.h2).foregroundColor(theme.ink).lineLimit(2)
                    if let detail = workout.detail, !detail.isEmpty {
                        Text(detail).liType(.sub).foregroundColor(theme.ink2)
                    }
                }
                Spacer(minLength: 8)
                Text(tag).liType(.label).foregroundColor(theme.ink2).padding(.top, 6)
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 14)

            if workout.exercises.isEmpty {
                LIHairline()
                Text("No exercises listed.").liType(.sub).foregroundColor(theme.ink2)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
            } else {
                ForEach(0..<workout.exercises.count, id: \.self) { i in
                    LIHairline()
                    HStack(spacing: 12) {
                        Text("\(i + 1)").liType(.caption).foregroundColor(theme.ink2).frame(width: 16, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(workout.exercises[i].name).liType(.body).foregroundColor(theme.ink)
                            if let note = workout.exercises[i].note, !note.isEmpty {
                                Text(note).liType(.caption).foregroundColor(theme.ink2)
                            }
                        }
                        Spacer(minLength: 8)
                        Text(Workouts.formatSets(workout.exercises[i])).liType(.body).foregroundColor(theme.ink2)
                    }
                    .padding(.horizontal, 20)
                    .frame(minHeight: 46)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LITileSurface(radius: 24))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}
