import SwiftUI
import UserNotifications
import LockInKit

/// Everything that can be changed, in one place. Changes apply from today forward.
struct SettingsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        SettingsRoot(store: store)
    }
}

private struct SettingsRoot: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @State private var model: SettingsModel
    @State private var toast: String? = nil
    @State private var name = ""
    @State private var nameLoaded = false
    @State private var signingOut = false

    init(store: AppStore) {
        _model = State(initialValue: SettingsModel(store: store))
    }

    private struct Entry: Identifiable {
        var id: String
        var title: String
        var sub: String
    }

    var body: some View {
        let active = Challenges.activeChallenge(store.challenges)
        let entries: [Entry] = [
            Entry(id: "checklist", title: "Checklist", sub: "\(store.items.filter { $0.active && !$0.archived }.count) items"),
            Entry(id: "plan", title: "Weekly plan", sub: "Blocks for each day"),
            Entry(id: "workouts", title: "Workouts", sub: "Main and core, by weekday"),
            Entry(id: "challenge", title: "Challenge", sub: active.map { "\($0.name), \($0.lengthDays) days" } ?? "None running"),
            Entry(id: "reminders", title: "Reminders", sub: "\(model.reminders.filter { $0.enabled }.count) on"),
            Entry(id: "coach", title: "Coach", sub: voiceName(model.settings?.coachVoice ?? store.settings?.coachVoice ?? .stoic)),
        ]
        return LIScreen {
            LIPageHeader("Settings")

            if let f = model.failure {
                LINotice(f, actionTitle: "Retry") { Task { await model.load() } }.padding(.bottom, 10)
            }

            SettingsList(entries) { e in
                NavigationLink {
                    destination(e.id)
                } label: {
                    LXRow(title: e.title, sub: e.sub)
                }
                .buttonStyle(LIPressStyle())
            }
            .padding(.top, 8)

            SettingsLabel("You")
            SettingsTile {
                LXField(label: "Name on Today", text: $name, placeholder: "Your name", hint: "Used in the greeting.", onCommit: { saveName() })
                    .onChange(of: model.settings?.displayName) { _, new in
                        if !nameLoaded { name = new ?? ""; nameLoaded = true }
                    }
                LXToggleRow(title: "Haptics", sub: "A tap when you check something off.", isOn: Binding(
                    get: { model.settings?.haptics ?? store.settings?.haptics ?? true },
                    set: { v in lxRun($toast) { try await model.setHaptics(v) } }
                ))
            }

            SettingsLabel("Look")
            SettingsTile {
                LISegmentedControl(options: ThemeBase.allCases.map { (value: $0, title: ThemeBuild.baseName($0)) }, selection: Binding(
                    get: { store.themeRow?.base ?? store.theme.base },
                    set: { v in lxRun($toast) { try await store.setBaseTheme(v) } }
                ))
                Text(ThemeBuild.baseBlurb(store.themeRow?.base ?? store.theme.base)).liType(.caption).foregroundColor(theme.ink2)
                if store.themeRow?.palette != nil {
                    Text("A board is on top of this. Change it in Boards.").liType(.caption).foregroundColor(theme.ink2)
                }
            }

            SettingsLabel("This device")
            LICard {
                VStack(alignment: .leading, spacing: 14) {
                    LIStat(label: "Server", value: session.serverText)
                    LIHairline()
                    LIStat(label: "Look", value: store.theme.base == .contrast ? "High contrast" : "Aubergine")
                    LIHairline()
                    LIStat(label: "Font", value: LIFont.isAvailable ? "Schibsted Grotesk" : "System")
                }
            }

            LISecondaryButton("Sign out") {
                Task { await session.logout() }
            }
            .padding(.top, 20)
        }
        .lxToast($toast)
        .task {
            await model.load()
            if !nameLoaded {
                name = model.settings?.displayName ?? ""
                nameLoaded = true
            }
        }
        .refreshable { await model.load() }
    }

    private func saveName() {
        let value = name
        lxRun($toast) { try await model.setDisplayName(value) }
    }

    @ViewBuilder
    private func destination(_ id: String) -> some View {
        switch id {
        case "checklist": SettingsChecklistPage(model: model)
        case "plan": SettingsSchedulePage(model: model)
        case "workouts": SettingsWorkoutsPage(model: model)
        case "challenge": SettingsChallengePage(model: model)
        case "reminders": SettingsRemindersPage(model: model)
        default: SettingsCoachPage(model: model)
        }
    }
}

func voiceName(_ v: CoachVoice) -> String {
    switch v {
    case .stoic: return "Stoic"
    case .sergeant: return "Sergeant"
    case .brother: return "Brother"
    }
}

// MARK: coach

