import SwiftUI
import LockInKit

/// The week's shape: blocks for each weekday.
struct SettingsSchedulePage: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: SettingsModel

    @State private var day: Int = 1
    @State private var ready = false
    @State private var toast: String? = nil
    @State private var editing: ScheduleTemplate? = nil
    @State private var adding = false

    private var blocks: [ScheduleTemplate] {
        return model.templates.sorted { $0.start < $1.start }
    }

    var body: some View {
        SettingsPage("Weekly plan", subtitle: "Changes apply from today forward.") {
            LISegmentedControl(options: SettingsDays.order.map { (value: $0, title: SettingsDays.short[$0]) }, selection: $day)
                .padding(.top, 4)
            HStack {
                Text(SettingsDays.long[day]).liType(.h2).foregroundColor(theme.ink)
                Spacer()
                LISecondaryButton("Add a block") { adding = true }
            }
            .padding(.top, 20)
            .padding(.bottom, 12)

            if blocks.isEmpty {
                LIEmptyState(title: "An open day", message: "Nothing is planned for \(SettingsDays.long[day]).", actionTitle: "Add a block") { adding = true }
            } else {
                SettingsList(blocks) { t in
                    Button { editing = t } label: {
                        LXRow(title: t.blockName, sub: LIDate.formatTime(t.start) + " to " + LIDate.formatTime(t.end) + (t.flexible ? ", flexible" : ""), value: t.kind.settingsLabel)
                    }
                    .buttonStyle(LIPressStyle())
                }
            }
        }
        .lxToast($toast)
        .task {
            if !ready {
                ready = true
                day = LIDate.weekdayOf(store.today)
            }
            await model.loadTemplates(weekday: day)
        }
        .onChange(of: day) { _, d in Task { await model.loadTemplates(weekday: d) } }
        .sheet(isPresented: $adding) {
            BlockSheet(model: model, weekday: day, block: nil, onClose: { adding = false }, onToast: { toast = $0 }).liSheetStyle()
        }
        .sheet(item: $editing) { t in
            BlockSheet(model: model, weekday: day, block: t, onClose: { editing = nil }, onToast: { toast = $0 }).liSheetStyle()
        }
    }
}

struct BlockSheet: View {
    @Environment(\.liTheme) private var theme
    let model: SettingsModel
    let weekday: Int
    let block: ScheduleTemplate?
    let onClose: () -> Void
    let onToast: (String) -> Void

    @State private var name: String
    @State private var start: String
    @State private var end: String
    @State private var kind: BlockKind
    @State private var flexible: Bool
    @State private var note: String
    @State private var busy = false
    @State private var confirm = false

    init(model: SettingsModel, weekday: Int, block: ScheduleTemplate?, onClose: @escaping () -> Void, onToast: @escaping (String) -> Void) {
        self.model = model
        self.weekday = weekday
        self.block = block
        self.onClose = onClose
        self.onToast = onToast
        _name = State(initialValue: block?.blockName ?? "")
        _start = State(initialValue: block?.start ?? "09:00")
        _end = State(initialValue: block?.end ?? "10:00")
        _kind = State(initialValue: block?.kind ?? .other)
        _flexible = State(initialValue: block?.flexible ?? false)
        _note = State(initialValue: block?.note ?? "")
    }

    private var problem: String? {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Give it a name." }
        if !(start < end) { return "It ends after it starts." }
        return nil
    }

    var body: some View {
        LXSheet(title: block == nil ? "New block" : "Block", subtitle: SettingsDays.long[weekday]) {
            VStack(alignment: .leading, spacing: 18) {
                LXField(label: "Name", text: $name, placeholder: "Class")
                HStack(spacing: 10) {
                    LXTimeField(label: "Starts", time: $start)
                    LXTimeField(label: "Ends", time: $end)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Kind").liType(.sub).foregroundColor(theme.ink2)
                    SettingsChips(options: BlockKind.allCases.map { (value: $0, title: $0.settingsLabel) }, selection: $kind)
                }
                LXToggleRow(title: "Flexible", sub: "It can move if the day does.", isOn: $flexible)
                LXField(label: "Note", text: $note, placeholder: "Optional", lines: 3)
                if let b = block {
                    LXDangerButton(title: confirm ? "Tap again to delete" : "Delete block") {
                        if !confirm {
                            confirm = true
                            return
                        }
                        delete(b)
                    }
                }
            }
        } footer: {
            LXPrimaryButton(title: block == nil ? "Add" : "Save", busy: busy, disabled: problem != nil) { save() }
        }
    }

    private func save() {
        guard !busy else { return }
        busy = true
        Task {
            do {
                try await model.saveBlock(id: block?.id, weekday: weekday, name: name, start: start, end: end, kind: kind, flexible: flexible, note: note)
                LIHaptics.celebrate()
                onClose()
            } catch {
                LIHaptics.error()
                onToast(SettingsModel.describe(error))
                busy = false
            }
        }
    }

    private func delete(_ b: ScheduleTemplate) {
        guard !busy else { return }
        busy = true
        Task {
            do {
                try await model.deleteBlock(b.id, weekday: weekday)
                onClose()
            } catch {
                LIHaptics.error()
                onToast(SettingsModel.describe(error))
                busy = false
            }
        }
    }
}

// MARK: workouts

