import SwiftUI
import LockInKit

/// The challenge page opened from outside Settings (Money links here), with its own model.
struct SettingsChallengeScreen: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        Inner(store: store)
    }

    private struct Inner: View {
        @State private var model: SettingsModel

        init(store: AppStore) {
            _model = State(initialValue: SettingsModel(store: store))
        }

        var body: some View {
            SettingsChallengePage(model: model)
                .task { await model.load() }
        }
    }
}

/// The challenge: a stretch of days, held to the checklist, optionally with a money target.
struct SettingsChallengePage: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: SettingsModel

    @State private var toast: String? = nil
    @State private var starting = false
    @State private var editing = false
    @State private var confirm: Confirm? = nil

    private enum Confirm: Identifiable {
        case end, restart, finish
        var id: Int { return hashValue }
    }

    private var active: Challenge? { return Challenges.activeChallenge(store.challenges) }
    private var past: [Challenge] { return ChallengeRules.pastChallenges(store.challenges) }

    var body: some View {
        SettingsPage("Challenge", subtitle: "A stretch of days you hold yourself to.") {
            if let c = active {
                activeCard(c)
            } else {
                LIEmptyState(title: "No challenge running", message: "Start one when you want a clear finish line.", actionTitle: "Start a challenge") { starting = true }
            }

            if !past.isEmpty {
                SettingsLabel("Past")
                SettingsList(past) { c in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(c.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                            Text("\(ChallengeRules.statusLabel(c.status)), \(ChallengeRules.daysRun(c, store.today)) of \(c.lengthDays) days").liType(.caption).foregroundColor(theme.ink2)
                        }
                        Spacer(minLength: 8)
                        if active == nil {
                            LISecondaryButton("Again") {
                                lxRun($toast, ok: "Started again from today") { try await model.restartChallenge(id: c.id) }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .frame(minHeight: 64)
                }
            }
        }
        .lxToast($toast)
        .sheet(isPresented: $starting) {
            NewChallengeSheet(model: model, onClose: { starting = false }, onToast: { toast = $0 }).liSheetStyle()
        }
        .sheet(isPresented: $editing) {
            if let c = active {
                ChallengeEditSheet(model: model, challenge: c, onClose: { editing = false }, onToast: { toast = $0 }).liSheetStyle()
            }
        }
        .confirmationDialog(confirmTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            switch confirm {
            case .end:
                Button("End it", role: .destructive) { lxRun($toast, ok: "Challenge ended") { try await model.endChallenge() } }
            case .restart:
                Button("Restart from today", role: .destructive) { lxRun($toast, ok: "Restarted from today") { try await model.restartChallenge(id: nil) } }
            case .finish:
                Button("Finish it") { lxRun($toast, ok: "Challenge finished") { try await model.finishChallenge() } }
            case .none:
                EmptyView()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(confirmMessage)
        }
    }

    private var confirmTitle: String {
        switch confirm {
        case .end: return "End this challenge?"
        case .restart: return "Restart it?"
        case .finish: return "Finish this challenge?"
        case .none: return ""
        }
    }

    private var confirmMessage: String {
        switch confirm {
        case .end: return "It keeps the days it ran. You can start another."
        case .restart: return "This one closes today and a new one starts with the same rules."
        case .finish: return "Mark it done."
        case .none: return ""
        }
    }

    private func activeCard(_ c: Challenge) -> some View {
        let day = LIDate.dayNumber(c.startDate, store.today)
        let end = Challenges.plannedEnd(c)
        let items = ChallengeRules.challengeItems(c, store.items)
        return VStack(alignment: .leading, spacing: 14) {
            LICard(feature: true) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(day < 1 ? "Starts in \(1 - day) days" : "Day \(min(day, c.lengthDays)) of \(c.lengthDays)").liType(.label).foregroundColor(theme.ink2)
                    Text(c.name).liType(.title).foregroundColor(theme.ink)
                    Text("Ends " + LIDate.formatDateLong(end)).liType(.sub).foregroundColor(theme.ink2)
                    Text(c.rules == nil ? "Counts the whole checklist" : "Counts \(items.count) \(items.count == 1 ? "item" : "items"): " + items.map { $0.name }.joined(separator: ", ")).liType(.sub).foregroundColor(theme.ink2)
                    if let t = c.moneyTarget, t > 0 {
                        Text("Money target $" + MealsCore.jsNum(t) + (c.moneyDeadline.map { " by " + LIDate.formatDateLong($0) } ?? "")).liType(.sub).foregroundColor(theme.ink2)
                    }
                }
            }
            LXWideButton(title: "Edit details") { editing = true }
            if ChallengeRules.canFinish(c, store.today) {
                LXPrimaryButton(title: "Finish") { confirm = .finish }
            }
            HStack(spacing: 10) {
                LXWideButton(title: "Restart") { confirm = .restart }
                LXDangerButton(title: "End early") { confirm = .end }
            }
        }
    }
}

