import SwiftUI
import UIKit
import FamilyControls
import LockInKit

/// Screen Time: allow it, choose the apps, and say when they are shut. Also what happens when the app itself is left.
struct FocusLockCard: View {
    @Environment(\.liTheme) private var theme
    @AppStorage(SystemPrefs.Key.lockDuringFocus, store: AppGroup.defaults) private var lockFocus = true
    @AppStorage(SystemPrefs.Key.autoLockStudy, store: AppGroup.defaults) private var lockStudy = false
    @AppStorage(SystemPrefs.Key.fullScreen, store: AppGroup.defaults) private var fullScreen = false
    @State private var status: AuthorizationStatus = FocusLock.status
    @State private var selection = FocusShieldStore.load()
    @State private var pickerOpen = false
    @State private var asking = false
    @State private var strict: FocusStrictMode = SystemPrefs.strictMode
    @State private var grace: Int = SystemPrefs.strictGrace

    private let focus = FocusStore.shared

    private var chosenText: String {
        var parts: [String] = []
        let apps = selection.applicationTokens.count
        let cats = selection.categoryTokens.count
        let sites = selection.webDomainTokens.count
        if apps > 0 { parts.append(apps == 1 ? "1 app" : "\(apps) apps") }
        if cats > 0 { parts.append(cats == 1 ? "1 category" : "\(cats) categories") }
        if sites > 0 { parts.append(sites == 1 ? "1 site" : "\(sites) sites") }
        return parts.isEmpty ? "Nothing chosen yet" : parts.joined(separator: ", ")
    }

    private var strictCopy: String {
        switch strict {
        case .off: return "Time away comes off the session. You can claim it back."
        case .end: return "Gone past the grace period, the session ends where you left."
        case .void: return "Gone past the grace period, the session is thrown out."
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Focus lock")
            LICard(padding: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    authRow
                    if status == .approved {
                        LIHairline()
                        appsRow
                        LIHairline()
                        FocusToggleRow(title: "Lock during focus", sub: "Shut the chosen apps while a timer runs", isOn: $lockFocus)
                            .padding(.horizontal, 18)
                            .onChange(of: lockFocus) { _, _ in focus.lockSettingChanged() }
                        LIHairline()
                        FocusToggleRow(title: "Lock during study blocks", sub: "Starts on its own when a study block begins", isOn: $lockStudy)
                            .padding(.horizontal, 18)
                            .onChange(of: lockStudy) { _, _ in
                                Task { SystemCoordinator.shared.scheduleAutoLock(force: true) }
                            }
                        LIHairline()
                    }
                    leaveRow
                    LIHairline()
                    FocusToggleRow(title: "Start in focus mode", sub: "Just the clock. The screen stays on", isOn: $fullScreen)
                        .padding(.horizontal, 18)
                }
            }
        }
        .sheet(isPresented: $pickerOpen) {
            FocusAppsSheet {
                selection = FocusShieldStore.load()
                focus.lockSettingChanged()
                SystemCoordinator.shared.scheduleAutoLock(force: true)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            status = FocusLock.status
        }
    }

    @ViewBuilder
    private var authRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch status {
            case .approved:
                HStack(spacing: 12) {
                    Image(systemName: "lock.fill").font(.system(size: 16)).foregroundColor(theme.accent)
                    Text("Screen Time is on").liType(.body).foregroundColor(theme.ink)
                    Spacer()
                }
            case .denied:
                Text("Screen Time is off for Lock In").liType(.body).foregroundColor(theme.ink)
                Text("Turn it on in Settings to block apps while you focus.").liType(.sub).foregroundColor(theme.ink2)
                LISecondaryButton("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
            default:
                Text("Block the apps that pull you away").liType(.body).foregroundColor(theme.ink)
                Text("Lock In asks Screen Time to shut the apps you pick while a session runs. It lifts on its own when the session ends.")
                    .liType(.sub)
                    .foregroundColor(theme.ink2)
                LIPrimaryButton("Allow Screen Time", busy: asking) {
                    asking = true
                    Task {
                        _ = await FocusLock.requestAuthorization()
                        status = FocusLock.status
                        asking = false
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var appsRow: some View {
        Button(action: {
            LIHaptics.tap()
            pickerOpen = true
        }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Apps to block").liType(.body).foregroundColor(theme.ink)
                    Text(chosenText).liType(.caption).foregroundColor(theme.ink2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(theme.ink3)
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(LIPressStyle())
    }

    private var leaveRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("If you leave the app").liType(.body).foregroundColor(theme.ink)
            LISegmentedControl(
                options: [(value: FocusStrictMode.off, title: "Record"), (value: FocusStrictMode.end, title: "End it"), (value: FocusStrictMode.void, title: "Void it")],
                selection: $strict
            )
            .onChange(of: strict) { _, value in SystemPrefs.strictMode = value }
            Text(strictCopy).liType(.sub).foregroundColor(theme.ink2)
            if strict != .off {
                Text("Grace period").liType(.label).foregroundColor(theme.ink2)
                LISegmentedControl(
                    options: Focus.graceOptions.map { (value: $0, title: Focus.formatAway($0)) },
                    selection: $grace
                )
                .onChange(of: grace) { _, value in SystemPrefs.strictGrace = value }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Notifications and the Live Activity. Also embeddable in Settings.
struct SystemSettingsCard: View {
    @Environment(\.liTheme) private var theme
    @AppStorage(SystemPrefs.Key.reminders, store: AppGroup.defaults) private var reminders = true
    @AppStorage(SystemPrefs.Key.liveBlocks, store: AppGroup.defaults) private var liveBlocks = true
    private let system = SystemCoordinator.shared

    private var allowed: Bool { return NotificationScheduler.isAllowed(system.notificationStatus) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Reminders and Live Activity")
            LICard(padding: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    if system.notificationStatus == .notDetermined {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Reminders need your OK").liType(.body).foregroundColor(theme.ink)
                            Text("Wake, workout, delivery and the evening money nudge, set in the web app.").liType(.sub).foregroundColor(theme.ink2)
                            LIPrimaryButton("Allow notifications") {
                                Task { await system.requestNotifications() }
                            }
                        }
                        .padding(18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else if system.notificationStatus == .denied {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Notifications are off for Lock In").liType(.body).foregroundColor(theme.ink)
                            Text("Turn them on in Settings to get reminders.").liType(.sub).foregroundColor(theme.ink2)
                            LISecondaryButton("Open Settings") {
                                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                            }
                        }
                        .padding(18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        FocusToggleRow(title: "Reminders", sub: "Quiet hours are respected", isOn: $reminders)
                            .padding(.horizontal, 18)
                            .onChange(of: reminders) { _, _ in
                                Task { await system.reschedule() }
                            }
                    }
                    LIHairline()
                    FocusToggleRow(
                        title: "Live Activity for the current block",
                        sub: system.activitiesEnabled ? "On the lock screen and in the Dynamic Island" : "Turn on Live Activities for Lock In in Settings",
                        isOn: $liveBlocks
                    )
                    .padding(.horizontal, 18)
                    .onChange(of: liveBlocks) { _, _ in
                        Task { await system.syncBlockActivity() }
                    }
                }
            }
        }
    }
}
