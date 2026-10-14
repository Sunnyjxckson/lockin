import SwiftUI
import LockInKit

/// Budget, store, likes and dislikes, and an optional ask in plain words. Used for the first plan and for every rebuild.
struct MealsSetupForm: View {
    @Environment(\.liTheme) private var theme
    let initial: MealsBuildValues
    let targets: DayTargets
    let challengeName: String?
    let busy: Bool
    let submitLabel: String
    let onSubmit: (MealsBuildValues) -> Void

    @State private var budget: Double?
    @State private var store: String
    @State private var likes: [String]
    @State private var dislikes: [String]
    @State private var ask: String

    init(initial: MealsBuildValues, targets: DayTargets, challengeName: String?, busy: Bool, submitLabel: String, onSubmit: @escaping (MealsBuildValues) -> Void) {
        self.initial = initial
        self.targets = targets
        self.challengeName = challengeName
        self.busy = busy
        self.submitLabel = submitLabel
        self.onSubmit = onSubmit
        _budget = State(initialValue: initial.budget > 0 ? initial.budget : nil)
        _store = State(initialValue: initial.store)
        _likes = State(initialValue: initial.likes)
        _dislikes = State(initialValue: initial.dislikes)
        _ask = State(initialValue: initial.ask)
    }

    private var ok: Bool { return (budget ?? 0) > 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            LXNumberField(label: "Weekly food budget", value: $budget, prefix: "$", placeholder: "60")

            VStack(alignment: .leading, spacing: 9) {
                Text("Where you shop").liType(.sub).foregroundColor(theme.ink2)
                LXFlow(spacing: 8) {
                    ForEach(MealsPricing.stores, id: \.self) { s in
                        LIChip(s, on: store == s) { store = s }
                    }
                }
                Text("Priced with estimates for this store.").liType(.caption).foregroundColor(theme.ink2)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(challengeName.map { "Each day, from \($0)" } ?? "Each day").liType(.label).foregroundColor(theme.ink2)
                Text(MealsCore.describeTargets(targets)).liType(.body).foregroundColor(theme.ink)
            }

            MealsTermChips(label: "Foods you like", terms: $likes, suggestions: MealsIdeas.likes, placeholder: "Add a food")
            MealsTermChips(label: "Foods to leave out", terms: $dislikes, suggestions: MealsIdeas.dislikes, placeholder: "Add a food")

            LXField(label: "Anything else, in your words", text: $ask, placeholder: "More chicken, no fish, cheaper breakfasts", hint: "Optional.", lines: 3)

            LXPrimaryButton(title: submitLabel, busy: busy, disabled: !ok) {
                if let b = budget, b > 0 {
                    onSubmit(MealsBuildValues(budget: b, store: store, likes: likes, dislikes: dislikes, ask: ask.trimmingCharacters(in: .whitespacesAndNewlines)))
                }
            }
        }
    }
}