struct SettingsCoachPage: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: SettingsModel
    @State private var toast: String? = nil

    private var settings: AppSettings? { return model.settings ?? store.settings }

    private func blurb(_ v: CoachVoice) -> String {
        switch v {
        case .stoic: return "Calm and plain. Says what happened and what is next."
        case .sergeant: return "Short, firm, no excuses."
        case .brother: return "Warm, direct, on your side."
        }
    }

    var body: some View {
        let voice = settings?.coachVoice ?? .stoic
        let checkins = settings?.coachCheckins ?? CoachCheckins()
        return SettingsPage("Coach", subtitle: "How it talks, and when it speaks up.") {
            SettingsTile {
                Text("Voice").liType(.label).foregroundColor(theme.ink2)
                LISegmentedControl(options: CoachVoice.allCases.map { (value: $0, title: voiceName($0)) }, selection: Binding(
                    get: { voice },
                    set: { v in lxRun($toast) { try await model.setVoice(v) } }
                ))
                Text(blurb(voice)).liType(.sub).foregroundColor(theme.ink2)
            }
            .padding(.top, 4)

            SettingsLabel("Check-ins")
            SettingsTile {
                LXToggleRow(title: "After a workout", sub: "A word once you log one.", isOn: Binding(
                    get: { checkins.postWorkout },
                    set: { v in var c = checkins; c.postWorkout = v; lxRun($toast) { try await model.setCheckins(c) } }
                ))
                LXToggleRow(title: "After a slip", sub: "When a vice day goes wrong.", isOn: Binding(
                    get: { checkins.slip },
                    set: { v in var c = checkins; c.slip = v; lxRun($toast) { try await model.setCheckins(c) } }
                ))
                LXToggleRow(title: "A missed item", sub: "When something on the list is still open late.", isOn: Binding(
                    get: { checkins.missedItem },
                    set: { v in var c = checkins; c.missedItem = v; lxRun($toast) { try await model.setCheckins(c) } }
                ))
            }
        }
        .lxToast($toast)
    }
}

// MARK: reminders

struct SettingsRemindersPage: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: SettingsModel
    @State private var toast: String? = nil
    @State private var quietStart = "22:00"
    @State private var quietEnd = "07:00"
    @State private var quietLoaded = false
    @State private var allowed: Bool? = nil

    private var settings: AppSettings? { return model.settings ?? store.settings }

    var body: some View {
        SettingsPage("Reminders", subtitle: "Quiet hours always win.") {
            if allowed == false {
                LINotice("Notifications are off for Lock In. Turn them on in the iOS Settings app.", actionTitle: "Open") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                .padding(.bottom, 12)
            }

            if model.reminders.isEmpty && !model.loading {
                LIEmptyState(title: "No reminders", message: "They appear here once the app has set up your day.")
            } else {
                VStack(spacing: 12) {
                    ForEach(model.reminders) { r in
                        ReminderCard(model: model, reminder: r, onToast: { toast = $0 })
                    }
                }
                .padding(.top, 4)
            }

            SettingsLabel("Drops")
            SettingsTile {
                LXToggleRow(title: "Quote drops", sub: "A line from the library, now and then.", isOn: Binding(
                    get: { settings?.dropsEnabled ?? false },
                    set: { v in lxRun($toast) { try await model.setDrops(enabled: v, perDay: nil) } }
                ))
                if settings?.dropsEnabled == true {
                    HStack {
                        Text("Per day").liType(.body).foregroundColor(theme.ink)
                        Spacer()
                        Stepper("", value: Binding(
                            get: { settings?.dropsPerDay ?? 3 },
                            set: { v in lxRun($toast) { try await model.setDrops(enabled: nil, perDay: v) } }
                        ), in: 1...6).labelsHidden()
                        Text("\(settings?.dropsPerDay ?? 3)").liType(.stat).foregroundColor(theme.ink).frame(minWidth: 24)
                    }
                }
            }

            SettingsLabel("Quiet hours")
            SettingsTile {
                HStack(spacing: 10) {
                    LXTimeField(label: "From", time: $quietStart)
                    LXTimeField(label: "Until", time: $quietEnd)
                }
                Text("Nothing sounds in this window.").liType(.caption).foregroundColor(theme.ink2)
            }
        }
        .lxToast($toast)
        .task {
            await model.load()
            if !quietLoaded, let s = model.settings {
                quietStart = s.quietStart
                quietEnd = s.quietEnd
                quietLoaded = true
            }
            let current = await UNUserNotificationCenter.current().notificationSettings()
            allowed = current.authorizationStatus == .denied ? false : true
        }
        .onChange(of: quietStart) { _, v in
            if quietLoaded, v != settings?.quietStart { lxRun($toast) { try await model.setQuiet(start: v, end: nil) } }
        }
        .onChange(of: quietEnd) { _, v in
            if quietLoaded, v != settings?.quietEnd { lxRun($toast) { try await model.setQuiet(start: nil, end: v) } }
        }
    }
}

private struct ReminderCard: View {
    @Environment(\.liTheme) private var theme
    let model: SettingsModel
    let reminder: Reminder
    let onToast: (String) -> Void

    @State private var time: String = "08:00"
    @State private var minutes: Double? = 0
    @State private var loaded = false

    private var timed: Bool { return reminder.time != nil }
    private var toastBinding: Binding<String?> {
        Binding<String?>(get: { nil }, set: { if let v = $0 { onToast(v) } })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            LXToggleRow(title: reminder.label, sub: reminder.body, isOn: Binding(
                get: { reminder.enabled },
                set: { v in lxRun(toastBinding) { try await model.updateReminder(reminder.id, ["enabled": .bool(v)]) } }
            ))
            if reminder.enabled {
                if timed {
                    LXTimeField(label: "At", time: $time)
                } else if reminder.blockName != nil {
                    LXNumberField(label: "Minutes before \(reminder.blockName ?? "it")", value: $minutes, unit: "min", decimal: false, onCommit: {
                        let m = max(0, Int((minutes ?? 0).rounded()))
                        if m != reminder.offsetMinutes {
                            lxRun(toastBinding) { try await model.updateReminder(reminder.id, ["offset_minutes": .int(m)]) }
                        }
                    })
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(theme.tile))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
        .onAppear {
            if !loaded {
                loaded = true
                time = reminder.time ?? "08:00"
                minutes = Double(reminder.offsetMinutes)
            }
        }
        .onChange(of: time) { _, v in
            if loaded, v != reminder.time {
                lxRun(toastBinding) { try await model.updateReminder(reminder.id, ["time": .string(v)]) }
            }
        }
    }
}