struct ChallengeEditSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: SettingsModel
    let challenge: Challenge
    let onClose: () -> Void
    let onToast: (String) -> Void

    @State private var name: String
    @State private var start: String
    @State private var length: Double?
    @State private var hasMoney: Bool
    @State private var money: Double?
    @State private var deadline: String
    @State private var floor: Double?
    @State private var busy = false

    init(model: SettingsModel, challenge: Challenge, onClose: @escaping () -> Void, onToast: @escaping (String) -> Void) {
        self.model = model
        self.challenge = challenge
        self.onClose = onClose
        self.onToast = onToast
        _name = State(initialValue: challenge.name)
        _start = State(initialValue: challenge.startDate)
        _length = State(initialValue: Double(challenge.lengthDays))
        _hasMoney = State(initialValue: challenge.moneyTarget != nil)
        _money = State(initialValue: challenge.moneyTarget)
        _deadline = State(initialValue: challenge.moneyDeadline ?? Challenges.plannedEnd(challenge))
        _floor = State(initialValue: challenge.dailyFloor)
    }

    private var days: Int { return Int((length ?? 0).rounded()) }

    private var problem: String? {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Give it a name." }
        if days < 1 || days > ChallengeRules.maxChallengeDays { return "Length is 1 to \(ChallengeRules.maxChallengeDays) days." }
        if hasMoney {
            guard let m = money, m > 0 else { return "The money target is above zero." }
            if !LIDate.isDateStr(deadline) || deadline < start { return "The deadline is on or after the start." }
        }
        return nil
    }

    var body: some View {
        LXSheet(title: "Challenge", subtitle: "Changes apply from today forward.") {
            VStack(alignment: .leading, spacing: 18) {
                LXField(label: "Name", text: $name, placeholder: "Lock in")
                LXDateField(label: "Start date", day: $start)
                LXNumberField(label: "Length", value: $length, unit: "days", decimal: false)
                if problem == nil {
                    Text("Ends " + LIDate.formatDateLong(LIDate.addDays(start, days - 1))).liType(.caption).foregroundColor(theme.ink2)
                }
                LXToggleRow(title: "Money target", sub: "A total to reach by a date", isOn: $hasMoney)
                if hasMoney {
                    LXNumberField(label: "Target", value: $money, prefix: "$", placeholder: "5000")
                    LXDateField(label: "Deadline", day: $deadline, min: start)
                }
                LXNumberField(label: "Daily earnings floor", value: $floor, prefix: "$", hint: "The least a day should bring in.")
            }
        } footer: {
            VStack(spacing: 8) {
                if let p = problem { Text(p).liType(.caption).foregroundColor(theme.ink2) }
                LXPrimaryButton(title: "Save", busy: busy, disabled: problem != nil) { save() }
            }
        }
    }

    private func save() {
        guard !busy, problem == nil else { return }
        busy = true
        var patch: JSONObject = [
            "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "start_date": .string(start),
            "length_days": .int(days),
            "money_target": hasMoney ? JSON.num(money) : .null,
            "money_deadline": hasMoney ? JSON.string(deadline) : .null,
        ]
        if !hasMoney { patch["money_target_start"] = .null }
        let reopen: DateStr? = start < (store.settings?.historyStart ?? start) ? start : nil
        let newFloor = floor
        let oldFloor = challenge.dailyFloor
        Task {
            do {
                try await model.updateChallenge(patch, historyStartTo: reopen)
                if let f = newFloor, f != oldFloor { try await model.setDailyFloor(f) }
                LIHaptics.celebrate()
                onToast("Challenge saved")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(SettingsModel.describe(error))
                busy = false
            }
        }
    }
}

