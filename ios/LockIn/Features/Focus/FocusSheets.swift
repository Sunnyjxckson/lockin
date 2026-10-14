import SwiftUI
import FamilyControls
import LockInKit

/// What the session sheet is for: a new entry by hand, or an existing session.
struct SessionTarget: Identifiable {
    let session: FocusSession?
    var id: String { return session?.id ?? "new" }
}

/// Log a session by hand, or edit or delete one that is already logged.
struct SessionSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let session: FocusSession?
    let today: DateStr
    let onDone: (String) -> Void

    @State private var minutes: Int
    @State private var label: String
    @State private var date: DateStr
    @State private var start: Date
    @State private var busy = false
    @State private var confirmDelete = false
    private let focus = FocusStore.shared

    init(session: FocusSession?, today: DateStr, onDone: @escaping (String) -> Void) {
        self.session = session
        self.today = today
        self.onDone = onDone
        _minutes = State(initialValue: session?.minutes ?? 60)
        _label = State(initialValue: session?.label ?? "Study")
        _date = State(initialValue: session?.date ?? today)
        _start = State(initialValue: SessionSheet.date(from: session?.start ?? LIDate.addMinutes(LIDate.timeNY(), -60)))
    }

    private static func date(from time: TimeStr) -> Date {
        let m = LIDate.minutesOf(time)
        return Calendar.current.date(bySettingHour: m / 60, minute: m % 60, second: 0, of: Date()) ?? Date()
    }

    private var startText: TimeStr {
        let c = Calendar.current.dateComponents([.hour, .minute], from: start)
        return LIDate.timeFromMinutes((c.hour ?? 0) * 60 + (c.minute ?? 0))
    }

    private var problem: String? {
        return Focus.manualProblem(date: date, minutes: minutes, today: today)
    }

    private var dateOptions: [DateStr] {
        var out = (0..<14).map { LIDate.addDays(today, -$0) }
        if !out.contains(date) { out.append(date) }
        return out.sorted(by: >)
    }

    private func dateTitle(_ d: DateStr) -> String {
        if d == today { return "Today" }
        if d == LIDate.addDays(today, -1) { return "Yesterday" }
        return LIDate.formatDateLong(d)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(session == nil ? "Log focus time" : "Edit session").liType(.h1).foregroundColor(theme.ink)

                FocusStepper(value: $minutes, range: 1...Focus.maxManualMinutes, step: 5)
                if let problem = problem, minutes > Focus.maxManualMinutes {
                    Text(problem).liType(.sub).foregroundColor(theme.warn)
                }
                FocusFlow(spacing: 8) {
                    ForEach([30, 45, 60, 90, 120], id: \.self) { m in
                        LIChip(LIDate.formatDuration(m), on: minutes == m) { minutes = m }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Label").liType(.label).foregroundColor(theme.ink2)
                    FocusFlow(spacing: 8) {
                        ForEach(Focus.labels, id: \.self) { l in
                            LIChip(l, on: label == l) { label = l }
                        }
                    }
                    FocusField(placeholder: "Study", text: $label)
                }

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Date").liType(.label).foregroundColor(theme.ink2)
                        Picker("Date", selection: $date) {
                            ForEach(dateOptions, id: \.self) { d in
                                Text(dateTitle(d)).tag(d)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(theme.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 48)
                        .background(LITileSurface(radius: 16))
                    }
                    if session == nil {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Started at").liType(.label).foregroundColor(theme.ink2)
                            DatePicker("Started at", selection: $start, displayedComponents: .hourAndMinute)
                                .labelsHidden()
                                .tint(theme.accent)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 12)
                                .frame(minHeight: 48)
                                .background(LITileSurface(radius: 16))
                        }
                    }
                }

                LIPrimaryButton(session == nil ? "Log it" : "Save", busy: busy) { save() }
                    .opacity(problem == nil ? 1 : 0.4)
                    .disabled(problem != nil)

                if let session = session {
                    if confirmDelete {
                        HStack(spacing: 10) {
                            FocusSecondaryButton(title: "Delete for good") { remove(session) }
                            FocusSecondaryButton(title: "Keep") { confirmDelete = false }
                        }
                    } else {
                        Button(action: {
                            LIHaptics.tap()
                            confirmDelete = true
                        }) {
                            Text("Delete session")
                                .liType(.body)
                                .foregroundColor(theme.danger)
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(LIPressStyle())
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 24)
        }
    }

    private func save() {
        guard problem == nil else { return }
        busy = true
        Task {
            let ok: Bool
            if let session = session {
                ok = await focus.edit(session, date: date, minutes: minutes, label: label)
            } else {
                ok = await focus.logManual(date: date, minutes: minutes, label: label, start: startText)
            }
            busy = false
            if ok {
                onDone(session == nil ? "Focus time logged" : "Session updated")
                dismiss()
            }
        }
    }

    private func remove(_ session: FocusSession) {
        busy = true
        Task {
            let ok = await focus.delete(session)
            busy = false
            if ok {
                onDone("Session deleted")
                dismiss()
            }
        }
    }
}

/// The daily focus goal. Reaching it ticks Study.
struct FocusGoalSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    @Environment(AppStore.self) private var store
    @State private var minutes: Int
    @State private var busy = false
    @State private var failed = false

    init(current: Int) {
        _minutes = State(initialValue: current)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Daily focus goal").liType(.h1).foregroundColor(theme.ink)
            Text("Reaching it ticks Study.").liType(.sub).foregroundColor(theme.ink2)
            FocusStepper(value: $minutes, range: 0...720, step: 15)
                .padding(.top, 6)
            if failed {
                Text("Could not save. Try again.").liType(.sub).foregroundColor(theme.warn)
            }
            LIPrimaryButton("Save", busy: busy) {
                busy = true
                Task {
                    let ok = await store.setFocusGoal(minutes)
                    busy = false
                    if ok { dismiss() } else { failed = true }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
    }
}

/// Choose the apps, categories and sites to block while a session runs.
struct FocusAppsSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var selection: FamilyActivitySelection
    let onSaved: () -> Void

    init(onSaved: @escaping () -> Void) {
        _selection = State(initialValue: FocusShieldStore.load())
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle("Apps to block")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") {
                            FocusShieldStore.save(selection)
                            onSaved()
                            dismiss()
                        }
                    }
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Cancel") { dismiss() }
                    }
                }
        }
    }
}
