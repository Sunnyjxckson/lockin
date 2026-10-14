import SwiftUI
import LockInKit

/// Today's workout with per set weight and reps logging, the last session beside each exercise, and the core routine.
struct WorkoutLogScreen: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase

    @State private var model: WorkoutLogModel

    init(store: AppStore) {
        _model = State(initialValue: WorkoutLogModel(store: store))
    }

    var body: some View {
        let main = model.main
        let loggable = Workouts.isLoggable(main)
        return LIScreen {
            header(main: main, loggable: loggable)
            if let error = model.errorText {
                LINotice(error, actionTitle: "Dismiss") { model.errorText = nil }
                    .padding(.bottom, 8)
            }
            if let main = main, loggable {
                progressBlock
                    .padding(.top, 12)
                ForEach(0..<main.exercises.count, id: \.self) { i in
                    WorkoutExerciseCard(model: model, exercise: main.exercises[i])
                        .padding(.top, 30)
                }
            } else if model.loaded || store.hasData {
                emptyState(main: main)
                    .padding(.top, 16)
            }
            if let core = model.core {
                BodyCoreCard(workout: core)
                    .padding(.top, 34)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(theme.colorScheme, for: .navigationBar)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                }
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
    }

    private func header(main: Workout?, loggable: Bool) -> some View {
        var subtitle: String? = nil
        if let main = main, loggable {
            subtitle = main.name
            if let detail = main.detail, !detail.isEmpty { subtitle = "\(main.name), \(detail.lowercased())" }
        }
        return LIPageHeader("Log workout", eyebrow: LIDate.formatDateLong(store.today), subtitle: subtitle)
    }

    private var progressBlock: some View {
        let p = model.progress
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(p.logged)")
                    .liType(.display)
                    .foregroundColor(p.complete ? theme.accent : theme.ink)
                Text("of \(p.total) sets").liType(.body).foregroundColor(theme.ink2)
            }
            LIProgressBar(value: p.total > 0 ? Double(p.logged) / Double(p.total) : 0, height: 4)
            Text(p.complete ? "All logged. Tick Workout on Today yourself." : "Last time's numbers are filled in. Tap the circle to log a set.")
                .liType(.sub)
                .foregroundColor(theme.ink2)
        }
    }

    private func emptyState(main: Workout?) -> some View {
        var parts: [String] = []
        if let main = main {
            parts.append("Today is \(main.name.lowercased()), nothing to log set by set.")
        } else {
            parts.append("Nothing is planned for today.")
        }
        if let next = model.nextLift {
            parts.append("Next lift: \(next.workout.name) on \(BodyRules.dayName(LIDate.weekdayOf(next.date))).")
        }
        return LICard {
            LIEmptyState(title: "No lift today", message: parts.joined(separator: " "))
        }
    }
}

/// One exercise: its sets as rows of weight, reps, last time and a circle to log.
struct WorkoutExerciseCard: View {
    @Environment(\.liTheme) private var theme

    let model: WorkoutLogModel
    let exercise: Exercise

