import SwiftUI
import UIKit
import LockInKit

struct TodayView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase

    @State private var celebrating = false
    private let clock = Timer.publish(every: 20, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            content
            if celebrating {
                DayCompleteOverlay(
                    title: dayTitle,
                    total: store.summary?.total ?? 0,
                    streak: store.fullStreak,
                    onDone: { celebrating = false }
                )
                .transition(.opacity)
                .zIndex(1)
            }
        }
        .animation(.easeOut(duration: 0.3), value: celebrating)
        .task {
            if !store.hasData { await store.reload() }
        }
        .onReceive(clock) { _ in store.tick() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                store.tick()
                Task { await store.reload() }
            }
        }
        .onChange(of: store.celebrationTick) { _, _ in
            LIHaptics.celebrate()
            celebrating = true
        }
    }

    private var dayTitle: String {
        if let n = store.mode.day { return "Day \(n)" }
        return LIDate.formatDateShort(store.today)
    }

    @ViewBuilder
    private var content: some View {
        if !store.hasData {
            firstLoad
        } else {
            LIScreen {
                TodayHeader()
                banners
                NowNextCard()
                    .padding(.top, 16)
                ChecklistSection()
                    .padding(.top, 24)
                WeeklySection()
                WorkoutSection()
                    .padding(.top, 28)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await store.reload() }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                }
            }
        }
    }

    /// Before there is any data: a spinner, or a real error with a way to retry.
    @ViewBuilder
    private var firstLoad: some View {
        ZStack {
            LIBackground()
            switch store.loadState {
            case .failed(let message, let offline):
                VStack(spacing: 16) {
                    LIEmptyState(
                        title: offline ? "You look offline" : "Could not load",
                        message: offline ? "Lock In needs the server for the first load. Check your connection." : message,
                        actionTitle: "Try again",
                        action: { Task { await store.reload() } }
                    )
                }
                .padding(.horizontal, 20)
            case .loaded:
                LIEmptyState(
                    title: "Nothing set up yet",
                    message: "Open Lock In on the web once so your checklist and schedule are created, then pull down here.",
                    actionTitle: "Refresh",
                    action: { Task { await store.reload() } }
                )
                .padding(.horizontal, 20)
            default:
                ProgressView().tint(theme.ink2)
            }
        }
    }

    @ViewBuilder
    private var banners: some View {
        if case .failed(let message, let offline) = store.loadState {
            LINotice(offline ? "You look offline. Showing the last data." : message, actionTitle: "Retry") {
                Task { await store.reload() }
            }
            .padding(.top, 12)
        }
        if let error = store.saveError {
            LINotice(error, actionTitle: "Dismiss") {
                store.saveError = nil
            }
            .padding(.top, 12)
        }
    }
}

/// The greeting, the day line and the percent ring.
struct TodayHeader: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme

    private var lines: [String] {
        let hour = LIDate.nyParts(store.now).hour
        return Tracks.greetingLines(hour: hour, name: store.settings?.displayName)
    }

    private var dayLine: String {
        let date = LIDate.formatDateFull(store.today)
        if let n = store.mode.day, let c = store.mode.challenge {
            return "\(date). Day \(n) of \(c.lengthDays)."
        }
        if let c = store.consistency {
            if c.days == 0 { return "\(date). First day. Keep it going." }
            return "\(date). \(Challenges.consistencyLabel(c)) locked in."
        }
        return date + "."
    }

    var body: some View {
        let percent = store.summary?.percent ?? 0
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(0..<lines.count, id: \.self) { i in
                        Text(lines[i]).liType(.greeting).foregroundColor(theme.ink)
                    }
                }
                Text(dayLine).liType(.sub).foregroundColor(theme.ink2)
                if let c = store.mode.challenge, let scoped = store.challengeSummary {
                    Text("\(c.name): \(scoped.done) of \(scoped.total)").liType(.sub).foregroundColor(theme.ink2)
                }
            }
            Spacer(minLength: 8)
            LIProgressRing(value: Double(percent) / 100.0, size: 76, stroke: 5) {
                Text("\(percent)%").liType(.value).foregroundColor(theme.ink)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(percent) percent done")
        }
        .padding(.top, 12)
    }
}

/// The current block and the one after it, on the glass card Today leads with.
struct NowNextCard: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme

    var body: some View {
        LICard(feature: true) {
            if store.blocks.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Now").liType(.label).foregroundColor(theme.accent)
                    Text("Nothing scheduled").liType(.h1).foregroundColor(theme.ink)
                    Text("Add blocks for this weekday in the web app.").liType(.sub).foregroundColor(theme.ink2)
                }
            } else {
                filled
            }
        }
    }

    @ViewBuilder
    private var filled: some View {
        let nn = store.nowNext ?? Blocks.nowAndNext(store.blocks, time: LIDate.timeNY(store.now))
        let current = nn.now
        let next = nn.next
        let time = LIDate.timeNY(store.now)
        let elapsed: Double = {
            guard let c = current else { return next == nil ? 1 : 0 }
            return Double(LIDate.minutesOf(time) - LIDate.minutesOf(c.start)) / Double(max(1, c.duration))
        }()
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 8) {
                    if current != nil {
                        Circle().fill(theme.accent).frame(width: 6, height: 6)
                    }
                    Text("Now").liType(.label).foregroundColor(theme.accent)
                }
                Spacer()
                if current != nil, let left = nn.minutesLeft {
                    Text("\(LIDate.formatDuration(left)) left").liType(.sub).foregroundColor(theme.ink2)
                }
            }
            Text(current?.blockName ?? (next != nil ? "Open time" : "Day is done"))
                .liType(.h1)
                .foregroundColor(theme.ink)
                .lineLimit(1)
            LIProgressBar(value: elapsed)
            HStack(alignment: .firstTextBaseline) {
                Text("Next").liType(.sub).foregroundColor(theme.ink2)
                Spacer()
                if let n = next {
                    Text(nextLine(n, soon: current == nil, until: nn.minutesUntilNext))
                        .liType(.sub)
                        .foregroundColor(theme.ink2)
                        .lineLimit(1)
                } else {
                    Text("Nothing after this").liType(.sub).foregroundColor(theme.ink2)
                }
            }
        }
    }

    private func nextLine(_ block: DayBlock, soon: Bool, until: Int?) -> String {
        var line = "\(block.blockName) at \(LIDate.formatTime(block.start))"
        if soon, let until = until, until <= 180 { line += ", in \(LIDate.formatDuration(until))" }
        return line
    }
}