struct NewChallengeSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: SettingsModel
    let onClose: () -> Void
    let onToast: (String) -> Void

    @State private var name = ChallengeRules.defaultChallengeName
    @State private var start: String = ""
    @State private var length: Double? = 30
    @State private var whole = true
    @State private var picked: Set<String> = []
    @State private var hasMoney = false
    @State private var money: Double?
    @State private var deadline: String = ""
    @State private var floor: Double?
    @State private var busy = false

    private var rows: [ChecklistItem] {
        return store.items.filter { $0.active && !$0.archived }.sorted { $0.sortOrder < $1.sortOrder }
    }

    private var days: Int { return Int((length ?? 0).rounded()) }

    private func input() -> ChallengeInput {
        let rules: [ChallengeRule]? = whole ? nil : rows.filter { picked.contains($0.id) }.map { ChallengeRule(itemId: $0.id, target: $0.target) }
        return ChallengeInput(name: name, startDate: start, lengthDays: days, rules: rules, moneyTarget: hasMoney ? money : nil, moneyDeadline: hasMoney ? deadline : nil, dailyFloor: floor ?? (store.settings?.dailyFloor ?? 0))
    }

    var body: some View {
        let problem = ChallengeRules.problem(input(), today: store.today)
        return LXSheet(title: "New challenge", subtitle: "Pick the days and what counts.") {
            VStack(alignment: .leading, spacing: 18) {
                LXField(label: "Name", text: $name, placeholder: "Lock in")
                LXDateField(label: "Start date", day: $start, min: store.today)
                LXNumberField(label: "Length", value: $length, unit: "days", decimal: false)
                VStack(alignment: .leading, spacing: 8) {
                    Text("What counts").liType(.sub).foregroundColor(theme.ink2)
                    LISegmentedControl(options: [(value: true, title: "Whole checklist"), (value: false, title: "Pick items")], selection: $whole)
                }
                if !whole {
                    VStack(spacing: 0) {
                        ForEach(rows) { item in
                            let on = picked.contains(item.id)
                            Button {
                                if on { picked.remove(item.id) } else { picked.insert(item.id) }
                                LIHaptics.tap()
                            } label: {
                                HStack {
                                    Text(item.name).liType(.body).foregroundColor(theme.ink)
                                    Spacer()
                                    Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundColor(on ? theme.accent : theme.ink3)
                                }
                                .frame(minHeight: 48)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                LXToggleRow(title: "Money target", sub: "A total to reach by a date", isOn: $hasMoney)
                if hasMoney {
                    LXNumberField(label: "Target", value: $money, prefix: "$", placeholder: "5000")
                    LXDateField(label: "Deadline", day: $deadline, min: start)
                }
                LXNumberField(label: "Daily earnings floor", value: $floor, prefix: "$", placeholder: MealsCore.jsNum(store.settings?.dailyFloor ?? 0))
            }
        } footer: {
            VStack(spacing: 8) {
                if let p = problem { Text(p).liType(.caption).foregroundColor(theme.ink2) }
                LXPrimaryButton(title: "Start", busy: busy, disabled: problem != nil) { save() }
            }
        }
        .onAppear {
            if start.isEmpty {
                start = store.today
                deadline = LIDate.addDays(store.today, 29)
            }
        }
        .onChange(of: length) { _, _ in
            if hasMoney, days >= 1 { deadline = LIDate.addDays(start, days - 1) }
        }
    }

    private func save() {
        guard !busy else { return }
        busy = true
        let value = input()
        Task {
            do {
                try await model.startChallenge(value)
                LIHaptics.celebrate()
                onToast("Challenge started")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(SettingsModel.describe(error))
                busy = false
            }
        }
    }
}