    var body: some View {
        let logged = model.loggedCount(for: exercise)
        let complete = exercise.sets > 0 && logged >= exercise.sets
        let last = model.last(for: exercise)
        let numbers: [Int] = exercise.sets > 0 ? Array(1...exercise.sets) : []
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(exercise.name).liType(.h2).foregroundColor(theme.ink).lineLimit(2)
                    Text(subtitle(last: last)).liType(.sub).foregroundColor(theme.ink2)
                }
                Spacer(minLength: 8)
                Text("\(logged) of \(exercise.sets)")
                    .liType(.label)
                    .foregroundColor(complete ? theme.accent : theme.ink2)
                    .padding(.bottom, 2)
            }
            .padding(.horizontal, 4)
            VStack(spacing: 8) {
                ForEach(numbers, id: \.self) { n in
                    setRow(n)
                }
            }
        }
    }

    private func subtitle(last: [SetLog]) -> String {
        var line = "\(exercise.sets) x \(exercise.reps)"
        if let first = last.first {
            line += ", last \(LIDate.formatDateShort(first.date))"
        } else {
            line += ", first time"
        }
        return line
    }

    private func setRow(_ n: Int) -> some View {
        let row = model.row(for: exercise, n)
        let current = model.current(exercise, n)
        let done = row != nil
        let lastText = model.lastText(for: exercise, n)
        return HStack(spacing: 8) {
            Text("\(n)")
                .liType(.sub)
                .foregroundColor(theme.ink2)
                .frame(width: 16, alignment: .leading)
            WorkoutSetField(unit: model.weightUnit, decimal: true, done: done, value: current.weight) { v in
                model.setWeight(exercise, n, v)
            }
            WorkoutSetField(unit: "reps", decimal: false, done: done, value: current.reps.map { Double($0) }) { v in
                model.setReps(exercise, n, v.map { Int($0.rounded()) })
            }
            Text(lastText.isEmpty ? "new" : lastText)
                .liType(.caption)
                .foregroundColor(theme.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 60, alignment: .trailing)
            Button(action: { model.toggle(exercise, n) }) {
                LICheckmark(checked: done, size: 30)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("\(exercise.name) set \(n) done")
            .accessibilityAddTraits(done ? .isSelected : [])
        }
    }
}

/// A number box for one set. Keeps what you type while the logged value follows.
struct WorkoutSetField: View {
    @Environment(\.liTheme) private var theme

    let unit: String
    let decimal: Bool
    let done: Bool
    let value: Double?
    let onChange: (Double?) -> Void

    @State private var text: String = ""
    @FocusState private var focused: Bool

    private func parse(_ s: String) -> Double? {
        if s.isEmpty { return nil }
        guard let v = Double(s) else { return nil }
        return decimal ? (v * 100).rounded() / 100 : v.rounded()
    }

    private func clean(_ s: String) -> String {
        var out = ""
        var seenDot = false
        for ch in s {
            if ch.isASCII && ch.isNumber {
                out.append(ch)
            } else if decimal && (ch == "." || ch == ",") && !seenDot {
                seenDot = true
                out.append(".")
            }
        }
        return String(out.prefix(6))
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            TextField("", text: $text, prompt: Text("0").foregroundColor(theme.ink3))
                .keyboardType(decimal ? .decimalPad : .numberPad)
                .focused($focused)
                .liType(.value)
                .foregroundColor(done ? theme.accent : theme.ink)
                .tint(theme.accent)
            Text(unit).liType(.caption).foregroundColor(theme.ink2)
        }
        .padding(.horizontal, 12)
        .frame(height: 48)
        .background(LITileSurface(radius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(focused ? theme.ink2 : (done ? theme.accent.opacity(0.45) : Color.clear), lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { text = MBNumberField.show(value) }
        .onChange(of: text) { _, new in
            let cleaned = clean(new)
            if cleaned != new {
                text = cleaned
                return
            }
            if focused { onChange(parse(cleaned)) }
        }
        .onChange(of: value) { _, new in
            if !focused { text = MBNumberField.show(new) }
        }
        .onChange(of: focused) { _, isFocused in
            if !isFocused { text = MBNumberField.show(value) }
        }
    }
}

/// The core routine for the day. Listed, not logged set by set.
struct BodyCoreCard: View {
    @Environment(\.liTheme) private var theme
    let workout: Workout

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Core")
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(workout.name).liType(.h2).foregroundColor(theme.ink).lineLimit(2)
                    if let detail = workout.detail, !detail.isEmpty {
                        Text(detail).liType(.sub).foregroundColor(theme.ink2)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 14)
                if workout.exercises.isEmpty {
                    LIHairline()
                    Text("No exercises listed.")
                        .liType(.sub)
                        .foregroundColor(theme.ink2)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                } else {
                    ForEach(0..<workout.exercises.count, id: \.self) { i in
                        LIHairline()
                        HStack(spacing: 12) {
                            Text("\(i + 1)").liType(.caption).foregroundColor(theme.ink2).frame(width: 16, alignment: .leading)
                            Text(workout.exercises[i].name).liType(.body).foregroundColor(theme.ink)
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
}
