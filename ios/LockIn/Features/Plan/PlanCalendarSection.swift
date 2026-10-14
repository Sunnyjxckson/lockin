import SwiftUI
import LockInKit

/// Google Calendar on the Plan screen. The sign in itself stays on the server and the web app: this reads the status,
/// picks which calendar class times come from, and syncs.
@Observable
@MainActor
final class PlanCalendarModel {
    private(set) var status: PlanCalendarStatus? = nil
    private(set) var choices: [PlanCalendarChoice] = []
    private(set) var loading = true
    private(set) var syncing = false
    private(set) var busy = false
    private(set) var error: String? = nil
    private(set) var last: PlanSyncOutcome? = nil
    @ObservationIgnored private var store: AppStore? = nil
    @ObservationIgnored private var lastAuto: Date = .distantPast

    func bind(_ store: AppStore) { self.store = store }

    var connected: Bool { return status?.connected == true }

    func refresh() async {
        guard let store = store else { return }
        do {
            status = try await store.planCalendarStatus()
            if status?.connected == true {
                choices = (try? await store.planCalendarChoices()) ?? []
            }
        } catch {
            status = nil
        }
        loading = false
    }

    /// Returns true when blocks may have changed.
    @discardableResult
    func sync() async -> Bool {
        guard let store = store, connected, !syncing else { return false }
        syncing = true
        error = nil
        defer { syncing = false }
        do {
            let out = try await store.planCalendarSync()
            last = out
            lastAuto = Date()
            if let at = out.lastSyncAt, var s = status {
                s.lastSyncAt = at
                status = s
            }
            if let first = out.errors.first { error = first }
            return true
        } catch {
            self.error = PlanErrorText.text(error)
            return false
        }
    }

    /// Sync on open, and when the app comes back after a few minutes.
    func syncIfStale() async -> Bool {
        if Date().timeIntervalSince(lastAuto) < 5 * 60 { return false }
        return await sync()
    }

    func choose(_ id: String?) async -> Bool {
        guard let store = store else { return false }
        busy = true
        defer { busy = false }
        do {
            try await store.planCalendarChoose(id)
            await refresh()
            return await sync()
        } catch {
            self.error = PlanErrorText.text(error)
            return false
        }
    }

    func disconnect() async {
        guard let store = store else { return }
        busy = true
        defer { busy = false }
        do {
            try await store.planCalendarDisconnect()
            last = nil
            await refresh()
        } catch {
            self.error = "Could not disconnect"
        }
    }
}

struct PlanCalendarSection: View {
    @Environment(\.liTheme) private var theme
    let model: PlanCalendarModel
    let onSynced: () -> Void

    var body: some View {
        Group {
            if model.loading {
                LICard { Text("Checking").liType(.sub).foregroundColor(theme.ink2) }
            } else if let status = model.status {
                if !status.configured {
                    notConfigured(status)
                } else if !status.connected {
                    notConnected(status)
                } else {
                    connected(status)
                }
            } else {
                LICard {
                    VStack(alignment: .leading, spacing: 14) {
                        head(on: false, label: "Could not check")
                        LISecondaryButton("Try again") { Task { await model.refresh() } }
                    }
                }
            }
        }
    }

    private func head(on: Bool, label: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: on ? "calendar.badge.checkmark" : "calendar.badge.exclamationmark")
                .font(.system(size: 18))
                .foregroundColor(on ? theme.accentInk : theme.ink2)
                .frame(width: 44, height: 44)
                .background(Circle().fill(on ? AnyShapeStyle(theme.gradient) : AnyShapeStyle(theme.tile)))
            VStack(alignment: .leading, spacing: 2) {
                Text("Google Calendar").liType(.body).foregroundColor(theme.ink)
                Text(label).liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }

    private func notConfigured(_ status: PlanCalendarStatus) -> some View {
        LICard {
            VStack(alignment: .leading, spacing: 12) {
                head(on: false, label: "Needs server keys")
                ForEach(status.missing, id: \.self) { name in
                    Text(name).font(.system(size: 12, design: .monospaced)).foregroundColor(theme.ink)
                }
            }
        }
    }

    private func notConnected(_ status: PlanCalendarStatus) -> some View {
        LICard {
            VStack(alignment: .leading, spacing: 12) {
                head(on: false, label: "Class times in, your blocks out")
                Text("Connect Google Calendar once from Lock In on the web. Sign in stays on the server, then syncing works here too.")
                    .liType(.sub).foregroundColor(theme.ink2)
                LISecondaryButton("Check again") { Task { await model.refresh() } }
            }
        }
    }

    private func lastLine(_ status: PlanCalendarStatus) -> String {
        guard let at = status.lastSyncAt else { return "Not synced yet" }
        let p = LIDate.nyParts(iso: at)
        let time = LIDate.formatTime(p.time)
        return p.date == LIDate.todayNY() ? "Synced \(time)" : "Synced \(LIDate.formatDateShort(p.date)), \(time)"
    }

    private func connected(_ status: PlanCalendarStatus) -> some View {
        let line: String
        if let e = model.error {
            line = e
        } else if let l = model.last {
            line = l.summary
        } else {
            line = "Next \(AppStore.planExportDays) days go out to the Lock In calendar"
        }
        return LICard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    head(on: true, label: model.syncing ? "Syncing" : lastLine(status))
                    Button {
                        LIHaptics.tap()
                        Task {
                            if await model.sync() { onSynced() }
                        }
                    } label: {
                        Group {
                            if model.syncing {
                                ProgressView().tint(theme.ink)
                            } else {
                                Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 17))
                            }
                        }
                        .foregroundColor(theme.ink)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(theme.tile))
                    }
                    .buttonStyle(LIPressStyle())
                    .disabled(model.syncing)
                    .accessibilityLabel("Sync now")
                }
                Text(line).liType(.caption).foregroundColor(model.error != nil ? theme.danger : theme.ink2).lineLimit(2)
                calendarMenu(status)
                if status.calendarId != nil && status.importWritable == false {
                    Text("Read only. Its events cannot be moved from here.").liType(.caption).foregroundColor(theme.ink2)
                }
                Button {
                    LIHaptics.tap()
                    Task { await model.disconnect() }
                } label: {
                    Text("Disconnect").liType(.sub).foregroundColor(theme.ink2).underline().frame(minHeight: 36)
                }
                .buttonStyle(LIPressStyle())
                .disabled(model.busy || model.syncing)
            }
        }
    }

    private func calendarMenu(_ status: PlanCalendarStatus) -> some View {
        let currentName: String = {
            if let id = status.calendarId {
                if let c = model.choices.first(where: { $0.id == id }) { return c.primary ? "\(c.name) (main)" : c.name }
                return status.calendarName ?? "Chosen calendar"
            }
            return "None, only send blocks out"
        }()
        return VStack(alignment: .leading, spacing: 6) {
            Text("Class times come from").liType(.label).foregroundColor(theme.ink2)
            Menu {
                Button("None, only send blocks out") {
                    Task { if await model.choose(nil) { onSynced() } }
                }
                ForEach(model.choices) { c in
                    Button(c.primary ? "\(c.name) (main)" : c.name) {
                        Task { if await model.choose(c.id) { onSynced() } }
                    }
                }
            } label: {
                HStack {
                    Text(currentName).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 12)).foregroundColor(theme.ink2)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 48)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.tile))
            }
            .disabled(model.busy || model.syncing)
        }
    }
}