struct SettingsWorkoutsPage: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: SettingsModel

    @State private var day: Int = 1
    @State private var ready = false
    @State private var toast: String? = nil
    @State private var editing: Workout? = nil

    private func workout(_ slot: WorkoutSlot) -> Workout? {
        return store.workouts.first { $0.weekday == day && $0.slot == slot }
    }

    var body: some View {
        SettingsPage("Workouts", subtitle: "What each day asks of your body.") {
            LISegmentedControl(options: SettingsDays.order.map { (value: $0, title: SettingsDays.short[$0]) }, selection: $day)
                .padding(.top, 4)
            Text(SettingsDays.long[day]).liType(.h2).foregroundColor(theme.ink).padding(.top, 20).padding(.bottom, 12)
            VStack(spacing: 12) {
                ForEach([WorkoutSlot.main, WorkoutSlot.core], id: \.self) { slot in
                    slotCard(slot)
                }
            }
        }
        .lxToast($toast)
        .task {
            if !ready {
                ready = true
                day = LIDate.weekdayOf(store.today)
            }
        }
        .sheet(item: $editing) { w in
            WorkoutSheet(model: model, workout: w, onClose: { editing = nil }, onToast: { toast = $0 }).liSheetStyle()
        }
    }

    @ViewBuilder
    private func slotCard(_ slot: WorkoutSlot) -> some View {
        let w = workout(slot)
        let title = slot == .main ? "Main" : "Core"
        if let w = w {
            Button { editing = w } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title).liType(.label).foregroundColor(theme.ink2)
                    Text(w.name).liType(.h2).foregroundColor(theme.ink)
                    Text(w.exercises.isEmpty ? (w.detail ?? "No exercises yet.") : "\(w.exercises.count) exercises").liType(.sub).foregroundColor(theme.ink2)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(theme.tile))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
            }
            .buttonStyle(LIPressStyle())
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text(title).liType(.label).foregroundColor(theme.ink2)
                Text("Nothing planned").liType(.body).foregroundColor(theme.ink2)
                LISecondaryButton("Add \(title.lowercased())") {
                    lxRun($toast) { try await model.addWorkout(weekday: day, slot: slot) }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(theme.tileLine, style: StrokeStyle(lineWidth: 1, dash: [4, 4])))
        }
    }
}

private struct ExerciseDraft: Identifiable, Equatable {
    var id = UUID()
    var name: String
    var sets: Double?
    var reps: String
}

struct WorkoutSheet: View {
    @Environment(\.liTheme) private var theme
    let model: SettingsModel
    let workout: Workout
    let onClose: () -> Void
    let onToast: (String) -> Void

    @State private var name: String
    @State private var kind: WorkoutKind
    @State private var detail: String
    @State private var exercises: [ExerciseDraft]
    @State private var busy = false

    init(model: SettingsModel, workout: Workout, onClose: @escaping () -> Void, onToast: @escaping (String) -> Void) {
        self.model = model
        self.workout = workout
        self.onClose = onClose
        self.onToast = onToast
        _name = State(initialValue: workout.name)
        _kind = State(initialValue: workout.kind)
        _detail = State(initialValue: workout.detail ?? "")
        _exercises = State(initialValue: workout.exercises.map { ExerciseDraft(name: $0.name, sets: $0.sets > 0 ? Double($0.sets) : nil, reps: $0.reps) })
    }

    var body: some View {
        LXSheet(title: workout.slot == .main ? "Main workout" : "Core", subtitle: SettingsDays.long[workout.weekday]) {
            VStack(alignment: .leading, spacing: 18) {
                LXField(label: "Name", text: $name, placeholder: "Push")
                VStack(alignment: .leading, spacing: 8) {
                    Text("Kind").liType(.sub).foregroundColor(theme.ink2)
                    LISegmentedControl(options: [(value: WorkoutKind.lift, title: "Lift"), (value: WorkoutKind.cardio, title: "Cardio"), (value: WorkoutKind.sport, title: "Sport"), (value: WorkoutKind.rest, title: "Rest")], selection: $kind)
                }
                LXField(label: "Note", text: $detail, placeholder: "Optional", lines: 3)
                VStack(alignment: .leading, spacing: 10) {
                    Text("Exercises").liType(.sub).foregroundColor(theme.ink2)
                    ForEach($exercises) { $e in
                        VStack(spacing: 8) {
                            LXField(label: nil, text: $e.name, placeholder: "Bench press")
                            HStack(spacing: 8) {
                                LXNumberField(label: nil, value: $e.sets, unit: "sets", placeholder: "3", decimal: false)
                                LXField(label: nil, text: $e.reps, placeholder: "8 to 10 reps", capitalization: .never)
                                LXIconButton(systemName: "minus", label: "Remove exercise") {
                                    exercises.removeAll { $0.id == e.id }
                                }
                            }
                        }
                        .padding(.bottom, 6)
                    }
                    LXWideButton(title: "Add an exercise") { exercises.append(ExerciseDraft(name: "", sets: 3, reps: "")) }
                }
            }
        } footer: {
            LXPrimaryButton(title: "Save", busy: busy, disabled: name.trimmingCharacters(in: .whitespaces).isEmpty) { save() }
        }
    }

    private func save() {
        guard !busy else { return }
        busy = true
        let list: [Exercise] = exercises
            .filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { Exercise(name: $0.name.trimmingCharacters(in: .whitespaces), sets: max(0, Int(($0.sets ?? 0).rounded())), reps: $0.reps.trimmingCharacters(in: .whitespaces)) }
        let d = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        let patch: JSONObject = [
            "name": .string(name.trimmingCharacters(in: .whitespaces)),
            "kind": .string(kind.rawValue),
            "detail": d.isEmpty ? JSON.null : JSON.string(d),
            "exercises": JSON.from(list),
        ]
        let id = workout.id
        Task {
            do {
                try await model.updateWorkout(id, patch)
                LIHaptics.celebrate()
                onClose()
            } catch {
                LIHaptics.error()
                onToast(SettingsModel.describe(error))
                busy = false
            }
        }
    }
}
